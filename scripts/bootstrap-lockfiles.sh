#!/usr/bin/env bash
# Run once on an online Mac/Linux machine; commit both generated lockfiles.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if ! command -v npm >/dev/null; then
  echo 'npm is required (Node.js 22 recommended).' >&2
  exit 1
fi

printf '\n=== Root package-lock.json ===\n'
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --no-audit --no-fund
npm run ci

printf '\n=== SvelteKit package-lock.json ===\n'
cd "$ROOT/examples/sveltekit"
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm ci --no-audit --no-fund
npm run check
npm run build

printf '\nLockfiles generated successfully. Run the browser tests after installing Chromium:\n'
printf '  cd %s/examples/sveltekit\n' "$ROOT"
printf '  npx playwright install chromium\n'
printf '  npm run test:e2e\n'
printf '\nCommit BOTH lockfiles to enable npm ci in CI:\n'
printf '  %s/package-lock.json\n' "$ROOT"
printf '  %s/examples/sveltekit/package-lock.json\n' "$ROOT"
