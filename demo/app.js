import { createPalette, optimizePalette, createDesignSystem, bestForeground, simulateVision, STOPS } from '../dist/index.js';

const byId = id => document.getElementById(id);
const scaleNames = [
  ['primary','Primary','Original hue'],
  ['neutral','Neutral','Brand-influenced grey'],
  ['analogousLeft','Analogous −30°','Neighbouring hue'],
  ['analogousRight','Analogous +30°','Neighbouring hue'],
  ['complementary','Complementary','Hue +180°'],
  ['splitLeft','Split +150°','Split complement'],
  ['splitRight','Split −150°','Split complement'],
  ['triadLeft','Triadic −120°','Three-way harmony'],
  ['triadRight','Triadic +120°','Three-way harmony'],
  ['success','Success','Semantic positive state'],
  ['warning','Warning','Semantic caution state'],
  ['danger','Danger','Semantic error state'],
  ['info','Information','Semantic neutral notice'],
];
let current = createPalette('#2563EB');
let toastTimeout;

function announce(message){
  const element = byId('toast');
  element.textContent=message;
  element.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout=setTimeout(()=>element.classList.remove('visible'),2000);
}

async function copy(text, label){
  try { await navigator.clipboard.writeText(text); announce(label + ' copied'); }
  catch { announce('Clipboard unavailable — select and copy manually'); }
}

function visionMode(){return byId('vision-select').value || 'normal';}
function renderScales(palette) {
  const root=byId('scales'); root.replaceChildren();
  for (const [key,label,subtitle] of scaleNames){
    const row=document.createElement('div'); row.className='scale-row';
    const info=document.createElement('div');info.className='scale-info';
    const title=document.createElement('b'); title.textContent=label;
    const sub=document.createElement('span'); sub.textContent=subtitle;
    info.append(title,sub);
    const swatches=document.createElement('div');swatches.className='scale-swatches';
    for(const stop of STOPS){
      const color=palette.scales[key][stop];
      const button=document.createElement('button');button.type='button';button.className='swatch';
      const appearance=simulateVision(color,visionMode());
      button.style.backgroundColor=appearance;button.style.color=bestForeground(appearance).hex;
      button.title=`${label} ${stop}: ${color} — copy`;button.setAttribute('aria-label',button.title);
      const stopLabel=document.createElement('small');stopLabel.textContent=stop;
      const hexLabel=document.createElement('span');hexLabel.className='swatch-hex';hexLabel.textContent=color;
      button.append(stopLabel,hexLabel);button.addEventListener('click',()=>copy(color,color));
      swatches.append(button);
    }
    row.append(info,swatches);root.append(row);
  }
}

function renderPreview(palette) {
  const mode=byId('theme-select').value;
  const t=palette[mode];
  const root=byId('preview');
  const names=Object.keys(t);
  for (const key of names) root.style.setProperty('--pv-'+key.replace(/[A-Z]/g,x=>'-'+x.toLowerCase()),simulateVision(t[key],visionMode()));
  const states=palette.interactions[mode];
  for (const [key,value] of Object.entries(states)) {
    root.style.setProperty('--pv-'+key.replace(/[A-Z]/g,x=>'-'+x.toLowerCase()),
      key === 'overlayTint' || key === 'overlayScrim' ? value : simulateVision(value,visionMode()));
  }
  const checks=[...palette.checks.light,...palette.checks.dark,
    ...palette.interactionChecks.light,...palette.interactionChecks.dark];
  const passed=checks.filter(x=>x.pass).length;
  byId('audit-count').textContent=`${passed} / ${checks.length}`;
  byId('audit-label').textContent=`${passed} / ${checks.length} passed`;
  byId('audit-label').classList.toggle('fail',passed!==checks.length);
  const tbody=byId('audit-rows');tbody.replaceChildren();
  for(const selected of ['light','dark']){
    for(const check of [...palette.checks[selected],...palette.interactionChecks[selected]]){
      const tr=document.createElement('tr');
      for(const txt of [selected,check.role,check.ratio.toFixed(2)+':1',check.minimum.toFixed(1)+':1',check.pass?'Pass':'Fail']){
        const td=document.createElement('td');td.textContent=txt;tr.append(td);
      }
      tr.lastElementChild.className=check.pass?'pass':'fail';tbody.append(tr);
    }
  }
  byId('css-preview').textContent=palette.css.split('\n').slice(0,25).join('\n')+'\n  /* … further scales, component states and P3 overrides in exported file */';
  const v=palette.vision;
  const weak=(audit)=>audit.weakest ? `${audit.weakest.first} / ${audit.weakest.second} under ${audit.weakest.mode}` : 'none';
  byId('vision-report').textContent=`Smallest simulated ΔEOK: accents ${v.accents.minimumSimulatedDistance.toFixed(3)} (${weak(v.accents)}); status families ${v.statuses.minimumSimulatedDistance.toFixed(3)} (${weak(v.statuses)}). ${palette.wideGamut.enhancedSwatches} swatches permit noticeably greater chroma in P3. Values are heuristic visual comparisons, not discrimination guarantees.`;
}

