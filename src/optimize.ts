import {
  deltaEOK, gamutMapSRGB, hexToLch, lchToLab, parseHex, rgbToOKLab,
} from './color.js';
import {
  createPalette, createPaletteWithParameters, DEFAULT_PARAMETERS, STOPS,
  type Palette, type PaletteParameters, type Scale,
} from './palette.js';

/** An objective is an engineering proxy, not an experimentally validated beauty score. */
export type DesignIntent = 'balanced' | 'vibrant' | 'restrained';
export type SearchEffort = 'fast' | 'thorough';
export type OptimisationOptions = Readonly<{
  intent?: DesignIntent;
  effort?: SearchEffort;
}>;
export type ScoreBreakdown = Readonly<{
  spacing: number;
  contrastMargin: number;
  brandFidelity: number;
  accentSeparation: number;
  chromaIntent: number;
  neutralBalance: number;
  gamutRetention: number;
  cvdSeparation: number;
  total: number;
}>;
export type OptimisationReport = Readonly<{
  intent: DesignIntent;
  effort: SearchEffort;
  evaluatedCandidates: number;
  rejectedCandidates: number;
  baselineScore: number;
  optimizedScore: number;
  components: ScoreBreakdown;
  parameters: PaletteParameters;
  cautions: readonly string[];
}>;
export type OptimisedPalette = Palette & Readonly<{ optimisation: OptimisationReport }>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const closeness = (a: number, b: number, span: number) => Math.exp(-Math.abs(a-b) / span);
const lab = (hex: string) => rgbToOKLab(parseHex(hex));

/** Coefficient of variation of successive ΔEOK distances, after 8-bit output rounding. */
export function scaleSpacingCV(scale: Scale): number {
  const values = STOPS.map(stop => lab(scale[stop]));
  const distances = values.slice(1).map((v,i) => deltaEOK(values[i]!, v));
  const mean = distances.reduce((a,b) => a+b, 0) / distances.length;
  if (mean <= 1e-10) return 1;
  return Math.hypot(...distances.map(d => d-mean)) / Math.sqrt(distances.length) / mean;
}

function isFeasible(palette: Palette): boolean {
  return [...palette.checks.light, ...palette.checks.dark,
    ...palette.interactionChecks.light, ...palette.interactionChecks.dark].every(x => x.pass);
}

/**
 * Weighted, deterministic objective normalised to [0,100].
 * Hard accessibility constraints are checked separately before candidate selection.
 * Proxy weights are design heuristics; they have not been tuned on human preference data.
 */
export function scorePalette(
  palette: Palette,
  parameters: PaletteParameters = DEFAULT_PARAMETERS,
  intent: DesignIntent = 'balanced',
): ScoreBreakdown {
  if (!['balanced','vibrant','restrained'].includes(intent)) throw new RangeError('Unknown design intent');
  const scales = palette.scales;
  const cvs = [scales.primary,scales.neutral,scales.analogousLeft,scales.complementary]
    .map(scaleSpacingCV);
  const spacing = clamp01(1 - cvs.reduce((a,b)=>a+b,0) / cvs.length / .16);

  // Only the headroom over the mandated contrast ratio is optimised; it can never
  // compensate for a failure. Cap to avoid making the objective "more black".
  const checks = [...palette.checks.light, ...palette.checks.dark,
    ...palette.interactionChecks.light, ...palette.interactionChecks.dark];
  const contrastMargin = checks.reduce((sum,check) =>
    sum + clamp01((check.ratio / check.minimum - 1) / .6), 0) / checks.length;

  const seed = palette.seedLch;
  const mappedSeed = gamutMapSRGB({l:seed.l,c:seed.c * parameters.chromaMultiplier,h:seed.h});
  const fidelityDistance = deltaEOK(lchToLab(seed),lchToLab(mappedSeed));
  const brandFidelity = closeness(fidelityDistance,0,.045);

  // Enforce hue separation on key accents using the final quantised swatches.
  // For near-achromatic seeds, the honest outcome is a near-zero diversity score.
  const base = lab(scales.primary[500]);
  const accents = [scales.analogousLeft[500],scales.analogousRight[500],scales.complementary[500]];
  const minDistance = Math.min(...accents.map(color=>deltaEOK(base,lab(color))));
  const accentSeparation = clamp01(minDistance / .10);

  const actualChroma = hexToLch(scales.primary[500]).c;
  const targetFactor = intent === 'vibrant' ? 1.24 : intent === 'restrained' ? .70 : 1.0;
  const desiredChroma = Math.min(.30,seed.c*targetFactor);
  const chromaIntent = closeness(actualChroma,desiredChroma,Math.max(.025,desiredChroma*.32));
  const neutralChroma = hexToLch(scales.neutral[500]).c;
  const neutralBalance = closeness(neutralChroma,.006,.012);

  // Gamut efficiency evaluates the actual chroma retained at representative mid-tones.
  const retention = [.4,.55,.7].map(l => {
    const envelope = Math.pow(Math.max(0,Math.sin(Math.PI*l)) / Math.sin(Math.PI*.63),parameters.envelopeExponent);
    const requested = seed.c * parameters.chromaMultiplier * Math.min(1.12,envelope);
    if (requested < .000001) return 1;
    return gamutMapSRGB({l,c:requested,h:seed.h}).c / requested;
  });
  const gamutRetention = retention.reduce((a,b)=>a+b,0)/retention.length;

  // CVD is a soft optimisation objective, not a pass/fail WCAG requirement.
  // The absolute ΔE threshold is heuristic; pairs still require redundant cues.
  const cvdSeparation = clamp01((.75*palette.vision.accents.minimumSimulatedDistance +
    .25*palette.vision.statuses.minimumSimulatedDistance)/.07);
  const weights = intent === 'vibrant'
    ? [14,12,8,13,27,4,8,14] : intent === 'restrained'
    ? [16,12,8,12,28,4,6,14] : [18,12,18,12,15,4,7,14];
  const total =
    weights[0]!*spacing + weights[1]!*contrastMargin + weights[2]!*brandFidelity +
    weights[3]!*accentSeparation + weights[4]!*chromaIntent +
    weights[5]!*neutralBalance + weights[6]!*gamutRetention + weights[7]!*cvdSeparation;
  return {spacing,contrastMargin,brandFidelity,accentSeparation,chromaIntent,
    neutralBalance,gamutRetention,cvdSeparation,total};
}

