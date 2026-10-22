/** Colour arithmetic is unrounded until the final 8-bit sRGB serialization. */
export type RGB = Readonly<{ r: number; g: number; b: number }>;
export type OKLab = Readonly<{ l: number; a: number; b: number }>;
export type OKLCH = Readonly<{ l: number; c: number; h: number }>;

const clamp = (x: number, low = 0, high = 1): number => Math.min(high, Math.max(low, x));
export const wrapHue = (h: number): number => ((h % 360) + 360) % 360;
const asByte = (x: number): number => Math.round(clamp(x) * 255);
const linear = (c: number): number => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const gamma = (c: number): number => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;

export function parseHex(hex: string): RGB {
  const raw = hex.trim().replace(/^#/, '');
  if (!/^(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(raw)) {
    throw new TypeError('Expected an opaque #RGB or #RRGGBB colour');
  }
  const six = raw.length === 3 ? [...raw].map(c => c + c).join('') : raw;
  return {
    r: parseInt(six.slice(0, 2), 16) / 255,
    g: parseInt(six.slice(2, 4), 16) / 255,
    b: parseInt(six.slice(4, 6), 16) / 255,
  };
}

export function toHex(rgb: RGB): string {
  return '#' + [rgb.r, rgb.g, rgb.b]
    .map(c => asByte(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Björn Ottosson's OKLab matrices (D65 sRGB); RGB channels are gamma encoded 0..1. */
export function rgbToOKLab(rgb: RGB): OKLab {
  const r = linear(rgb.r), g = linear(rgb.g), b = linear(rgb.b);
  const L = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const M = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const S = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  return {
    l: 0.2104542553*L + 0.7936177850*M - 0.0040720468*S,
    a: 1.9779984951*L - 2.4285922050*M + 0.4505937099*S,
    b: 0.0259040371*L + 0.7827717662*M - 0.8086757660*S,
  };
}

/** Return *linear* sRGB; preserve out-of-gamut values for explicit gamut testing. */
export function oklabToLinearRGB(lab: OKLab): RGB {
  const l = (lab.l + 0.3963377774*lab.a + 0.2158037573*lab.b) ** 3;
  const m = (lab.l - 0.1055613458*lab.a - 0.0638541728*lab.b) ** 3;
  const s = (lab.l - 0.0894841775*lab.a - 1.2914855480*lab.b) ** 3;
  return {
    r: +4.0767416621*l - 3.3077115913*m + 0.2309699292*s,
    g: -1.2684380046*l + 2.6097574011*m - 0.3413193965*s,
    b: -0.0041960863*l - 0.7034186147*m + 1.7076147010*s,
  };
}

export function labToLch(lab: OKLab): OKLCH {
  const c = Math.hypot(lab.a, lab.b);
  return { l: lab.l, c, h: c < 0.000004 ? 0 : wrapHue(Math.atan2(lab.b, lab.a) * 180 / Math.PI) };
}
export function lchToLab(lch: OKLCH): OKLab {
  const radians = lch.h * Math.PI / 180;
  return { l: lch.l, a: lch.c * Math.cos(radians), b: lch.c * Math.sin(radians) };
}
export function hexToLch(hex: string): OKLCH { return labToLch(rgbToOKLab(parseHex(hex))); }

export function inSRGB(linearRGB: RGB, epsilon = 0.0000001): boolean {
  return [linearRGB.r, linearRGB.g, linearRGB.b].every(c => c >= -epsilon && c <= 1 + epsilon);
}

/** Preserve lightness and hue while reducing chroma until sRGB representable. */
export function gamutMapSRGB(lch: OKLCH): OKLCH {
  if (![lch.l, lch.c, lch.h].every(Number.isFinite) || lch.l < 0 || lch.l > 1 || lch.c < 0) {
    throw new RangeError('OKLCH requires finite L in [0,1], C >= 0 and finite H');
  }
  if (inSRGB(oklabToLinearRGB(lchToLab(lch)))) return lch;
  let low = 0, high = lch.c;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (inSRGB(oklabToLinearRGB(lchToLab({ ...lch, c: mid })))) low = mid;
    else high = mid;
  }
  return { ...lch, c: low };
}

export function lchToHex(lch: OKLCH): string {
  const rgb = oklabToLinearRGB(lchToLab(gamutMapSRGB(lch)));
  return toHex({ r: gamma(clamp(rgb.r)), g: gamma(clamp(rgb.g)), b: gamma(clamp(rgb.b)) });
}

/** ΔEOK, the Euclidean distance in perceptually-oriented OKLab. */
export function deltaEOK(a: OKLab, b: OKLab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  return 0.2126*linear(r) + 0.7152*linear(g) + 0.0722*linear(b);
}

/** WCAG 2.x contrast of final, quantized sRGB hex colours. */
export function contrastRatio(a: string, b: string): number {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
}

/** Choose black/white by measured contrast, never by arbitrary lightness cutoff. */
export function bestForeground(background: string): { hex: string; ratio: number; meetsAA: boolean } {
  const options = ['#000000', '#FFFFFF'].map(hex => ({ hex, ratio: contrastRatio(hex, background) }));
  const best = options[0]!.ratio >= options[1]!.ratio ? options[0]! : options[1]!;
  return { ...best, meetsAA: best.ratio >= 4.5 };
}
