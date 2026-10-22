# Colour Foundry: mathematical model and engineering notes

## 1. Source colour conversion

Input is an opaque sRGB colour `#RRGGBB`. Normalise channel bytes `u = byte/255`. Undo the sRGB transfer function:

```
linear(u) = u/12.92                         when u <= 0.04045
            ((u + 0.055)/1.055)^2.4          otherwise
```

Transform linear RGB to OKLab using the D65 matrices implemented in `src/color.ts`. Convert Cartesian OKLab to cylindrical OKLCH:

```
C = sqrt(a²+b²)
H = (atan2(b,a) * 180/π + 360) mod 360
```

A hue is semantically powerless for near-zero chroma, so the program uses 0° as a deterministic placeholder.

## 2. Continuous tonal curve

Generate a colour path `p(L) = [L, C(L), H]` at constant OKLCH hue `H`, with `L ∈ [0.16, 0.975]`.

```
C(L) = Csource * min(1.12, (sin(πL) / sin(π*0.63))^0.8)
```

These numbers are adjustable heuristics. They de-emphasise chroma near black/white while retaining middle-tone saturation. **They are not specified by CSS or proven aesthetically optimal.**

## 3. Constraining the sRGB gamut

For each L and H, find the largest `C' ≤ C(L)` such that:

```
0 <= linearR(L,C',H) <= 1
0 <= linearG(L,C',H) <= 1
0 <= linearB(L,C',H) <= 1
```

Use 32 steps of bisection over `[0,C]` and preserve L/H. Do not rely on clipping out-of-range channels after the colour transformation, which can distort hue. The implementation clamps microscopic numerical drift only when encoding to 8-bit sRGB.

This is a simple chroma-reduction policy, distinct from the gamut-mapping procedure specified for browser colour rendering in CSS Color 4.

## 4. Equalised perceptual arc length

Let `p_0...p_512` be the sampled, gamut-constrained colour path converted to OKLab. Define:

```
ΔEOK(p_i,p_j) = sqrt((L_i-L_j)²+(a_i-a_j)²+(b_i-b_j)²)
S_0 = 0
S_k = Σ(i=1..k) ΔEOK(p_(i-1),p_i)
```

Find an interpolation point at each target arc length `T_j = (j/10) S_512`, with `j=0,...,10`, and re-evaluate the continuous tonal curve to produce the 11 stops. Perceptual distances in final 8-bit sRGB are approximate due to quantisation and sampling.

This provides a strong *numeric* evenness prior, not a guarantee of visual beauty. Different users, displays, viewing conditions, and colour vision can perceive the same colour steps differently.

## 5. Conventional hue relationships

```
Base                    H +   0°
Analogous left/right   H ±  30°
Complementary          H + 180°
Split-complementary    H ± 150°
Triadic                H ± 120°
Near-neutral           H, C = min(0.018, 0.10*Csource)
```

All angles wrap into `[0,360)`. The output contains nine brand-derived families plus four status scales (success, warning, danger and info), giving 13 × 11 = 143 sRGB swatches. The exact seed HEX colour remains a separate token, not necessarily scale[500].

## 6. WCAG luminance and contrast (after 8-bit conversion)

For any final HEX colour, decode sRGB channels to linear light again and compute:

```
Y = 0.2126 Rlinear + 0.7152 Glinear + 0.0722 Blinear
contrast(A,B) = (max(YA,YB)+0.05) / (min(YA,YB)+0.05)
```

WCAG 2.2 minimum thresholds:

- 4.5:1 for ordinary text at Level AA
- 3:1 for qualifying large text and meaningful graphical/UI boundaries
- 7:1 for ordinary text at Level AAA

The engine tests 23 foreground/background role pairs for each of two themes (including three checks per status family). The engine requires 7:1 for main body text across page, surface, and raised backgrounds. It requires 4.5:1 for muted text and the link colour over relevant surfaces, and 3:1 for controls, borders and focus indicators. Tests do *not* certify other use cases, including alpha overlays, shadows, gradients and imagery.

For action labels, compute both `contrast('#000000',bg)` and `contrast('#FFFFFF',bg)`, and choose the better. For surface and border tokens, select swatches by threshold first, then choose the nearest tonal stop to a preferred design role. Contrast constraints take priority over aesthetics.

## 7. Implemented deterministic optimisation (v0.3)

A fixed grid search varies four parameters:

- `chromaMultiplier` = chroma amplitude relative to the seed (three candidates depending on design intent)
- `analogousAngle` = the analogous hue separation (24°, 38° for fast; 22°, 30°, 40° for thorough)
- `envelopeExponent` = exponent in the tonal chroma envelope (0.65, 0.95 for fast; 0.60, 0.80, 1.05 for thorough)
- `neutralMultiplier` = multiplier governing near-neutral chroma (0.05, 0.10 for fast; 0.04, 0.10, 0.16 for thorough)

