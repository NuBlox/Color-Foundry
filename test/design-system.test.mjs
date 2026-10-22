import test from 'node:test';
import assert from 'node:assert/strict';
import { createPalette, createDesignSystem, toDTCGTokens, resolveTokens,
  toDesignSystemCSS, optimizePalette, contrastRatio } from '../dist/index.js';

const seed='#2563EB';
const palette=createPalette(seed);
const ds=createDesignSystem(palette);

test('v0.5 exports 252 self-contained tokens per theme and resolves typed aliases',()=>{
  for (const mode of ['light','dark']) {
    const doc=ds.tokens[mode];
    assert.equal(doc.$schema,'https://www.designtokens.org/schemas/2025.10/format.json');
    assert.equal(Object.keys(resolveTokens(doc)).length,252);
    assert.equal(doc.color.component.button.primary.background.$value,'{color.semantic.primary}');
    assert.equal(resolveTokens(doc)['color.component.button.primary.background'].$value.hex, palette[mode].primary.toLowerCase());
    assert.equal(resolveTokens(doc)['color.component.button.primary.foreground'].$value.hex,palette[mode].onPrimary.toLowerCase());
    assert.equal(resolveTokens(doc)['color.component.focus.ring'].$value.hex,palette.interactions[mode].focusRing.toLowerCase());
    const color=resolveTokens(doc)['color.srgb.primary.500'].$value;
    assert.equal(color.colorSpace,'srgb');
    assert.deepEqual(color.components.map(x=>Math.round(x*255)),[42,107,251]);
    assert.equal(doc.space['0'].$value.unit,'px');
    assert.deepEqual(doc.typography.family.$value,['Inter','system-ui','sans-serif']);
  }
});

test('translucent overlays are exported as typed sRGB plus independent alpha',()=>{
  for(const mode of ['light','dark']) {
    const state=ds.tokens[mode].color.state;
    assert.equal(state.overlayTint.$value.alpha,.1);
    assert.equal(state.overlayTint.$value.colorSpace,'srgb');
    assert.equal(state.overlayScrim.$value.hex,undefined);
    assert.match(ds.css,/--cf-color-state-overlay-tint: rgb\(/);
  }
});

test('compiled CSS aliases preserve audited sRGB roles, while P3 is isolated',()=>{
  assert.match(ds.css,/--cf-color-component-button-primary-background: var\(--cf-color-semantic-primary\)/);
  assert.match(ds.css,/--cf-color-semantic-primary: var\(--cf-color-srgb-primary-/);
  assert.match(ds.css,/\[data-theme="dark"\]/);
  assert.match(ds.css,/:root:not\(\[data-theme\]\)/);
  assert.match(ds.css,/\[data-theme="dark"\] \{[\s\S]*--cf-color-semantic-primary:/);
  assert.match(ds.css,/@supports \(color: color\(display-p3 1 0 0\)\)/);
  assert.match(ds.css,/--cf-p3-primary-500: color\(display-p3 /);
  assert.doesNotMatch(ds.css,/--cf-color-semantic-primary: var\(--cf-p3-/);
  assert.ok([...palette.checks.light,...palette.checks.dark,...palette.interactionChecks.light,...palette.interactionChecks.dark].every(c=>c.pass));
});

test('portable tokens are deterministic and JSON-serializable',()=>{
  const a=createDesignSystem(seed);const b=createDesignSystem(seed);
  assert.equal(a.css,b.css);
  assert.deepEqual(JSON.parse(JSON.stringify(a.tokens)),JSON.parse(JSON.stringify(b.tokens)));
  assert.deepEqual(toDTCGTokens(palette,'light'),a.tokens.light);
  assert.equal(toDesignSystemCSS(palette),a.css);
  assert.match(createDesignSystem(seed,{prefix:'nublox'}).css,/--nublox-color-component-card-background/);
});

test('invalid CSS prefix is rejected rather than injected into stylesheet',()=>{
  for(const bad of ['','CF','unsafe;}', 'x--y','123','x y','--a']) {
    assert.throws(()=>createDesignSystem(palette,{prefix:bad}),RangeError);
  }
});

test('resolver catches unresolved, circular and cross-type aliases',()=>{
  const doc=structuredClone(ds.tokens.light);
  doc.color.component.button.primary.background.$value='{color.noSuchToken}';
  assert.throws(()=>resolveTokens(doc),/Unresolved token alias/);
  const circular=structuredClone(ds.tokens.light);
  circular.color.component.button.primary.background.$value='{color.component.button.primary.hover}';
  circular.color.component.button.primary.hover.$value='{color.component.button.primary.background}';
  assert.throws(()=>resolveTokens(circular),/Circular token alias/);
  const wrong=structuredClone(ds.tokens.light);
  wrong.color.component.button.primary.background.$value='{radius.md}';
  assert.throws(()=>resolveTokens(wrong),/Alias type mismatch/);
});

test('status and component colours retain both-mode semantic accessibility',()=>{
  for(const mode of ['light','dark']) {
    const r=resolveTokens(ds.tokens[mode]);
    for (const status of ['success','warning','danger','info']) {
      const fg=r[`color.component.status.${status}.foreground`].$value.hex;
      const bg=r[`color.component.status.${status}.background`].$value.hex;
      assert.ok(contrastRatio(fg,bg)>=4.5);
    }
  }
});

test('optimised output compiles independently with same design-system API',()=>{
  const optimised=optimizePalette('#237A48',{intent:'restrained',effort:'fast'});
  const output=createDesignSystem(optimised);
  assert.match(output.css,/--cf-color-semantic-background:/);
  assert.equal(resolveTokens(output.tokens.dark)['color.component.button.primary.background'].$value.hex,optimised.dark.primary.toLowerCase());
});
