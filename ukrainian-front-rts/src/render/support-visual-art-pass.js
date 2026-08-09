import { UNIT_TYPES } from '../config.js';
import { loadSupportVisualAtlas, supportVisualDirectionFromAngle, supportVisualFactionPrefix, supportVisualFamilyFor, supportVisualStateForEntity } from './support-visual-atlas.js';

const INSTALLATION=Symbol.for('fields-of-resolve.support-visual-art-pass');

function statsFor(renderer,entity){
  const legacy=UNIT_TYPES[entity?.type];
  if(!legacy)return null;
  try{return renderer.g?.unitStats?.(entity.type)??legacy;}catch{return legacy;}
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
    const family=supportVisualFamilyFor(entity?.type,stats);
    const prefix=supportVisualFactionPrefix(entity,stats);
    if(!family||!prefix||!state.runtime)return fallbackUnit.call(this,entity);
    const screen=this.sp(entity.x,entity.y),zoom=this.g.camera.z;
    const visualState=supportVisualStateForEntity(entity),direction=supportVisualDirectionFromAngle(entity.angle);
    const drawX=Math.round(screen.x),drawY=Math.round(screen.y)+14*zoom;
    const result=state.runtime.drawAnimation(this.x,`${prefix}.${family}.${visualState}`,{
      x:drawX,y:drawY,scale:Math.max(.3,zoom*.82),elapsedMs:Math.max(0,Number(this.g.time)||0)*1000,direction,
    });
    this.selection(entity,screen,stats,zoom);
    return result;
  }

  RendererClass.prototype.unit=supportUnit;
  RendererClass.prototype.supportVisualAtlasStatus=function supportVisualAtlasStatus(){return Object.freeze({state:state.status,ready:state.status==='ready',error:state.error?String(state.error.message??state.error):null});};
  const installation=Object.freeze({
    status:()=>Object.freeze({state:state.status,ready:state.status==='ready',error:state.error?String(state.error.message??state.error):null}),
    restore(){
      if(RendererClass.prototype.unit===supportUnit)RendererClass.prototype.unit=fallbackUnit;
      delete RendererClass.prototype.supportVisualAtlasStatus;
      delete RendererClass.prototype[INSTALLATION];
    },
  });
  Object.defineProperty(RendererClass.prototype,INSTALLATION,{value:installation,configurable:true});
  return installation;
}