The original `createPalette()` is an explicitly included baseline. Each other candidate is generated in OKLCH, gamut constrained in sRGB, then evaluated using its *actual 8-bit hex outputs*. The feasibility predicate is:

```
F(candidate) = all 46 tested semantic contrast ratios >= their role-specific minimum
```

Candidates with `F=false` are **rejected**, not given a soft penalty. For each feasible palette, eight components `s_i` in `[0,1]` are calculated:

| Component | Mathematical definition (normalised) |
|---|---|
| Spacing | `clamp(1 - mean(CV(ΔEOK adjacent tones)) / 0.16, 0, 1)` across primary, neutral, left analogous and complementary scales |
| Contrast margin | Mean `clamp((contrast/threshold - 1) / 0.6, 0, 1)` over 46 semantic checks |
| Brand fidelity | `exp(-ΔEOK(source, candidate at original source L) / 0.045)` |
| Accent separation | `clamp(min(ΔEOK(primary500, analogueL500 / analogueR500 / complement500)) / 0.10, 0, 1)` |
| Chroma intent | `exp(-abs(C(primary500)-Ctarget) / max(0.025, 0.32*Ctarget))`, with target factor 0.70 restrained, 1.0 balanced, 1.24 vibrant |
| Neutral balance | `exp(-abs(C(neutral500)-0.006) / 0.012)` |
| Gamut retention | Mean of `C_mapped/C_requested` at source hue, L = 0.40, 0.55, 0.70 |
| CVD separation | `clamp((0.75×D_accents + 0.25×D_statuses)/0.07, 0, 1)`; `D` is minimum pairwise ΔEOK after full-severity colour-vision simulation across protanopia, deuteranopia and tritanopia. The 0.07 divisor is a heuristic, **not** a perceptual just-noticeable-difference or a WCAG rule. |

The final objective is `S=Σ(w_i × s_i)`, where the weights sum to 100.

| Intent | Spacing | Contrast | Fidelity | Separation | Chroma | Neutral | Gamut | CVD |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Balanced | 18 | 12 | 18 | 12 | 15 | 4 | 7 | 14 |
| Vibrant | 14 | 12 | 8 | 13 | 27 | 4 | 8 | 14 |
| Restrained | 16 | 12 | 8 | 12 | 28 | 4 | 6 | 14 |

**Crucially:** weights and score transforms are explicitly engineered heuristics, not fitted perceptual data. The score is useful for reproducible comparison *within an intent*, not for ranking beauty between intents or claiming a percentage of accessibility.

Near-grey seeds cannot meaningfully separate hues by rotating hue alone; the report flags this instead of inventing chromatic distinctions. Clipping at the sRGB boundary can similarly prevent an increase in visual chroma.

## 8. Colour-vision simulation and Display P3

See [`PERCEPTION_AND_GAMUT.md`](PERCEPTION_AND_GAMUT.md) for the forward matrix model, the P3 gamut and CSS feature gating.

## 9. Further research problem

A complete adaptive generator could optimise all tonal curves and semantic role assignments jointly rather than selecting from fixed families.

Let `x` be the vector of palette colours and design role assignments. Let:

```
J(x) = w1 * variance(normalised ΔE steps)
     + w2 * penalty(deviations from the requested identity)
     + w3 * penalty(desired role hierarchy)
     + w4 * penalty(hue drift, dullness, or redundant swatches)
     + w5 * penalty(colour-vision-deficiency confusion)
```

Minimise `J(x)` subject to hard constraints:

```
all emitted colours ∈ selected display gamut
L50 > L100 > ... > L950
required contrast(foreground,background) >= applicable threshold
colour identity / brand bounds are preserved where specified
```

The weights `w1...w5` cannot meaningfully be called *optimal* without validating the objectives against real design tasks and human observers. A strong product will expose modes (brand fidelity, accessibility, expressive, restrained), give accessibility hard priority, and incorporate blinded user-preference studies and regression suites.

Other useful work: gamut support for Display P3; advanced CSS Color 4 gamut mapping; role-dependent backgrounds; alpha composition; CVD simulation and non-colour cues; automated visual and browser accessibility tests; batch scoring of candidate palettes.

## Sources

- W3C CSS Color Module Level 4: https://www.w3.org/TR/css-color-4/
- Björn Ottosson, A perceptual color space for image processing: https://bottosson.github.io/posts/oklab/
- Machado, Oliveira and Fernandes (2009): https://doi.org/10.1109/TVCG.2009.113
- W3C WCAG 2.2: https://www.w3.org/TR/WCAG22/
- W3C Understanding Contrast Minimum: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
- W3C Understanding Non-text Contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast
