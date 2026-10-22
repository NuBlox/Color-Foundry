import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCategoricalPalette, contrastRatio, visionDistance, bestForeground, VISION_MODES,
} from '../dist/index.js';

const sampleSeeds = ['#2563EB','#237A48','#808080','#D93F4D','#FEFAE0'];

test('categorical palettes are deterministic, unique and preserve feasible seeds', () => {
  const a=createCategoricalPalette('#2563eb');
  assert.deepEqual(a,createCategoricalPalette('#2563EB'));
  assert.equal(a.colors.length,8);
  assert.equal(a.colors[0].hex,'#2563EB');
  assert.equal(new Set(a.colors.map(c=>c.hex)).size,8);
  assert.match(a.css,/--cf-category-8: #[0-9A-F]{6};/);
  assert.match(a.css,/--cf-on-category-8: #(?:000000|FFFFFF);/);
});

test('all marks and on-mark text are contrast checked on final hex values',()=>{
  for (const background of ['#FFFFFF','#101827','#777777']) {
    for (const seed of sampleSeeds) {
      const palette=createCategoricalPalette(seed,{count:12,background,minBackgroundContrast:3});
      assert.equal(palette.colors.length,12);
      assert.equal(new Set(palette.colors.map(x=>x.hex)).size,12);
      for (const color of palette.colors) {
        assert.ok(contrastRatio(color.hex,background)>=3-1e-10);
        assert.ok(contrastRatio(color.onColor,color.hex)>=4.5);
        assert.equal(color.onColor,bestForeground(color.hex).hex);
      }
    }
  }
});

test('every reported minimum simulated ΔE is derived from the emitted swatches',()=>{
  const palette=createCategoricalPalette('#C0A0E8',{count:10,background:'#101827'});
  for (const mode of VISION_MODES) {
    let min=Infinity;
    for(let i=0;i<palette.colors.length;i++) for(let j=i+1;j<palette.colors.length;j++)
      min=Math.min(min,visionDistance(palette.colors[i].hex,palette.colors[j].hex,mode));
    assert.ok(Math.abs(min-palette.minimumDistances[mode])<1e-12);
  }
  const {first,second,mode,distance}=palette.weakestPair;
  assert.equal(distance,visionDistance(palette.colors[first-1].hex,palette.colors[second-1].hex,mode));
});

test('contrast-constrained selection replaces infeasible seed and preserves possible ones',()=>{
  const palette=createCategoricalPalette('#FAFAFA',{background:'#FFFFFF',count:4});
  assert.notEqual(palette.colors[0].hex,palette.seed);
  assert.ok(palette.cautions.some(c=>c.includes('source colour')));
  const black=createCategoricalPalette('#000000',{count:2});
  assert.equal(black.colors[0].hex,'#000000');
});

test('rejects invalid constraints, CSS prefixes and seed/background formats',()=>{
  for(const count of [0,1,13,2.5,NaN,Infinity])
    assert.throws(()=>createCategoricalPalette('#123456',{count}),RangeError);
  for(const minBackgroundContrast of [0,7.1,NaN,Infinity])
    assert.throws(()=>createCategoricalPalette('#123456',{minBackgroundContrast}),RangeError);
  for(const prefix of ['','Bad','--a','a;foo','a--b','a-','0abc'])
    assert.throws(()=>createCategoricalPalette('#123456',{prefix}),TypeError);
  assert.throws(()=>createCategoricalPalette('invalid'),TypeError);
  assert.throws(()=>createCategoricalPalette('#123456',{background:'transparent'}),TypeError);
});
