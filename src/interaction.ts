/** Interaction and translucent-overlay arithmetic for audited sRGB design tokens.
 * Source-over compositing here happens on CSS sRGB channel values, not OKLab or
 * linear-light RGB. WCAG contrast is computed on the resulting *opaque* output.
 */
import { contrastRatio, deltaEOK, parseHex, rgbToOKLab, toHex } from './color.js';
import { STOPS, type ContrastCheck, type Scale, type Scales, type Theme } from './palette.js';

export type InteractionStates = Readonly<{
  primaryHover: string; primaryPressed: string;
  secondaryHover: string; secondaryPressed: string;
  secondaryBorderHover: string; secondaryBorderPressed: string;
  selectedBackground: string; selectedText: string; selectedIndicator: string;
  focusRing: string; focusRingInner: string;
  disabledBackground: string; disabledText: string;
  overlayTint: string; overlayTintOnSurface: string;
  overlayScrim: string; overlayScrimOnSurface: string;
}>;

/** CSS `source-over` compositing of an alpha sRGB colour onto an opaque backing. */
export function compositeSRGB(foreground: string, alpha: number, background: string): string {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError('Alpha must be finite and within [0, 1]');
  }
  const f = parseHex(foreground), b = parseHex(background);
  return toHex({
    r: f.r * alpha + b.r * (1 - alpha),
    g: f.g * alpha + b.g * (1 - alpha),
    b: f.b * alpha + b.b * (1 - alpha),
  });
}

/** Serialize a CSS transparent color (the exported value is NOT precomposited). */
export function rgbaCSS(foreground: string, alpha: number): string {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError('Alpha must be finite and within [0, 1]');
  }
  const rgb = parseHex(foreground);
  return `rgb(${Math.round(rgb.r * 255)} ${Math.round(rgb.g * 255)} ${Math.round(rgb.b * 255)} / ${alpha})`;
}

const distance = (a: string, b: string): number =>
  deltaEOK(rgbToOKLab(parseHex(a)), rgbToOKLab(parseHex(b)));

function nearestWithContrast(scale: Scale, backgrounds: readonly string[],
  threshold: number, preferred: number): string {
  const candidates = STOPS.filter(s => backgrounds.every(bg => contrastRatio(scale[s], bg) >= threshold))
    .sort((a,b) => Math.abs(a - preferred) - Math.abs(b - preferred));
  if (candidates.length === 0) throw new Error('No state colour passes all contrast constraints');
  return scale[candidates[0]!]!;
}

/** Maintain *the same* on-primary label across interaction states to avoid label flicker. */
function actionStates(t: Theme): Pick<InteractionStates,'primaryHover'|'primaryPressed'> {
  const toward = t.onPrimary === '#FFFFFF' ? '#000000' : '#FFFFFF';
  const candidates: string[] = [];
  for (let n = 2; n <= 85; n++) {
    const candidate = compositeSRGB(toward, n/100, t.primary);
    if (contrastRatio(t.onPrimary,candidate) >= 4.5 && contrastRatio(candidate,t.surface) >= 3) {
      if (candidates.at(-1) !== candidate) candidates.push(candidate);
    }
  }
  const hover = candidates.find(candidate => distance(t.primary,candidate) >= .012);
  const pressed = candidates.find(candidate =>
    distance(t.primary,candidate) >= .035 && hover !== undefined && distance(hover,candidate) >= .012);
  if (!hover || !pressed) throw new Error('Unable to generate visibly distinct contrast-safe primary states');
  return {primaryHover:hover,primaryPressed:pressed};
}

/** Secondary backgrounds are subtle, but their dedicated borders must stay 3:1. */
function secondaryState(t: Theme, scales: Scales, alpha: number): { fill: string; border: string } {
  // Text tokens are not necessarily literal black/white, so infer from contrast.
  const toward = contrastRatio('#FFFFFF',t.surface) >= contrastRatio('#000000',t.surface)
    ? '#FFFFFF' : '#000000';
  const fill = compositeSRGB(toward,alpha,t.surface);
  if (contrastRatio(t.text,fill) < 4.5) throw new Error('Secondary state would hide its text');
  const border = contrastRatio(t.border,fill) >= 3 ? t.border : nearestWithContrast(
    scales.neutral,[fill],3,contrastRatio('#FFFFFF',fill) > contrastRatio('#000000',fill) ? 100 : 800);
  return { fill, border };
}

