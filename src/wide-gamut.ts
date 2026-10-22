import { gamutMapSRGB, lchToLab, oklabToLinearRGB, type RGB, type OKLCH } from './color.js';

// CSS Color 4: Display P3 and sRGB use D65; transfer curves are identical.
// Matrices are the published D65 primary-based transforms, not an HSL approximation.
const srgbToXyz = [
  [.41239079926595934, .357584339383878, .1804807884018343],
  [.21263900587151027, .715168678767756, .07219231536073371],
  [.01933081871559185, .11919477979462599, .9505321522496607],
];
const xyzToP3 = [
  [2.493496911941425, -.9313836179191239, -.40271078445071684],
  [-.8294889695615747, 1.7626640603183463, .023624685841943577],
  [.03584583024378447, -.07617238926804182, .9568845240076872],
];
const clamp = (x: number) => Math.max(0,Math.min(1,x));
const encode = (x: number) => x <= .0031308 ? 12.92*x : 1.055*x**(1/2.4)-.055;
const dot = (row: number[], v: number[]) => row.reduce((sum, n, i) => sum + n*v[i]!, 0);
export function linearSRGBToLinearP3(rgb: RGB): RGB {
  const v = [rgb.r,rgb.g,rgb.b];
  const xyz = srgbToXyz.map(row => dot(row,v));
  const p3 = xyzToP3.map(row => dot(row,xyz));
  return {r:p3[0]!,g:p3[1]!,b:p3[2]!};
}
export function inDisplayP3(rgb: RGB, tolerance=1e-7): boolean {
  return [rgb.r,rgb.g,rgb.b].every(c=> c>=-tolerance && c<=1+tolerance);
}
export function gamutMapP3(lch: OKLCH): OKLCH {
  if (![lch.l,lch.c,lch.h].every(Number.isFinite) || lch.l<0 || lch.l>1 || lch.c<0) {
    throw new RangeError('Invalid OKLCH colour');
  }
  const toP3 = (c: number) => linearSRGBToLinearP3(oklabToLinearRGB(lchToLab({...lch,c})));
  if (inDisplayP3(toP3(lch.c))) return lch;
  let low=0, high=lch.c;
  for (let i=0;i<36;i++) {
    const mid=(low+high)/2;
    if (inDisplayP3(toP3(mid))) low=mid;
    else high=mid;
  }
  return {...lch,c:low};
}
export function lchToDisplayP3(lch: OKLCH): RGB {
  const m=gamutMapP3(lch);
  const linear=linearSRGBToLinearP3(oklabToLinearRGB(lchToLab(m)));
  return {r:encode(clamp(linear.r)),g:encode(clamp(linear.g)),b:encode(clamp(linear.b))};
}
/** CSS color(display-p3 …) values, rounded only at serialization. */
export function p3CSS(lch: OKLCH): string {
  const {r,g,b}=lchToDisplayP3(lch);
  const tidy=(n:number)=>Number(n.toFixed(6));
  return `color(display-p3 ${tidy(r)} ${tidy(g)} ${tidy(b)})`;
}
export type WideGamutStatus = Readonly<{ sRGBChroma: number; p3Chroma: number; extraChroma: number }>;
export function p3GamutAdvantage(lch: OKLCH): WideGamutStatus {
  const sRGBChroma=gamutMapSRGB(lch).c;
  const p3Chroma=gamutMapP3(lch).c;
  return { sRGBChroma, p3Chroma, extraChroma: Math.max(0,p3Chroma-sRGBChroma) };
}
