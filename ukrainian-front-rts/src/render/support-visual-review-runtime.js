import {
  SUPPORT_VISUAL_EXPECTED_UNIT_IDS,
  SUPPORT_VISUAL_REQUIRED_DIRECTIONS,
  SUPPORT_VISUAL_REQUIRED_STATES,
  validateSupportVisualSource,
} from './support-visual-atlas-generator.js';
import {
  supportVisualReviewFrameCount,
  supportVisualReviewImageSvg,
} from './support-visual-review-frame.js';

export const SUPPORT_VISUAL_REVIEW_SOURCE_URL=new URL('../../art-src/units/support/support-visual-source.json',import.meta.url);

function svgDataUrl(svg){return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;}
function defaultImageFactory(){return new Image();}
function loadImage(source,imageFactory){
  return new Promise((resolve,reject)=>{
    let image;
    try{image=imageFactory();}catch(error){reject(error);return;}
    image.decoding='async';
    image.onload=()=>resolve(image);
    image.onerror=()=>reject(new Error('Unable to decode support review frame.'));
    image.src=source;
  });
}
function key(unitId,state,direction,frameIndex){return `${unitId}|${state}|${direction}|${frameIndex}`;}

export async function loadSupportVisualReviewRuntime({
  source=SUPPORT_VISUAL_REVIEW_SOURCE_URL,
  fetchImpl=globalThis.fetch?.bind(globalThis),
  imageFactory=defaultImageFactory,
}={}){
  if(typeof fetchImpl!=='function')throw new Error('No fetch implementation is available for support visual review.');
  const response=await fetchImpl(String(source));
  if(!response?.ok)throw new Error(`Unable to load support visual review source: ${String(source)} (${response?.status??'unknown'})`);
  const sourceObject=await response.json();
  const errors=validateSupportVisualSource(sourceObject);
  if(errors.length)throw new Error(errors.join('\n'));
  const units=new Map(sourceObject.units.map((unit)=>[unit.id,Object.freeze({...unit})]));
  const cache=new Map();
  const inflight=new Map();

  async function ensureFrame(unitId,state,direction,frameIndex){
    const frameKey=key(unitId,state,direction,frameIndex);
    if(cache.has(frameKey))return cache.get(frameKey);
    if(inflight.has(frameKey))return inflight.get(frameKey);
    if(!units.has(unitId))throw new Error(`Unknown support review identity: ${unitId}`);
    if(!SUPPORT_VISUAL_REQUIRED_STATES.includes(state))throw new Error(`Unknown support review state: ${state}`);
    if(!SUPPORT_VISUAL_REQUIRED_DIRECTIONS.includes(direction))throw new Error(`Unknown support review direction: ${direction}`);
    const promise=loadImage(svgDataUrl(supportVisualReviewImageSvg(sourceObject,unitId,state,direction,frameIndex)),imageFactory)
      .then((image)=>{cache.set(frameKey,image);inflight.delete(frameKey);return image;})
      .catch((error)=>{inflight.delete(frameKey);throw error;});
    inflight.set(frameKey,promise);
    return promise;
  }

  async function prepare(unitIds,{state='idle',direction='e'}={}){
    const requested=[...new Set(unitIds)];
    for(const unitId of requested)if(!units.has(unitId))throw new Error(`Unknown support review identity: ${unitId}`);
    const frames=supportVisualReviewFrameCount(sourceObject,state);
    await Promise.all(requested.flatMap((unitId)=>Array.from({length:frames},(_,frameIndex)=>ensureFrame(unitId,state,direction,frameIndex))));
    return Object.freeze({unitCount:requested.length,frameCount:requested.length*frames,state,direction});
  }

  function drawFrame(context,unitId,{x,y,scale=1,state='idle',direction='e',frameIndex=0}={}){
    const frames=supportVisualReviewFrameCount(sourceObject,state);
    const safeFrame=((Math.trunc(frameIndex)%frames)+frames)%frames;
    const image=cache.get(key(unitId,state,direction,safeFrame));
    if(!image)return false;
    context.save();
    try{
      context.imageSmoothingEnabled=false;
      context.translate(x,y);
      context.scale(scale,scale);
      context.drawImage(image,0,0,64,64,-32,-54,64,64);
    }finally{context.restore();}
    return true;
  }

  function frameIndexAt(state,elapsedMs=0){
    const definition=sourceObject.states[state];
    const total=definition.durationsMs.reduce((sum,value)=>sum+value,0);
    let cursor=Math.max(0,Number(elapsedMs)||0);
    cursor=definition.loop==='loop'?cursor%total:Math.min(cursor,Math.max(0,total-Number.EPSILON));
    let index=0;
    while(index<definition.frames-1&&cursor>=definition.durationsMs[index]){cursor-=definition.durationsMs[index];index+=1;}
    return index;
  }

  return Object.freeze({
    source:sourceObject,
    catalog:Object.freeze({units:Object.freeze(sourceObject.units.map((unit)=>Object.freeze({...unit})))}),
    unitIds:Object.freeze([...SUPPORT_VISUAL_EXPECTED_UNIT_IDS]),
    prepare,
    drawFrame,
    frameIndexAt,
    cachedFrameCount:()=>cache.size,
  });
}
