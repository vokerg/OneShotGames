import { UNIT_TYPES } from '../config.js';
import {
  loadSupportVisualAtlas,
  resolveSupportVisualUnitId,
  supportVisualAnimationElapsedMs,
  supportVisualAnimationId,
  supportVisualDirectionFromAngle,
  supportVisualStateForEntity,
} from './support-visual-atlas.js';

const INSTALLATION=Symbol.for('fields-of-resolve.support-visual-art-pass');

function statsFor(renderer,entity){
  try{
    const runtime=renderer.g?.unitStats?.(entity?.type);
    if(runtime)return runtime;
  }catch{}
  return entity?.stats??UNIT_TYPES[entity?.type]??null;
}

export function installSupportVisualArtPass(RendererClass,{loadAtlas=loadSupportVisualAtlas}={}){
  if(typeof RendererClass!=='function'||!RendererClass.prototype)throw new TypeError('Support visual art pass requires a Renderer class.');
  if(RendererClass.prototype[INSTALLATION])return RendererClass.prototype[INSTALLATION];
  const fallbackUnit=RendererClass.prototype.unit;
  if(typeof fallbackUnit!=='function')throw new TypeError('Renderer must expose unit before support visual installation.');
  const state={status:'loading',runtime:null,error:null};
  Promise.resolve().then(()=>loadAtlas()).then((runtime)=>{state.runtime=runtime;state.status='ready';}).catch((error)=>{state.error=error;state.status='error';});

  function supportUnit(entity){
    const stats=statsFor(this,entity);
    const unitId=resolveSupportVisualUnitId(entity?.type,stats);
    if(!unitId||!state.runtime)return fallbackUnit.call(this,entity);
    const visualState=supportVisualStateForEntity(entity),animationId=supportVisualAnimationId(unitId,visualState);
    if(!animationId||!state.runtime.manifest?.animations?.[animationId])return fallbackUnit.call(this,entity);
    const screen=this.sp(entity.x,entity.y),zoom=this.g.camera.z,direction=supportVisualDirectionFromAngle(entity.angle);
    const result=state.runtime.drawAnimation(this.x,animationId,{
      x:Math.round(screen.x),y:Math.round(screen.y)+14*zoom,scale:Math.max(.3,zoom*.82),
      elapsedMs:supportVisualAnimationElapsedMs(entity,visualState,this.g.time),direction,
    });
    if(stats&&typeof this.selection==='function')this.selection(entity,screen,stats,zoom);
    return result;
  }

  RendererClass.prototype.unit=supportUnit;
  RendererClass.prototype.supportVisualAtlasStatus=function supportVisualAtlasStatus(){return Object.freeze({state:state.status,ready:state.status==='ready',error:state.error?String(state.error.message??state.error):null});};
  const installation=Object.freeze({
    status:()=>Object.freeze({state:state.status,ready:state.status==='ready',error:state.error?String(state.error.message??state.error):null}),
    restore(){
      if(RendererClass.prototype.unit===supportUnit)RendererClass.prototype.unit=fallbackUnit;
      if(RendererClass.prototype.supportVisualAtlasStatus)delete RendererClass.prototype.supportVisualAtlasStatus;
      delete RendererClass.prototype[INSTALLATION];
    },
  });
  Object.defineProperty(RendererClass.prototype,INSTALLATION,{value:installation,configurable:true});
  return installation;
}
