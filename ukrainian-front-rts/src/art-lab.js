import {Game} from './game.js';
import {Renderer} from './render.js';
import './art-pass.js';
import {TEAM,UNIT_TYPES} from './config.js';
import {loadSpriteAtlas} from './render/sprite-atlas-runtime.js';
import {
 TEMPLATE_UNIT_DIRECTIONS,
 TEMPLATE_UNIT_STATES,
 loadTemplateUnitAtlas,
} from './render/template-unit-atlas.js';
import {
 UKRAINIAN_INFANTRY_DIRECTIONS,
 UKRAINIAN_INFANTRY_STATES,
 UKRAINIAN_INFANTRY_UNIT_IDS,
 loadUkrainianInfantryAtlas,
 ukrainianInfantryAnimationId,
} from './render/ukrainian-infantry-atlas.js';
import {
 RUSSIAN_INFANTRY_DIRECTIONS,
 RUSSIAN_INFANTRY_STATES,
 RUSSIAN_INFANTRY_UNIT_IDS,
 loadRussianInfantryAtlas,
 russianInfantryAnimationId,
} from './render/russian-infantry-atlas.js';
import {
 UKRAINIAN_VEHICLE_DIRECTIONS,
 UKRAINIAN_VEHICLE_STATES,
 UKRAINIAN_VEHICLE_UNIT_IDS,
 loadUkrainianVehicleAtlas,
 ukrainianVehicleAnimationId,
} from './render/ukrainian-vehicle-atlas.js';

const canvas=document.querySelector('#game');
const game=new Game();
game.start(0);
game.units=[];game.buildings=[];game.nodes=[];game.effects=[];game.projectiles=[];game.selected.clear();

const renderer=new Renderer(game,canvas,document.querySelector('#minimap'),document.querySelector('#portrait'));
renderer.fog=()=>{};
renderer.mini=()=>{};
renderer.mapLabel=()=>{};

const roster={
 [TEAM.UA]:['uaEngineer','uaInfantry','uaMedic','uaDrone','uaIfv','uaTank','uaArtillery','uaZelenskyy','uaZaluzhnyi'],
 [TEAM.RU]:['ruEngineer','ruInfantry','ruMedic','ruDrone','ruIfv','ruTank','ruArtillery','ruPutin','ruPrigozhin']
};

const origin={x:650,y:480};
for(const [teamKey,types] of Object.entries(roster)){
 const team=Number(teamKey),row=team===TEAM.UA?0:1;
 types.forEach((type,index)=>{
  const unit=game.addUnit(type,team,origin.x+index*145,origin.y+row*250);
  unit.angle=-Math.PI/2;
  unit.order={kind:'lab-motion'};
 });
}

game.camera={x:innerWidth/2-origin.x*.85,y:innerHeight/2-origin.y*.85,z:.85};
let paused=false,facing=1,valueCheck=false,last=performance.now(),templateStateIndex=0;
let ukrainianStateIndex=0,ukrainianDirectionIndex=2;
let templateRuntime=null,templateLoadError=null;
let ukrainianInfantryRuntime=null,ukrainianInfantryLoadError=null;
let russianInfantryRuntime=null,russianInfantryLoadError=null;
let ukrainianVehicleRuntime=null,ukrainianVehicleLoadError=null;

const ukrainianInfantryLabels=['ENGINEERS','LINE','ANTI-ARMOR','RECON','CASEVAC','AIR DEFENSE','COMMAND'];
const russianInfantryLabels=['ENGINEERS','COMMAND','LINE','ASSAULT','ANTI-ARMOR','RECON','MEDICAL','AIR DEFENSE'];
const ukrainianVehicleLabels=['APC','IFV','MBT','RECOVERY','ENGINEERING'];

