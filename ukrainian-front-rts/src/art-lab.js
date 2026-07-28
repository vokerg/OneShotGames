import {Game} from './game.js';
import {Renderer} from './render.js';
import './art-pass.js';
import {TEAM,UNIT_TYPES} from './config.js';

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
let paused=false,facing=1,last=performance.now();

function centerCamera(){
 const centerX=origin.x+4*145,centerY=origin.y+125;
 game.camera.x=innerWidth/2-centerX*game.camera.z;
 game.camera.y=innerHeight/2-centerY*game.camera.z;
}

function drawLabels(){
 const q=renderer.x,z=game.camera.z;
 q.save();q.textAlign='center';q.font='bold 11px ui-monospace, monospace';
 for(const unit of game.units){
  const s=renderer.sp(unit.x,unit.y),type=UNIT_TYPES[unit.type];
  q.fillStyle='rgba(10,14,11,.78)';q.fillRect(Math.round(s.x-58),Math.round(s.y+34*z),116,17);
  q.fillStyle=unit.team===TEAM.UA?'#8fc7e8':'#dfb49e';q.fillText(type.short||type.name,Math.round(s.x),Math.round(s.y+46*z));
 }
 q.restore();
}

function capture(){
 const stamp=new Date().toISOString().replace(/[:.]/g,'-');
 const link=document.createElement('a');
 link.download=`fields-of-resolve-roster-z${game.camera.z.toFixed(2)}-${paused?'still':'motion'}-${stamp}.png`;
 link.href=canvas.toDataURL('image/png');
 link.click();
}

addEventListener('keydown',event=>{
 if(event.key==='1'||event.key==='2'||event.key==='3'){
  game.camera.z=event.key==='1'?.65:event.key==='2'?.85:1.15;
  centerCamera();
 }
 if(event.key.toLowerCase()==='f'){
  facing*=-1;
  for(const unit of game.units)unit.angle=facing>0?-Math.PI/2:Math.PI/2;
 }
 if(event.key.toLowerCase()==='s')capture();
 if(event.code==='Space'){
  event.preventDefault();paused=!paused;
  for(const unit of game.units)unit.order=paused?null:{kind:'lab-motion'};
 }
});
addEventListener('resize',centerCamera);

function frame(now){
 const dt=Math.min(.033,(now-last)/1000);last=now;if(!paused)game.time+=dt;
 renderer.render();drawLabels();requestAnimationFrame(frame);
}
requestAnimationFrame(frame);