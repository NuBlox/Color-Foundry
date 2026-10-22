/** Color Foundry v0.6: portable design-token model and deterministic CSS compiler.
 * The data model follows DTCG 2025.10 ($type, $value, curly-brace aliases).
 * Each mode exports a self-contained token document; never point an alias into
 * another mode. Audited sRGB semantic values do not inherit P3 enhancements.
 */
import { parseHex } from './color.js';
import { createPalette, STOPS, type Palette, type Theme } from './palette.js';
import { type InteractionStates } from './interaction.js';
import { validateDTCGTokens } from './validation.js';

export type TokenType = 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration';
export type ColorValue = Readonly<{
  colorSpace: 'srgb'; components: readonly [number, number, number]; alpha?: number; hex?: string;
}>;
export type DimensionValue = Readonly<{value: number; unit: 'px'|'rem'}>;
export type DurationValue = Readonly<{value: number; unit: 'ms'}>;
export type TokenValue = ColorValue | DimensionValue | DurationValue | string | number | readonly string[];
export type TokenLeaf = Readonly<{$type: TokenType; $value: TokenValue; $description?: string}>;
export type TokenGroup = { [key: string]: TokenGroup | TokenLeaf };
export type DTCGDocument = Readonly<{
  $schema: string; $description: string; color:TokenGroup;space:TokenGroup;radius:TokenGroup;
  border:TokenGroup;typography:TokenGroup;motion:TokenGroup;
}>;
export type DesignSystem = Readonly<{
  palette: Palette;
  tokens: Readonly<{ light: DTCGDocument; dark: DTCGDocument }>;
  css: string;
  prefix: string;
}>;

const SCHEMA = 'https://www.designtokens.org/schemas/2025.10/format.json';
const familyName = (name: string): string => name.replace(/[A-Z]/g, char => '-' + char.toLowerCase());
const kebabPath = (path: string): string => path.split('.').map(familyName).join('-');
const alias = (path: string): string => `{${path}}`;
const token = ($type: TokenType, $value: TokenValue, $description?: string): TokenLeaf =>
  $description ? {$type,$value,$description} : {$type,$value};
const tokenColor = (hex: string, description?: string): TokenLeaf => {
  const parsed = parseHex(hex);
  return token('color', {
    colorSpace: 'srgb',
    components: [parsed.r, parsed.g, parsed.b],
    hex: hex.toLowerCase(),
  }, description);
};
const dimension = (value: number, unit: 'px'|'rem' = 'rem'): TokenLeaf =>
  token('dimension', {value,unit});
const duration = (value: number): TokenLeaf => token('duration', {value,unit:'ms'});

function isLeaf(value: TokenGroup | TokenLeaf): value is TokenLeaf {
  return Object.prototype.hasOwnProperty.call(value,'$value');
}

