import {Renderer} from './render.js';
import {TEAM,FACTIONS} from './config.js';

const INK='#111512';
const px=(q,x,y,w,h,c)=>{q.fillStyle=c;q.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)))};
const line=(q,x1,y1,x2,y2,c,w=1)=>{q.strokeStyle=c;q.lineWidth=Math.max(1,w);q.beginPath();q.moveTo(Math.round(x1)+.5,Math.round(y1)+.5);q.lineTo(Math.round(x2)+.5,Math.round(y2)+.5);q.stroke()};
const outline=(q,x,y,w,h,z=1)=>{q.strokeStyle=INK;q.lineWidth=Math.max(1,Math.round(1.6*z));q.strokeRect(Math.round(x)+.5,Math.round(y)+.5,Math.max(1,Math.round(w)-1),Math.max(1,Math.round(h)-1))};
const palette=team=>team===TEAM.UA
 ?{base:'#50684c',light:'#81956a',dark:'#293c30',deep:'#18271f',metal:'#9aa291',accent:'#e4ca54',glass:'#4e8db2'}
 :{base:'#6c5947',light:'#94775a',dark:'#41342a',deep:'#2a211b',metal:'#918d7d',accent:'#cdbd9d',glass:'#786957'};
const highDetail=z=>z>=.72;

Renderer.prototype.vehicle=function(q,u,t,z){
 const p=palette(u.team),art=t.archetype==='artillery',tank=t.archetype==='tank',ifv=t.archetype==='ifv';
 const w=(tank?40:art?39:37)*z,h=(art?49:41)*z,detail=highDetail(z);
 q.save();
 px(q,-w*.59,-h*.5,8*z,h,INK);px(q,w*.59-8*z,-h*.5,8*z,h,INK);
 px(q,-w*.54,-h*.43,5*z,h*.86,p.deep);px(q,w*.54-5*z,-h*.43,5*z,h*.86,p.deep);
 if(detail)for(let y=-h*.38;y<h*.39;y+=7*z){px(q,-w*.57,y,7*z,3*z,p.metal);px(q,w*.57-7*z,y,7*z,3*z,p.metal)}
 px(q,-w*.47,-h*.43,w*.94,h*.86,p.base);outline(q,-w*.47,-h*.43,w*.94,h*.86,z);
 px(q,-w*.39,-h*.35,w*.78,h*.18,p.light);px(q,-w*.39,h*.18,w*.78,h*.13,p.dark);
 px(q,-w*.43,-h*.39,5*z,h*.7,p.light);px(q,w*.43-4*z,-h*.32,4*z,h*.62,p.deep);
 if(tank){
  q.fillStyle=p.dark;q.beginPath();q.ellipse(0,-5*z,13*z,10*z,0,0,Math.PI*2);q.fill();q.strokeStyle=INK;q.lineWidth=Math.max(1,2*z);q.stroke();
  px(q,-8*z,-11*z,12*z,5*z,p.light);px(q,-3*z,-43*z,6*z,35*z,p.deep);px(q,-1*z,-45*z,3*z,32*z,p.metal);
  q.fillStyle=p.light;q.beginPath();q.moveTo(-14*z,-17*z);q.lineTo(14*z,-17*z);q.lineTo(9*z,-23*z);q.lineTo(-9*z,-23*z);q.closePath();q.fill();
  if(detail){px(q,5*z,-9*z,5*z,5*z,p.glass);px(q,-12*z,9*z,24*z,4*z,p.deep)}
 }else if(art){
  px(q,-14*z,-2*z,28*z,19*z,p.dark);outline(q,-14*z,-2*z,28*z,19*z,z);
  q.fillStyle=p.dark;q.beginPath();q.ellipse(0,-9*z,11*z,8*z,0,0,Math.PI*2);q.fill();q.strokeStyle=INK;q.lineWidth=Math.max(1,2*z);q.stroke();
  px(q,-3*z,-55*z,6*z,48*z,p.deep);px(q,-1*z,-57*z,3*z,45*z,p.metal);
  px(q,-18*z,14*z,8*z,4*z,p.deep);px(q,10*z,14*z,8*z,4*z,p.deep);
  if(detail){line(q,-18*z,17*z,-22*z,24*z,p.metal,2*z);line(q,18*z,17*z,22*z,24*z,p.metal,2*z)}
 }else if(ifv){
  if(t.visual==='bradley'){
   px(q,-13*z,-16*z,26*z,25*z,p.dark);outline(q,-13*z,-16*z,26*z,25*z,z);
   px(q,-10*z,-15*z,15*z,7*z,p.light);px(q,3*z,-13*z,8*z,8*z,p.glass);
   px(q,-7*z,-30*z,5*z,18*z,p.deep);px(q,-5*z,-31*z,2*z,15*z,p.metal);
   px(q,-15*z,7*z,8*z,9*z,p.light);
  }else{
   q.fillStyle=p.dark;q.beginPath();q.moveTo(-12*z,-14*z);q.lineTo(12*z,-14*z);q.lineTo(15*z,9*z);q.lineTo(-15*z,9*z);q.closePath();q.fill();q.strokeStyle=INK;q.lineWidth=Math.max(1,2*z);q.stroke();
   q.fillStyle=p.light;q.beginPath();q.ellipse(1*z,-7*z,8*z,6*z,0,0,Math.PI*2);q.fill();q.stroke();
   px(q,-1*z,-30*z,4*z,19*z,p.deep);px(q,1*z,-31*z,2*z,16*z,p.metal);
   if(detail)for(let x=-10;x<=10;x+=10)px(q,x*z-2*z,8*z,4*z,3*z,p.light);
  }
 }
 if(t.visual==='bohdana'){px(q,-13*z,8*z,26*z,8*z,p.dark);px(q,-15*z,13*z,30*z,4*z,p.deep)}
 if(t.visual==='msta'&&detail)px(q,-10*z,7*z,20*z,7*z,p.dark);
 this.factionMark(q,u.team,-10*z,12*z,4*z);q.restore();
};

