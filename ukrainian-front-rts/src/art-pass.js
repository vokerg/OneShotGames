import {Renderer} from './render.js';
import {TEAM,FACTIONS} from './config.js';

const ink='#141815';
const px=(q,x,y,w,h,c)=>{q.fillStyle=c;q.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))};
const outline=(q,x,y,w,h,z=1)=>{q.strokeStyle=ink;q.lineWidth=Math.max(1,2*z);q.strokeRect(Math.round(x)+.5,Math.round(y)+.5,Math.round(w)-1,Math.round(h)-1)};
const palette=team=>team===TEAM.UA?{base:'#4f674b',light:'#7d9065',dark:'#283b2f',metal:'#8d9686',accent:'#e2c958'}:{base:'#6b5948',light:'#92775b',dark:'#40342b',metal:'#8b887b',accent:'#c9b998'};

Renderer.prototype.vehicle=function(q,u,t,z){
 const p=palette(u.team),art=t.archetype==='artillery',tank=t.archetype==='tank',w=(tank?38:36)*z,h=(art?46:40)*z;
 q.save();
 q.fillStyle='rgba(0,0,0,.28)';q.beginPath();q.ellipse(3*z,5*z,w*.58,h*.53,0,0,Math.PI*2);q.fill();
 px(q,-w*.58,-h*.5,7*z,h,ink);px(q,w*.58-7*z,-h*.5,7*z,h,ink);
 for(let y=-h*.42;y<h*.42;y+=7*z){px(q,-w*.56,y,6*z,3*z,p.metal);px(q,w*.56-6*z,y,6*z,3*z,p.metal)}
 px(q,-w*.47,-h*.43,w*.94,h*.86,p.base);outline(q,-w*.47,-h*.43,w*.94,h*.86,z);
 px(q,-w*.38,-h*.34,w*.76,h*.18,p.light);px(q,-w*.38,h*.18,w*.76,h*.12,p.dark);
 if(tank||art){q.fillStyle=p.dark;q.beginPath();q.ellipse(0,-5*z,12*z,10*z,0,0,Math.PI*2);q.fill();q.strokeStyle=ink;q.lineWidth=Math.max(1,2*z);q.stroke();px(q,-3*z,-(art?49:39)*z,6*z,(art?43:34)*z,p.dark);px(q,-1*z,-(art?52:42)*z,3*z,(art?39:30)*z,p.metal)}
 else{px(q,-11*z,-14*z,22*z,23*z,p.dark);outline(q,-11*z,-14*z,22*z,23*z,z);px(q,-2*z,-31*z,5*z,20*z,p.metal)}
 if(t.visual==='bradley'){px(q,9*z,-13*z,5*z,7*z,'#417ca0');px(q,-13*z,8*z,6*z,8*z,p.light)}
 if(t.visual==='bmp3')px(q,-13*z,8*z,26*z,6*z,p.light);
 if(t.visual==='bohdana')px(q,-12*z,8*z,24*z,8*z,p.dark);
 this.factionMark(q,u.team,-10*z,12*z,4*z);
 q.restore();
};

Renderer.prototype.infantry=function(q,u,t,z){
 const p=palette(u.team),bob=Math.sin((this.g.time*7)+(u.id||0))*.8*z;
 q.save();q.translate(0,bob);
 q.fillStyle='rgba(0,0,0,.32)';q.beginPath();q.ellipse(3*z,10*z,11*z,6*z,0,0,Math.PI*2);q.fill();
 px(q,-8*z,-7*z,16*z,21*z,p.base);outline(q,-8*z,-7*z,16*z,21*z,z);
 px(q,-7*z,-7*z,5*z,18*z,p.light);px(q,3*z,-5*z,5*z,17*z,p.dark);
 q.fillStyle=p.light;q.beginPath();q.arc(0,-12*z,7*z,Math.PI,Math.PI*2);q.fill();px(q,-7*z,-12*z,14*z,4*z,p.light);outline(q,-7*z,-12*z,14*z,5*z,z);
 if(t.medic){px(q,-6*z,-2*z,12*z,11*z,'#d7d9cf');px(q,-2*z,-1*z,4*z,9*z,'#9d3835');px(q,-5*z,2*z,10*z,3*z,'#9d3835')}
 else if(t.worker){px(q,-10*z,-1*z,20*z,6*z,'#b48142');px(q,-3*z,-25*z,5*z,20*z,p.metal)}
 else if(t.hero){px(q,-10*z,-3*z,20*z,4*z,p.accent);px(q,-3*z,-27*z,5*z,22*z,ink)}
 else{px(q,-3*z,-26*z,5*z,23*z,ink);px(q,-1*z,-25*z,2*z,18*z,p.metal);px(q,-10*z,2*z,5*z,9*z,p.dark)}
 px(q,-10*z,9*z,6*z,7*z,p.dark);px(q,4*z,9*z,6*z,7*z,p.dark);this.factionMark(q,u.team,7*z,5*z,2.5*z);q.restore();
};

Renderer.prototype.drone=function(q,u,t,z){
 const p=palette(u.team),pulse=1+Math.sin(this.g.time*12+(u.id||0))*.08;q.save();q.scale(pulse,pulse);
 if(t.visual==='quadDrone'){px(q,-16*z,-3*z,32*z,6*z,p.metal);px(q,-3*z,-16*z,6*z,32*z,p.metal);for(const [x,y]of[[-15,-15],[15,-15],[-15,15],[15,15]]){q.strokeStyle=ink;q.lineWidth=2*z;q.beginPath();q.arc(x*z,y*z,7*z,0,Math.PI*2);q.stroke()}px(q,-5*z,-5*z,10*z,10*z,p.base);outline(q,-5*z,-5*z,10*z,10*z,z)}
 else{q.fillStyle=p.base;q.strokeStyle=ink;q.lineWidth=2*z;q.beginPath();q.moveTo(20*z,0);q.lineTo(-14*z,-12*z);q.lineTo(-7*z,0);q.lineTo(-14*z,12*z);q.closePath();q.fill();q.stroke();px(q,-10*z,-3*z,27*z,6*z,p.dark)}
 this.factionMark(q,u.team,-3*z,0,3*z);q.restore();
};

Renderer.prototype.portrait=function(e){
 const q=this.px;q.clearRect(0,0,144,112);q.fillStyle='#111713';q.fillRect(0,0,144,112);
 for(let y=0;y<112;y+=8)for(let x=0;x<144;x+=8)if((x+y)%24===0)px(q,x,y,8,8,'#202a22');
 if(!e)return;const t=this.g.unitStats?.(e.type)||null,p=palette(e.team),f=FACTIONS[e.team];
 q.save();q.translate(72,62);q.scale(2.15,2.15);q.rotate(-.08);
 if(t?.armor)this.vehicle(q,e,t,.72);else if(t?.air)this.drone(q,e,t,.72);else this.infantry(q,e,t||{},.9);q.restore();
 q.fillStyle='rgba(0,0,0,.38)';q.fillRect(5,83,134,22);q.font='bold 10px monospace';q.fillStyle=p.accent;q.fillText(f.short+' // FIELD UNIT',11,97);q.strokeStyle='#a58a51';q.lineWidth=5;q.strokeRect(2,2,140,108);
};