/** Source colour and scale tokens remain unchanged; state colours are additional opaque roles. */
export function createInteractionStates(t: Theme, scales: Scales, dark: boolean): InteractionStates {
  const actions = actionStates(t);
  const secondaryHover = secondaryState(t,scales,.055);
  const secondaryPressed = secondaryState(t,scales,.12);
  const selectedBackground = scales.primary[dark ? 900 : 100];
  const selectedText = nearestWithContrast(scales.neutral,[selectedBackground],4.5,dark?100:900);
  const selectedIndicator = nearestWithContrast(scales.primary,
    [selectedBackground,t.surface],3,dark?300:700);

  const surfaces = [t.background,t.surface,t.surfaceRaised];
  // A visible exterior ring across all declared opaque surface tokens.
  const ringCandidates = [t.focus,...STOPS.map(stop=>scales.primary[stop]),
    ...STOPS.map(stop=>scales.neutral[stop]),'#000000','#FFFFFF'];
  const focusRing = ringCandidates.find(v=>surfaces.every(s=>contrastRatio(v,s)>=3));
  if (!focusRing) throw new Error('No common focus ring colour meets all surface constraints');
  const focusRingInner = contrastRatio('#FFFFFF',t.primary) >= contrastRatio('#000000',t.primary)
    ? '#FFFFFF' : '#000000';
  const disabledBackground = compositeSRGB(t.text,.085,t.surface);
  const disabledText = compositeSRGB(t.textMuted,.43,disabledBackground);
  const tintAlpha = .10, scrimAlpha = dark ? .44 : .56;
  return {
    ...actions,
    secondaryHover:secondaryHover.fill,secondaryPressed:secondaryPressed.fill,
    secondaryBorderHover:secondaryHover.border,secondaryBorderPressed:secondaryPressed.border,
    selectedBackground,selectedText,selectedIndicator,focusRing,focusRingInner,
    disabledBackground,disabledText,
    overlayTint:rgbaCSS(t.primary,tintAlpha),
    overlayTintOnSurface:compositeSRGB(t.primary,tintAlpha,t.surface),
    overlayScrim:rgbaCSS('#000000',scrimAlpha),
    overlayScrimOnSurface:compositeSRGB('#000000',scrimAlpha,t.surface),
  };
}

/** Disabled controls and obscured content behind scrims are intentionally omitted:
 * WCAG 2.2 1.4.11 exempts inactive components; occluded content must be checked
 * in its actual layout instead of claiming the background remains readable.
 */
export function auditInteractions(t: Theme, s: InteractionStates): ContrastCheck[] {
  const comparisons = [
    ['hover button label',t.onPrimary,s.primaryHover,4.5],
    ['hover button / surface',s.primaryHover,t.surface,3],
    ['pressed button label',t.onPrimary,s.primaryPressed,4.5],
    ['pressed button / surface',s.primaryPressed,t.surface,3],
    ['secondary hover text',t.text,s.secondaryHover,4.5],
    ['secondary hover border',s.secondaryBorderHover,s.secondaryHover,3],
    ['secondary pressed text',t.text,s.secondaryPressed,4.5],
    ['secondary pressed border',s.secondaryBorderPressed,s.secondaryPressed,3],
    ['selected text',s.selectedText,s.selectedBackground,4.5],
    ['selected marker / selected',s.selectedIndicator,s.selectedBackground,3],
    ['selected marker / surface',s.selectedIndicator,t.surface,3],
    ['focus ring / background',s.focusRing,t.background,3],
    ['focus ring / surface',s.focusRing,t.surface,3],
    ['focus ring / raised',s.focusRing,t.surfaceRaised,3],
    ['inner focus ring / primary',s.focusRingInner,t.primary,3],
    ['text / translucent tinted surface',t.text,s.overlayTintOnSurface,4.5],
  ] as const;
  return comparisons.map(([role,foreground,background,minimum])=>{
    const ratio=contrastRatio(foreground,background);
    return {role,foreground,background,ratio,minimum,pass:ratio>=minimum};
  });
}
