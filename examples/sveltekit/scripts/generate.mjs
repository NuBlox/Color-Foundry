/** Build-time multi-brand token generation; no service, database or secret required. */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createBrandDesignSystem, STOPS, validateCSSReferences, validateDTCGTokens } from '../../../dist/index.js';

const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/generated');
const definitions = [
  { id: 'foundry', name: 'Foundry Blue', seed: process.env.COLOR_FOUNDRY_SEED ?? '#2563EB' },
  { id: 'forest', name: 'Evergreen', seed: '#237A48' },
  { id: 'plum', name: 'Royal Plum', seed: '#8757D6' },
];
const collection = createBrandDesignSystem(definitions, { defaultBrand: 'foundry' });
validateCSSReferences(collection.css);
const json = data => JSON.stringify(data, null, 2) + '\n';
const manifest = {
  defaultBrand: collection.defaultBrand,
  brands: definitions.map(definition => {
    const design = collection.brands[definition.id];
    for (const mode of ['light', 'dark']) validateDTCGTokens(design.tokens[mode]);
    if (![...design.palette.checks.light, ...design.palette.checks.dark,
      ...design.palette.interactionChecks.light, ...design.palette.interactionChecks.dark].every(check => check.pass)) {
      throw new Error(`Contrast audit failed for ${definition.id}`);
    }
    return {
      id: definition.id,
      name: definition.name,
      seed: design.palette.seed,
      primary: STOPS.map(step => ({ step, hex: design.palette.scales.primary[step] })),
    };
  }),
};
await mkdir(resolve(directory, 'brands'), {recursive: true});
await Promise.all([
  writeFile(resolve(directory, 'color-foundry.css'), collection.css),
  writeFile(resolve(directory, 'brand-manifest.json'), json(manifest)),
  writeFile(resolve(directory, 'tokens-light.json'), json(collection.brands.foundry.tokens.light)),
  writeFile(resolve(directory, 'tokens-dark.json'), json(collection.brands.foundry.tokens.dark)),
  ...definitions.flatMap(definition => ['light', 'dark'].map(mode =>
    writeFile(resolve(directory, 'brands', `${definition.id}-${mode}.json`),
      json(collection.brands[definition.id].tokens[mode])))),
]);
console.log(`Generated ${definitions.length} brand themes (six mode documents) and validated shared CSS.`);
