import {
  SUPPORT_VISUAL_EXPECTED_UNIT_IDS,
  SUPPORT_VISUAL_REQUIRED_DIRECTIONS,
  SUPPORT_VISUAL_REQUIRED_FAMILIES,
  SUPPORT_VISUAL_REQUIRED_STATES,
  validateSupportVisualSource,
} from './support-visual-atlas-generator.js';
import {
  supportVisualReviewFrameCount,
  supportVisualReviewFrameSvg,
  supportVisualReviewImageSvg,
} from './support-visual-review-frame.js';

export { SUPPORT_VISUAL_EXPECTED_UNIT_IDS, SUPPORT_VISUAL_REQUIRED_DIRECTIONS, SUPPORT_VISUAL_REQUIRED_FAMILIES, SUPPORT_VISUAL_REQUIRED_STATES };
export const SUPPORT_VISUAL_SOURCE_URL = new URL('../../art-src/units/support/support-visual-source.json', import.meta.url);
export const SUPPORT_VISUAL_DECODED_FRAME_LIMIT = 192;
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
const ACTIVE_RUNTIME_IDS=Object.freeze([...new Set(Object.values(SUPPORT_VISUAL_TYPE_ALIASES))]);

function svgDataUrl(svg){return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;}
function defaultImageFactory(){return new Image();}
function loadImage(source,imageFactory){
  return new Promise((resolve,reject)=>{
    let image;
    try{image=imageFactory();}catch(error){reject(error);return;}
    image.decoding='async';
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('Unable to decode support visual frame.'));
    image.src=source;
  });
}
function directionId(direction){return SUPPORT_VISUAL_REQUIRED_DIRECTIONS.includes(direction)?direction:SUPPORT_VISUAL_REQUIRED_DIRECTIONS[0];}
function resolveUnitId(value){return CANONICAL_IDS.has(value)?value:SUPPORT_VISUAL_TYPE_ALIASES[value]??null;}
function animationParts(animationId){
  for(const state of SUPPORT_VISUAL_REQUIRED_STATES){
    const suffix=`.${state}`;
    if(animationId?.endsWith(suffix)){
      const unitId=animationId.slice(0,-suffix.length);
      if(CANONICAL_IDS.has(unitId))return{unitId,state};
    }
  }
  return null;
}
function resolvedFrameIndex(source,state,elapsedMs){
  const definition=source.states[state],total=definition.durationsMs.reduce((sum,value)=>sum+value,0);
  let cursor=Math.max(0,Number(elapsedMs)||0);
  cursor=definition.loop==='loop'?cursor%total:Math.min(cursor,Math.max(0,total-Number.EPSILON));
  let index=0;
  while(index<definition.frames-1&&cursor>=definition.durationsMs[index]){cursor-=definition.durationsMs[index];index+=1;}
  return{index,cursor,durationMs:definition.durationsMs[index],complete:definition.loop!=='loop'&&(Number(elapsedMs)||0)>=total};
}
function drawImage(context,image,{x,y,scale=1,alpha=1}={}){
  if(!context||typeof context.drawImage!=='function')throw new TypeError('Support visual draw requires a CanvasRenderingContext2D-compatible object.');
  context.save();
  try{
    context.imageSmoothingEnabled=false;
    if('globalAlpha'in context)context.globalAlpha*=alpha;
    context.translate(x,y);context.scale(scale,scale);context.drawImage(image,0,0,64,64,-32,-54,64,64);
  }finally{context.restore();}
}
function portraitSvg(source,unitId){
  const unit=source.units.find((entry)=>entry.id===unitId),prefix=unit?.faction==='ukraine'?'ua':'ru';
  const deep=source.paletteTokens?.[`${prefix}Deep`]??(prefix==='ua'?'#2f443b':'#403429');
  const accent=source.paletteTokens?.[`${prefix}Accent`]??(prefix==='ua'?'#d7bb56':'#b9aa8d');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" fill="#151815"/><rect x="3" y="3" width="58" height="58" rx="5" fill="${deep}" stroke="${accent}" stroke-width="3"/><g transform="translate(0 3)">${supportVisualReviewFrameSvg(source,unitId,'idle','se',0)}</g></svg>`;
}
function manifestFor(source){
  const frames={},animations={};
  for(const unit of source.units){
    frames[`${unit.id}.portrait`]={id:`${unit.id}.portrait`};frames[`${unit.id}.icon`]={id:`${unit.id}.icon`};
    for(const state of SUPPORT_VISUAL_REQUIRED_STATES){
      const definition=source.states[state],directions={};
      for(const direction of SUPPORT_VISUAL_REQUIRED_DIRECTIONS){
        directions[direction]=Array.from({length:definition.frames},(_,frameIndex)=>({frame:`${unit.id}.${state}.${direction}.${frameIndex}`,durationMs:definition.durationsMs[frameIndex]}));
      }
      animations[`${unit.id}.${state}`]={loop:definition.loop==='hold'?'hold':'loop',defaultDurationMs:definition.durationsMs[0],directions};
    }
  }
  return Object.freeze({frames:Object.freeze(frames),animations:Object.freeze(animations),fallback:Object.freeze({frame:'missing'}),directions:Object.freeze({order:[...SUPPORT_VISUAL_REQUIRED_DIRECTIONS],zero:'n',clockwise:true})});
}

