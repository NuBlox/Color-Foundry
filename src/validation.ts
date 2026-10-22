/** Runtime validation for the DTCG token types emitted by Color Foundry.
 * This deliberately validates the supported subset, rather than claiming to
 * implement every 2025.10 extension or the complete published JSON Schema.
 */
import { parseHex } from './color.js';
import { resolveTokens, type DTCGDocument, type TokenType } from './design-system.js';

export type ValidationSummary = Readonly<{tokenCount: number; aliasCount: number; types: Readonly<Record<TokenType,number>>}>;
type JsonObject = Record<string,unknown>;
const allowedTypes: readonly TokenType[]=['color','dimension','fontFamily','fontWeight','duration'];
const isObject = (x:unknown):x is JsonObject => typeof x==='object' && x!==null && !Array.isArray(x);
const finite = (x:unknown):x is number => typeof x==='number' && Number.isFinite(x);
const aliasSyntax=/^\{([^{}]+)\}$/;
const fail=(path:string, message:string):never => { throw new TypeError(`Invalid token ${path}: ${message}`); };

function validateValue(path:string,leaf:JsonObject): void {
  const type=leaf.$type;
  if(!allowedTypes.includes(type as TokenType))fail(path,`unsupported $type ${String(type)}`);
  if(typeof leaf.$description!=='undefined' && typeof leaf.$description!=='string') fail(path,'$description must be a string');
  const value=leaf.$value;
  if(typeof value==='string' && value.startsWith('{')) {
    if(!aliasSyntax.test(value))fail(path,'malformed token alias');
    return;
  }
  if(type==='color') {
    if(!isObject(value) || value.colorSpace!=='srgb' || !Array.isArray(value.components) || value.components.length!==3 ||
      !value.components.every((c:unknown)=>finite(c)&&c>=0&&c<=1)) fail(path,'expected sRGB colour with three normalized channels');
    const rgbValue = value as JsonObject;
    if(rgbValue.alpha!==undefined && (!finite(rgbValue.alpha)||rgbValue.alpha<0||rgbValue.alpha>1)) fail(path,'alpha must be within [0,1]');
    if(rgbValue.hex!==undefined) {
      if(typeof rgbValue.hex!=='string'||!/^#[0-9a-fA-F]{6}$/.test(String(rgbValue.hex)))fail(path,'hex must be #RRGGBB');
      const rgb=parseHex(String(rgbValue.hex));
      const channels=[rgb.r,rgb.g,rgb.b];
      if(channels.some((c,i)=>Math.abs(c-(rgbValue.components as number[])[i]!)>1/510+1e-9))
        fail(path,'hex and normalized components disagree');
    }
  } else if(type==='dimension' || type==='duration') {
    if(!isObject(value)||!finite(value.value)||
      (type==='dimension' ? !['px','rem'].includes(String(value.unit)) : !['ms','s'].includes(String(value.unit))))
      fail(path,`expected typed ${type} value and unit`);
  } else if(type==='fontWeight') {
    const named=['thin','hairline','extra-light','ultra-light','light','normal','regular','book','medium',
      'semi-bold','demi-bold','bold','extra-bold','ultra-bold','black','heavy','extra-black','ultra-black'];
    if(!(finite(value) && value>=1 && value<=1000) && !(typeof value==='string' && named.includes(value)))
      fail(path,'fontWeight must be a number in [1,1000] or a standard keyword');
  } else if(type==='fontFamily') {
    if(!(typeof value==='string'&&value.length>0) &&
      !(Array.isArray(value)&&value.length>0&&value.every(v=>typeof v==='string'&&v.length>0)))
      fail(path,'fontFamily must be a nonempty string or string array');
  }
}

/** Validate emitted token structure, typed values, references and cycles. */
export function validateDTCGTokens(input:unknown):ValidationSummary {
  if(!isObject(input))fail('<document>','must be a JSON object');
  const document=input as JsonObject;
  if(document.$schema!=='https://www.designtokens.org/schemas/2025.10/format.json')
    fail('<document>','unexpected 2025.10 schema identifier');
  const types:Record<TokenType,number>={color:0,dimension:0,fontFamily:0,fontWeight:0,duration:0};
  let aliasCount=0;
  function visit(group:JsonObject,path:string):void {
    for(const [name,child] of Object.entries(group)) {
      if(name.startsWith('$'))continue;
      if(!name || /[{}.]/.test(name) || ['__proto__','prototype','constructor'].includes(name))
        fail(path||'<document>',`invalid token or group name ${name}`);
      const here=path?`${path}.${name}`:name;
      if(!isObject(child))fail(here,'expected group or token object');
      const item=child as JsonObject;
      if(Object.hasOwn(item,'$value')) {
        for (const key of Object.keys(item)) {
          if(!key.startsWith('$'))fail(here,'token cannot also contain nested groups');
        }
        validateValue(here,item);
        types[item.$type as TokenType]++;
        if(typeof item.$value==='string' && aliasSyntax.test(item.$value as string))aliasCount++;
      } else visit(item,here);
    }
  }
  visit(document,'');
  // The reference resolver independently checks missing references, cycles and
  // alias target type agreement; validating values first prevents type confusion.
  resolveTokens(input as unknown as DTCGDocument);
  return {tokenCount:Object.values(types).reduce((a,b)=>a+b,0),aliasCount,types};
}

/** Assert that every generated CSS var() reference has a generated declaration. */
export function validateCSSReferences(css:string,prefix='cf'):Readonly<{declarations:number;references:number}> {
  if(typeof css!=='string'||typeof prefix!=='string'||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(prefix))
    throw new TypeError('Expected CSS and a safe variable prefix');
  const names=new Set([...css.matchAll(/--([a-z][a-z0-9-]*)\s*:/g)].map(m=>m[1]!));
  const refs=[...css.matchAll(/var\(\s*--([a-z][a-z0-9-]*)\s*(?:,|\))/g)].map(m=>m[1]!);
  for(const ref of refs) if(ref.startsWith(prefix+'-')&&!names.has(ref)) throw new Error(`Undeclared CSS variable: --${ref}`);
  return {declarations:names.size,references:refs.length};
}
