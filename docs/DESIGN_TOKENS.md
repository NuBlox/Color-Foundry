# Color Foundry v0.6 — design-token architecture

## Model

The generator has three layers. All exported token names are namespaced in CSS (`--cf-...` by default).

1. **Primitive:** `color.srgb.primary.500`, `color.fixed.white`, `space.4`, `radius.md`, typography and motion; `color.p3` is a *separate CSS-only optional channel*.
2. **Semantic:** `color.semantic.primary`, `color.semantic.text`, `color.semantic.successSurface`, `color.state.primaryHover`. Generated from the v0.4 audits, not from arbitrary design guesses.
3. **Component:** `color.component.button.primary.background`, `color.component.button.secondary.pressed`, `color.component.input.focus`, `color.component.status.success.foreground`, etc. Aliases reference semantic roles.

The portable JSON follows the W3C Design Tokens Community Group **2025.10** vocabulary: `$type`, `$value`, nested groups, aliases like `{color.semantic.primary}`, sRGB colour objects (`colorSpace`, `components`, `hex`), alpha, dimensions, durations, font family and weights. Every light or dark document is individually self-contained and can be resolved without an external resolver document. The JSON is a useful exchange baseline. v0.6 adds structural/value/reference validation for the token types we emit, but **it has not been certified against the complete published JSON Schema**.

### API

```ts
import {
  createPalette, createDesignSystem, optimizePalette,
  toDTCGTokens, toDesignSystemCSS, resolveTokens, validateDTCGTokens, validateCSSReferences
} from 'color-foundry-engine';

const palette = optimizePalette('#2563EB', { intent: 'balanced' });
const system = createDesignSystem(palette, { prefix: 'cf' });

system.css;          // CSS with root, data-theme dark, OS theme and optional P3
system.tokens.light; // standalone typed DTCG 2025.10 document
system.tokens.dark;  // standalone typed DTCG 2025.10 document
resolveTokens(system.tokens.light); // fully resolve aliases
validateDTCGTokens(system.tokens.light); // validate supported DTCG shapes and values
validateCSSReferences(system.css); // ensure var() references are declared
```

### Mathematical and accessibility guarantees

- All sRGB semantic values come directly from the colour engine's already-audited roles.
- CSS aliases only reference sRGB primitives. Optional P3 output is emitted as `--cf-p3-*` custom properties and is **not** substituted into semantic/component roles, because doing so could invalidate WCAG ratios.
- The unchanged v0.4 role audit covers 78 contrasts (39 per theme), **not** the entire Svelte application and **not** the geometric legibility of every focus indicator.
- Disabled controls remain outside mandatory contrast checks, as explained in `INTERACTIONS.md`.
- The engine does not claim preference or colour-difference validation based on human experiments.
- The DTCG spec represents colour alpha independently from hex. Its `hex` field is omitted for semi-transparent values, while CSS receives `rgb(... / alpha)`.

### Generated CSS naming

```css
:root {
  --cf-color-srgb-primary-500: #2A6BFB;
  --cf-color-semantic-primary: var(--cf-color-srgb-primary-700);
  --cf-color-component-button-primary-background: var(--cf-color-semantic-primary);
  --cf-space-4: 1rem;
  --cf-radius-md: .75rem;
}
[data-theme="dark"] { /* override only changed light/dark semantic and state values */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) { /* automatic OS dark mode */ }
}
@supports (color: color(display-p3 1 0 0)) {
  @media (color-gamut: p3) { :root { /* raw wide-gamut ramp only */ } }
}
```

The sample `--cf-color-semantic-primary` target illustrates a variable reference, not a fixed selection: its stop varies with the theme and seed.

### Exports

```bash
npm run build
node examples/generate-tokens.mjs '#2563EB' > example-design-system.css
node examples/generate-tokens.mjs '#2563EB' --format=light > tokens-light.json
node examples/generate-tokens.mjs '#2563EB' --format=dark > tokens-dark.json
node examples/generate-tokens.mjs '#2563EB' --optimize --format=css > optimised-system.css
```

### SvelteKit starter

A complete starter is supplied under `examples/sveltekit`. It demonstrates root theming (system/light/dark with pre-paint storage preference), automated build-time token generation, a component showcase and a raw palette ramp.

From the extracted root project:

```bash
npm install
npm run build
cd examples/sveltekit
npm install
npm run tokens
npm run check
npm run build
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). For rebranding, change the input seed:

```bash
COLOR_FOUNDRY_SEED='#8757D6' npm run tokens
COLOR_FOUNDRY_OPTIMIZE=1 npm run tokens
```

The starter does not use a database and needs no migrations. It depends on the locally installed `color-foundry-engine` package (`file:../..`), not a published npm package. The npm registry must be reachable for its SvelteKit dev dependencies; the build was not executable in the restricted authoring container because DNS resolution for npmjs.org failed. The core engine and token generator were compiled and independently tested.

### Limitations and subsequent work

- A future DTCG resolver module could describe brands/modes in a single document. v0.5 exports separate fully resolved *mode-specific* token documents instead.
- The current component system is a reference set, not an exhaustive component library.
- End-to-end SvelteKit build, browser rendering, keyboard/focus tests and axe-based accessibility audits must be run after installing dependencies on a machine with network access.
- A supported-subset token validator, CSS reference auditor, Playwright tests and a GitHub Actions CI definition were added in v0.6. Full independent schema conformance, supply-chain signing and publishing are still outstanding.

## Standards

- https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/
- https://www.w3.org/community/reports/design-tokens/CG-FINAL-color-20251028/
- https://www.w3.org/TR/css-color-4/
- https://www.w3.org/TR/WCAG22/


## v0.6 release hardening and CI

Run the core checks without a browser:

```bash
npm install
npm run ci
```

`npm run validate` checks five representative seeds (390 declared pair checks), their light/dark typed-token documents (2,520 tokens), CSS references, deterministic output, and an additional optimised seed. This is a declared-pair audit, not an exhaustive visual accessibility test.

Run the SvelteKit starter and real Chromium checks in an online Node 22 environment:

```bash
cd examples/sveltekit
npm install
npm run tokens
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
```

The GitHub Actions workflow at `.github/workflows/ci.yml` performs both layers for pushes to `main`, pull requests and manual runs. Its browser checks cover theme persistence, eleven swatches, interactive state, keyboard focus, and axe-core WCAG-tagged violations across all reported severities for light/dark themes on desktop/mobile. These checks are **configured but not executed** in the restricted authoring container. Before making compliance claims, run manual screen-reader testing and independent specialist audits.

### Validation scope

`validateDTCGTokens()` covers the Color Foundry output subset (sRGB, dimension, duration, fontFamily, fontWeight and curly-brace references). It rejects malformed values, invalid aliases, missing targets, cycles, type mismatches and token/group mixtures. The validator does not implement all DTCG extensions, composite tokens or complete standard JSON Schema rules, and is not itself a DTCG-conformance certification.

`validateCSSReferences()` parses the CSS variables emitted by this engine and rejects unresolved `var(--prefix-...)` references. It does not parse all legal CSS syntax, external imported styles or runtime DOM style rules.
