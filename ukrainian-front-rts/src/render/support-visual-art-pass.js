import { FACTIONS, UNIT_TYPES } from '../config.js';
import {
  loadSupportVisualAtlas,
  resolveSupportVisualUnitId,
  supportVisualAnimationElapsedMs,
  supportVisualAnimationId,
  supportVisualDirectionFromAngle,
  supportVisualPortraitFrameId,
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
function roleLabel(stats,unitId){
  return String(stats?.roleId??stats?.archetype??stats?.role??unitId??'support').replaceAll('-',' ').replaceAll('.',' ').toUpperCase();
}
function statusRecord(state){
  return Object.freeze({state:state.status,ready:state.status==='ready',degraded:Boolean(state.runtime?.degraded),error:state.error?String(state.error.message??state.error):null});
}

export function installSupportVisualArtPass(RendererClass,{loadAtlas=loadSupportVisualAtlas}={}){
  if(typeof RendererClass!=='function'||!RendererClass.prototype)throw new TypeError('Support visual art pass requires a Renderer class.');
  if(typeof loadAtlas!=='function')throw new TypeError('loadAtlas must be a function.');
  if(RendererClass.prototype[INSTALLATION])return RendererClass.prototype[INSTALLATION];
  const fallbackUnit=RendererClass.prototype.unit;
  const fallbackPortrait=RendererClass.prototype.portrait;
  if(typeof fallbackUnit!=='function'||typeof fallbackPortrait!=='function')throw new TypeError('Renderer must expose unit and portrait methods before support visual installation.');
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

  function supportPortrait(entity){
    const stats=statsFor(this,entity);
    const unitId=resolveSupportVisualUnitId(entity?.type,stats);
    const frameId=unitId?supportVisualPortraitFrameId(unitId):null;
    if(!frameId||!state.runtime||!state.runtime.manifest?.frames?.[frameId])return fallbackPortrait.call(this,entity);
    const context=this.px;
    if(!context)return fallbackPortrait.call(this,entity);
    context.clearRect(0,0,144,112);
    context.fillStyle='#111713';context.fillRect(0,0,144,112);
    context.fillStyle=unitId.startsWith('ua.')?'#26352b':'#352b24';
    for(let y=0;y<112;y+=9)for(let x=0;x<144;x+=9)if((x+y)%27===0)context.fillRect(x,y,9,9);
    state.runtime.drawFrame(context,frameId,{x:72,y:87,scale:1.42});
    context.fillStyle='rgba(0,0,0,.55)';context.fillRect(5,82,134,23);
    context.font='bold 9px monospace';context.fillStyle=unitId.startsWith('ua.')?'#e4ca54':'#c8b89a';
    context.fillText(`${FACTIONS[entity.team]?.short??(unitId.startsWith('ua.')?'UA':'RU')} // ${roleLabel(stats,unitId)}`.slice(0,30),10,97);
    context.strokeStyle=unitId.startsWith('ua.')?'#75865e':'#806b54';context.lineWidth=5;context.strokeRect(2,2,140,108);
    return unitId;
  }

  RendererClass.prototype.unit=supportUnit;
  RendererClass.prototype.portrait=supportPortrait;
  RendererClass.prototype.supportVisualAtlasStatus=function supportVisualAtlasStatus(){return statusRecord(state);};
  const installation=Object.freeze({
    status:()=>statusRecord(state),
    restore(){
      if(RendererClass.prototype.unit===supportUnit)RendererClass.prototype.unit=fallbackUnit;
      if(RendererClass.prototype.portrait===supportPortrait)RendererClass.prototype.portrait=fallbackPortrait;
      if(RendererClass.prototype.supportVisualAtlasStatus)delete RendererClass.prototype.supportVisualAtlasStatus;
      delete RendererClass.prototype[INSTALLATION];
    },
  });
  Object.defineProperty(RendererClass.prototype,INSTALLATION,{value:installation,configurable:true});
  return installation;
}
