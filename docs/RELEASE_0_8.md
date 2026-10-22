# Color Foundry v0.8 — release validation

This is a **source release** in [NuBlox/Color-Foundry](https://github.com/NuBlox/Color-Foundry), not an npm-published package or a whole-interface WCAG certification.

## Verified in the authoring environment

- TypeScript engine compilation and **47 automated tests**.
- DTCG token/CSS validators covering the existing five-seed sweep: **390 declared contrast checks** and **2,520 validated token entries**.
- Multi-brand generator for Foundry Blue, Evergreen and Royal Plum: six token documents, 1,512 colour/design tokens in total.
- Python Playwright + real local Chromium tests: **20 configurations × 10 computed properties = 200 browser CSS comparisons**, all passing. Cases include manual light/dark, OS themes, overrides against opposite OS choice, and invalid-brand fallback.
- CSS browser checks use each brand's generated DTCG token document, resolving colour aliases to the expected sRGB HEX before comparing actual computed RGB pixel values.
- Shell and Python script syntax checks, and generated artifacts validation.

## Online CI and remaining verification

- GitHub Actions has successfully installed dependencies, type-checked and built the SvelteKit application. The first Playwright run uncovered hydration-timing and test-fixture persistence issues. These have been addressed in the accompanying changes, subject to CI confirmation.
- The root and SvelteKit npm lockfiles were exported from the online GitHub Actions runner and are now committed for `npm ci` reproducibility.
- The full Playwright/axe suite is the release gate. Passing axe automation does not certify screen-reader usability, all interactive states, or entire-interface WCAG conformance.
- Colour-managed Display P3 hardware rendering and external usability evaluation remain outstanding.

## Run on macOS (online)

```bash
git clone https://github.com/NuBlox/Color-Foundry.git ~/Developer/Color-Foundry
cd ~/Developer/Color-Foundry
npm ci
npm run ci
npm run brand:tokens
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:chromium
cd examples/sveltekit
npm ci
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

**Repository:** source is hosted on `main`; check [GitHub Actions](https://github.com/NuBlox/Color-Foundry/actions) for the latest CI conclusion before declaring the release fully verified.

## Scope of browser validation

The CSS fixture uses the generated stylesheet directly. It validates actual sRGB CSS cascade behaviour but does **not** verify SvelteKit hydration, pixel screenshots of the complete UI, user interactions, screen-reader behaviour, colour-managed Display P3 displays or accessibility conformance.