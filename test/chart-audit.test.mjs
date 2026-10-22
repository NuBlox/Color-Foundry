import test from 'node:test';
import assert from 'node:assert/strict';
import { auditCategoricalChart, bestForeground, compositeChartMark, contrastRatio,
  createCategoricalPalette, renderCategoricalChartFixture, visionDistance, VISION_MODES } from '../dist/index.js';

const sample = createCategoricalPalette('#2563EB', {count:8});

test('opaque and transparent marks use actual rounded sRGB composites', () => {
  assert.equal(compositeChartMark('#FF0000','#000000',0.5),'#800000');
  assert.equal(compositeChartMark('#123456','#987654',0),'#987654');
  assert.equal(compositeChartMark('#123456','#987654',1),'#123456');
  assert.equal(compositeChartMark('#FFFFFF','#000000',0.5),'#808080');
  for (const opacity of [-1,1.01,NaN,Infinity])
    assert.throws(() => compositeChartMark('#000000','#FFFFFF',opacity),RangeError);
});

test('opaque palette preserves contrast promised for original category surface', () => {
  const audit = auditCategoricalChart(sample);
  assert.equal(audit.opacity,1);
  assert.equal(audit.markChecks.length,8);
  assert.equal(audit.pairChecks.length,28);
  assert.equal(audit.failures,0);
  assert.equal(audit.passed,true);
  for (const mark of audit.markChecks) {
    assert.equal(mark.displayedHex,mark.sourceHex);
    assert.equal(mark.contrast,contrastRatio(mark.sourceHex,'#FFFFFF'));
  }
});

test('transparent chart marks can fail contrast even when opaque originals pass', () => {
  const audit=auditCategoricalChart(sample,{opacity:.2});
  assert.equal(audit.markChecks.length,8);
  assert.ok(audit.failures>0);
  assert.equal(audit.passed,false);
  assert.ok(audit.guidance.some(g => g.includes('Opacity')));
});

test('multiple surfaces independently audit actual composited swatches', () => {
  const surfaces=[{name:'white',hex:'#FFFFFF'},{name:'ink',hex:'#101827'},{name:'card',hex:'#EEEEEE'}];
  const audit = auditCategoricalChart(sample,{surfaces,opacity:.8});
  assert.equal(audit.markChecks.length,24);
  assert.equal(audit.pairChecks.length,3*28);
  for (const check of audit.markChecks) {
    const bg=surfaces.find(s=>s.name===check.surface).hex;
    assert.equal(check.displayedHex,compositeChartMark(check.sourceHex,bg,.8));
    assert.equal(check.contrast,contrastRatio(check.displayedHex,bg));
  }
});

test('pair separation report recomputes from effective colours under every vision mode', () => {
  const audit=auditCategoricalChart(sample,{opacity:.65,surfaces:[{name:'paper',hex:'#EAEFF9'}]});
  for (const pair of audit.pairChecks) {
    const a=audit.markChecks.find(c=>c.category===pair.first).displayedHex;
    const b=audit.markChecks.find(c=>c.category===pair.second).displayedHex;
    for(const mode of VISION_MODES) assert.equal(pair.distances[mode],visionDistance(a,b,mode));
    assert.equal(pair.minimumDistance,Math.min(...Object.values(pair.distances)));
  }
  assert.equal(audit.weakestPair.minimumDistance,Math.min(...audit.pairChecks.map(x=>x.minimumDistance)));
});

test('chart audit rejects invalid surfaces and ratios, no silent fallback', () => {
  const invalid=[
    {opacity:NaN},{opacity:-.1},{minimumMarkContrast:0},{minimumMarkContrast:22},
    {reviewDistance:-.1},{reviewDistance:2},{surfaces:[]},
    {surfaces:[{name:'a',hex:'#FFF'},{name:'a',hex:'#000'}]},
    {surfaces:[{name:'<script>',hex:'#fff'}]},
    {surfaces:[{name:'ok',hex:'transparent'}]},
  ];
  for(const opts of invalid) assert.throws(()=>auditCategoricalChart(sample,opts));
});

test('SVG fixture includes accessible descriptions, direct labels and independent point shapes', () => {
  const svg=renderCategoricalChartFixture(sample,{title:'<Series & chart>'});
  assert.match(svg,/role="img" aria-labelledby="cf-title cf-desc"/);
  assert.match(svg,/<title id="cf-title">&lt;Series &amp; chart&gt;<\/title>/);
  assert.ok(!svg.includes('<Series & chart>'));
  assert.equal((svg.match(/>Series \d+<\/text>/g)||[]).length,8);
  assert.match(svg,/stroke-dasharray/);
  assert.match(svg,/<rect x=/);
  assert.match(svg,/<circle cx=/);
  assert.match(svg,/l5,5 -5,5/);
  assert.match(svg,/l5,9 h-10/);
  assert.ok(!svg.includes('NaN'));
  for (const options of [{width:300},{height:260},{width:Infinity},{title:'x'.repeat(121)}])
    assert.throws(()=>renderCategoricalChartFixture(sample,options));
});
