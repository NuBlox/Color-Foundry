import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHex, toHex, rgbToOKLab, oklabToLinearRGB, inSRGB, lchToLab,
  hexToLch, gamutMapSRGB, lchToHex, contrastRatio, deltaEOK,
  bestForeground, generateScale, STOPS, createPalette,
} from '../dist/index.js';

const approx = (a,b, tolerance = 1e-6) => assert.ok(Math.abs(a-b) < tolerance, `${a} should be within ${tolerance} of ${b}`);

const known = [
  ['#FF0000', .6279553606, .2248630611, .1258462985],
  ['#00FF00', .8664396115, -.2338875742, .1794984799],
  ['#0000FF', .4520137184, -.0324569842, -.3115281477],
  ['#FFFFFF', 1, 0, 0],
  ['#000000', 0, 0, 0],
];

test('known OKLab reference values from standard implementation', () => {
  for (const [hex, l, a, b] of known) {
    const lab = rgbToOKLab(parseHex(hex));
    approx(lab.l,l,3e-6); approx(lab.a,a,3e-6); approx(lab.b,b,3e-6);
  }
});

test('sRGB/OKLab round trips at byte precision', () => {
  for (const hex of ['#123456','#FFFFFF','#FF0000','#00FFFF','#FF00FF','#808080','#F4E9E1']) {
    const rgb = parseHex(hex); const lab = rgbToOKLab(rgb);
    const lin = oklabToLinearRGB(lab);
    // Equivalent 8-bit hex after applying standard sRGB transfer function.
    const gamma = x => x <= .0031308 ? 12.92*x : 1.055*x**(1/2.4)-.055;
    const rebuilt = toHex({ r: gamma(lin.r), g: gamma(lin.g), b: gamma(lin.b) });
    assert.equal(rebuilt,hex);
  }
});

test('hex parsing rejects alpha, invalid CSS strings, and malformed content', () => {
  assert.equal(toHex(parseHex('#abc')),'#AABBCC');
  for(const v of ['red','#abcd','#12345678','rgb(1 2 3)','xyz','#1a','#12345']) {
    assert.throws(()=>parseHex(v));
  }
});

test('WCAG contrast reference endpoints', () => {
  approx(contrastRatio('#FFFFFF','#000000'),21,1e-12);
  approx(contrastRatio('#000000','#000000'),1,1e-12);
  approx(contrastRatio('#FFFFFF','#FFFFFF'),1,1e-12);
  assert.equal(bestForeground('#FEFEFE').hex,'#000000');
  assert.equal(bestForeground('#020202').hex,'#FFFFFF');
});

test('gamut projection changes only chroma and preserves L / hue', () => {
  const input={l:.75,c:.4,h:265};
  assert.equal(inSRGB(oklabToLinearRGB(lchToLab(input))),false);
  const mapped=gamutMapSRGB(input);
  assert.ok(mapped.c < input.c);
  assert.equal(mapped.l,input.l);
  assert.equal(mapped.h,input.h);
  assert.equal(inSRGB(oklabToLinearRGB(lchToLab(mapped))),true);
  assert.match(lchToHex(input),/^#[A-F0-9]{6}$/);
});

test('every generated scale is ordered with nonduplicate stops and approximately equal ΔEOK',()=>{
  for(const [h,c] of [[265,.21],[25,.25],[125,.3],[310,.19],[0,0]]) {
    const p=generateScale(h,c);
    const labs=STOPS.map(k=>rgbToOKLab(parseHex(p[k])));
    const edges=labs.slice(1).map((v,i)=>deltaEOK(labs[i],v));
    assert.equal(new Set(STOPS.map(k=>p[k])).size,11);
    for(let i=1;i<labs.length;i++) assert.ok(labs[i-1].l>labs[i].l);
    const mean=edges.reduce((a,b)=>a+b,0)/edges.length;
    assert.ok(Math.max(...edges.map(d=>Math.abs(d-mean)/mean)) < .16, `steps are uneven: ${JSON.stringify(edges)}`);
  }
});

test('generation is deterministic, CSS contains expected tokens, and seed is preserved',()=>{
  const a=createPalette('#2563eb');
  assert.deepEqual(a,createPalette('#2563EB'));
  assert.equal(a.seed,'#2563EB');
  assert.ok(a.css.includes('--palette-source: #2563EB;'));
  assert.ok(a.css.includes('--palette-primary-500:'));
  assert.ok(a.css.includes('[data-theme="dark"]'));
  assert.ok(a.css.includes('--color-on-primary:'));
  approx(hexToLch('#2563EB').l, a.seedLch.l);
});

test('light/dark semantic combinations meet the declared WCAG contrast thresholds',()=>{
  const seeds = ['#2563EB','#FF0000','#00FF00','#0000FF','#0F172A','#FFFFFF','#000000','#FF00FF','#FFFF00','#808080'];
  // Deterministic diversity sweep; repeatable across machines.
  for(let i=0;i<96;i++) seeds.push('#'+((i*1299721+376319)&0xFFFFFF).toString(16).padStart(6,'0'));
  for(const seed of seeds) {
    const palette=createPalette(seed);
    for(const themeName of ['light','dark']){
      const theme=palette[themeName];
      for (const test of palette.checks[themeName]) {
        assert.ok(test.pass,`${seed}, ${themeName} ${test.role}: ${test.ratio} < ${test.minimum}`);
        approx(test.ratio,contrastRatio(test.foreground,test.background),1e-12);
      }
      assert.ok(contrastRatio(theme.text,theme.surfaceRaised)>=7,`${seed} text on raised surface`);
      assert.ok(contrastRatio(theme.textMuted,theme.surfaceRaised)>=4.5,`${seed} muted on raised surface`);
    }
  }
});
