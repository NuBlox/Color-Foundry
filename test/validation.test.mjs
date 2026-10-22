import test from 'node:test';
import assert from 'node:assert/strict';
import {createDesignSystem, validateDTCGTokens, validateCSSReferences} from '../dist/index.js';

const original=createDesignSystem('#2563EB');
const clone=()=>structuredClone(original.tokens.light);
const change=(fn)=>{ const d=clone(); fn(d); return d; };

test('both mode token documents pass value and alias validation',()=>{
  for(const mode of ['light','dark']){
    const report=validateDTCGTokens(original.tokens[mode]);
    assert.equal(report.tokenCount,252);
    assert.ok(report.aliasCount>50);
    assert.ok(report.types.color>200);
    assert.equal(report.types.fontWeight,3);
  }
});

test('CSS generated in both default and custom namespaces contains no dangling var references',()=>{
  const a=validateCSSReferences(original.css);
  assert.ok(a.declarations>300);
  assert.ok(a.references>50);
  const custom=createDesignSystem('#A34762',{prefix:'foundry'});
  assert.ok(validateCSSReferences(custom.css,'foundry').declarations>300);
});

test('CSS validator rejects a missing namespaced reference',()=>{
  assert.throws(()=>validateCSSReferences(':root{color:var(--cf-not-declared)}'),/Undeclared CSS variable/);
  assert.throws(()=>validateCSSReferences('','evil;style'),/safe variable prefix/);
});

test('token validation catches invalid RGB ranges, count and colorSpace',()=>{
  for(const bad of [
    {components:[2,0,0]},
    {components:[1,0]},
    {colorSpace:'not-rgb'},
    {components:[NaN,0,0]},
    {alpha:-0.01},
    {alpha:1.01},
    {hex:'#FF0000'}
  ]){
    const doc=change(d=>Object.assign(d.color.srgb.primary['500'].$value,bad));
    assert.throws(()=>validateDTCGTokens(doc),/Invalid token/);
  }
});

test('token validation rejects unsupported dimensions, durations and weight',()=>{
  for(const [path,changeValue] of [
    ['space',v=>v.unit='vw'],
    ['motion',v=>v.unit='minutes'],
    ['weight',()=>{}]
  ]){
    const doc=change(d=>{
      if(path==='space')changeValue(d.space['4'].$value);
      if(path==='motion')changeValue(d.motion.quick.$value);
      if(path==='weight')d.typography.weight.bold.$value=1001;
    });
    assert.throws(()=>validateDTCGTokens(doc),/Invalid token/);
  }
});

test('token validation rejects token/group mixtures, malformed references and missing targets',()=>{
  assert.throws(()=>validateDTCGTokens(change(d=>d.color.semantic.primary.nested={})),/nested groups/);
  assert.throws(()=>validateDTCGTokens(change(d=>d.color.semantic.primary.$value='{bad{alias}')),/malformed token alias/);
  assert.throws(()=>validateDTCGTokens(change(d=>d.color.semantic.primary.$value='{color.srgb.doesNotExist.500}')),/Unresolved token alias/);
  assert.throws(()=>validateDTCGTokens(change(d=>d.color.semantic.primary.$value='{radius.sm}')),/Alias type mismatch/);
});

test('token validation detects circular references and missing schema',()=>{
  assert.throws(()=>validateDTCGTokens(change(d=>{
    d.color.semantic.primary.$value='{color.semantic.text}';
    d.color.semantic.text.$value='{color.semantic.primary}';
  })),/Circular token alias/);
  assert.throws(()=>validateDTCGTokens(change(d=>{delete d.$schema;})),/unexpected 2025.10 schema/);
});

test('validator rejects unsafe group keys and non-leaf scalar tokens',()=>{
  assert.throws(()=>validateDTCGTokens(change(d=>{d.color['bad.name']={};})),/invalid token or group name/);
  assert.throws(()=>validateDTCGTokens(change(d=>{d.color.srgb.primary['500']=42;})),/expected group or token object/);
});
