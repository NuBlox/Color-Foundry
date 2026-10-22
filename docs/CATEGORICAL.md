# Categorical palettes (v0.9)

A categorical palette encodes **different identities**, unlike a sequential tonal scale. A hue wheel alone does not guarantee that two data categories remain distinguishable after sRGB gamut mapping, display quantisation or colour-vision changes.

## Mathematical strategy

1. Convert the opaque seed and background into canonical 8-bit sRGB hex.
2. Enumerate candidates in OKLCH across 24 hue positions (15° intervals rotated from the seed), eight lightness levels and four chroma levels, and map each colour independently into sRGB.
3. Deduplicate **after** conversion to 8-bit hex and reject colours whose actual WCAG 2.x contrast against the opaque background is below the requested constraint.
4. If feasible, preserve the exact seed as the first category; otherwise anchor to the remaining candidate nearest the seed in OKLab.
5. Greedily select each next candidate using **maximin** perceptual separation. For two colours `a`, `b` and simulated viewing modes `M`, the pair's score is:

   `d(a,b) = min_{m ∈ M} || OKLab(sim_m(a)) − OKLab(sim_m(b)) ||₂`

   where `M = {normal, protanopia, deuteranopia, tritanopia}` and the simulations use full-severity Machado transformation matrices on linear sRGB.
6. Maximise the smallest `d` to previously selected colours; a small mean-distance and chroma term stabilises tie-breaking. Re-audit **all** emitted pairs for each mode.
7. Choose readable black or white foreground text for labels placed *inside* a mark using the actual measured contrast.

This is a **deterministic greedy heuristic**, not proof of a globally optimal palette or a validated psychophysical discrimination threshold. Colour-vision simulations approximate full-severity deficiencies; real users, displays, lighting and contextual induction vary.

## API

```ts
import { createCategoricalPalette } from 'color-foundry-engine';

const chart = createCategoricalPalette('#2563EB', {
  count: 8,                   // integer 2–12
  background: '#FFFFFF',     // opaque hex or shorthand
  minBackgroundContrast: 3, // desired ratio 1–7
  prefix: 'nbx',             // defaults to 'cf'
});

console.log(chart.colors);
console.log(chart.minimumDistances);
console.log(chart.weakestPair);
console.log(chart.css);
```

CSS exports `--nbx-category-1`, `--nbx-on-category-1`, etc. These colours are separate from the existing design-token system: adding a chart palette does not modify a brand's validated semantic roles.

## Accessibility boundaries

- The minimum requested WCAG contrast is enforced **only for opaque solid-colour data marks against the supplied solid background**. WCAG does not require every chart colour to be 3:1 in every circumstance, and transparency, overlapping marks, gradients or textured backgrounds require new calculations.
- Label contrast is independently measured at least 4.5:1 using emitted 8-bit colours; the calculation is for text *inside its own mark*, not arbitrary overlaid text or external annotations.
- Perceptual minimum distances are reported, never labelled as passing a universal CVD accessibility threshold.
- Never communicate information through colour alone: supply legends, text, direct labels, symbols, shapes, stroke patterns or dash styles.
- A near-zero minimum distance produces a review warning; `0.06` ΔEOK is a **heuristic alert** rather than a WCAG criterion.

## Complexity

The search samples up to 768 OKLCH positions. It computes four simulated OKLab vectors per feasible distinct candidate, then greedily evaluates pairs as categories are selected (maximum 12). The output is reproducible for identical inputs and algorithm versions, independent of run order or platform randomness.
