# Multi-brand design systems — v0.7

Color Foundry generates a separate **palette, audit and DTCG token graph for every brand**. It composes these token sets into one CSS namespace. Component CSS never needs to know the brand name.

## Engine API

```ts
import { createBrandDesignSystem, validateDTCGTokens } from 'color-foundry-engine';

const library = createBrandDesignSystem([
  { id: 'foundry', name: 'Foundry Blue', seed: '#2563EB' },
  { id: 'forest', name: 'Evergreen', seed: '#237A48' },
  { id: 'plum', name: 'Royal Plum', seed: '#8757D6' },
], { defaultBrand: 'foundry', prefix: 'cf' });

const css = library.css;
const forestDarkTokens = library.brands.forest.tokens.dark;
validateDTCGTokens(forestDarkTokens);
```

Brands accept a seed HEX colour **or an already-generated `Palette`**, allowing the user to pass separately optimised brand palettes. `createDesignSystem()`, `createPalette()` and the original CSS outputs remain unchanged.

## CSS selectors and cascade

| Attribute combination | Effective tokens |
|---|---|
| `<html>` | Default brand; OS light/dark |
| `<html data-brand="forest">` | Forest; OS light/dark |
| `<html data-brand="forest" data-theme="light">` | Forest light, regardless of OS |
| `<html data-brand="forest" data-theme="dark">` | Forest dark, regardless of OS |
| `<html data-brand="unknown">` | Default brand; OS light/dark |

The default brand's CSS is emitted first using the existing single-brand selectors. Other brands override it through `:root[data-brand="..."]` selectors. Their manual dark overrides use `:root[data-brand="..."][data-theme="dark"]`, and OS dark uses `:root[data-brand="..."]:not([data-theme])` inside a dark-preference media query. This explicitly separates theme preference from brand preference.

The optional P3 ramps are scoped to each brand. **Semantic and component token values remain audited in sRGB**, rather than automatically replacing a validated colour with an unaudited P3 version.

## SvelteKit starter

`examples/sveltekit/scripts/generate.mjs` emits:

- `src/lib/generated/color-foundry.css` — all three brand themes
- `src/lib/generated/brand-manifest.json` — brand labels, seeds and primary ramps
- `src/lib/generated/brands/{brand}-{light|dark}.json` — six independent 252-token documents
- `src/lib/generated/tokens-light.json` and `tokens-dark.json` — compatibility aliases for the default brand

The starter includes a brand selector and theme selector. Both choices persist in localStorage and are restored in `src/app.html` **before the first paint**. These localStorage keys are example-app settings, not a server-side identity or authentication mechanism.

```bash
# From root: build the engine before running the generator
npm run build
cd examples/sveltekit
npm install
npm run tokens
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

The root engine requires no runtime packages; the SvelteKit example requires network access for its npm dependencies. **The full SvelteKit build and Playwright/axe suite could not be executed in the release environment because npm registry DNS was unavailable.** Chromium's local headless navigation also timed out; the supplied optional `npm run test:chromium` is therefore a reproducible test utility, **not a claimed passing check**. The engine builds and its native automated tests pass.

## Hardening / next stage

For production use, create and commit npm lockfiles after a successful online install, replace CI `npm install` with `npm ci`, run SvelteKit and Playwright/axe in CI, and address any findings. Add brand configurations through validated source files and avoid injecting unknown brand IDs into raw selectors. For multi-tenant use, map the authenticated tenant identity to an allowlisted brand; do not trust a client-provided `data-brand` as an access-control decision.