Renderer.prototype.infantry=function(q,u,t,z){
 const p=palette(u.team),moving=!!u.order,bob=moving?Math.sin(this.g.time*9+(u.id||0))*.9*z:0,detail=highDetail(z);
 q.save();q.translate(0,bob);
 px(q,-9*z,-7*z,18*z,21*z,p.base);outline(q,-9*z,-7*z,18*z,21*z,z);
 px(q,-8*z,-7*z,6*z,18*z,p.light);px(q,3*z,-5*z,6*z,17*z,p.dark);
 q.fillStyle=p.light;q.beginPath();q.arc(0,-12*z,7*z,Math.PI,Math.PI*2);q.fill();px(q,-7*z,-12*z,14*z,5*z,p.light);outline(q,-7*z,-12*z,14*z,5*z,z);
 if(detail){px(q,-4*z,-10*z,3*z,2*z,p.deep);px(q,2*z,-10*z,3*z,2*z,p.deep)}
 if(t.medic){px(q,-7*z,-3*z,14*z,12*z,'#d7d9cf');outline(q,-7*z,-3*z,14*z,12*z,z);px(q,-2*z,-2*z,4*z,10*z,'#9d3835');px(q,-5*z,2*z,10*z,3*z,'#9d3835')}
 else if(t.worker){line(q,-10*z,7*z,8*z,-22*z,p.deep,6*z);line(q,-9*z,6*z,7*z,-21*z,p.metal,2*z);line(q,4*z,-23*z,11*z,-18*z,'#b48142',5*z);px(q,-10*z,2*z,6*z,10*z,'#b48142')}
 else if(t.hero){
  px(q,-13*z,-5*z,26*z,6*z,p.accent);outline(q,-13*z,-5*z,26*z,6*z,z);
  const strategist=u.type==='uaZaluzhnyi'||u.type==='ruPutin';
  if(strategist){
   px(q,-12*z,1*z,8*z,15*z,p.dark);px(q,5*z,0,7*z,14*z,p.light);
   px(q,-8*z,-20*z,16*z,4*z,p.deep);line(q,-10*z,7*z,10*z,7*z,p.metal,3*z);
  }else{
   px(q,-13*z,1*z,7*z,15*z,p.dark);px(q,7*z,-2*z,6*z,12*z,p.light);
   line(q,10*z,8*z,10*z,-26*z,INK,3*z);q.fillStyle=p.accent;q.beginPath();q.moveTo(11*z,-25*z);q.lineTo(22*z,-20*z);q.lineTo(11*z,-14*z);q.closePath();q.fill();
  }
 }
 else{px(q,-3*z,-28*z,6*z,25*z,INK);px(q,-1*z,-27*z,3*z,19*z,p.metal);px(q,-11*z,2*z,6*z,10*z,p.dark)}
 const stride=moving?Math.sin(this.g.time*9+(u.id||0))*2*z:0;
 px(q,-10*z+stride,9*z,6*z,8*z,p.deep);px(q,4*z-stride,9*z,6*z,8*z,p.deep);
 this.factionMark(q,u.team,7*z,5*z,2.5*z);q.restore();
};

