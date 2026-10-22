import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPalette, createPaletteWithParameters, optimizePalette,
  scorePalette, scaleSpacingCV, contrastRatio, STOPS,
} from '../dist/index.js';

const defaultParameters={chromaMultiplier:1, analogousAngle:30, neutralMultiplier:.10, envelopeExponent:.8};

test('parameterised generator is compatible with legacy generator defaults',()=>{
  const original=createPalette('#2563EB');
  assert.deepEqual(createPaletteWithParameters('#2563EB',defaultParameters), original);
  assert.equal(original.checks.light.length,23);
  assert.equal(original.checks.dark.length,23);
  assert.equal(original.light.link.startsWith('#'),true);
  assert.ok(contrastRatio(original.light.link,original.light.surface) >=4.5);
});

test('objective is a finite, bounded, reproducible engineering score',()=>{
  const a=createPalette('#A85769');
  const v=scorePalette(a,defaultParameters,'balanced');
  assert.ok(v.total>=0 && v.total<=100);
  for(const [key,value] of Object.entries(v)) {
    assert.ok(Number.isFinite(value),key);
    if(key!=='total') assert.ok(value>=0 && value<=1,key);
  }
  assert.equal(scaleSpacingCV(a.scales.primary),scaleSpacingCV(a.scales.primary));
  assert.throws(()=>scorePalette(a,defaultParameters,'not-an-intent'),RangeError);
});

test('fast optimisation is reproducible, does not score below included baseline, and meets all contrast constraints',()=>{
  for(const seed of ['#2563EB','#A85769','#10B981','#999999','#010101']){
    const result=optimizePalette(seed,{intent:'balanced'});
    assert.ok(result.optimisation.evaluatedCandidates>=25);
    assert.ok(result.optimisation.optimizedScore >= result.optimisation.baselineScore - 1e-8);
    assert.equal(result.seed,seed);
    assert.equal(STOPS.length*Object.keys(result.scales).length,143);
    assert.ok(result.css.includes('--color-link:'));
    for(const check of [...result.checks.light,...result.checks.dark]){
      assert.ok(check.pass,`${seed} ${check.role}: ${check.ratio}`);
      assert.ok(check.ratio >= check.minimum);
    }
  }
  assert.deepEqual(optimizePalette('#A85769',{intent:'balanced'}),optimizePalette('#A85769',{intent:'balanced'}));
});

test('vibrant and restrained modes deliver distinct saturated midtone outcomes for a suitable source',()=>{
  const vibrant=optimizePalette('#A85769',{intent:'vibrant'});
  const restrained=optimizePalette('#A85769',{intent:'restrained'});
  assert.notEqual(vibrant.scales.primary[500],restrained.scales.primary[500]);
  assert.ok(vibrant.optimisation.optimizedScore>=vibrant.optimisation.baselineScore);
  assert.ok(restrained.optimisation.optimizedScore>=restrained.optimisation.baselineScore);
  assert.ok(vibrant.optimisation.parameters.chromaMultiplier>restrained.optimisation.parameters.chromaMultiplier);
});

test('thorough mode expands search and invalid parameters are rejected',()=>{
  const p=optimizePalette('#A85769',{intent:'balanced',effort:'thorough'});
  assert.ok(p.optimisation.evaluatedCandidates>25);
  assert.ok(p.optimisation.optimizedScore>=p.optimisation.baselineScore);
  assert.throws(()=>optimizePalette('#2563EB',{intent:'artificial'}),RangeError);
  assert.throws(()=>optimizePalette('#2563EB',{effort:'maximum'}),RangeError);
  assert.throws(()=>createPaletteWithParameters('#2563EB',{...defaultParameters,chromaMultiplier:-2}),RangeError);
  assert.throws(()=>createPaletteWithParameters('#2563EB',{...defaultParameters,analogousAngle:361}),RangeError);
});

test('neutral inputs disclose the limitation of hue-based accent diversity',()=>{
  const gray=optimizePalette('#999999');
  assert.ok(gray.optimisation.cautions.some(x=>x.includes('nearly achromatic')));
});
