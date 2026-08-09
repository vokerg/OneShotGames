import { loadSpriteAtlas } from './sprite-atlas-runtime.js';
import { generateSupportVisualAtlas, SUPPORT_VISUAL_REQUIRED_DIRECTIONS, SUPPORT_VISUAL_REQUIRED_FAMILIES, SUPPORT_VISUAL_REQUIRED_STATES } from './support-visual-atlas-generator.js';

export { SUPPORT_VISUAL_REQUIRED_DIRECTIONS, SUPPORT_VISUAL_REQUIRED_FAMILIES, SUPPORT_VISUAL_REQUIRED_STATES };
export const SUPPORT_VISUAL_SOURCE_URL = new URL('../../art-src/units/support/support-visual-source.json', import.meta.url);

function svgDataUrl(svg){return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;}

export function supportVisualFamilyFor(type,stats=null){
  const candidates=[stats?.archetype,stats?.vehicleClass,stats?.roleId,stats?.role,stats?.visual,type]
    .filter((value)=>typeof value==='string').map((value)=>value.trim().toLowerCase());
  for(const family of SUPPORT_VISUAL_REQUIRED_FAMILIES){
    if(candidates.some((value)=>value===family||value.includes(family)))return family;
  }
  if(candidates.some((value)=>value.includes('rocket')||value.includes('launcher')))return'rocket';
  if(candidates.some((value)=>value.includes('air defense')||value.includes('air-defense')||value.includes('sam')||value.includes('radar')))return'air-defense';
  if(candidates.some((value)=>value.includes('bridge')))return'bridging';
  if(candidates.some((value)=>value.includes('logistic')||value.includes('supply')))return'logistics';
  return null;
}

export function supportVisualFactionPrefix(entity,stats=null){
  const faction=String(stats?.faction??stats?.factionId??stats?.side??'').toLowerCase();
  if(faction==='ukraine')return'ua';
  if(faction==='russia')return'ru';
  if(entity?.team===0)return'ua';
  if(entity?.team===1)return'ru';
  return null;
}

export function supportVisualStateForEntity(entity){
  if(!entity||typeof entity!=='object')return'idle';
  if(entity.wreck===true||entity.destroyed===true||Number(entity.hp)<=0)return'wreck';
  if(entity.firing===true||Number(entity.flash)>0)return'attack';
  const hp=Number(entity.hp),maxHp=Number(entity.maxHp);
  if(Number.isFinite(hp)&&Number.isFinite(maxHp)&&maxHp>0&&hp/maxHp<.5)return'damaged';
  if(entity.order||entity.moving===true||Math.hypot(Number(entity.vx)||0,Number(entity.vy)||0)>.01)return'move';
  return'idle';
}

export function supportVisualDirectionFromAngle(angleRadians){
  if(!Number.isFinite(angleRadians))return SUPPORT_VISUAL_REQUIRED_DIRECTIONS[0];
  const index=Math.round((angleRadians+Math.PI/2)/(Math.PI/4));
  return SUPPORT_VISUAL_REQUIRED_DIRECTIONS[((index%8)+8)%8];
}

export async function loadSupportVisualAtlas({source=SUPPORT_VISUAL_SOURCE_URL,fetchImpl=globalThis.fetch?.bind(globalThis),imageFactory,fallbackRuntime=null}={}){
  if(typeof fetchImpl!=='function')throw new Error('No fetch implementation is available for support visuals.');
  const response=await fetchImpl(String(source));
  if(!response?.ok)throw new Error(`Unable to load support visual source: ${String(source)} (${response?.status??'unknown'})`);
  const generated=generateSupportVisualAtlas(await response.json());
  const manifest={...generated.manifestObject,image:{...generated.manifestObject.image,src:svgDataUrl(generated.svg)}};
  return loadSpriteAtlas(manifest,{fetchImpl,imageFactory,fallbackRuntime});
}