Renderer.prototype.drone=function(q,u,t,z){
 const p=palette(u.team),pulse=1+Math.sin(this.g.time*15+(u.id||0))*.045,detail=highDetail(z);q.save();q.scale(pulse,pulse);
 if(t.visual==='quadDrone'){
  px(q,-17*z,-3*z,34*z,6*z,p.metal);px(q,-3*z,-17*z,6*z,34*z,p.metal);
  for(const [x,y]of[[-15,-15],[15,-15],[-15,15],[15,15]]){q.strokeStyle=detail?p.metal:INK;q.lineWidth=Math.max(1,2*z);q.beginPath();q.arc(x*z,y*z,7*z,0,Math.PI*2);q.stroke();if(detail)line(q,(x-5)*z,y*z,(x+5)*z,y*z,INK,z)}
  px(q,-6*z,-6*z,12*z,12*z,p.base);outline(q,-6*z,-6*z,12*z,12*z,z);px(q,-3*z,-3*z,6*z,5*z,p.glass);
 }else{
  q.fillStyle=p.base;q.strokeStyle=INK;q.lineWidth=Math.max(1,2*z);q.beginPath();q.moveTo(21*z,0);q.lineTo(-15*z,-13*z);q.lineTo(-8*z,0);q.lineTo(-15*z,13*z);q.closePath();q.fill();q.stroke();
  px(q,-11*z,-3*z,29*z,6*z,p.dark);px(q,4*z,-2*z,7*z,4*z,p.light);
 }
 this.factionMark(q,u.team,-3*z,0,3*z);q.restore();
};

Renderer.prototype.portrait=function(e){
 const q=this.px;q.clearRect(0,0,144,112);q.fillStyle='#111713';q.fillRect(0,0,144,112);
 for(let y=0;y<112;y+=8)for(let x=0;x<144;x+=8)if((x+y)%24===0)px(q,x,y,8,8,'#202a22');
 if(!e)return;
 const t=this.g.unitStats?.(e.type)||null,p=palette(e.team),f=FACTIONS[e.team];
 q.save();q.translate(72,64);q.scale(2.15,2.15);q.rotate(-.08);
 q.fillStyle='rgba(0,0,0,.35)';q.beginPath();q.ellipse(3,9,17,7,0,0,Math.PI*2);q.fill();
 if(t?.armor)this.vehicle(q,e,t,.72);else if(t?.air)this.drone(q,e,t,.72);else this.infantry(q,e,t||{},.9);q.restore();
 q.fillStyle='rgba(0,0,0,.42)';q.fillRect(5,83,134,22);q.font='bold 10px monospace';q.fillStyle=p.accent;q.fillText(`${f.short} // ${t?.archetype?.toUpperCase()||'FIELD UNIT'}`,11,97);q.strokeStyle='#a58a51';q.lineWidth=5;q.strokeRect(2,2,140,108);
};