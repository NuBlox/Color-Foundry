# Colour vision, P3 gamut and constraint evaluation

## 1. Full-severity CVD simulation

Color Foundry simulates three named deficiencies using the full-severity 3×3 RGB matrices from Machado, Oliveira and Fernandes (IEEE TVCG, 2009):

```
[r', g', b']ᵀ = M_mode [r, g, b]ᵀ
```

The input `[r,g,b]` is **linear-light sRGB**, not encoded CSS sRGB. Each channel undergoes decoding, multiplication by a selected deficiency matrix, bounding to the representable range, re-encoding and 8-bit serialization. A severity control uses an **interpolated matrix** `(1−s) I + sM` for `0 ≤ s ≤ 1`; for intermediate severities this is a computational approximation to the model, not a claim to reproduce its full spectral physiology.

The engine measures separation after simulation by converting both displayed results to OKLab:

```
D_mode(A,B) = sqrt( (L_A-L_B)² + (a_A-a_B)² + (b_A-b_B)² )
D_set = min(D_mode(A,B)) over all named pairs and all three CVD modes
```

There are two named comparison sets: four brand-family midtones (`primary`, analogous left/right, complementary), and four semantic-family midtones (`success`, `warning`, `danger`, `info`). The optimiser's **soft CVD objective** is:

```
CVD_score = clamp((0.75*D_brand + 0.25*D_status)/0.07, 0, 1)
```

The divisor `0.07`, heuristic `reviewRecommended` flag at `0.06`, and weights are design choices, not validated thresholds for human discrimination. The 14-point contribution to the 100-point objective cannot offset hard WCAG contrast failures. Brightness/shape/context can determine readability. Always add **text, icons, patterns** to categorical states. This simulation is not a clinical model or a WCAG success-criterion test.

## 2. Display P3 mathematics

Display P3 uses the **D65** whitepoint and the **same transfer function as sRGB**, but different RGB primaries. Therefore simply writing `color(display-p3 <sRGB channels>)` is not colourimetrically correct.

The correct conversion pipeline for any OKLCH candidate is:

```
OKLCH → OKLab → linear sRGB → XYZ D65 → linear Display P3 → encoded Display P3
```

Use matrix multiplication:

```
XYZ_D65 = M_sRGB_to_XYZ × RGB_linear_sRGB
RGB_linear_P3 = M_XYZ_to_P3 × XYZ_D65
```

Check each linear P3 channel is between 0 and 1. If not, bisect OKLCH chroma toward zero at **fixed L and H** until it fits in P3. This is an explicit chroma-reduction strategy and not the CSS Color 4 normative gamut algorithm.

Crucially: scale generation sends the **unclipped requested chroma** to the P3 mapper independently, retaining chroma discarded by the sRGB projection. Each scale token has an opaque sRGB fallback, plus an optional `color(display-p3 …)` override.

```css
:root { --palette-primary-500: #...; --color-text: #...; }
@supports (color: color(display-p3 1 0 0)) {
  @media (color-gamut: p3) {
    :root { --palette-primary-500: color(display-p3 0.4 0.6 0.9); }
  }
}
```

The sample values are illustrative. We **do not override semantic tokens** (including links, text, focus, status fills) in P3, because the contrast audits ran on the sRGB semantic output. An eventual wide-gamut semantic theme needs a separate, colourimetrically accurate contrast implementation and contextual browser tests.

## 3. Semantic accessibility requirements

For both themes:

- 7:1 minimum: main text across page/background, surface and raised surface.
- 4.5:1: muted text and links over declared surfaces, status text on fill and on status surface.
- 3:1: control fill against its declared surface, borders and focus against surfaces, status fills against their chosen surface.

`23 × 2 = 46` original semantic pairs are checked against actual sRGB hex output. v0.4 adds `16 × 2 = 32` interaction-state pairs for a total of 78. These checks are intentionally narrower than the entire WCAG 2.2 standard; real UIs also require layout, occlusion, shadows, arbitrary overlay backdrops, touch targets, keyboard access, and more.

## Sources

- CSS Color Module Level 4: https://www.w3.org/TR/css-color-4/
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- Machado et al. (2009), DOI: https://doi.org/10.1109/TVCG.2009.113
