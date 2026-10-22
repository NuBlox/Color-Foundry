import {
  bestForeground, contrastRatio, deltaEOK, gamutMapSRGB, hexToLch, labToLch,
  lchToHex, lchToLab, parseHex, rgbToOKLab, toHex, wrapHue,
  type OKLCH,
} from './color.js';
import { auditVision, type VisionAudit } from './vision.js';
import { p3CSS, p3GamutAdvantage } from './wide-gamut.js';
import { auditInteractions, createInteractionStates, type InteractionStates } from './interaction.js';

export const STOPS = [50,100,200,300,400,500,600,700,800,900,950] as const;
export type Stop = typeof STOPS[number];
export type Scale = Readonly<Record<Stop, string>>;
export type Scales = Readonly<Record<'primary'|'neutral'|'analogousLeft'|'analogousRight'|
  'complementary'|'splitLeft'|'splitRight'|'triadLeft'|'triadRight'|
  'success'|'warning'|'danger'|'info', Scale>>;
export type Theme = Readonly<{
  background: string; surface: string; surfaceRaised: string;
  text: string; textMuted: string; border: string;
  primary: string; onPrimary: string; focus: string; link: string;
  success: string; onSuccess: string; successSurface: string; onSuccessSurface: string;
  warning: string; onWarning: string; warningSurface: string; onWarningSurface: string;
  danger: string; onDanger: string; dangerSurface: string; onDangerSurface: string;
  info: string; onInfo: string; infoSurface: string; onInfoSurface: string;
}>;
export type ContrastCheck = Readonly<{ role: string; foreground: string; background: string; ratio: number; minimum: number; pass: boolean }>;
export type Palette = Readonly<{
  seed: string; seedLch: OKLCH; scales: Scales;
  p3Scales: Readonly<{[K in keyof Scales]: Readonly<Record<Stop,string>>}>;
  wideGamut: Readonly<{ extraChromaAt500: number; enhancedSwatches: number }>;
  vision: Readonly<{ accents: VisionAudit; statuses: VisionAudit }>;
  light: Theme; dark: Theme;
  interactions: Readonly<{light: InteractionStates; dark: InteractionStates}>;
  interactionChecks: Readonly<{light: ContrastCheck[]; dark: ContrastCheck[]}>;
  checks: Readonly<{ light: ContrastCheck[]; dark: ContrastCheck[] }>;
  css: string;
}>;

/** Tunable search variables. Defaults reproduce the v0.1 tonal generation. */
export type PaletteParameters = Readonly<{
  chromaMultiplier: number;
  analogousAngle: number;
  neutralMultiplier: number;
  envelopeExponent: number;
}>;
export const DEFAULT_PARAMETERS: PaletteParameters = Object.freeze({
  chromaMultiplier: 1, analogousAngle: 30, neutralMultiplier: .10, envelopeExponent: .8,
});

/**
 * C(L) = C_base [sin(pi*L)/sin(pi*.63)]^0.80 with a small cap.
 * This avoids vivid white/black extremes while retaining vivid middle tones.
 * We map chroma into sRGB at fixed OKLCH lightness and hue.
 */
function colourAt(l: number, c: number, h: number, exponent: number): OKLCH {
  const envelope = Math.pow(Math.max(0, Math.sin(Math.PI*l)) / Math.sin(Math.PI*.63), exponent);
  return gamutMapSRGB({ l, c: c * Math.min(1.12, envelope), h: wrapHue(h) });
}

/**
 * Sample a colour path densely; position 11 stops at uniform accumulated ΔEOK
 * (arc-length parameterization). Aims for visually even steps, rather than
 * equally spaced RGB or HSL numbers.
 */
export function generateScale(hue: number, chroma: number, envelopeExponent = .8): Scale {
  if (!Number.isFinite(hue) || !Number.isFinite(chroma) || chroma < 0
      || !Number.isFinite(envelopeExponent) || envelopeExponent < 0.25 || envelopeExponent > 2) {
    throw new RangeError('Hue/chroma/exponent must be finite; chroma >= 0 and exponent in [0.25, 2]');
  }
  const resolution = 512;
  const path = Array.from({ length: resolution + 1 }, (_, i) => {
    const l = 0.975 - (0.975 - 0.16) * (i / resolution);
    const lch = colourAt(l, chroma, hue, envelopeExponent);
    return { lch, lab: lchToLab(lch) };
  });
  const distances = [0];
  for (let i = 1; i < path.length; i++) {
    distances.push(distances[i - 1]! + deltaEOK(path[i-1]!.lab, path[i]!.lab));
  }
  const total = distances[distances.length - 1]!;
  const scale = {} as Record<Stop, string>;
  for (let i = 0; i < STOPS.length; i++) {
    const target = total * i / (STOPS.length - 1);
    let low = 0, high = distances.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (distances[middle]! < target) low = middle + 1;
      else high = middle;
    }
    const pos = Math.max(1, low);
    const from = distances[pos - 1]!, to = distances[pos]!;
    const t = to > from ? (target - from) / (to - from) : 0;
    // Re-evaluate the analytic path between samples, then gamut-map again.
    const l = path[pos - 1]!.lch.l * (1-t) + path[pos]!.lch.l * t;
    scale[STOPS[i]!] = lchToHex(colourAt(l, chroma, hue, envelopeExponent));
  }
  return scale;
}

