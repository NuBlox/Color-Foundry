import test from 'node:test';
import assert from 'node:assert/strict';
import { compositeSRGB, rgbaCSS, createPalette, createPaletteWithParameters,
  DEFAULT_PARAMETERS, contrastRatio, deltaEOK, rgbToOKLab, parseHex,
  optimizePalette, auditInteractions } from '../dist/index.js';

const d=(a,b)=>deltaEOK(rgbToOKLab(parseHex(a)),rgbToOKLab(parseHex(b)));

test('source-over alpha compositing is performed on CSS sRGB channels before WCAG measurement',()=>{
  assert.equal(compositeSRGB('#FF0000',.25,'#0000FF'),'#4000BF');
  assert.equal(compositeSRGB('#000000',.5,'#FFFFFF'),'#808080');
  assert.equal(compositeSRGB('#808080',.5,'#FFFFFF'),'#C0C0C0');
  assert.equal(compositeSRGB('#FF0000',0,'#123456'),'#123456');
  assert.equal(compositeSRGB('#FF0000',1,'#123456'),'#FF0000');
  const composited=compositeSRGB('#FF0000',.25,'#FFFFFF');
  assert.equal(composited,'#FFBFBF');
  assert.ok(contrastRatio('#000000',composited)>1);
  assert.equal(rgbaCSS('#2563EB',.125),'rgb(37 99 235 / 0.125)');
  for(const alpha of [-.1,1.1,NaN,Infinity]) {
    assert.throws(()=>compositeSRGB('#FFFFFF',alpha,'#000000'),RangeError);
    assert.throws(()=>rgbaCSS('#FFFFFF',alpha),RangeError);
  }
  assert.throws(()=>compositeSRGB('red',.5,'#000000'),TypeError);
});

test('generated states have mathematically distinct active steps and tested contrast',()=>{
  const seed=createPalette('#2563EB');
  for(const mode of ['light','dark']){
    const state=seed.interactions[mode], theme=seed[mode];
    assert.ok(d(theme.primary,state.primaryHover)>=.012);
    assert.ok(d(theme.primary,state.primaryPressed)>=.035);
    assert.ok(d(state.primaryHover,state.primaryPressed)>=.012);
    assert.ok(contrastRatio(theme.onPrimary,state.primaryHover)>=4.5);
    assert.ok(contrastRatio(theme.onPrimary,state.primaryPressed)>=4.5);
    assert.equal(seed.interactionChecks[mode].length,16);
    assert.deepEqual(seed.interactionChecks[mode],auditInteractions(theme,state));
    assert.ok(seed.interactionChecks[mode].every(c=>c.pass));
    assert.equal(state.overlayTintOnSurface,compositeSRGB(theme.primary,.10,theme.surface));
    assert.equal(state.overlayScrimOnSurface,compositeSRGB('#000000',mode==='dark'?.44:.56,theme.surface));
    assert.match(state.overlayTint,/^rgb\(\d+ \d+ \d+ \/ 0\.1\)$/);
    assert.ok(contrastRatio(state.focusRing,theme.surfaceRaised)>=3);
  }
});

test('broad deterministic seed sample meets interaction and existing semantic contrast targets',()=>{
  const seeds=['#2563EB','#FF0000','#00FF00','#0000FF','#0F172A',
    '#FFFFFF','#000000','#FF00FF','#FFFF00','#808080'];
  for(let i=0;i<96;i++) seeds.push('#'+((i*1299721+376319)&0xFFFFFF).toString(16).padStart(6,'0'));
  for (const color of seeds){
    const palette=createPalette(color);
    for (const mode of ['light','dark']){
      for (const check of [...palette.checks[mode],...palette.interactionChecks[mode]]) {
        assert.ok(check.pass,`${color} ${mode} ${check.role}: ${check.ratio} < ${check.minimum}`);
        assert.equal(check.ratio,contrastRatio(check.foreground,check.background));
      }
    }
  }
});

test('interaction token CSS exports both themes with unrounded alpha and semantic P3 isolation',()=>{
  const palette=createPalette('#2563EB');
  assert.match(palette.css,/--color-primary-hover: #[0-9A-F]{6};/);
  assert.match(palette.css,/--color-primary-pressed: #[0-9A-F]{6};/);
  assert.match(palette.css,/--color-selected-indicator: #[0-9A-F]{6};/);
  assert.match(palette.css,/--color-overlay-tint: rgb\(\d+ \d+ \d+ \/ 0\.1\);/);
  assert.match(palette.css,/--color-focus-ring: #[0-9A-F]{6};/);
  assert.match(palette.css,/\[data-theme="dark"\] \{[\s\S]*--color-primary-pressed/);
  // P3 may override raw swatches, but not contrast-audited state roles.
  assert.ok(!palette.css.split('@supports')[1].includes('--color-primary-hover'));
});

test('constraint-based optimiser includes state accessibility in feasible candidates',()=>{
  const optimized=optimizePalette('#2563EB',{intent:'balanced',effort:'fast'});
  assert.ok(optimized.optimisation.optimizedScore>=optimized.optimisation.baselineScore);
  assert.ok([...optimized.interactionChecks.light,...optimized.interactionChecks.dark].every(check=>check.pass));
  const custom=createPaletteWithParameters('#2088F0',{...DEFAULT_PARAMETERS,chromaMultiplier:.84});
  assert.ok([...custom.interactionChecks.light,...custom.interactionChecks.dark].every(check=>check.pass));
});
