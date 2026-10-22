# Chart-context auditing (v0.10)

The categorical optimiser selects opaque colour marks on **one background**. Real data visualisations often put those marks on cards, dashboards or alternate themes, or render them at reduced opacity. They may also have line crossings and antialiasing. A minimum colour distance is **not** evidence that a reader can tell categories apart reliably.

`auditCategoricalChart()` adds a deterministic, explicit contextual audit. It does not change existing palette selection.

```ts
import {
  createCategoricalPalette, auditCategoricalChart,
  renderCategoricalChartFixture,
} from 'color-foundry-engine';

const palette = createCategoricalPalette('#2563EB', {
  count: 8,
  background: '#FFFFFF',
  minBackgroundContrast: 3,
});
const audit = auditCategoricalChart(palette, {
  surfaces: [
    {name: 'page', hex: '#FFFFFF'},
    {name: 'card', hex: '#F5F7FB'},
    {name: 'dark panel', hex: '#101827'},
  ],
  opacity: 0.8,
  minimumMarkContrast: 3,
  reviewDistance: 0.06,
});
console.log(audit.passed, audit.failures, audit.reviewPairs, audit.weakestPair);
const svg = renderCategoricalChartFixture(palette, {title:'Example chart'});
```

## Maths

For an opaque backdrop (per channel in gamma-encoded sRGB), the displayed mark is quantised to the final CSS-compatible 8-bit value:

\[
C_{out} = \operatorname{round}_{8bit}(\alpha C_{mark}+(1-\alpha)C_{surface})
\]

The emitted value is used in the WCAG 2.x luminance contrast formula:

\[
R = \frac{\max(Y_{mark},Y_{surface})+0.05}{\min(Y_{mark},Y_{surface})+0.05}
\]

For each chart surface, all category pairs are converted to simulated normal/protanopia/deuteranopia/tritanopia full-severity views and pairwise \(\Delta E_{OK}\) is computed on quantised colours. The reported weakest pair is the minimum over **all** surfaces and vision conditions. `reviewDistance` is a *triage heuristic*, not a measured threshold of distinguishability.

`opacity=1` reproduces the original fully opaque categorical marks. A palette can pass there and fail at 60% opacity, or on a card surface of different luminance.

## Non-colour encoding and tests

The SVG example is synthetic and intentionally draws crossing line series. It uses different dash patterns, point shapes and directly printed series labels. Its accessible name and description are included, but a chart with real data must additionally expose a structured data table or an equivalent accessible representation. Line styles and label placement should be reviewed at small viewport sizes.

The browser preview offers opacity scenarios. **The SVG preview itself remains fully opaque**; the contextual audit is the precise result for the selected opacity, not a claim that the example SVG simulates transparency. Actual SVG rendering and WCAG conformance must be verified independently.

Automated regression tests cover:

- deterministic 8-bit alpha compositing;
- opaque-vs-translucent failure detection;
- contrast against multiple independently measured surfaces;
- exact recomputation of all CVD pair distances;
- invalid option rejection, safe output encoding, SVG labels and symbol variety.

## Interpretation

WCAG 2.2's non-text contrast requirement applies to meaningful graphical objects, frequently requiring 3:1 against adjacent colours. Whether objects overlap, are supplemented by equivalent text, or are essential to understanding matters. Fine and antialiased strokes can become materially lighter. A passing numerical chart audit is **not** a conformance assessment and does not replace user testing. Sources:

- [W3C Understanding Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- [W3C Compositing and Blending Level 1](https://www.w3.org/TR/compositing-1/)
- [Machado et al. 2009 simulation model](https://doi.org/10.1109/TVCG.2009.113)

## Human review protocol (not yet conducted)

Use 8–12 representative series across actual light/dark charts; test dense legends, 320px screens, crossings, high zoom, printed/monochrome output and different display conditions. Ask representative users to match a named series to its path, identify line crossings and read direct labels without relying on colour, then report accuracy and response time. Avoid any claim of empirically superior human distinguishability until the study has been run and evaluated.