/**
 * Finite grid search with an included baseline, stable iteration order and
 * deterministic tie-breaking. All outputs must pass semantic WCAG contrast.
 */
export function optimizePalette(seedHex: string, options: OptimisationOptions = {}): OptimisedPalette {
  const intent = options.intent ?? 'balanced';
  const effort = options.effort ?? 'fast';
  if (!['balanced','vibrant','restrained'].includes(intent)) throw new RangeError('Unknown design intent');
  if (!['fast','thorough'].includes(effort)) throw new RangeError('Unknown search effort');
  const baseline = createPalette(seedHex);
  if (!isFeasible(baseline)) throw new Error('Baseline accessibility requirements failed');
  const baselineComponents = scorePalette(baseline,DEFAULT_PARAMETERS,intent);
  let best = baseline;
  let bestParams: PaletteParameters = DEFAULT_PARAMETERS;
  let bestScore = baselineComponents;
  let evaluated = 1, rejected = 0;

  const multipliers = intent === 'vibrant' ? [1,1.16,1.32] :
    intent === 'restrained' ? [.68,.84,1] : [.84,1,1.16];
  const angles = effort === 'fast' ? [24,38] : [22,30,40];
  const exponents = effort === 'fast' ? [.65,.95] : [.60,.80,1.05];
  const neutrals = effort === 'fast' ? [.05,.10] : [.04,.10,.16];
  for (const chromaMultiplier of multipliers) {
    for (const analogousAngle of angles) {
      for (const envelopeExponent of exponents) {
        for (const neutralMultiplier of neutrals) {
          const params: PaletteParameters = {chromaMultiplier,analogousAngle,envelopeExponent,neutralMultiplier};
          // The exact default was already evaluated.
          if (Object.keys(DEFAULT_PARAMETERS).every(key =>
            params[key as keyof PaletteParameters] === DEFAULT_PARAMETERS[key as keyof PaletteParameters])) continue;
          const candidate = createPaletteWithParameters(seedHex,params);
          evaluated++;
          if (!isFeasible(candidate)) { rejected++; continue; }
          const components = scorePalette(candidate,params,intent);
          if (components.total > bestScore.total + 1e-9) {
            best = candidate; bestScore = components; bestParams = params;
          }
        }
      }
    }
  }
  const cautions: string[] = [];
  if (baseline.seedLch.c < .01) cautions.push(
    'The source is nearly achromatic; hue-based accents remain nearly monochrome. Choose an explicit accent hue for coloured categories.');
  if (bestScore.accentSeparation < .5) cautions.push(
    'Some accent hues are insufficiently distinct for categories. Add patterns or labels; do not communicate meaning by colour alone.');
  if (best.vision.accents.reviewRecommended || best.vision.statuses.reviewRecommended) cautions.push(
    'Simulated colour-vision-deficiency comparisons show possible category confusion. Use text, icons or patterns in addition to colour.');
  cautions.push('Machado full-severity simulations are approximations; simulated distance is not a WCAG criterion.');
  cautions.push('The score is an engineering proxy, not a validated measure of aesthetics or WCAG certification.');
  return {
    ...best,
    optimisation: {
      intent, effort, evaluatedCandidates:evaluated, rejectedCandidates:rejected,
      baselineScore:baselineComponents.total, optimizedScore:bestScore.total,
      components:bestScore, parameters:bestParams, cautions,
    },
  };
}