async function loadAtlasReviews(){
 const fallback=await loadSpriteAtlas(new URL('../assets/atlases/fallback.atlas.json',import.meta.url));
 const [template,ukrainianInfantry,russianInfantry,ukrainianVehicle]=await Promise.all([
  loadTemplateUnitAtlas({fallbackRuntime:fallback}),
  loadUkrainianInfantryAtlas({fallbackRuntime:fallback}),
  loadRussianInfantryAtlas({fallbackRuntime:fallback}),
  loadUkrainianVehicleAtlas({fallbackRuntime:fallback}),
 ]);
 templateRuntime=template;
 ukrainianInfantryRuntime=ukrainianInfantry;
 russianInfantryRuntime=russianInfantry;
 ukrainianVehicleRuntime=ukrainianVehicle;
}
loadAtlasReviews().catch(error=>{
 if(!templateRuntime)templateLoadError=error;
 if(!ukrainianInfantryRuntime)ukrainianInfantryLoadError=error;
 if(!russianInfantryRuntime)russianInfantryLoadError=error;
 if(!ukrainianVehicleRuntime)ukrainianVehicleLoadError=error;
 console.error('[art-lab] atlas review load failed',error);
});

function centerCamera(){
 const centerX=origin.x+4*145,centerY=origin.y+125;
 game.camera.x=innerWidth/2-centerX*game.camera.z;
 game.camera.y=innerHeight/2-centerY*game.camera.z;
}

function drawTemplateReview(now){
 const q=renderer.x,state=TEMPLATE_UNIT_STATES[templateStateIndex];
 const spacing=Math.min(88,Math.max(58,(canvas.width-120)/TEMPLATE_UNIT_DIRECTIONS.length));
 const start=canvas.width/2-spacing*(TEMPLATE_UNIT_DIRECTIONS.length-1)/2;
 const y=canvas.height-64;
 q.save();
 q.fillStyle='rgba(10,14,11,.84)';
 q.fillRect(Math.round(start-spacing*.55),Math.round(y-58),Math.round(spacing*TEMPLATE_UNIT_DIRECTIONS.length),86);
 q.textAlign='center';q.font='bold 11px ui-monospace, monospace';q.fillStyle='#f0cf71';
 q.fillText(`UFR-109 TEMPLATE · ${state.toUpperCase()}`,Math.round(canvas.width/2),Math.round(y-43));
 if(templateRuntime){
  for(let index=0;index<TEMPLATE_UNIT_DIRECTIONS.length;index+=1){
   const direction=TEMPLATE_UNIT_DIRECTIONS[index],x=start+index*spacing;
   templateRuntime.drawAnimation(q,state,{x,y,elapsedMs:paused?0:now,direction,scale:1.05});
   q.fillStyle='#c9c1a2';q.fillText(direction.toUpperCase(),Math.round(x),Math.round(y+17));
  }
 }else{q.fillStyle='#dfb49e';q.fillText(templateLoadError?'TEMPLATE ATLAS FAILED TO LOAD':'LOADING TEMPLATE ATLAS…',Math.round(canvas.width/2),Math.round(y));}
 q.restore();
}

function drawUkrainianInfantryReview(now){
 const q=renderer.x,state=UKRAINIAN_INFANTRY_STATES[ukrainianStateIndex];
 const direction=UKRAINIAN_INFANTRY_DIRECTIONS[ukrainianDirectionIndex];
 const spacing=Math.min(122,Math.max(82,(canvas.width-160)/UKRAINIAN_INFANTRY_UNIT_IDS.length));
 const start=canvas.width/2-spacing*(UKRAINIAN_INFANTRY_UNIT_IDS.length-1)/2,y=135;
 q.save();q.fillStyle='rgba(10,14,11,.88)';q.fillRect(Math.round(start-spacing*.58),Math.round(y-50),Math.round(spacing*UKRAINIAN_INFANTRY_UNIT_IDS.length+spacing*.16),84);
 q.textAlign='center';q.font='bold 11px ui-monospace, monospace';q.fillStyle='#8fc7e8';
 q.fillText(`UFR-110 UKRAINIAN INFANTRY · ${state.toUpperCase()} · ${direction.toUpperCase()}`,Math.round(canvas.width/2),Math.round(y-36));
 if(ukrainianInfantryRuntime){for(let index=0;index<UKRAINIAN_INFANTRY_UNIT_IDS.length;index+=1){const unitId=UKRAINIAN_INFANTRY_UNIT_IDS[index],x=start+index*spacing;ukrainianInfantryRuntime.drawAnimation(q,ukrainianInfantryAnimationId(unitId,state),{x,y,elapsedMs:paused?0:now,direction,scale:1.08});q.fillStyle='#c9c1a2';q.font='bold 9px ui-monospace, monospace';q.fillText(ukrainianInfantryLabels[index],Math.round(x),Math.round(y+23));}}
 else{q.fillStyle='#dfb49e';q.fillText(ukrainianInfantryLoadError?'UKRAINIAN INFANTRY ATLAS FAILED TO LOAD':'LOADING UKRAINIAN INFANTRY ATLAS…',Math.round(canvas.width/2),Math.round(y));}
 q.restore();
}