/** Independent, serializable light/dark documents with primitive→semantic→component aliases. */
export function toDTCGTokens(palette: Palette, mode: 'light'|'dark'): DTCGDocument {
  const scales: TokenGroup = {};
  const lookup = new Map<string,string>();
  for (const [family,scale] of Object.entries(palette.scales)) {
    const stops: TokenGroup = {};
    for (const stop of STOPS) {
      const hex = scale[stop as keyof typeof scale];
      stops[String(stop)] = tokenColor(hex);
      if (!lookup.has(hex.toUpperCase())) lookup.set(hex.toUpperCase(), `color.srgb.${family}.${stop}`);
    }
    scales[family] = stops;
  }
  // Pure sRGB fixed primitives can be referenced in both modes.
  const constants: TokenGroup = {white:tokenColor('#FFFFFF'),black:tokenColor('#000000'),source:tokenColor(palette.seed)};
  lookup.set('#FFFFFF','color.fixed.white');
  lookup.set('#000000','color.fixed.black');

  function semanticValue(value: string): TokenLeaf {
    const found = lookup.get(value.toUpperCase());
    return found ? token('color', alias(found)) : tokenColor(value);
  }
  const semantic: TokenGroup = {};
  for (const [name,value] of Object.entries(palette[mode] as Theme)) semantic[name] = semanticValue(value);
  const interactions: TokenGroup = {};
  for (const [name,value] of Object.entries(palette.interactions[mode] as InteractionStates)) {
    // CSS alpha colours require separate DTCG alpha objects; three/four channel
    // RGB syntax and 6-digit CSS hex are intentionally not mixed.
    if (value.startsWith('rgb(')) {
      const match = /^rgb\((\d+) (\d+) (\d+) \/ (0(?:\.\d+)?|1)\)$/.exec(value);
      if (!match) throw new Error(`Unsupported CSS translucent colour: ${value}`);
      const rgb = [Number(match[1]),Number(match[2]),Number(match[3])] as const;
      interactions[name] = token('color', {
        colorSpace:'srgb',components:rgb.map(channel=>channel/255) as unknown as [number,number,number],
        alpha:Number(match[4]),
      });
    } else interactions[name] = semanticValue(value);
  }

  const component: TokenGroup = {
    button: {
      primary: {
        background: token('color',alias('color.semantic.primary')),
        foreground: token('color',alias('color.semantic.onPrimary')),
        hover: token('color',alias('color.state.primaryHover')),
        pressed: token('color',alias('color.state.primaryPressed')),
        disabledBackground: token('color',alias('color.state.disabledBackground')),
        disabledForeground: token('color',alias('color.state.disabledText')),
      },
      secondary: {
        background: token('color',alias('color.semantic.surface')),
        foreground: token('color',alias('color.semantic.text')),
        border: token('color',alias('color.semantic.border')),
        hover: token('color',alias('color.state.secondaryHover')),
        hoverBorder: token('color',alias('color.state.secondaryBorderHover')),
        pressed: token('color',alias('color.state.secondaryPressed')),
        pressedBorder: token('color',alias('color.state.secondaryBorderPressed')),
      },
    },
    card: {
      background:token('color',alias('color.semantic.surface')),
      elevated:token('color',alias('color.semantic.surfaceRaised')),
      border:token('color',alias('color.semantic.border')),
      text:token('color',alias('color.semantic.text')),
    },
    input: {
      background:token('color',alias('color.semantic.surface')),
      foreground:token('color',alias('color.semantic.text')),
      border:token('color',alias('color.semantic.border')),
      focus:token('color',alias('color.state.focusRing')),
    },
    selection: {
      background:token('color',alias('color.state.selectedBackground')),
      foreground:token('color',alias('color.state.selectedText')),
      indicator:token('color',alias('color.state.selectedIndicator')),
    },
    focus: {ring:token('color',alias('color.state.focusRing')),inner:token('color',alias('color.state.focusRingInner'))},
    status: Object.fromEntries((['success','warning','danger','info'] as const).map(status => [status,{
      background:token('color',alias(`color.semantic.${status}`)),
      foreground:token('color',alias(`color.semantic.on${status[0]!.toUpperCase()}${status.slice(1)}`)),
      subtle:token('color',alias(`color.semantic.${status}Surface`)),
      subtleForeground:token('color',alias(`color.semantic.on${status[0]!.toUpperCase()}${status.slice(1)}Surface`)),
    }])) as TokenGroup,
  };
  return {
    $schema:SCHEMA,
    $description:`Color Foundry v0.8 ${mode} tokens. Semantic and component roles use audited sRGB, independent of optional P3 swatches.`,
    color:{srgb:scales,fixed:constants,semantic,state:interactions,component},
    space:{0:dimension(0,'px'),1:dimension(.25),2:dimension(.5),3:dimension(.75),4:dimension(1),5:dimension(1.5),6:dimension(2),7:dimension(3),8:dimension(4)},
    radius:{sm:dimension(.375),md:dimension(.75),lg:dimension(1.125),pill:dimension(999,'px')},
    border:{width:dimension(1,'px'),focusWidth:dimension(3,'px')},
    typography:{family:token('fontFamily',['Inter','system-ui','sans-serif']),weight:{regular:token('fontWeight',400),medium:token('fontWeight',500),bold:token('fontWeight',700)}},
    motion:{quick:duration(120),normal:duration(180)},
  };
}

/** Enumerate leaves and check that every alias resolves, is type-consistent, and is acyclic. */
export function resolveTokens(document: DTCGDocument): Readonly<Record<string,TokenLeaf>> {
  const leaves = new Map<string,TokenLeaf>();
  function visit(group: TokenGroup, path: string): void {
    for (const [key,child] of Object.entries(group)) {
      if (key.startsWith('$')) continue;
      if (!key || /[{}.]/.test(key) || key.startsWith('$')) throw new Error(`Invalid DTCG token name: ${key}`);
      const next = path ? path+'.'+key : key;
      if (isLeaf(child)) leaves.set(next,child);
      else visit(child,next);
    }
  }
  visit(document as unknown as TokenGroup,'');
  const cache = new Map<string,TokenLeaf>();
  const visiting = new Set<string>();
  function resolve(path: string): TokenLeaf {
    const cached=cache.get(path); if(cached) return cached;
    if(visiting.has(path)) throw new Error(`Circular token alias: ${path}`);
    const leaf=leaves.get(path); if(!leaf) throw new Error(`Unresolved token alias: ${path}`);
    visiting.add(path);
    const ref = typeof leaf.$value==='string' ? /^\{([^{}]+)\}$/.exec(leaf.$value) : null;
    let actual=leaf;
    if(ref){
      const dependency=resolve(ref[1]!);
      if(leaf.$type!==dependency.$type) throw new Error(`Alias type mismatch: ${path}`);
      actual=token(leaf.$type,dependency.$value,leaf.$description);
    }
    visiting.delete(path);cache.set(path,actual);return actual;
  }
  for (const path of leaves.keys()) resolve(path);
  return Object.fromEntries(cache);
}

