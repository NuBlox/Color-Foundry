import test from 'node:test';
import assert from 'node:assert/strict';
import {
  simulateVision, visionDistance, auditVision, linearSRGBToLinearP3,
  inDisplayP3, gamutMapP3, p3CSS, p3GamutAdvantage,
  hexToLch, gamutMapSRGB, createPalette, optimizePalette,
} from '../dist/index.js';
const near=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<epsilon,`${a} should be near ${b}`);

test('Machado simulation preserves identity at zero severity and validates modes',()=>{
  const hex='#E63946';
  for(const mode of ['protanopia','deuteranopia','tritanopia']){
    assert.equal(simulateVision(hex,mode,0),hex);
    assert.notEqual(simulateVision(hex,mode),hex);
    assert.match(simulateVision(hex,mode,.6),/^#[0-9A-F]{6}$/);
    near(visionDistance(hex,hex,mode),0,1e-12);
  }
  assert.equal(simulateVision(hex,'normal'),hex);
  assert.throws(()=>simulateVision(hex,'invented'),RangeError);
  assert.throws(()=>simulateVision(hex,'protanopia',-1),RangeError);
  assert.throws(()=>simulateVision(hex,'protanopia',NaN),RangeError);
  assert.throws(()=>simulateVision('#abc','tritanopia',1.1),RangeError);
});

test('full-severity red/green discrimination is substantially reduced for protanopia and deuteranopia',()=>{
  const normal=visionDistance('#FF0000','#00FF00','normal');
  assert.ok(visionDistance('#FF0000','#00FF00','protanopia')<normal*.90);
  assert.ok(visionDistance('#FF0000','#00FF00','deuteranopia')<normal*.8);
  const info=auditVision({red:'#FF0000', green:'#00FF00', blue:'#0000FF'});
  assert.equal(info.comparisons.length,3);
  assert.ok(info.minimumSimulatedDistance>=0);
  assert.ok(info.weakest);
});

test('linear sRGB to linear Display P3 uses D65 primary matrices',()=>{
  const red=linearSRGBToLinearP3({r:1,g:0,b:0});
  near(red.r,.822462,1e-5);
  near(red.g,.0331942,1e-5);
  near(red.b,.0170826,1e-5);
  assert.ok(inDisplayP3(red));
});

test('Display P3 gamut projection preserves L and hue while allowing wider chroma',()=>{
  const red=hexToLch('#FF0000');
  const value=p3CSS(red);
  assert.match(value,/^color\(display-p3 [0-9.]+ [0-9.]+ [0-9.]+\)$/);
  const vivid={l:.7,c:.4,h:145};
  const s=gamutMapSRGB(vivid);
  const p=gamutMapP3(vivid);
  assert.ok(p.c>=s.c-1e-6);
  assert.ok(p.c>s.c+.003);
  assert.equal(p.h,vivid.h);
  assert.equal(p.l,vivid.l);
  const comparison=p3GamutAdvantage(vivid);
  near(comparison.extraChroma,p.c-s.c,1e-8);
  assert.throws(()=>p3CSS({l:Infinity,c:2,h:30}),RangeError);
});

test('palette publishes real P3 overrides, preserves audited sRGB semantics, and exposes CVD metrics',()=>{
  const p=createPalette('#00FF00');
  assert.equal(Object.keys(p.scales).length,13);
  assert.equal(Object.keys(p.p3Scales).length,13);
  assert.ok(p.wideGamut.enhancedSwatches>0);
  assert.match(p.css, /@supports \(color: color\(display-p3 1 0 0\)\)/);
  assert.match(p.css, /@media \(color-gamut: p3\)/);
  assert.match(p.css, /--palette-primary-500: color\(display-p3/);
  assert.match(p.css, /--color-success-surface:/);
  assert.ok(!p.css.slice(p.css.indexOf('@supports')).includes('--color-text:'));
  assert.ok(p.vision.statuses.comparisons.length>0);
  for(const theme of ['light','dark']) assert.equal(p.checks[theme].filter(x=>x.pass).length,23);
  const q=optimizePalette('#00FF00');
  assert.ok(q.optimisation.components.cvdSeparation>=0);
  assert.ok(q.optimisation.components.cvdSeparation<=1);
});
