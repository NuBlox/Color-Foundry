import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBrandDesignSystem, createDesignSystem, validateCSSReferences,
  validateDTCGTokens, resolveTokens, contrastRatio,
} from '../dist/index.js';

const definitions = [
  {id:'foundry', name:'Foundry Blue',seed:'#2563EB'},
  {id:'forest', name:'Evergreen',seed:'#237A48'},
  {id:'plum', name:'Royal Plum',seed:'#8757D6'},
];
let multi;
test('builds three deterministic brands and preserves existing single-brand outputs',()=>{
  multi=createBrandDesignSystem(definitions,{defaultBrand:'foundry'});
  assert.equal(multi.defaultBrand,'foundry');
  assert.equal(multi.prefix,'cf');
  assert.deepEqual(Object.keys(multi.brands),['foundry','forest','plum']);
  assert.ok(multi.css.startsWith(createDesignSystem('#2563EB').css.trimEnd()));
  assert.equal(multi.css,createBrandDesignSystem(definitions,{defaultBrand:'foundry'}).css);
  assert.equal(multi.brands.forest.palette.seed,'#237A48');
  assert.equal(multi.brands.plum.palette.seed,'#8757D6');
});

test('scopes all branded light, manual-dark and system-dark declarations',()=>{
  const css=multi.css;
  for(const brand of ['forest','plum']) {
    assert.match(css,new RegExp(`:root\\[data-brand="${brand}"\\] \\{[\\s\\S]*?--cf-color-semantic-primary:`));
    assert.match(css,new RegExp(`:root\\[data-brand="${brand}"\\]\\[data-theme="dark"\\] \\{[\\s\\S]*?--cf-color-semantic-primary:`));
    assert.ok(css.includes(`:root[data-brand="${brand}"]:not([data-theme]) {`));
    assert.match(css,new RegExp(`:root\\[data-brand="${brand}"\\] \\{[\\s\\S]*?--cf-p3-primary-500: color\\(display-p3 `));
  }
  assert.ok(!css.includes('--cf-color-semantic-primary: var(--cf-p3-'));
  assert.equal(validateCSSReferences(css).references > 200,true);
});

test('all independent brand themes resolve and pass every declared contrast check',()=>{
  let total=0;
  for(const brand of Object.values(multi.brands)) {
    for(const mode of ['light','dark']) {
      const report=validateDTCGTokens(brand.tokens[mode]);
      assert.equal(report.tokenCount,252);
      const resolved=resolveTokens(brand.tokens[mode]);
      const bg=resolved['color.component.button.primary.background'].$value.hex;
      const fg=resolved['color.component.button.primary.foreground'].$value.hex;
      assert.ok(contrastRatio(fg,bg)>=4.5);
      const audits=[...brand.palette.checks[mode],...brand.palette.interactionChecks[mode]];
      assert.equal(audits.length,39);
      assert.ok(audits.every(a=>a.pass));
      total+=audits.length;
    }
  }
  assert.equal(total,234);
});

test('non-first default brand does not inherit an unscoped competitor',()=>{
  const alternative=createBrandDesignSystem(definitions,{defaultBrand:'forest'});
  assert.ok(alternative.css.startsWith(createDesignSystem('#237A48').css.trimEnd()));
  assert.ok(alternative.css.includes(':root[data-brand="foundry"]'));
  assert.ok(!alternative.css.includes(':root[data-brand="forest"] {'));
});

test('rejects invalid, missing or duplicate brand identities and invalid prefixes',()=>{
  assert.throws(()=>createBrandDesignSystem([]),/At least one brand/);
  assert.throws(()=>createBrandDesignSystem(definitions,{defaultBrand:'missing'}),/Unknown default brand/);
  assert.throws(()=>createBrandDesignSystem([definitions[0],definitions[0]]),/Duplicate brand ID/);
  assert.throws(()=>createBrandDesignSystem([{id:'Bad Brand',name:'X',seed:'#2563EB'}]),/Invalid brand ID/);
  assert.throws(()=>createBrandDesignSystem([{id:'x',name:' ',seed:'#2563EB'}]),/display name/);
  assert.throws(()=>createBrandDesignSystem(definitions,{prefix:'x;}' }),/Invalid CSS token prefix/);
});

test('namespaced brands export independent token structures',()=>{
  const named=createBrandDesignSystem(definitions,{prefix:'nublox'});
  assert.match(named.css,/--nublox-color-component-button-primary-background/);
  assert.match(named.css,/:root\[data-brand="forest"\]/);
  assert.equal(validateCSSReferences(named.css,'nublox').references>200,true);
  const defaultCss=named.brands.foundry.css;
  assert.ok(named.css.startsWith(defaultCss.trimEnd()));
  const blue=named.brands.foundry.tokens.light.color.srgb.primary['500'].$value.hex;
  const green=named.brands.forest.tokens.light.color.srgb.primary['500'].$value.hex;
  assert.notEqual(blue,green);
});
