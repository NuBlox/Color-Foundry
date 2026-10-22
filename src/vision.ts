import { deltaEOK, parseHex, rgbToOKLab, toHex, type RGB } from './color.js';

/**
 * Full-severity (1.0) Machado–Oliveira–Fernandes (2009) matrices.
 * These operate on *linear-light* sRGB. Simulations are approximations of
 * perception, not diagnostic tools and not a conformance test.
 * https://doi.org/10.1109/TVCG.2009.113
 */
export type VisionMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export const VISION_MODES = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as const;
const matrices: Record<Exclude<VisionMode,'normal'>, readonly number[]> = {
  protanopia: [.152286, 1.052583, -.204868, .114503, .786281, .099216, -.003882, -.048116, 1.051998],
  deuteranopia: [.367322, .860646, -.227968, .280085, .672501, .047413, -.011820, .042940, .968881],
  tritanopia: [1.255528, -.076749, -.178779, -.078411, .930809, .147602, .004733, .691367, .303900],
};
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));
const decode = (c: number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
const encode = (c: number) => c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;

export function simulateVision(hex: string, mode: VisionMode, severity = 1): string {
  if (!VISION_MODES.includes(mode)) throw new RangeError('Unknown vision mode');
  if (!Number.isFinite(severity) || severity < 0 || severity > 1) throw new RangeError('Severity must be between 0 and 1');
  const input = parseHex(hex);
  if (severity === 0 || mode === 'normal') return toHex(input);
  const rgb = [decode(input.r), decode(input.g), decode(input.b)];
  const m = matrices[mode];
  const transformed = rgb.map((original, i) =>
    clamp01(original * (1-severity) + severity * (m[3*i]! * rgb[0]! + m[3*i+1]! * rgb[1]! + m[3*i+2]! * rgb[2]!)));
  return toHex({r:encode(transformed[0]!), g:encode(transformed[1]!), b:encode(transformed[2]!)});
}

/** ΔEOK of simulated, quantized sRGB output; no universal discrimination threshold is implied. */
export function visionDistance(a: string, b: string, mode: VisionMode): number {
  const lab = (hex: string) => rgbToOKLab(parseHex(simulateVision(hex, mode)));
  return deltaEOK(lab(a), lab(b));
}

export type VisionComparison = Readonly<{
  first: string; second: string;
  distances: Readonly<Record<VisionMode, number>>;
  minimumSimulatedDistance: number;
}>;
export type VisionAudit = Readonly<{
  comparisons: readonly VisionComparison[];
  minimumSimulatedDistance: number;
  weakest: Readonly<{ mode: Exclude<VisionMode,'normal'>; first: string; second: string }> | null;
  /** A heuristic flag, NOT a diagnostic threshold. */
  reviewRecommended: boolean;
}>;

/** Inspect categorical colours under each full-severity model. */
export function auditVision(colors: Readonly<Record<string,string>>): VisionAudit {
  const entries = Object.entries(colors);
  if (entries.length < 2) return { comparisons: [], minimumSimulatedDistance: 0, weakest: null, reviewRecommended: true };
  const comparisons: VisionComparison[] = [];
  let min = Infinity;
  let weakest: VisionAudit['weakest'] = null;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i+1; j < entries.length; j++) {
      const [first,firstHex] = entries[i]!;
      const [second,secondHex] = entries[j]!;
      const distances = {} as Record<VisionMode,number>;
      for (const mode of VISION_MODES) {
        distances[mode] = visionDistance(firstHex,secondHex,mode);
        if (mode !== 'normal' && distances[mode]! < min) {
          min = distances[mode]!;
          weakest = { mode, first, second };
        }
      }
      comparisons.push({first,second,distances,minimumSimulatedDistance:Math.min(
        distances.protanopia!, distances.deuteranopia!, distances.tritanopia!)});
    }
  }
  return { comparisons, minimumSimulatedDistance:min, weakest,
    reviewRecommended:min < .06 };
}
