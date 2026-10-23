import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bestForeground, compositeSRGB, contrastRatio, deltaEOK,
  gamutMapP3, gamutMapSRGB, inDisplayP3, inSRGB,
  lchToLab, lchToHex, linearSRGBToLinearP3, oklabToLinearRGB,
  parseHex, p3CSS, rgbToOKLab, simulateVision, toHex,
  visionMatrix, wrapHue,
} from '../dist/index.js';

const near = (a,b,e=1e-7)=>assert.ok(Number.isFinite(a) && Math.abs(a-b)<=e,
  'expected '+a+' to equal '+b+' within '+e);

test('WCAG 2.2 independently anchored 8-bit contrast values',()=>{
  for(const [a,b,expected] of [
    ['#000000','#FFFFFF',21],
    ['#777777','#FFFFFF',4.478089453577215],
    ['#767676','#FFFFFF',4.542224959605253],
    ['#0000FF','#FFFFFF',8.592471358428805],
    ['#FF0000','#FFFFFF',3.9984767707539985],
    ['#123456','#ABCDEF',7.697307588979985],
  ]) {
    near(contrastRatio(a,b),expected,1e-11);
    near(contrastRatio(b,a),expected,1e-11);
  }
  assert.equal(bestForeground('#767676').hex,'#000000');
});

test('published OKLab primaries and 256 neutral 8-bit round trips',()=>{
  for(const [hex,l,a,b] of [
    ['#FF0000',.6279553606,.2248630611,.1258462985],
    ['#00FF00',.8664396115,-.2338875742,.1794984799],
    ['#0000FF',.4520137184,-.0324569842,-.3115281477],
    ['#FFFFFF',1,0,0],['#000000',0,0,0],
  ]){
    const v=rgbToOKLab(parseHex(hex));
    near(v.l,l,3e-6);near(v.a,a,3e-6);near(v.b,b,3e-6);
  }
  for(let i=0;i<256;i++){
    const sample=toHex({r:i/255,g:i/255,b:i/255});
    const v=oklabToLinearRGB(rgbToOKLab(parseHex(sample)));
    const encode=x=>x<=.0031308?12.92*x:1.055*Math.max(0,x)**(1/2.4)-.055;
    assert.equal(toHex({r:encode(v.r),g:encode(v.g),b:encode(v.b)}),sample);
  }
});

test('independent D65 linear sRGB-to-P3 matrix vectors',()=>{
  for(const [rgb,expected] of [
    [{r:1,g:0,b:0},[.82246197,.03319420,.01708263]],
    [{r:0,g:1,b:0},[.17753803,.96680580,.07239744]],
    [{r:0,g:0,b:1},[0,0,.91051993]],
  ]){
    const result=linearSRGBToLinearP3(rgb);
    [result.r,result.g,result.b].forEach((v,i)=>near(v,expected[i],2e-7));
  }
});

test('Machado published deciles interpolate adjacent matrices',()=>{
  near(visionMatrix('protanopia',.1)[0],.856167,1e-12);
  near(visionMatrix('protanopia',.15)[0],.7954665,1e-12);
  near(visionMatrix('protanopia',.15)[1],.258455,1e-12);
  near(visionMatrix('deuteranopia',.5)[0],.547494,1e-12);
  near(visionMatrix('tritanopia',.9)[7],.601151,1e-12);
  near(visionMatrix('tritanopia',1)[8],.303900,1e-12);
  assert.equal(simulateVision('#FF0000','protanopia',.5),'#B45600');
  assert.deepEqual(visionMatrix('normal',.5),[1,0,0,0,1,0,0,0,1]);
  assert.deepEqual(visionMatrix('protanopia',0),[1,0,0,0,1,0,0,0,1]);
});

test('invalid numeric colour inputs are rejected before HEX serialization',()=>{
  for(const x of [NaN,Infinity,-Infinity]){
    assert.throws(()=>toHex({r:x,g:0,b:0}),RangeError);
    assert.throws(()=>wrapHue(x),RangeError);
    assert.throws(()=>lchToLab({l:.5,c:.1,h:x}),RangeError);
  }
  assert.throws(()=>lchToLab({l:.5,c:-.1,h:10}),RangeError);
  assert.throws(()=>inSRGB({r:.1,g:.2,b:.3},Infinity),RangeError);
});

test('seeded 1500-vector sRGB/P3 gamut and serialization property audit',()=>{
  let state=0x12345678;
  const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/2**32;};
  for(let i=0;i<1500;i++){
    const input={l:next(),c:next()*.5,h:next()*360};
    const srgb=gamutMapSRGB(input),p3=gamutMapP3(input);
    assert.ok(inSRGB(oklabToLinearRGB(lchToLab(srgb))));
    assert.ok(inDisplayP3(linearSRGBToLinearP3(oklabToLinearRGB(lchToLab(p3)))));
    assert.ok(srgb.c<=input.c+1e-12 && p3.c<=input.c+1e-12);
    assert.equal(srgb.l,input.l);assert.equal(srgb.h,input.h);
    assert.equal(p3.l,input.l);assert.equal(p3.h,input.h);
    assert.match(lchToHex(input),/^#[A-F0-9]{6}$/);
    assert.match(p3CSS(input),/^color\(display-p3 /);
    const lab=rgbToOKLab(parseHex(lchToHex(input)));
    assert.equal(deltaEOK(lab,lab),0);
  }
});

test('Chromium-observed CSS encoded-sRGB source-over reference pixels',()=>{
  assert.equal(compositeSRGB('#FF0000',.5,'#000000'),'#800000');
  assert.equal(compositeSRGB('#FFFFFF',.5,'#000000'),'#808080');
  assert.equal(compositeSRGB('#000000',.5,'#FFFFFF'),'#808080');
});
