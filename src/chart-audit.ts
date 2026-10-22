import { contrastRatio, deltaEOK, parseHex, rgbToOKLab, toHex, bestForeground } from './color.js';
import { simulateVision, VISION_MODES, type VisionMode } from './vision.js';
import type { CategoricalPalette } from './categorical.js';

/** Composites a semitransparent sRGB mark onto an opaque sRGB chart surface. */
export function compositeChartMark(mark: string, surface: string, opacity = 1): string {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw new RangeError('Chart mark opacity must be a finite number in [0,1]');
  const top = parseHex(mark), bottom = parseHex(surface);
  const mix = (a: number, b: number) => a * opacity + b * (1 - opacity);
  return toHex({r:mix(top.r,bottom.r),g:mix(top.g,bottom.g),b:mix(top.b,bottom.b)});
}

export type ChartSurface = Readonly<{name: string; hex: string}>;
export type ChartAuditOptions = Readonly<{
  /** Opaque surfaces that the chart may appear on. Defaults to palette background. */
  surfaces?: readonly ChartSurface[];
  /** Opacity of marks. Calculations use quantised sRGB after source-over composition. */
  opacity?: number;
  /** Desired ratio between visible data marks and all specified surfaces. Defaults to 3. */
  minimumMarkContrast?: number;
  /** Heuristic threshold for reporting close pairs, NOT an accessibility threshold. */
  reviewDistance?: number;
}>;
export type ChartMarkCheck = Readonly<{
  surface: string;
  category: number;
  sourceHex: string;
  displayedHex: string;
  contrast: number;
  minimum: number;
  pass: boolean;
}>;
export type ChartPairCheck = Readonly<{
  surface: string;
  first: number;
  second: number;
  distances: Readonly<Record<VisionMode, number>>;
  minimumDistance: number;
  weakestMode: VisionMode;
  reviewRecommended: boolean;
}>;
export type ChartAudit = Readonly<{
  surfaces: readonly ChartSurface[];
  opacity: number;
  minimumMarkContrast: number;
  markChecks: readonly ChartMarkCheck[];
  pairChecks: readonly ChartPairCheck[];
  failures: number;
  reviewPairs: number;
  weakestPair: ChartPairCheck | null;
  /** A passed audit only establishes these declared mark/surface ratios, not chart accessibility. */
  passed: boolean;
  guidance: readonly string[];
}>;

/**
 * Audit colour use in a chart context. Marks are measured AFTER alpha
 * compositing against each surface. Pairs are compared under simulated full
 * severity CVD and normal vision. Label and symbol redundancy remains required.
 */
export function auditCategoricalChart(palette: CategoricalPalette, options: ChartAuditOptions = {}): ChartAudit {
  const opacity = options.opacity ?? 1;
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
    throw new RangeError('Chart mark opacity must be a finite number in [0,1]');
  const minimum = options.minimumMarkContrast ?? 3;
  if (!Number.isFinite(minimum) || minimum < 1 || minimum > 21)
    throw new RangeError('minimumMarkContrast must be between 1 and 21');
  const reviewDistance = options.reviewDistance ?? .06;
  if (!Number.isFinite(reviewDistance) || reviewDistance < 0 || reviewDistance > 1)
    throw new RangeError('reviewDistance must be between 0 and 1');
  const inputSurfaces = options.surfaces ?? [{ name:'chart', hex:palette.background }];
  if (!inputSurfaces.length || inputSurfaces.length > 16)
    throw new RangeError('Provide between 1 and 16 chart surfaces');
  const names = new Set<string>();
  const surfaces = inputSurfaces.map((s) => {
    if (typeof s.name !== 'string' || !/^[A-Za-z][A-Za-z0-9 _-]{0,39}$/.test(s.name) || names.has(s.name))
      throw new TypeError('Chart surfaces require distinct, readable names');
    names.add(s.name);
    return {name:s.name,hex:toHex(parseHex(s.hex))};
  });
  const markChecks: ChartMarkCheck[] = [];
  const pairChecks: ChartPairCheck[] = [];
  let weakestPair: ChartPairCheck | null = null;
  for (const surface of surfaces) {
    const displayed = palette.colors.map((color) => {
      const hex = compositeChartMark(color.hex, surface.hex, opacity);
      const contrast = contrastRatio(hex, surface.hex);
      markChecks.push({surface:surface.name,category:color.index,sourceHex:color.hex,
        displayedHex:hex,contrast,minimum,pass:contrast + 1e-10 >= minimum});
      return hex;
    });
    const labs = displayed.map(hex => Object.fromEntries(VISION_MODES.map(mode => [mode,
      rgbToOKLab(parseHex(simulateVision(hex, mode)))])) as Record<VisionMode,ReturnType<typeof rgbToOKLab>>);
    for (let i=0; i<displayed.length; i++) for(let j=i+1; j<displayed.length; j++) {
      const distances = {} as Record<VisionMode,number>;
      let weakestMode: VisionMode = 'normal';
      let min = Infinity;
      for(const mode of VISION_MODES) {
        const d=deltaEOK(labs[i]![mode],labs[j]![mode]);
        distances[mode]=d;
        if (d < min) {min=d;weakestMode=mode;}
      }
      const pair: ChartPairCheck = {surface:surface.name,first:i+1,second:j+1,distances,
        minimumDistance:min,weakestMode,reviewRecommended:min < reviewDistance};
      pairChecks.push(pair);
      if (!weakestPair || min < weakestPair.minimumDistance) weakestPair=pair;
    }
  }
  const failures=markChecks.filter(c=>!c.pass).length;
  const reviewPairs=pairChecks.filter(c=>c.reviewRecommended).length;
  const guidance = [
    'Provide text labels and data tables; never encode the identity of a data series by colour alone.',
    'Use redundant line dashes, point markers, or bar patterns, particularly at crossings and small sizes.',
    'A nominal 3:1 contrast may become harder to perceive when strokes are thin or antialiased.',
    'Simulated colour-vision distances and their review thresholds are heuristics, not clinical or WCAG certifications.',
  ];
  if (opacity < 1) guidance.push('Opacity reduces effective mark contrast; audits use the composited 8-bit sRGB output.');
  if (failures) guidance.push(`${failures} mark/surface pair(s) fall below the requested contrast ratio.`);
  if (reviewPairs) guidance.push(`${reviewPairs} pair/surface combination(s) fall below the selected separation review heuristic.`);
  return {surfaces,opacity,minimumMarkContrast:minimum,markChecks,pairChecks,failures,reviewPairs,
    weakestPair,passed:failures===0,guidance};
}