function nearestMeetingContrast(
  scale: Scale, backgrounds: readonly string[], threshold: number, preferred: Stop,
): string {
  const valid = STOPS.filter(stop => backgrounds.every(bg => contrastRatio(scale[stop], bg) >= threshold));
  if (valid.length === 0) throw new Error(`No suitable swatch meets ${threshold}:1 against all surfaces`);
  valid.sort((a,b) => Math.abs(a-preferred) - Math.abs(b-preferred));
  return scale[valid[0]!]!;
}

function theme(scales: Scales, dark: boolean): Theme {
  const neutral = scales.neutral, primary = scales.primary;
  const background = neutral[dark ? 950 : 50];
  const surface = dark ? neutral[900] : '#FFFFFF';
  const surfaceRaised = neutral[dark ? 800 : 100];
  const surfaces = [background, surface, surfaceRaised];
  const text = nearestMeetingContrast(neutral, surfaces, 7, dark ? 50 : 950);
  const textMuted = nearestMeetingContrast(neutral, surfaces, 4.5, dark ? 300 : 700);
  const border = nearestMeetingContrast(neutral, [surface], 3, dark ? 400 : 600);
  const preferred = dark ? 400 : 700;
  // Ensure primary as a graphical component is visible against the surface,
  // and has a black/white label meeting AA.
  const colored = STOPS.filter(s => contrastRatio(primary[s], surface) >= 3
    && bestForeground(primary[s]).ratio >= 4.5);
  if (!colored.length) throw new Error('No suitable primary colour');
  colored.sort((a,b) => Math.abs(a-preferred) - Math.abs(b-preferred));
  const action = primary[colored[0]!]!;
  const status = (scale: Scale, preferredStop: Stop) => {
    const candidates = STOPS.filter(s => contrastRatio(scale[s],surface)>=3 && bestForeground(scale[s]).ratio>=4.5);
    if (!candidates.length) throw new Error('No accessible status colour');
    candidates.sort((a,b)=>Math.abs(a-preferredStop)-Math.abs(b-preferredStop));
    const fill = scale[candidates[0]!]!;
    const statusSurface = scale[dark ? 900 : 100];
    return { fill, on:bestForeground(fill).hex, statusSurface,
      onSurface:nearestMeetingContrast(neutral,[statusSurface],4.5,dark?100:900) };
  };
  const success=status(scales.success,preferred);
  const warning=status(scales.warning,preferred);
  const danger=status(scales.danger,preferred);
  const info=status(scales.info,preferred);
  return {
    background, surface, surfaceRaised, text, textMuted, border,
    success:success.fill, onSuccess:success.on, successSurface:success.statusSurface, onSuccessSurface:success.onSurface,
    warning:warning.fill, onWarning:warning.on, warningSurface:warning.statusSurface, onWarningSurface:warning.onSurface,
    danger:danger.fill, onDanger:danger.on, dangerSurface:danger.statusSurface, onDangerSurface:danger.onSurface,
    info:info.fill, onInfo:info.on, infoSurface:info.statusSurface, onInfoSurface:info.onSurface,
    primary: action,
    onPrimary: bestForeground(action).hex,
    focus: nearestMeetingContrast(primary, [surface], 3, dark ? 400 : 700),
    link: nearestMeetingContrast(primary, [surface], 4.5, dark ? 300 : 700),
  };
}

