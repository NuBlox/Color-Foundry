import {
  bestForeground, contrastRatio, deltaEOK, hexToLch, lchToHex, parseHex,
  rgbToOKLab, toHex, type OKLab,
} from './color.js';
import { simulateVision, VISION_MODES, type VisionMode } from './vision.js';

/** A categorical palette serves *different identities*, unlike a tonal scale. */
export type CategoricalOptions = Readonly<{
  count?: number;
  background?: string;
  /** Desired contrast of each mark against its opaque background, 1..7. Default 3. */
  minBackgroundContrast?: number;
  /** CSS custom property namespace, without leading hyphens. */
  prefix?: string;
}>;
export type CategoricalColor = Readonly<{
  index: number;
  hex: string;
  onColor: string;
  backgroundContrast: number;
  labelContrast: number;
}>;
export type CategoricalPair = Readonly<{
  first: number;
  second: number;
  mode: VisionMode;
  distance: number;
}>;
export type CategoricalPalette = Readonly<{
  seed: string;
  background: string;
  minBackgroundContrast: number;
  colors: readonly CategoricalColor[];
  /** Minimum of every pair's OKLab ΔE, for each simulated vision condition. */
  minimumDistances: Readonly<Record<VisionMode, number>>;
  /** Worst pair across all tested conditions, not a visual discrimination guarantee. */
  weakestPair: CategoricalPair;
  evaluatedCandidates: number;
  css: string;
  cautions: readonly string[];
}>;

type Candidate = {
  hex: string;
  contrast: number;
  lab: OKLab;
  modes: Readonly<Record<VisionMode, OKLab>>;
  chroma: number;
};

const visionLabs = (hex: string): Readonly<Record<VisionMode, OKLab>> => ({
  normal: rgbToOKLab(parseHex(hex)),
  protanopia: rgbToOKLab(parseHex(simulateVision(hex, 'protanopia'))),
  deuteranopia: rgbToOKLab(parseHex(simulateVision(hex, 'deuteranopia'))),
  tritanopia: rgbToOKLab(parseHex(simulateVision(hex, 'tritanopia'))),
});

/** All four modes participate in the maximin selection; no clinical thresholds are assumed. */
const minimumDistance = (a: Candidate, b: Candidate): number =>
  Math.min(...VISION_MODES.map(mode => deltaEOK(a.modes[mode], b.modes[mode])));

/**
 * Deterministic farthest-point search on quantised, in-gamut sRGB output.
 * It explicitly includes CVD simulations and keeps text/mark contrast separate.
 * Categories must ALSO use visible labels, shapes or patterns in real applications.
 */
