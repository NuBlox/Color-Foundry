# Color Foundry v0.8 — browser-verified multi-brand token engine

Deterministic TypeScript with **no runtime dependencies**. Generates OKLCH-derived sRGB/Display P3 colour scales, contrast-audited light/dark semantic roles, interaction states and reusable design tokens for SvelteKit.

## v0.8 at a glance

- **13 colour families × 11 stops = 143 swatches** per palette, preserving all v0.4 behaviour and the original `createPalette()`, `optimizePalette()` and `palette.css` outputs.
- **78 existing contrast tests per generated palette** (39 light, 39 dark) across declared semantic and interaction pairs. Not a blanket WCAG conformance statement.
- **252 tokens per light/dark mode:** palette primitives, fixed colours, semantic roles, component aliases, spacing, radii, borders, typography and motion.
- **Three-layer architecture:** primitive → semantic → component. A deterministic resolver checks aliases for unknown references, cycles and type mismatch.
- **DTCG 2025.10 JSON:** standalone light/dark documents using typed colour values and aliases. Modern CSS with namespaced variables, automatic OS dark mode and manual theme selection.
- **Display P3 remains optional and isolated from audited semantics.** Both modes use the same primitive sRGB ramps, preventing an uncontrolled contrast change on wide-gamut screens.
- **New SvelteKit starter** in `examples/sveltekit`, including pre-paint theme restoration, interactive component examples and a build-time token generator.
- **Standalone browser demo** still works, with additional design-system CSS and DTCG export buttons.
- **New emitted-token validator** verifies supported DTCG value types, normalized sRGB channels, HEX consistency, units, alias targets and graph cycles; **CSS reference auditor** rejects undefined namespaced variables. This is a rigorous validator for the emitted subset, not an independent full-schema DTCG certification.
- **Multi-brand composition:** one shared CSS namespace with independently audited light/dark palettes for Foundry Blue, Evergreen and Royal Plum; brand selection is separate from theme selection.
- **Chromium-verified token cascade:** optional Python Playwright test checks 200 browser-computed values across 20 explicit/OS/override/fallback configurations, using generated DTCG documents as the expected source.
- **Generalised pre-paint brand restoration:** supports any valid configured brand slug and cleans up unknown stored brands after hydration.
- **Reproducible builds:** both root and SvelteKit npm lockfiles are committed, and CI installs with `npm ci`. To update dependencies intentionally, regenerate lockfiles with `npm run lock:bootstrap`.
- **Automated CI workflow** checks the engine, SvelteKit build and Chromium/axe across all brands and modes. Status and run logs: [GitHub Actions](https://github.com/NuBlox/Color-Foundry/actions).

## Quick start

```bash
npm install
npm run check
npm test
npm run build
npm run validate
npm run brand:tokens
npm run demo
```

Open `http://localhost:8000/demo/` for the standalone palette editor.

### New design-token API

```ts
import { createDesignSystem, optimizePalette, resolveTokens, validateDTCGTokens, validateCSSReferences } from 'color-foundry-engine';
const optimized = optimizePalette('#2563EB', { intent: 'balanced' });
const design = createDesignSystem(optimized);
console.log(design.css); // light/dark design-system stylesheet
console.log(design.tokens.light.color.component.button.primary.background.$value);
console.log(resolveTokens(design.tokens.dark)['color.semantic.primary']);
console.log(validateDTCGTokens(design.tokens.light));
console.log(validateCSSReferences(design.css));
```

The npm-style import above works in a project that installs this local package; for scripts **inside this repository**, import from `../dist/index.js` after `npm run build`.

### Generate CSS and token JSON

```bash
node examples/generate-tokens.mjs '#2563EB' > example-design-system.css
node examples/generate-tokens.mjs '#2563EB' --format=light > tokens-light.json
node examples/generate-tokens.mjs '#2563EB' --format=dark > tokens-dark.json
node examples/generate-tokens.mjs '#2563EB' --prefix=nublox --optimize > nublox.css
```

The original `examples/generate.mjs` CLI continues to work.

### New multi-brand composition API

```ts
import { createBrandDesignSystem } from 'color-foundry-engine';
const collection = createBrandDesignSystem([
  { id: 'foundry', name: 'Foundry Blue', seed: '#2563EB' },
  { id: 'forest', name: 'Evergreen', seed: '#237A48' },
  { id: 'plum', name: 'Royal Plum', seed: '#8757D6' },
]);
console.log(collection.css);                 // Single stylesheet, scoped brand selectors
console.log(collection.brands.forest.tokens.dark); // Independent DTCG theme document
```

The original single-brand API is unchanged. Each brand is audited independently; the starter has `data-brand` and `data-theme` selectors and persists both choices before paint. See [MULTI_BRAND.md](docs/MULTI_BRAND.md).

### SvelteKit multi-brand starter

```bash
cd examples/sveltekit
npm install
npm run tokens
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

Open Vite's local URL (normally `http://localhost:5173`). Change the default brand seed with `COLOR_FOUNDRY_SEED='#8757D6' npm run tokens`; the root engine must have been built first, and the starter must be installed from its parent directory so its local file dependency resolves.

The starter uses Svelte 5/SvelteKit 2, does not need a database, and includes no migrations. For full run details and architecture see [DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md) and [MULTI_BRAND.md](docs/MULTI_BRAND.md).

## Verification

```bash
npm run check
npm test
npm run build
node --check demo/app.js
node --check examples/generate-tokens.mjs
npm run brand:tokens
```

The TypeScript engine, token validation and exports are covered by automated tests. The **SvelteKit build and Playwright/axe suite remain unverified in this container** because DNS for the npm registry is blocked. However, the generated CSS cascade has now been verified in a real Chromium process using Python Playwright (20 browser configurations and 200 pixel-colour comparisons). Run the starter checks and browser tests on your Mac or use the included GitHub Actions CI workflow.

### Reproducible lockfiles and independent Chromium smoke test

```bash
# Once, on a Mac with npm registry access (generates both lockfiles):
npm run lock:bootstrap

# Optional real CSS browser checks; requires Python Playwright and Chromium:
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:chromium
```

Both `package-lock.json` files are committed to the repository; CI now requires deterministic `npm ci` installs. Python Playwright's CSS check does not replace a SvelteKit build, axe or a manual accessibility audit. Full details are in [RELEASE_0_8.md](docs/RELEASE_0_8.md). An axe pass does not certify WCAG compliance.

## Prior mathematical and perceptual work

See [MATHEMATICS.md](docs/MATHEMATICS.md), [PERCEPTION_AND_GAMUT.md](docs/PERCEPTION_AND_GAMUT.md), [INTERACTIONS.md](docs/INTERACTIONS.md), and [DESIGN_TOKENS.md](docs/DESIGN_TOKENS.md).

Brand switching does not establish whole-interface WCAG conformance. Scores are engineering heuristics, CVD models are approximations, and real interfaces require browser, keyboard, usability and accessibility testing. Source repository: [NuBlox/Color-Foundry](https://github.com/NuBlox/Color-Foundry). No open-source licence has been selected. The full SvelteKit/axe workflow must be confirmed through CI; the engine and independent Chromium CSS tests do not certify the entire application.