export function resolveSupportVisualUnitId(type,stats=null){
  for(const candidate of [type,stats?.id,stats?.profileId,stats?.rosterNodeId,stats?.visual]){if(typeof candidate==='string'){const resolved=resolveUnitId(candidate);if(resolved)return resolved;}}
  return null;
}
export function supportVisualFactionPrefix(entity,stats=null){
  const id=resolveSupportVisualUnitId(entity?.type,stats);if(id?.startsWith('ua.'))return'ua';if(id?.startsWith('ru.'))return'ru';
  const faction=String(stats?.faction??stats?.factionId??stats?.side??'').toLowerCase();if(faction==='ukraine')return'ua';if(faction==='russia')return'ru';if(entity?.team===0)return'ua';if(entity?.team===1)return'ru';return null;
}
export function supportVisualStateForEntity(entity){
  if(!entity||typeof entity!=='object')return'idle';if(entity.wreck===true||entity.destroyed===true)return'wreck';if(entity.dying===true||entity.death===true||Number(entity.hp)<=0)return'death';if(Number(entity.flash)>0||entity.firing===true)return'attack';if(entity.hit===true||entity.hitFlash===true||Number(entity.recentHit)>0)return'hit';
  const hp=Number(entity.hp),maxHp=Number(entity.maxHp);if(Number.isFinite(hp)&&Number.isFinite(maxHp)&&maxHp>0&&hp/maxHp<.5)return'damaged';if(entity.order||entity.moving===true||Math.hypot(Number(entity.vx)||0,Number(entity.vy)||0)>.01)return'move';return'idle';
}
export function supportVisualDirectionFromAngle(angleRadians){if(!Number.isFinite(angleRadians))return SUPPORT_VISUAL_REQUIRED_DIRECTIONS[0];const index=Math.round((angleRadians+Math.PI/2)/(Math.PI/4));return SUPPORT_VISUAL_REQUIRED_DIRECTIONS[((index%8)+8)%8];}
export function supportVisualAnimationId(unitId,state='idle'){const resolved=resolveUnitId(unitId);return resolved?`${resolved}.${SUPPORT_VISUAL_REQUIRED_STATES.includes(state)?state:'idle'}`:null;}
export function supportVisualPortraitFrameId(unitId){const resolved=resolveUnitId(unitId);return resolved?`${resolved}.portrait`:null;}
export function supportVisualIconFrameId(unitId){const resolved=resolveUnitId(unitId);return resolved?`${resolved}.icon`:null;}
export function supportVisualAnimationElapsedMs(entity,state,gameTimeSeconds=0){if(state==='attack'){const flash=Math.max(0,Math.min(.1,Number(entity?.flash)||0));return(1-flash/.1)*260;}if(state==='hit')return Math.max(0,(1-Math.min(1,Number(entity?.recentHit)||0))*150);return Math.max(0,Number(gameTimeSeconds)||0)*1000;}