const svgEscape = (text: string) => text.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[s]!));
const pointSymbols = ['circle','square','diamond','triangle','cross','plus','star'];
const patterns = ['','8 4','2 4','12 3 2 3','6 2 2 2','14 4','1 3'];

/**
 * SVG line-chart teaching fixture: redundant dash, point shape and direct
 * labels. Uses fixed synthetic data solely to inspect realistic crossings.
 * An accompanying HTML table is required for non-visual access to real data.
 */
export function renderCategoricalChartFixture(palette: CategoricalPalette, options: {title?: string; width?: number; height?: number} = {}): string {
  const width=options.width ?? 800, height=options.height ?? 420;
  if (![width,height].every(x=>Number.isInteger(x) && x>=320 && x<=2400))
    throw new RangeError('SVG width and height must be integers in [320,2400]');
  const title=options.title ?? 'Categorical palette comparison';
  if (typeof title !== 'string' || title.length>120) throw new TypeError('title must be at most 120 characters');
  const plotX=45, plotY=38, plotW=width-205, plotH=height-92;
  const chunks: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="cf-title cf-desc">`,
    `<title id="cf-title">${svgEscape(title)}</title>`,
    `<desc id="cf-desc">Synthetic multi-series comparison. Each of ${palette.colors.length} series uses colour, a dash pattern, markers and a direct label. This demonstration is not a substitute for an accessible data table.</desc>`,
    `<rect width="${width}" height="${height}" fill="${palette.background}"/>`,
  ];
  const axis=bestForeground(palette.background).hex;
  chunks.push(`<path d="M${plotX} ${plotY}V${plotY+plotH}H${plotX+plotW}" fill="none" stroke="${axis}" stroke-width="1.5"/>`);
  for (let i=0; i<palette.colors.length; i++) {
    const category=palette.colors[i]!;
    const points=Array.from({length:7},(_,x)=>{
      const y=.5 + .33 * Math.sin(x*1.13 + i*1.87) + .13*Math.sin(i*3.7 + x*.77);
      return {x:plotX+x*plotW/6,y:plotY+plotH*(1-y)};
    });
    const d=points.map((pt,j)=>`${j?'L':'M'}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
    const dash=patterns[i%patterns.length];
    chunks.push(`<path d="${d}" fill="none" stroke="${category.hex}" stroke-width="3"${dash?` stroke-dasharray="${dash}"`:''}/>`);
    for(const p of points) {
      const marker=pointSymbols[i%pointSymbols.length];
      const x=p.x.toFixed(1),y=p.y.toFixed(1);
      if(marker==='circle') chunks.push(`<circle cx="${x}" cy="${y}" r="4.5" fill="${category.hex}"/>`);
      else if (marker==='square') chunks.push(`<rect x="${(p.x-4).toFixed(1)}" y="${(p.y-4).toFixed(1)}" width="8" height="8" fill="${category.hex}"/>`);
      else if (marker==='diamond') chunks.push(`<path d="M${x},${(p.y-5).toFixed(1)}l5,5 -5,5 -5,-5Z" fill="${category.hex}"/>`);
      else if (marker==='triangle') chunks.push(`<path d="M${x},${(p.y-5).toFixed(1)}l5,9 h-10Z" fill="${category.hex}"/>`);
      else if (marker==='star') chunks.push(`<path d="M${x},${(p.y-5).toFixed(1)}l1.3,3.3 3.5,.1 -2.8,2.1 1,3.4 -3,-2 -3,2 1,-3.4 -2.8,-2.1 3.5,-.1Z" fill="${category.hex}"/>`);
      else if (marker==='plus') chunks.push(`<path d="M${(p.x-4).toFixed(1)},${y}h8M${x},${(p.y-4).toFixed(1)}v8" fill="none" stroke="${category.hex}" stroke-width="2.5"/>`);
      else chunks.push(`<path d="M${(p.x-3).toFixed(1)},${(p.y-3).toFixed(1)}l6,6M${(p.x+3).toFixed(1)},${(p.y-3).toFixed(1)}l-6,6" fill="none" stroke="${category.hex}" stroke-width="2.5"/>`);
    }
    const labelY=plotY+14 + i*((plotH-16)/Math.max(1,palette.colors.length-1));
    chunks.push(`<path d="M${plotX+plotW+9} ${labelY.toFixed(1)}h25" stroke="${category.hex}" stroke-width="3" ${dash?`stroke-dasharray="${dash}"`:''}/>`);
    chunks.push(`<text x="${plotX+plotW+41}" y="${(labelY+4).toFixed(1)}" font-size="12" font-family="sans-serif" fill="${axis}">Series ${i+1}</text>`);
  }
  chunks.push('</svg>');
  return chunks.join('\n');
}