function drawRussianInfantryReview(now){
 const q=renderer.x,state=RUSSIAN_INFANTRY_STATES[ukrainianStateIndex%RUSSIAN_INFANTRY_STATES.length];
 const direction=RUSSIAN_INFANTRY_DIRECTIONS[ukrainianDirectionIndex%RUSSIAN_INFANTRY_DIRECTIONS.length];
 const spacing=Math.min(108,Math.max(72,(canvas.width-150)/RUSSIAN_INFANTRY_UNIT_IDS.length));
 const start=canvas.width/2-spacing*(RUSSIAN_INFANTRY_UNIT_IDS.length-1)/2,y=235;
 q.save();q.fillStyle='rgba(14,11,10,.9)';q.fillRect(Math.round(start-spacing*.58),Math.round(y-50),Math.round(spacing*RUSSIAN_INFANTRY_UNIT_IDS.length+spacing*.16),84);
 q.textAlign='center';q.font='bold 11px ui-monospace, monospace';q.fillStyle='#dfb49e';
 q.fillText(`UFR-111 RUSSIAN INFANTRY · ${state.toUpperCase()} · ${direction.toUpperCase()}`,Math.round(canvas.width/2),Math.round(y-36));
 if(russianInfantryRuntime){for(let index=0;index<RUSSIAN_INFANTRY_UNIT_IDS.length;index+=1){const unitId=RUSSIAN_INFANTRY_UNIT_IDS[index],x=start+index*spacing;russianInfantryRuntime.drawAnimation(q,russianInfantryAnimationId(unitId,state),{x,y,elapsedMs:paused?0:now,direction,scale:1.08});q.fillStyle='#c9c1a2';q.font='bold 9px ui-monospace, monospace';q.fillText(russianInfantryLabels[index],Math.round(x),Math.round(y+23));}}
 else{q.fillStyle='#dfb49e';q.fillText(russianInfantryLoadError?'RUSSIAN INFANTRY ATLAS FAILED TO LOAD':'LOADING RUSSIAN INFANTRY ATLAS…',Math.round(canvas.width/2),Math.round(y));}
 q.restore();
}

function drawUkrainianVehicleReview(now){
 const q=renderer.x,state=UKRAINIAN_VEHICLE_STATES[ukrainianStateIndex%UKRAINIAN_VEHICLE_STATES.length];
 const direction=UKRAINIAN_VEHICLE_DIRECTIONS[ukrainianDirectionIndex%UKRAINIAN_VEHICLE_DIRECTIONS.length];
 const spacing=Math.min(150,Math.max(110,(canvas.width-220)/UKRAINIAN_VEHICLE_UNIT_IDS.length));
 const start=canvas.width/2-spacing*(UKRAINIAN_VEHICLE_UNIT_IDS.length-1)/2,y=350;
 q.save();q.fillStyle='rgba(10,14,11,.91)';q.fillRect(Math.round(start-spacing*.58),Math.round(y-58),Math.round(spacing*UKRAINIAN_VEHICLE_UNIT_IDS.length+spacing*.16),100);
 q.textAlign='center';q.font='bold 11px ui-monospace, monospace';q.fillStyle='#8fc7e8';
 q.fillText(`UFR-112 UKRAINIAN VEHICLES · ${state.toUpperCase()} · ${direction.toUpperCase()}`,Math.round(canvas.width/2),Math.round(y-42));
 if(ukrainianVehicleRuntime){for(let index=0;index<UKRAINIAN_VEHICLE_UNIT_IDS.length;index+=1){const unitId=UKRAINIAN_VEHICLE_UNIT_IDS[index],x=start+index*spacing;ukrainianVehicleRuntime.drawAnimation(q,ukrainianVehicleAnimationId(unitId,state),{x,y,elapsedMs:paused?0:now,direction,scale:1.02});q.fillStyle='#c9c1a2';q.font='bold 9px ui-monospace, monospace';q.fillText(ukrainianVehicleLabels[index],Math.round(x),Math.round(y+31));}}
 else{q.fillStyle='#dfb49e';q.fillText(ukrainianVehicleLoadError?'UKRAINIAN VEHICLE ATLAS FAILED TO LOAD':'LOADING UKRAINIAN VEHICLE ATLAS…',Math.round(canvas.width/2),Math.round(y));}
 q.restore();
}

