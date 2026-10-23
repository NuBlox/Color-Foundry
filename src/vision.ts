import { deltaEOK, parseHex, rgbToOKLab, toHex, type RGB } from './color.js';

/**
 * Machado–Oliveira–Fernandes (2009) matrices for linear-light sRGB.
 * Rows represent severities 0.1, 0.2, ... 1.0; zero uses identity.
 * Intermediate strengths interpolate ADJACENT published matrices,
 * not the inaccurate identity-to-full-severity linear blend.
 * https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
 * Colour-vision simulations are approximate, not clinical predictions.
 */
export type VisionMode = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia';
export const VISION_MODES = ['normal', 'protanopia', 'deuteranopia', 'tritanopia'] as const;
const IDENTITY = [1,0,0,0,1,0,0,0,1] as const;
const matrices: Record<Exclude<VisionMode,'normal'>, readonly (readonly number[])[]> = {
  protanopia: [
    [.856167,.182038,-.038205,.029342,.955115,.015544,-.002880,-.001563,1.004443],
    [.734766,.334872,-.069637,.051840,.919198,.028963,-.004928,-.004209,1.009137],
    [.630323,.465641,-.095964,.069181,.890046,.040773,-.006308,-.007724,1.014032],
    [.539009,.579343,-.118352,.082546,.866121,.051332,-.007136,-.011959,1.019095],
    [.458064,.679578,-.137642,.092785,.846313,.060902,-.007494,-.016807,1.024301],
    [.385450,.769005,-.154455,.100526,.829802,.069673,-.007442,-.022190,1.029632],
    [.319627,.849633,-.169261,.106241,.815969,.077790,-.007025,-.028051,1.035076],
    [.259411,.923008,-.182420,.110296,.804340,.085364,-.006276,-.034346,1.040622],
    [.203876,.990338,-.194214,.112975,.794542,.092483,-.005222,-.041043,1.046265],
    [.152286,1.052583,-.204868,.114503,.786281,.099216,-.003882,-.048116,1.051998],
  ],
  deuteranopia: [
    [.866435,.177704,-.044139,.049567,.939063,.011370,-.003453,.007233,.996220],
    [.760729,.319078,-.079807,.090568,.889315,.020117,-.006027,.013325,.992702],
    [.675425,.433850,-.109275,.125303,.847755,.026942,-.007950,.018572,.989378],
    [.605511,.528560,-.134071,.155318,.812366,.032316,-.009376,.023176,.986200],
    [.547494,.607765,-.155259,.181692,.781742,.036566,-.010410,.027275,.983136],
    [.498864,.674741,-.173604,.205199,.754872,.039929,-.011131,.030969,.980162],
    [.457771,.731899,-.189670,.226409,.731012,.042579,-.011595,.034333,.977261],
    [.422823,.781057,-.203881,.245752,.709602,.044646,-.011843,.037423,.974421],
    [.392952,.823610,-.216562,.263559,.690210,.046232,-.011910,.040281,.971630],
    [.367322,.860646,-.227968,.280085,.672501,.047413,-.011820,.042940,.968881],
  ],
  tritanopia: [
    [.926670,.092514,-.019184,.021191,.964503,.014306,.008437,.054813,.936750],
    [.895720,.133330,-.029050,.029997,.945400,.024603,.013027,.104707,.882266],
    [.905871,.127791,-.033662,.026856,.941251,.031893,.013410,.148296,.838294],
    [.948035,.089490,-.037526,.014364,.946792,.038844,.010853,.193991,.795156],
    [1.017277,.027029,-.044306,-.006113,.958479,.047634,.006379,.248708,.744913],
    [1.104996,-.046633,-.058363,-.032137,.971635,.060503,.001336,.317922,.680742],
    [1.193214,-.109812,-.083402,-.058496,.979410,.079086,-.002346,.403492,.598854],
    [1.257728,-.139648,-.118081,-.078003,.975409,.102594,-.003316,.501214,.502102],
    [1.278864,-.125333,-.153531,-.084748,.957674,.127074,-.000989,.601151,.399838],
    [1.255528,-.076749,-.178779,-.078411,.930809,.147602,.004733,.691367,.303900],
  ],
};
/** Published decile transformations; interpolate only between adjacent deciles. */
export function visionMatrix(mode: VisionMode, severity = 1): readonly number[] {
  if (!VISION_MODES.includes(mode)) throw new RangeError('Unknown vision mode');
  if (!Number.isFinite(severity) || severity < 0 || severity > 1)
    throw new RangeError('Severity must be between 0 and 1');
  if (mode === 'normal' || severity === 0) return [...IDENTITY];
  const position = severity * 10;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const table = matrices[mode];
  const lo = lower === 0 ? IDENTITY : table[lower - 1]!;
  const hi = table[Math.max(0, upper - 1)]!;
  const fraction = position - lower;
  return lo.map((value,i)=>value * (1-fraction) + hi[i]! * fraction);
}
const clamp01 = (c: number) => Math.min(1, Math.max(0, c));
const decode = (c: number) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
const encode = (c: number) => c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;

export function simulateVision(hex: string, mode: VisionMode, severity = 1): string {
  if (!VISION_MODES.includes(mode)) throw new RangeError('Unknown vision mode');
  if (!Number.isFinite(severity) || severity < 0 || severity > 1) throw new RangeError('Severity must be between 0 and 1');
  const input = parseHex(hex);
  if (severity === 0 || mode === 'normal') return toHex(input);
  const rgb = [decode(input.r), decode(input.g), decode(input.b)];
  const m = visionMatrix(mode, severity);
  const transformed = rgb.map((_, i) =>
    clamp01(m[3*i]! * rgb[0]! + m[3*i+1]! * rgb[1]! + m[3*i+2]! * rgb[2]!));
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
