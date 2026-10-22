# Interaction-state and alpha-compositing mathematics (v0.4)

## Intended use and scope

This release adds auditable, **opaque sRGB** values for common component states, plus two
transparent CSS overlays. The colours are generated for the exact page, surface, raised
surface, and button foreground roles in each exported theme. They are **not** universal
contrast guarantees for arbitrary images, overlays, gradients, custom backgrounds,
partially transparent ancestors, or uncontrolled stacking contexts.

The v0.3 `createPalette()` API, 13 scales, 143 swatches, semantic themes, and P3 scale
exports remain available. v0.4 additionally exposes:

```ts
palette.interactions.light.primaryHover;
palette.interactions.dark.focusRing;
palette.interactionChecks.light; // 16 audited pairs
palette.interactionChecks.dark;  // 16 audited pairs
```

## 1. Source-over alpha compositing in sRGB

For a foreground/source colour `F`, an opaque background `B` and alpha `a ∈ [0, 1]`,
calculate each *gamma-encoded sRGB* channel:

\[
C_{out}=\operatorname{round}_{8\ bit}(a C_F+(1-a) C_B)
\]

This implements ordinary CSS source-over interpolation for colours already specified
in the sRGB compositing colour space. **Do not linearise the channel for this step.**
After composition, use the normal sRGB-to-linear conversion to compute WCAG 2.x
relative luminance and contrast of the resulting, quantised `#RRGGBB` colour:

\[
R_{contrast}=\frac{L_{lighter}+0.05}{L_{darker}+0.05}
\]

Examples: `compositeSRGB('#FF0000', 0.25, '#0000FF') === '#4000BF'` and
`compositeSRGB('#000000', 0.5, '#FFFFFF') === '#808080'`.

The helper intentionally takes only **opaque** input colours; it validates alpha
and performs a single source-over operation. Layer several overlays by calling it
repeatedly, back to front, with the **actual** background.

## 2. Primary hover and pressed states

The primary state engine tests a deterministic series of overlay strengths
`a = 0.02 ... 0.85` at 0.01 intervals against the original primary fill:

- White-labelled buttons are darkened towards black.
- Black-labelled buttons are lightened towards white.
- Each candidate retains at least **4.5:1** for the unchanged button label and
  **3:1** against the designated `surface` background.
- The first hover state must be at least `ΔEOK = 0.012` from the base fill.
- The first pressed state must be at least `ΔEOK = 0.035` from base **and**
  `ΔEOK = 0.012` from hover.

The ΔE thresholds are engineering heuristics, **not** WCAG requirements or
perceptual visibility guarantees.

## 3. Secondary buttons, selection, and focus

- Secondary hover and pressed backgrounds are respectively 5.5% and 12%
  white/black overlays on `surface`. Text is checked at **4.5:1**. If the existing
  border becomes too faint, a replacement border is selected to maintain **3:1**
  relative to the new state background.
- `selectedBackground` uses a restrained primary tint, while `selectedText` stays
  at least **4.5:1**. The selected marker is measured against both the selection
  background and adjacent `surface` at **3:1**.
- `focusRing` passes **3:1** against declared page, surface, and raised-surface
  backgrounds. `focusRingInner` passes **3:1** against the primary button fill.
  The external ring is intended for a *visible, sufficiently thick* `:focus-visible`
  outline; exported colour alone cannot guarantee focus appearance, dimensions,
  geometry, placement, or a clear keyboard focus order.

## 4. Disabled controls and overlays

- Disabled background/text colours are derived with alpha compositing, but are
  **not counted as contrast passes**. WCAG 2.2 Non-text Contrast (1.4.11) exempts
  inactive controls. Confirm disabled appearance is understandable in context.
- `overlayTint` is an actual transparent CSS `rgb(... / 0.1)` value.
  `overlayTintOnSurface` is its opaque composited sample on `surface`, whose normal
  text contrast is checked at **4.5:1**.
- `overlayScrim` is an actual transparent black CSS value: alpha 0.56 in light mode,
  0.44 in dark mode. `overlayScrimOnSurface` is a preview sample **only**. Any
  visible content behind a scrim, modal, or loading overlay must be analysed in
  its actual rendered state. A dialog shown above a scrim needs its own accessible
  foreground/background tokens, keyboard focus management, and scroll handling.

## 5. Example component CSS

```css
.primary-action {
  background: var(--color-primary);
  color: var(--color-on-primary);
}
.primary-action:hover { background: var(--color-primary-hover); }
.primary-action:active { background: var(--color-primary-pressed); }

.secondary-action {
  background: var(--color-surface);
  color: var(--color-text);
  border: 2px solid var(--color-border);
}
.secondary-action:hover {
  background: var(--color-secondary-hover);
  border-color: var(--color-secondary-border-hover);
}
.secondary-action:active {
  background: var(--color-secondary-pressed);
  border-color: var(--color-secondary-border-pressed);
}
:where(button, a, input, select, textarea):focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 3px;
}
.selected-item {
  background: var(--color-selected-background);
  color: var(--color-selected-text);
  border-inline-start: 5px solid var(--color-selected-indicator);
}
button:disabled {
  background: var(--color-disabled-background);
  color: var(--color-disabled-text);
}
.surface-tint {
  background: var(--color-overlay-tint-on-surface);
  color: var(--color-text);
}
.scrim { background: var(--color-overlay-scrim); }
```

Important: the generated `--color-overlay-tint` itself is alpha-containing. Its
compositing will vary with any backdrop other than `--color-surface`. The separately
exported `--color-overlay-tint-on-surface` is the **precomposited** opaque result.

## 6. Validation, limits, and references

Every palette reports 23 v0.3 semantic checks and 16 state checks **per theme**:
`(23 + 16) × 2 = 78` relationships. The optimiser rejects candidates that fail
any of them. The 16 new relationships do **not** include disabled content, scrimmed
backgrounds, novel component configurations, or text under arbitrary overlays.

Passing all checks demonstrates those exact pairings in 8-bit sRGB only, not whole-site
WCAG conformance. Vision-deficiency simulations and Display P3 scale exports remain
independent of the audited sRGB semantic colour tokens.

Primary references:

- W3C Compositing and Blending Level 1: https://www.w3.org/TR/compositing-1/#simplealphacompositing
- W3C WCAG 2.2 Non-text Contrast: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast
- W3C WCAG 2.2 Contrast (Minimum): https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum
- W3C Focus Not Obscured: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum
- W3C CSS Color Level 4: https://www.w3.org/TR/css-color-4/