export function createCategoricalPalette(seedHex: string, options: CategoricalOptions = {}): CategoricalPalette {
  const count = options.count ?? 8;
  const background = toHex(parseHex(options.background ?? '#FFFFFF'));
  const seed = toHex(parseHex(seedHex));
  const minContrast = options.minBackgroundContrast ?? 3;
  const prefix = options.prefix ?? 'cf';
  if (!Number.isInteger(count) || count < 2 || count > 12) throw new RangeError('count must be an integer between 2 and 12');
  if (!Number.isFinite(minContrast) || minContrast < 1 || minContrast > 7) {
    throw new RangeError('minBackgroundContrast must be between 1 and 7');
  }
  if (!/^[a-z][a-z0-9-]*$/.test(prefix) || prefix.endsWith('-') || prefix.includes('--')) {
    throw new TypeError('prefix must be a lowercase CSS identifier');
  }
  const seedLch = hexToLch(seed);
  const unique = new Map<string, Candidate>();
  const add = (hex: string) => {
    if (unique.has(hex)) return;
    const contrast = contrastRatio(hex, background);
    if (contrast + 1e-10 < minContrast) return;
    const lab = rgbToOKLab(parseHex(hex));
    unique.set(hex, {hex, contrast, lab, modes: visionLabs(hex), chroma: Math.hypot(lab.a,lab.b)});
  };
  add(seed);
  // Vary hue, lightness and chroma so gamut boundaries cannot collapse every
  // candidate into an indistinguishable shade. Seed-hue rotation is deterministic.
  for (const l of [.27, .35, .43, .51, .59, .67, .75, .83]) {
    for (const c of [.09, .14, .19, .25]) {
      for (let h = 0; h < 360; h += 15) {
        add(lchToHex({l, c, h: seedLch.h + h}));
      }
    }
  }
  const candidates = [...unique.values()];
  if (candidates.length < count) {
    throw new RangeError('Not enough distinct colours satisfy the background contrast constraint');
  }
  const origin = rgbToOKLab(parseHex(seed));
  // Preserve the original seed exactly when it satisfies the background constraint.
  // Otherwise select the nearest feasible colour in OKLab.
  const first = unique.get(seed) ?? candidates.reduce((best, candidate) =>
    deltaEOK(candidate.lab, origin) < deltaEOK(best.lab, origin) - 1e-12 ? candidate : best);
  const selected: Candidate[] = [first];
  const used = new Set([first.hex]);
  while (selected.length < count) {
    let best: Candidate | undefined;
    let bestScore = -Infinity;
    for (const candidate of candidates) {
      if (used.has(candidate.hex)) continue;
      const distances = selected.map(s => minimumDistance(candidate, s));
      const worst = Math.min(...distances);
      const average = distances.reduce((a,b)=>a+b,0) / distances.length;
      // Maximin dominates; average and chroma break near ties predictably.
      const score = worst + .015 * average + .0005 * candidate.chroma;
      if (score > bestScore + 1e-12) {bestScore = score; best = candidate;}
    }
    if (!best) throw new Error('Categorical selection failed');
    selected.push(best); used.add(best.hex);
  }
  const colors: CategoricalColor[] = selected.map((candidate, i) => {
    const foreground = bestForeground(candidate.hex);
    return {index: i+1, hex: candidate.hex, onColor: foreground.hex,
      backgroundContrast: candidate.contrast, labelContrast: foreground.ratio};
  });
  const minimumDistances = {} as Record<VisionMode, number>;
  let weakestPair: CategoricalPair | undefined;
  for (const mode of VISION_MODES) minimumDistances[mode] = Infinity;
  for (let i = 0; i < selected.length; i++) {
    for (let j = i+1; j < selected.length; j++) {
      for (const mode of VISION_MODES) {
        const distance = deltaEOK(selected[i]!.modes[mode], selected[j]!.modes[mode]);
        minimumDistances[mode] = Math.min(minimumDistances[mode], distance);
        if (!weakestPair || distance < weakestPair.distance) {
          weakestPair = {first:i+1, second:j+1, mode, distance};
        }
      }
    }
  }
  if (!weakestPair) throw new Error('At least two colours are needed for pairwise analysis');
  const cautions = [
    'Full-severity colour-vision simulations are approximations, not a WCAG conformance test.',
    'Always distinguish categories with labels, symbols, line styles or patterns in addition to colour.',
  ];
  if (weakestPair.distance < .06) cautions.push('At least one simulated pair is close (ΔEOK < 0.06 heuristic); manual review is recommended.');
  if (seed !== first.hex) cautions.push('The source colour did not meet the background contrast target; the nearest viable colour was used.');
  const css = [
    `/* Categorical colours: ${count} marks; minimum background contrast ${minContrast}:1 against ${background}. */`,
    ':root {',
    ...colors.flatMap(swatch => [
      `  --${prefix}-category-${swatch.index}: ${swatch.hex};`,
      `  --${prefix}-on-category-${swatch.index}: ${swatch.onColor};`,
    ]),
    '}', '',
  ].join('\n');
  return {seed, background, minBackgroundContrast:minContrast, colors, minimumDistances,
    weakestPair, evaluatedCandidates:candidates.length, css, cautions};
}