function renderOptimisation(palette) {
  const root=byId('optimization-detail');
  if (!palette.optimisation) {
    byId('objective-score').textContent='—';
    byId('objective-subtitle').textContent='Run optimiser to score';
    root.textContent='Choose a design intent and click Optimise palette. The engine compares candidate tonal curves and checks contrast before accepting a result.';
    return;
  }
  const r=palette.optimisation;
  const gain=(r.optimizedScore-r.baselineScore).toFixed(2);
  byId('objective-score').textContent=r.optimizedScore.toFixed(1);
  byId('objective-subtitle').textContent=`+${gain} versus baseline`;
  root.replaceChildren();
  const summary=document.createElement('p');
  summary.textContent=`${r.intent} · ${r.evaluatedCandidates} candidates evaluated · ${r.rejectedCandidates} rejected · chroma × ${r.parameters.chromaMultiplier.toFixed(2)} · analogous ±${r.parameters.analogousAngle}° · envelope ${r.parameters.envelopeExponent.toFixed(2)}`;
  root.append(summary);
  const grid=document.createElement('div');grid.className='score-grid';
  for (const [key,label] of [
    ['spacing','Tone spacing'],['contrastMargin','Contrast margin'],['brandFidelity','Brand fidelity'],
    ['accentSeparation','Accent separation'],['chromaIntent','Requested chroma'],
    ['neutralBalance','Neutral balance'],['gamutRetention','Gamut retention'],
    ['cvdSeparation','CVD robustness'],
  ]) {
    const tile=document.createElement('div');tile.className='score-tile';
    const caption=document.createElement('span');caption.textContent=label;
    const value=document.createElement('strong');value.textContent=`${Math.round(r.components[key]*100)}%`;
    tile.append(caption,value);grid.append(tile);
  }
  root.append(grid);
  for(const caution of r.cautions){const p=document.createElement('p');p.className='footnote';p.textContent=caution;root.append(p);}
}

function render() {renderScales(current);renderPreview(current);renderOptimisation(current);}
function update(value){
  try {
    current=createPalette(value);
    byId('color-picker').value=current.seed.toLowerCase();
    byId('hex-input').value=current.seed;
    byId('error').hidden=true;
    render();
  } catch (err) {
    byId('error').hidden=false;
    byId('error').textContent=String(err.message ?? err);
  }
}

byId('color-picker').addEventListener('input',e=>update(e.target.value));
byId('hex-input').addEventListener('change',e=>update(e.target.value));
byId('hex-input').addEventListener('keydown',e=>{if(e.key==='Enter')update(e.target.value);});
byId('theme-select').addEventListener('change',()=>renderPreview(current));
byId('vision-select').addEventListener('change',()=>{renderScales(current);renderPreview(current);});
byId('optimize-button').addEventListener('click',()=>{
  try {
    const button=byId('optimize-button');button.disabled=true;
    // Defer processing one frame so the busy state can be painted in real browsers.
    setTimeout(()=>{
      try {
        current=optimizePalette(current.seed,{intent:byId('intent-select').value});
        byId('error').hidden=true;
        render();announce('Optimised palette ready');
      } catch(err) {
        byId('error').hidden=false;byId('error').textContent=String(err.message??err);
      } finally {button.disabled=false;}
    },0);
  } catch(err) {byId('error').hidden=false;byId('error').textContent=String(err.message??err);}
});
byId('random-button').addEventListener('click',()=>{
  const bytes=new Uint8Array(3);crypto.getRandomValues(bytes);
  update('#'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''));
});
byId('copy-css-button').addEventListener('click',()=>copy(current.css,'CSS'));
function download(content, type, filename) {
  const blob=new Blob([content],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  announce(filename+' exported');
}
byId('download-button').addEventListener('click',()=>
  download(current.css,'text/css',`palette-${current.seed.slice(1)}.css`));
byId('download-json-button').addEventListener('click',()=>
  download(JSON.stringify(current,null,2)+'\n','application/json',`palette-${current.seed.slice(1)}.json`));
render();

byId('download-system-button').addEventListener('click',()=>
  download(createDesignSystem(current).css,'text/css',`design-system-${current.seed.slice(1)}.css`));
byId('download-dtcg-light-button').addEventListener('click',()=>
  download(JSON.stringify(createDesignSystem(current).tokens.light,null,2)+'\n','application/json',`tokens-${current.seed.slice(1)}-light.json`));
byId('download-dtcg-dark-button').addEventListener('click',()=>
  download(JSON.stringify(createDesignSystem(current).tokens.dark,null,2)+'\n','application/json',`tokens-${current.seed.slice(1)}-dark.json`));
