import { loadSpriteAtlas } from './sprite-atlas-runtime.js';
import {
  generateSupportVisualAtlas,
  SUPPORT_VISUAL_EXPECTED_UNIT_IDS,
  SUPPORT_VISUAL_REQUIRED_DIRECTIONS,
  SUPPORT_VISUAL_REQUIRED_FAMILIES,
  SUPPORT_VISUAL_REQUIRED_STATES,
} from './support-visual-atlas-generator.js';

export { SUPPORT_VISUAL_EXPECTED_UNIT_IDS, SUPPORT_VISUAL_REQUIRED_DIRECTIONS, SUPPORT_VISUAL_REQUIRED_FAMILIES, SUPPORT_VISUAL_REQUIRED_STATES };
export const SUPPORT_VISUAL_SOURCE_URL = new URL('../../art-src/units/support/support-visual-source.json', import.meta.url);
export const SUPPORT_VISUAL_TYPE_ALIASES = Object.freeze({
  uaDrone:'ua.recon-drone.fpv-strike',quadDrone:'ua.recon-drone.fpv-strike',
  uaArtillery:'ua.self-propelled-artillery',bohdana:'ua.self-propelled-artillery',
  ruDrone:'ru.recon-uav.strike',fixedWingDrone:'ru.recon-uav.strike',
  ruArtillery:'ru.self-propelled-gun',msta:'ru.self-propelled-gun',
});
export const SUPPORT_VISUAL_REVIEW_PAGES = Object.freeze([
  Object.freeze({label:'UA UAS · EW · FIRES',unitIds:Object.freeze(SUPPORT_VISUAL_EXPECTED_UNIT_IDS.slice(0,11))}),
  Object.freeze({label:'UA LOGISTICS · COMMAND · BRIDGING · SUPPORT',unitIds:Object.freeze(SUPPORT_VISUAL_EXPECTED_UNIT_IDS.slice(11,18))}),
  Object.freeze({label:'RU UAS · EW · FIRES',unitIds:Object.freeze(SUPPORT_VISUAL_EXPECTED_UNIT_IDS.slice(18,25))}),
  Object.freeze({label:'RU LOGISTICS · COMMAND · BRIDGING · SUPPORT',unitIds:Object.freeze(SUPPORT_VISUAL_EXPECTED_UNIT_IDS.slice(25))}),
]);
const CANONICAL_IDS=new Set(SUPPORT_VISUAL_EXPECTED_UNIT_IDS);

function svgDataUrl(svg){return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;}

export function resolveSupportVisualUnitId(type,stats=null){
  for(const candidate of [type,stats?.id,stats?.profileId,stats?.rosterNodeId,stats?.visual]){
    if(typeof candidate!=='string')continue;
    if(CANONICAL_IDS.has(candidate))return candidate;
    if(SUPPORT_VISUAL_TYPE_ALIASES[candidate])return SUPPORT_VISUAL_TYPE_ALIASES[candidate];
  }
  return null;
}

export function supportVisualFactionPrefix(entity,stats=null){
  const id=resolveSupportVisualUnitId(entity?.type,stats);
  if(id?.startsWith('ua.'))return'ua';
  if(id?.startsWith('ru.'))return'ru';
  const faction=String(stats?.faction??stats?.factionId??stats?.side??'').toLowerCase();
  if(faction==='ukraine')return'ua';
  if(faction==='russia')return'ru';
  if(entity?.team===0)return'ua';
  if(entity?.team===1)return'ru';
  return null;
}

export function supportVisualStateForEntity(entity){
  if(!entity||typeof entity!=='object')return'idle';
  if(entity.wreck===true||entity.destroyed===true)return'wreck';
  if(entity.dying===true||entity.death===true||Number(entity.hp)<=0)return'death';
  if(Number(entity.flash)>0||entity.firing===true)return'attack';
  if(entity.hit===true||entity.hitFlash===true||Number(entity.recentHit)>0)return'hit';
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

export function supportVisualAnimationId(unitId,state='idle'){
  const resolved=CANONICAL_IDS.has(unitId)?unitId:SUPPORT_VISUAL_TYPE_ALIASES[unitId];
  if(!resolved)return null;
  return `${resolved}.${SUPPORT_VISUAL_REQUIRED_STATES.includes(state)?state:'idle'}`;
}
export function supportVisualPortraitFrameId(unitId){const resolved=CANONICAL_IDS.has(unitId)?unitId:SUPPORT_VISUAL_TYPE_ALIASES[unitId];return resolved?`${resolved}.portrait`:null;}
export function supportVisualIconFrameId(unitId){const resolved=CANONICAL_IDS.has(unitId)?unitId:SUPPORT_VISUAL_TYPE_ALIASES[unitId];return resolved?`${resolved}.icon`:null;}
export function supportVisualAnimationElapsedMs(entity,state,gameTimeSeconds=0){
  if(state==='attack'){const flash=Math.max(0,Math.min(.1,Number(entity?.flash)||0));return(1-flash/.1)*260;}
  if(state==='hit')return Math.max(0,(1-Math.min(1,Number(entity?.recentHit)||0))*150);
  return Math.max(0,Number(gameTimeSeconds)||0)*1000;
}

export async function loadSupportVisualAtlas({source=SUPPORT_VISUAL_SOURCE_URL,fetchImpl=globalThis.fetch?.bind(globalThis),imageFactory,fallbackRuntime=null}={}){
  if(typeof fetchImpl!=='function')throw new Error('No fetch implementation is available for support visuals.');
  const response=await fetchImpl(String(source));
  if(!response?.ok)throw new Error(`Unable to load support visual source: ${String(source)} (${response?.status??'unknown'})`);
  const generated=generateSupportVisualAtlas(await response.json());
  const manifest={...generated.manifestObject,image:{...generated.manifestObject.image,src:svgDataUrl(generated.svg)}};
  const runtime=await loadSpriteAtlas(manifest,{fetchImpl,imageFactory,fallbackRuntime});
  return Object.freeze({...runtime,catalog:generated.catalogObject,source:generated.source,generatedSvgBytes:generated.svg.length});
}
