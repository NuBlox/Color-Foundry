import { createPalette, optimizePalette } from '../dist/index.js';

const args=process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`Usage: node examples/generate.mjs '#2563EB' [--json] [--optimize] [--intent=balanced|vibrant|restrained] [--thorough]

--optimize: run candidate search. --thorough: expanded grid search. --json: full palette and report.`);
  process.exit(0);
}
const input=args.find(a=>!a.startsWith('--')) ?? '#2563EB';
const flag=args.find(a=>a.startsWith('--intent='));
const intent=flag?.slice('--intent='.length) ?? 'balanced';
const shouldOptimize=args.includes('--optimize') || Boolean(flag) || args.includes('--thorough');
try {
  const palette=shouldOptimize
    ? optimizePalette(input,{intent,effort:args.includes('--thorough')?'thorough':'fast'})
    : createPalette(input);
  process.stdout.write(args.includes('--json')
    ? JSON.stringify(palette,null,2) + '\n'
    : palette.css);
} catch(error) {
  console.error(String(error));
  process.exitCode=1;
}
