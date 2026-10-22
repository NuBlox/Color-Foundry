/** Optional real-CSS cascade check using local Chromium, with zero npm dependencies.
 * It cannot replace a SvelteKit build or Playwright/axe, but validates the actual
 * computed styles for six brand × mode combinations.
 */
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createBrandDesignSystem } from '../dist/index.js';

const designs = createBrandDesignSystem([
  {id:'foundry',name:'Foundry Blue',seed:'#2563EB'},
  {id:'forest',name:'Evergreen',seed:'#237A48'},
  {id:'plum',name:'Royal Plum',seed:'#8757D6'},
]);
const expected = Object.fromEntries(Object.entries(designs.brands).map(([id,{palette}]) => [id,{
  light:{background:palette.light.background,primary:palette.light.primary,onPrimary:palette.light.onPrimary},
  dark:{background:palette.dark.background,primary:palette.dark.primary,onPrimary:palette.dark.onPrimary},
}]));
const scratch = await mkdtemp(join(tmpdir(),'color-foundry-browser-'));
try {
  await writeFile(join(scratch,'theme.css'),designs.css);
  const html = `<!DOCTYPE html><html><head><link rel="stylesheet" href="theme.css"></head><body>
    <div id="background" style="background:var(--cf-color-semantic-background)"></div>
    <button id="button" style="background:var(--cf-color-component-button-primary-background);color:var(--cf-color-component-button-primary-foreground)">Button</button>
    <pre id="result"></pre>
    <script>
      const expected = ${JSON.stringify(expected)};
      const toRgb = hex => 'rgb(' + [1,3,5].map(n => parseInt(hex.slice(n,n+2),16)).join(', ') + ')';
      let results=[];
      for(const [brand,modes] of Object.entries(expected)){
        for(const [mode,colors] of Object.entries(modes)){
          if(brand==='foundry')delete document.documentElement.dataset.brand;
          else document.documentElement.dataset.brand=brand;
          document.documentElement.dataset.theme=mode;
          const actual={background:getComputedStyle(document.querySelector('#background')).backgroundColor,
            primary:getComputedStyle(document.querySelector('#button')).backgroundColor,
            onPrimary:getComputedStyle(document.querySelector('#button')).color};
          const mismatches=Object.entries(colors).filter(([name,hex])=>actual[name]!==toRgb(hex));
          results.push({brand,mode,passed:mismatches.length===0,actual,
            expected:Object.fromEntries(Object.entries(colors).map(([k,v])=>[k,toRgb(v)]))});
        }
      }
      document.querySelector('#result').textContent=JSON.stringify(results);
    </script></body></html>`;
  const fixture=join(scratch,'index.html');
  await writeFile(fixture,html);
  const chromium=process.env.CHROMIUM_BIN ?? 'chromium';
  const output=execFileSync(chromium,[
    '--headless','--disable-gpu','--no-sandbox','--disable-dev-shm-usage',
    '--no-first-run','--virtual-time-budget=2000','--dump-dom',pathToFileURL(fixture).href,
  ],{timeout:30000,encoding:'utf8',stdio:['ignore','pipe','ignore']});
  const escaped=/<pre id="result">([^<]*)<\/pre>/.exec(output)?.[1];
  if (!escaped) throw new Error('Chromium did not return a cascade test result');
  const results=JSON.parse(escaped.replaceAll('&quot;','"').replaceAll('&amp;','&'));
  const failed=results.filter(result=>!result.passed);
  console.log(JSON.stringify({checks:results.length,passed:results.length-failed.length,failed},null,2));
  if(failed.length)process.exitCode=1;
} finally {
  await rm(scratch,{recursive:true,force:true});
}