export async function loadSupportVisualAtlas({source=SUPPORT_VISUAL_SOURCE_URL,fetchImpl=globalThis.fetch?.bind(globalThis),imageFactory=defaultImageFactory,fallbackRuntime=null,decodedFrameLimit=SUPPORT_VISUAL_DECODED_FRAME_LIMIT}={}){
  const artLabPath=String(globalThis.location?.pathname??'').endsWith('/art-lab.html');
  try{
    if(!Number.isInteger(decodedFrameLimit)||decodedFrameLimit<=0)throw new TypeError('decodedFrameLimit must be a positive integer.');
    if(typeof fetchImpl!=='function')throw new Error('No fetch implementation is available for support visuals.');
    const response=await fetchImpl(String(source));if(!response?.ok)throw new Error(`Unable to load support visual source: ${String(source)} (${response?.status??'unknown'})`);
    const sourceObject=await response.json(),errors=validateSupportVisualSource(sourceObject);if(errors.length)throw new Error(errors.join('\n'));
    const manifest=manifestFor(sourceObject),catalog=Object.freeze({schema:'fields-of-resolve.support-visual-catalog',version:1,units:Object.freeze(sourceObject.units.map((unit)=>Object.freeze({...unit})))});
    const cache=new Map(),inflight=new Map(),loadErrors=new Map();let evictions=0;
    const frameKey=(unitId,state,direction,frameIndex)=>`${unitId}|${state}|${direction}|${frameIndex}`;
    const cached=(key)=>{if(!cache.has(key))return null;const image=cache.get(key);cache.delete(key);cache.set(key,image);return image;};
    const store=(key,image)=>{if(cache.has(key))cache.delete(key);cache.set(key,image);while(cache.size>decodedFrameLimit){const oldest=cache.keys().next().value;cache.delete(oldest);evictions+=1;}return image;};
    const ensureImage=(key,svg)=>{
      const hit=cached(key);if(hit)return Promise.resolve(hit);if(inflight.has(key))return inflight.get(key);
      const promise=loadImage(svgDataUrl(svg),imageFactory).then((image)=>{store(key,image);inflight.delete(key);loadErrors.delete(key);return image;}).catch((error)=>{inflight.delete(key);loadErrors.set(key,error);throw error;});
      inflight.set(key,promise);return promise;
    };
    const ensureAnimationFrame=(unitId,state,direction,frameIndex)=>ensureImage(frameKey(unitId,state,direction,frameIndex),supportVisualReviewImageSvg(sourceObject,unitId,state,direction,frameIndex));
    const ensurePortrait=(unitId)=>ensureImage(`${unitId}|portrait`,portraitSvg(sourceObject,unitId));
    const search=globalThis.location?.search?new URLSearchParams(globalThis.location.search):null,reviewParam=search?.get('supportPage');
    const reviewPage=reviewParam===null||reviewParam===undefined?Number.NaN:Number(reviewParam),reviewPageDefinition=Number.isInteger(reviewPage)?SUPPORT_VISUAL_REVIEW_PAGES[reviewPage]:null;
    const initialIds=reviewPageDefinition?.unitIds??ACTIVE_RUNTIME_IDS,initialDirection=reviewPageDefinition?'e':null;
    const preload=initialDirection?initialIds.map((unitId)=>ensureAnimationFrame(unitId,'idle',initialDirection,0)):initialIds.flatMap((unitId)=>SUPPORT_VISUAL_REQUIRED_DIRECTIONS.map((direction)=>ensureAnimationFrame(unitId,'idle',direction,0)));
    await Promise.all(preload);

    function drawAnimation(context,animationId,{x,y,scale=1,alpha=1,elapsedMs=0,direction='n'}={}){
      const parts=animationParts(animationId);if(!parts)return Object.freeze({animationId:null,frameId:null,index:0,pending:true});
      const facing=directionId(direction),resolved=resolvedFrameIndex(sourceObject,parts.state,elapsedMs),key=frameKey(parts.unitId,parts.state,facing,resolved.index),image=cached(key);
      if(!image){ensureAnimationFrame(parts.unitId,parts.state,facing,resolved.index).catch(()=>{});return Object.freeze({animationId,frameId:`${parts.unitId}.${parts.state}.${facing}.${resolved.index}`,index:resolved.index,pending:true,loadError:loadErrors.get(key)??null});}
      drawImage(context,image,{x,y,scale,alpha});return Object.freeze({animationId,frameId:`${parts.unitId}.${parts.state}.${facing}.${resolved.index}`,index:resolved.index,pending:false,durationMs:resolved.durationMs,complete:resolved.complete});
    }
    function drawFrame(context,frameId,{x,y,scale=1,alpha=1}={}){
      const suffix='.portrait';if(!frameId?.endsWith(suffix))return Object.freeze({frameId,pending:true});const unitId=frameId.slice(0,-suffix.length);if(!CANONICAL_IDS.has(unitId))return Object.freeze({frameId,pending:true});
      const key=`${unitId}|portrait`,image=cached(key);if(!image){ensurePortrait(unitId).catch(()=>{});return Object.freeze({frameId,pending:true,loadError:loadErrors.get(key)??null});}drawImage(context,image,{x,y,scale,alpha});return Object.freeze({frameId,pending:false});
    }
    return Object.freeze({
      manifest,catalog,source:sourceObject,degraded:false,loadError:null,drawAnimation,drawFrame,
      prepare:async(unitIds,{state='idle',direction='e'}={})=>{const count=supportVisualReviewFrameCount(sourceObject,state);await Promise.all(unitIds.flatMap((unitId)=>Array.from({length:count},(_,index)=>ensureAnimationFrame(unitId,state,direction,index))));return Object.freeze({unitCount:unitIds.length,frameCount:unitIds.length*count});},
      cacheStatus:()=>Object.freeze({loaded:cache.size,loading:inflight.size,errors:loadErrors.size,limit:decodedFrameLimit,evictions}),
    });
  }catch(error){if(fallbackRuntime&&!artLabPath)return Object.freeze({...fallbackRuntime,degraded:true,loadError:error,catalog:Object.freeze({units:Object.freeze([])})});throw error;}
}