export function auditTheme(t: Theme): ContrastCheck[] {
  const tests = [
    ['text / background', t.text, t.background, 7],
    ['text / surface', t.text, t.surface, 7],
    ['text / raised', t.text, t.surfaceRaised, 7],
    ['muted / background', t.textMuted, t.background, 4.5],
    ['muted / surface', t.textMuted, t.surface, 4.5],
    ['muted / raised', t.textMuted, t.surfaceRaised, 4.5],
    ['button label / button', t.onPrimary, t.primary, 4.5],
    ['button / surface', t.primary, t.surface, 3],
    ['border / surface', t.border, t.surface, 3],
    ['focus / surface', t.focus, t.surface, 3],
    ['link / surface', t.link, t.surface, 4.5],
    ['success label / fill', t.onSuccess, t.success, 4.5],
    ['success fill / surface', t.success, t.surface, 3],
    ['success surface label', t.onSuccessSurface, t.successSurface, 4.5],
    ['warning label / fill', t.onWarning, t.warning, 4.5],
    ['warning fill / surface', t.warning, t.surface, 3],
    ['warning surface label', t.onWarningSurface, t.warningSurface, 4.5],
    ['danger label / fill', t.onDanger, t.danger, 4.5],
    ['danger fill / surface', t.danger, t.surface, 3],
    ['danger surface label', t.onDangerSurface, t.dangerSurface, 4.5],
    ['info label / fill', t.onInfo, t.info, 4.5],
    ['info fill / surface', t.info, t.surface, 3],
    ['info surface label', t.onInfoSurface, t.infoSurface, 4.5],
  ] as const;
  return tests.map(([role,foreground,background,minimum]) => {
    const ratio = contrastRatio(foreground, background);
    return { role, foreground, background, ratio, minimum, pass: ratio >= minimum };
  });
}

function cssValue(name: string, color: string): string { return `  --${name}: ${color};`; }
export function toCSS(scales: Scales, light: Theme, dark: Theme, seed: string,
  wideScales?: Readonly<{[K in keyof Scales]: Readonly<Record<Stop,string>>}>,
  interactions?: Palette['interactions']): string {
  const order = ['primary','neutral','analogousLeft','analogousRight','complementary',
    'splitLeft','splitRight','triadLeft','triadRight','success','warning','danger','info'] as const;
  const nameOf=(name:string)=>name.replace(/[A-Z]/g, x => '-' + x.toLowerCase());
  const palette = order.flatMap(name => STOPS.map(stop =>
    cssValue(`palette-${nameOf(name)}-${stop}`, scales[name][stop])));
  const semantic = (t: Theme | InteractionStates) => Object.entries(t).map(([name, value]) =>
    cssValue(`color-${nameOf(name)}`, value)).join('\n');
  // Keep *semantic* tokens in audited, 8-bit sRGB. Wide-gamut overrides only
  // change the raw palette swatches; otherwise audited contrast could change.
  const p3Overrides = wideScales ? order.flatMap(name => STOPS.map(stop =>
    cssValue(`palette-${nameOf(name)}-${stop}`, wideScales[name][stop]))) : [];
  return [
    '/* Color Foundry v0.4 — audited sRGB semantics and component states; optional Display P3 scales. */',
    ':root {', cssValue('palette-source', seed), ...palette, ...semantic(light).split('\n'),
      ...(interactions ? semantic(interactions.light).split('\n') : []), '}',
    '[data-theme="dark"] {', semantic(dark),
      ...(interactions ? semantic(interactions.dark).split('\n') : []), '}',
    ...(wideScales ? ['@supports (color: color(display-p3 1 0 0)) {',
      '  @media (color-gamut: p3) {', '    :root {', ...p3Overrides, '    }', '  }', '}'] : []),
  ].join('\n') + '\n';
}

/** Independently project requested OKLCH chroma into the wider P3 gamut. */
function createP3Scales(scales: Scales, chromas: Record<keyof Scales,number>,
  hues: Record<keyof Scales,number>, exponent: number): Palette['p3Scales'] {
  const result = {} as Record<keyof Scales,Record<Stop,string>>;
  for (const name of Object.keys(scales) as (keyof Scales)[]) {
    const swatches={} as Record<Stop,string>;
    for (const stop of STOPS) {
      const l=hexToLch(scales[name][stop]).l;
      const envelope=Math.pow(Math.max(0,Math.sin(Math.PI*l))/Math.sin(Math.PI*.63),exponent);
      const c=chromas[name] * Math.min(1.12,envelope);
      swatches[stop]=p3CSS({l,c,h:wrapHue(hues[name])});
    }
    result[name]=swatches;
  }
  return result;
}