function flatten(document: DTCGDocument): Map<string,TokenLeaf> {
  const leaves=new Map<string,TokenLeaf>();
  function step(group: TokenGroup,path=''):void {
    for(const [key,child] of Object.entries(group)) {
      if(key.startsWith('$'))continue;
      const next=path ? `${path}.${key}` : key;
      if(isLeaf(child))leaves.set(next,child);else step(child,next);
    }
  }
  step(document as unknown as TokenGroup); return leaves;
}

function cssLiteral(leaf: TokenLeaf): string {
  const value=leaf.$value;
  if(typeof value==='string') throw new Error(`Unresolved token value: ${value}`);
  if(leaf.$type==='color') {
    const c=value as ColorValue;
    if(c.alpha!==undefined && c.alpha<1) return `rgb(${c.components.map(v=>Math.round(v*255)).join(' ')} / ${c.alpha})`;
    return c.hex?.toUpperCase() ?? `rgb(${c.components.map(v=>Math.round(v*255)).join(' ')})`;
  }
  if(leaf.$type==='dimension') {const d=value as DimensionValue;return `${d.value}${d.unit}`;}
  if(leaf.$type==='duration') {const d=value as DurationValue;return `${d.value}${d.unit}`;}
  if(leaf.$type==='fontFamily')return (value as readonly string[]).map(font=>font.includes(' ')?`"${font}"`:font).join(', ');
  return String(value);
}

function declaration(path:string,leaf:TokenLeaf,prefix:string): string {
  const raw=leaf.$value;
  const match=typeof raw==='string' ? /^\{([^{}]+)\}$/.exec(raw) : null;
  const val=match ? `var(--${prefix}-${kebabPath(match[1]!)})` : cssLiteral(leaf);
  return `  --${prefix}-${kebabPath(path)}: ${val};`;
}

/** Compile scoped light/dark token CSS; explicit themes override OS preference. */
export function toDesignSystemCSS(palette:Palette, options:Readonly<{prefix?:string}>={}):string {
  const prefix=options.prefix ?? 'cf';
  if(!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(prefix))throw new RangeError('Invalid CSS token prefix');
  const light=toDTCGTokens(palette,'light');const dark=toDTCGTokens(palette,'dark');
  validateDTCGTokens(light);validateDTCGTokens(dark);
  const a=flatten(light),b=flatten(dark);
  const linesA=Array.from(a,([path,leaf])=>declaration(path,leaf,prefix));
  const changed=Array.from(b).filter(([path,leaf])=>JSON.stringify(leaf)!==JSON.stringify(a.get(path)))
    .map(([path,leaf])=>declaration(path,leaf,prefix));
  // Raw enhanced P3 colour ramps are OPTIONAL; audited roles reference srgb.*, never p3.*.
  const p3=Object.entries(palette.p3Scales).flatMap(([family,scale])=>
    STOPS.map(stop=>`    --${prefix}-p3-${familyName(family)}-${stop}: ${scale[stop]};`));
  const srgbP3Names=Object.entries(palette.scales).flatMap(([family,scale])=>
    STOPS.map(stop=>`  --${prefix}-p3-${familyName(family)}-${stop}: ${scale[stop]};`));
  return [
    '/* Color Foundry v0.8: DTCG-inspired three-layer design tokens. */',
    '/* Semantic/component aliases always resolve to contrast-audited sRGB primitives. */',
    ':root {',...linesA,...srgbP3Names,'}',
    '[data-theme="dark"] {',...changed,'}',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme]) {',...changed,'  }',
    '}',
    '@supports (color: color(display-p3 1 0 0)) {',
    '  @media (color-gamut: p3) {', '    :root {',...p3,'    }','  }','}',
  ].join('\n')+'\n';
}