function drawLabels(){
 const q=renderer.x,z=game.camera.z;q.save();q.textAlign='center';q.font='bold 11px ui-monospace, monospace';
 for(const unit of game.units){const s=renderer.sp(unit.x,unit.y),type=UNIT_TYPES[unit.type];q.fillStyle='rgba(10,14,11,.78)';q.fillRect(Math.round(s.x-58),Math.round(s.y+34*z),116,17);q.fillStyle=unit.team===TEAM.UA?'#8fc7e8':'#dfb49e';q.fillText(type.short||type.name,Math.round(s.x),Math.round(s.y+46*z));}
 q.textAlign='right';q.fillStyle='#f0cf71';q.fillText(valueCheck?'VALUE CHECK':'FULL COLOR',canvas.width-18,canvas.height-18);q.restore();
}

function applyValueCheck(){if(!valueCheck)return;const q=renderer.x,image=q.getImageData(0,0,canvas.width,canvas.height),d=image.data;for(let i=0;i<d.length;i+=4){const y=Math.round(d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722);d[i]=d[i+1]=d[i+2]=y;}q.putImageData(image,0,0);}

function capture(){const stamp=new Date().toISOString().replace(/[:.]/g,'-'),templateState=TEMPLATE_UNIT_STATES[templateStateIndex],state=UKRAINIAN_INFANTRY_STATES[ukrainianStateIndex],direction=UKRAINIAN_INFANTRY_DIRECTIONS[ukrainianDirectionIndex],link=document.createElement('a');link.download=`fields-of-resolve-roster-template-${templateState}-atlas-${state}-${direction}-z${game.camera.z.toFixed(2)}-${paused?'still':'motion'}-${valueCheck?'value':'color'}-${stamp}.png`;link.href=canvas.toDataURL('image/png');link.click();}

addEventListener('keydown',event=>{
 if(event.key==='1'||event.key==='2'||event.key==='3'){game.camera.z=event.key==='1'?.65:event.key==='2'?.85:1.15;centerCamera();}
 if(event.key.toLowerCase()==='f'){facing*=-1;for(const unit of game.units)unit.angle=facing>0?-Math.PI/2:Math.PI/2;}
 if(event.key.toLowerCase()==='t')templateStateIndex=(templateStateIndex+1)%TEMPLATE_UNIT_STATES.length;
 if(event.key.toLowerCase()==='u')ukrainianStateIndex=(ukrainianStateIndex+1)%UKRAINIAN_INFANTRY_STATES.length;
 if(event.key.toLowerCase()==='r')ukrainianDirectionIndex=(ukrainianDirectionIndex+1)%UKRAINIAN_INFANTRY_DIRECTIONS.length;
 if(event.key.toLowerCase()==='v')valueCheck=!valueCheck;
 if(event.key.toLowerCase()==='s')capture();
 if(event.code==='Space'){event.preventDefault();paused=!paused;for(const unit of game.units)unit.order=paused?null:{kind:'lab-motion'};}
});
addEventListener('resize',centerCamera);

function frame(now){const dt=Math.min(.033,(now-last)/1000);last=now;if(!paused)game.time+=dt;renderer.render();drawUkrainianInfantryReview(now);drawRussianInfantryReview(now);drawUkrainianVehicleReview(now);drawTemplateReview(now);drawLabels();applyValueCheck();requestAnimationFrame(frame);}
requestAnimationFrame(frame);
