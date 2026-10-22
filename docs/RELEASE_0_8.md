# Color Foundry v0.8 — release validation

This is a **source release**, not a published package or a verified SvelteKit production build.

## Verified in the authoring environment

- TypeScript engine compilation and **47 automated tests**.
- DTCG token/CSS validators covering the existing five-seed sweep: **390 declared contrast checks** and **2,520 validated token entries**.
- Multi-brand generator for Foundry Blue, Evergreen and Royal Plum: six token documents, 1,512 colour/design tokens in total.
- Python Playwright + real local Chromium tests: **20 configurations × 10 computed properties = 200 browser CSS comparisons**, all passing. Cases include manual light/dark, OS themes, overrides against opposite OS choice, and invalid-brand fallback.
- CSS browser checks use each brand's generated DTCG token document, resolving colour aliases to the expected sRGB HEX before comparing actual computed RGB pixel values.
- Shell and Python script syntax checks, and generated artifacts validation.

## What is still *not* verified

- SvelteKit's TypeScript/Svelte compiler run, production bundling and actual hydrated application rendering. No dependency install could be completed: npm registry DNS resolution fails (`EAI_AGAIN`).
- The `@playwright/test` + axe-core SvelteKit suite has not run. It is configured to check WCAG-tagged violations of **all severities** on desktop and mobile for each brand and mode.
- Lockfiles cannot be generated offline from this project (registry metadata and integrity hashes are required). The bootstrap helper is supplied and needs an online npm install. CI uses `npm ci` when lockfiles are available and otherwise emits an explicit warning before using `npm install`.
- No Git remote, main-branch merge, GitHub Actions execution, publishing or independent WCAG conformance certification.

## Run on macOS (online)

```bash
unzip ~/Downloads/Color-Foundry-v0.8.zip -d ~/Developer
cd ~/Developer/color-foundry
npm run lock:bootstrap   # Requires npm registry; produces root and starter lockfiles
npm run ci
npm run brand:tokens
python3 -m pip install playwright
python3 -m playwright install chromium
npm run test:chromium
cd examples/sveltekit
npm run check
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

**Repository follow-up:** create or select the intended GitHub repository, commit the source and both lockfiles, push a branch, run GitHub Actions, resolve failures, merge into `main`, and clean up the task branch. No repository was selected or changed in this environment.

## Scope of browser validation

The CSS fixture uses the generated stylesheet directly. It validates actual sRGB CSS cascade behaviour but does **not** verify SvelteKit hydration, pixel screenshots of the complete UI, user interactions, screen-reader behaviour, colour-managed Display P3 displays or accessibility conformance.