/** Parameterised generator used by the optimiser; all inputs explicitly validated. */
export function createPaletteWithParameters(seedHex: string, params: PaletteParameters): Palette {
  const { chromaMultiplier, analogousAngle, neutralMultiplier, envelopeExponent } = params;
  if (!Number.isFinite(chromaMultiplier) || chromaMultiplier < 0.25 || chromaMultiplier > 2
      || !Number.isFinite(analogousAngle) || analogousAngle < 10 || analogousAngle > 60
      || !Number.isFinite(neutralMultiplier) || neutralMultiplier < 0 || neutralMultiplier > 1
      || !Number.isFinite(envelopeExponent) || envelopeExponent < 0.25 || envelopeExponent > 2) {
    throw new RangeError('Invalid palette parameters');
  }
  const seed = toHex(parseHex(seedHex));
  const seedLch = labToLch(rgbToOKLab(parseHex(seed)));
  const { h, c } = seedLch;
  const chroma = c * chromaMultiplier;
  const neutralChroma = Math.min(0.018, chroma * neutralMultiplier);
  const scales: Scales = {
    primary: generateScale(h, chroma, envelopeExponent),
    neutral: generateScale(h, neutralChroma, envelopeExponent),
    analogousLeft: generateScale(h-analogousAngle,chroma, envelopeExponent),
    analogousRight: generateScale(h+analogousAngle,chroma, envelopeExponent),
    complementary: generateScale(h+180,chroma, envelopeExponent),
    splitLeft: generateScale(h+180-analogousAngle,chroma, envelopeExponent),
    splitRight: generateScale(h-180+analogousAngle,chroma, envelopeExponent),
    triadLeft: generateScale(h-120,chroma, envelopeExponent),
    triadRight: generateScale(h+120,chroma, envelopeExponent),
    // Semantic status families are intentionally independent of achromatic seeds.
    success: generateScale(150, .16, envelopeExponent),
    warning: generateScale(85, .17, envelopeExponent),
    danger: generateScale(25, .18, envelopeExponent),
    info: generateScale(250, .17, envelopeExponent),
  };
  const names = Object.keys(scales) as (keyof Scales)[];
  const hues = Object.fromEntries(names.map(name => [name, ({
    primary:h,neutral:h,analogousLeft:h-analogousAngle,analogousRight:h+analogousAngle,
    complementary:h+180,splitLeft:h+180-analogousAngle,splitRight:h-180+analogousAngle,
    triadLeft:h-120,triadRight:h+120,success:150,warning:85,danger:25,info:250,
  } as Record<keyof Scales,number>)[name]])) as Record<keyof Scales,number>;
  const chromas = Object.fromEntries(names.map(name => [name,
    name==='neutral' ? neutralChroma : name==='success' ? .16 : name==='warning' ? .17 :
    name==='danger' ? .18 : name==='info' ? .17 : chroma])) as Record<keyof Scales,number>;
  const p3Scales=createP3Scales(scales,chromas,hues,envelopeExponent);
  const midLightness=hexToLch(scales.primary[500]).l;
  const midEnvelope=Math.pow(Math.max(0,Math.sin(Math.PI*midLightness))/Math.sin(Math.PI*.63),envelopeExponent);
  const p3Progress=p3GamutAdvantage({l:midLightness,c:chroma*Math.min(1.12,midEnvelope),h});
  const vision = {
    accents:auditVision({primary:scales.primary[500],analogousLeft:scales.analogousLeft[500],
      analogousRight:scales.analogousRight[500],complementary:scales.complementary[500]}),
    statuses:auditVision({success:scales.success[500],warning:scales.warning[500],
      danger:scales.danger[500],info:scales.info[500]}),
  };
  const light = theme(scales, false);
  const dark = theme(scales, true);
  const interactions = {light:createInteractionStates(light,scales,false), dark:createInteractionStates(dark,scales,true)};
  const interactionChecks = {light:auditInteractions(light,interactions.light), dark:auditInteractions(dark,interactions.dark)};
  return {
    seed, seedLch, scales, p3Scales,
    wideGamut:{extraChromaAt500:p3Progress.extraChroma,
      enhancedSwatches:names.reduce((sum,name)=>sum+STOPS.filter(stop=>{
        // Indicate the number of swatches with materially more P3 chroma.
        const l=hexToLch(scales[name][stop]).l;
        const env=Math.pow(Math.max(0,Math.sin(Math.PI*l))/Math.sin(Math.PI*.63),envelopeExponent);
        return p3GamutAdvantage({l,c:chromas[name]*Math.min(1.12,env),h:hues[name]}).extraChroma>.003;
      }).length,0)},
    vision, light, dark, interactions, interactionChecks,
    checks: { light: auditTheme(light), dark: auditTheme(dark) },
    css: toCSS(scales, light, dark, seed, p3Scales, interactions),
  };
}

/** Backwards-compatible v0.1 entrypoint (now with expanded semantic checks). */
export function createPalette(seedHex: string): Palette {
  return createPaletteWithParameters(seedHex, DEFAULT_PARAMETERS);
}
