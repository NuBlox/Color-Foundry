/** Validate the compiled engine and representative generated outputs.
 * Results are deterministic and printable as a machine-readable JSON report.
 */
import assert from 'node:assert/strict';
import {createDesignSystem,createPalette,optimizePalette,validateDTCGTokens,validateCSSReferences,createCategoricalPalette} from '../dist/index.js';

const seeds=['#2563EB','#237A48','#A33A36','#808080','#F3E7C9'];
const reports=[];
for(const seed of seeds){
  const palette=createPalette(seed);
  const {tokens,css}=createDesignSystem(palette);
  const checks=[...palette.checks.light,...palette.checks.dark,...palette.interactionChecks.light,...palette.interactionChecks.dark];
  assert.equal(checks.length,78,`Expected 78 declared contrast checks: ${seed}`);
  assert.ok(checks.every(item=>item.pass),`Contrast failed: ${seed}`);
  const modes={light:validateDTCGTokens(tokens.light),dark:validateDTCGTokens(tokens.dark)};
  const variables=validateCSSReferences(css);
  assert.equal(modes.light.tokenCount,252);
  assert.equal(modes.dark.tokenCount,252);
  const alternate=createDesignSystem(palette);
  assert.equal(css,alternate.css,'Output must be deterministic');
  reports.push({seed,contrastChecks:checks.length,tokenCounts:[modes.light.tokenCount,modes.dark.tokenCount],css:variables});
}
const categories=createCategoricalPalette('#2563EB',{count:12,background:'#101827'});
assert.equal(categories.colors.length,12);
assert.ok(categories.colors.every(c=>c.backgroundContrast>=3 && c.labelContrast>=4.5));
const optimized=optimizePalette('#2563EB',{intent:'balanced',effort:'fast'});
const opt=createDesignSystem(optimized);
assert.ok([...optimized.checks.light,...optimized.checks.dark,...optimized.interactionChecks.light,...optimized.interactionChecks.dark].every(c=>c.pass));
validateDTCGTokens(opt.tokens.light);
validateDTCGTokens(opt.tokens.dark);
validateCSSReferences(opt.css);
console.log(JSON.stringify({release:'0.9.0',categoricalSampleValidated:true,seedSamples:reports.length,optimizedSampleValidated:true,report:reports},null,2));
