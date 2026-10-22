#!/usr/bin/env node
import { createDesignSystem, optimizePalette } from '../dist/index.js';

const args=process.argv.slice(2);
if(args.includes('--help')) {
  console.log(`Usage: node examples/generate-tokens.mjs [#2563EB] [--format=css|light|dark|all] [--prefix=cf] [--optimize] [--intent=balanced|vibrant|restrained]\n\ncss = theme-aware CSS; light/dark = DTCG 2025.10 JSON document; all = combined JSON object.`);
  process.exit(0);
}
function valueFor(flag,defaultValue){return args.find(a=>a.startsWith(`--${flag}=`))?.split('=').slice(1).join('=')??defaultValue;}
const seed=args.find(a=>!a.startsWith('--'))??'#2563EB';
const format=valueFor('format','css');
const intent=valueFor('intent','balanced');
try {
  if(!['css','light','dark','all'].includes(format))throw new RangeError('Invalid export format');
  const p=args.includes('--optimize') ? optimizePalette(seed,{intent}) : seed;
  const ds=createDesignSystem(p,{prefix:valueFor('prefix','cf')});
  const output=format==='css' ? ds.css : JSON.stringify(format==='all'?ds.tokens:ds.tokens[format],null,2)+'\n';
  process.stdout.write(output);
} catch (err) {console.error(String(err));process.exitCode=1;}