export function createDesignSystem(seedOrPalette:string|Palette,options:Readonly<{prefix?:string}>={}):DesignSystem {
  const palette=typeof seedOrPalette==='string' ? createPalette(seedOrPalette):seedOrPalette;
  const prefix=options.prefix??'cf';
  const tokens={light:toDTCGTokens(palette,'light'),dark:toDTCGTokens(palette,'dark')};
  validateDTCGTokens(tokens.light);validateDTCGTokens(tokens.dark);
  return {palette,tokens,css:toDesignSystemCSS(palette,{prefix}),prefix};
}


/** Multi-brand composition. A brand only overrides token *values*, never token names.
 * The default brand retains the exact single-brand stylesheet and API.
 */
export type BrandDefinition = Readonly<{
  id: string;
  name: string;
  seed: string | Palette;
}>;
export type BrandDesignSystem = Readonly<{
  defaultBrand: string;
  prefix: string;
  brands: Readonly<Record<string, DesignSystem>>;
  css: string;
}>;

const BRAND_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** A brand-specific override must beat the default :root mode selectors.
 * Manual [data-theme] takes precedence over OS mode, and P3 affects raw ramps only.
 */
function brandedCSS(id: string, design: DesignSystem, prefix: string): string {
  const light = flatten(design.tokens.light);
  const dark = flatten(design.tokens.dark);
  const lightDeclarations = Array.from(light, ([path, leaf]) => declaration(path, leaf, prefix));
  const darkDeclarations = Array.from(dark)
    .filter(([path, leaf]) => JSON.stringify(leaf) !== JSON.stringify(light.get(path)))
    .map(([path, leaf]) => declaration(path, leaf, prefix));
  const fallbackP3 = Object.entries(design.palette.scales).flatMap(([family, scale]) =>
    STOPS.map(stop => `  --${prefix}-p3-${familyName(family)}-${stop}: ${scale[stop]};`));
  const enhancedP3 = Object.entries(design.palette.p3Scales).flatMap(([family, scale]) =>
    STOPS.map(stop => `      --${prefix}-p3-${familyName(family)}-${stop}: ${scale[stop]};`));
  const selector = `:root[data-brand="${id}"]`;
  return [
    `/* Brand ${id}: complete light values, mode deltas, and independent P3 ramps. */`,
    `${selector} {`, ...lightDeclarations, ...fallbackP3, '}',
    `${selector}[data-theme="dark"] {`, ...darkDeclarations, '}',
    '@media (prefers-color-scheme: dark) {',
    `  ${selector}:not([data-theme]) {`, ...darkDeclarations, '  }',
    '}',
    '@supports (color: color(display-p3 1 0 0)) {',
    '  @media (color-gamut: p3) {',
    `    ${selector} {`, ...enhancedP3, '    }', '  }', '}',
  ].join('\n');
}

/**
 * Compose multiple independently audited palettes into one CSS token namespace.
 * Select with <html data-brand="forest"> and <html data-theme="dark">.
 * Missing/unknown data-brand uses the default brand. No JS is needed for CSS.
 */
export function createBrandDesignSystem(
  definitions: readonly BrandDefinition[],
  options: Readonly<{prefix?: string; defaultBrand?: string}> = {},
): BrandDesignSystem {
  if (!definitions.length) throw new RangeError('At least one brand is required');
  const prefix = options.prefix ?? 'cf';
  if (!BRAND_ID.test(prefix)) throw new RangeError('Invalid CSS token prefix');
  const brands: Record<string, DesignSystem> = Object.create(null) as Record<string, DesignSystem>;
  for (const definition of definitions) {
    if (!BRAND_ID.test(definition.id)) throw new RangeError(`Invalid brand ID: ${definition.id}`);
    if (!definition.name.trim()) throw new RangeError(`Brand ${definition.id} must have a display name`);
    if (Object.hasOwn(brands, definition.id)) throw new RangeError(`Duplicate brand ID: ${definition.id}`);
    brands[definition.id] = createDesignSystem(definition.seed, {prefix});
  }
  const defaultBrand = options.defaultBrand ?? definitions[0]!.id;
  if (!Object.hasOwn(brands, defaultBrand)) throw new RangeError(`Unknown default brand: ${defaultBrand}`);
  const baseline = brands[defaultBrand]!;
  const otherCSS = definitions.filter(d => d.id !== defaultBrand)
    .map(d => brandedCSS(d.id, brands[d.id]!, prefix));
  const css = [baseline.css.trimEnd(), ...otherCSS].join('\n\n') + '\n';
  return { defaultBrand, prefix, brands, css };
}
