import { Renderer } from './render.js';
import { BUILDING_TYPES, TEAM } from './config.js';

const INK = '#111512';
const px = (q, x, y, w, h, color) => {
  q.fillStyle = color;
  q.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
};
const line = (q, x1, y1, x2, y2, color, width = 1) => {
  q.strokeStyle = color;
  q.lineWidth = Math.max(1, width);
  q.beginPath();
  q.moveTo(Math.round(x1) + 0.5, Math.round(y1) + 0.5);
  q.lineTo(Math.round(x2) + 0.5, Math.round(y2) + 0.5);
  q.stroke();
};
const outline = (q, x, y, w, h, z = 1) => {
  q.strokeStyle = INK;
  q.lineWidth = Math.max(1, Math.round(1.6 * z));
  q.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.max(1, Math.round(w) - 1), Math.max(1, Math.round(h) - 1));
};
const poly = (q, points, fill, stroke = INK, width = 1) => {
  q.fillStyle = fill;
  q.strokeStyle = stroke;
  q.lineWidth = Math.max(1, width);
  q.beginPath();
  points.forEach(([x, y], index) => (index ? q.lineTo(x, y) : q.moveTo(x, y)));
  q.closePath();
  q.fill();
  q.stroke();
};
const palette = (team) =>
  team === TEAM.UA
    ? { base:'#50684c', light:'#81956a', dark:'#293c30', deep:'#18271f', metal:'#9aa291', accent:'#e4ca54', glass:'#4e8db2', wall:'#766f58', roof:'#405844' }
    : { base:'#6c5947', light:'#94775a', dark:'#41342a', deep:'#2a211b', metal:'#918d7d', accent:'#cdbd9d', glass:'#786957', wall:'#776552', roof:'#5b493b' };
const highDetail = (z) => z >= 0.72;

const baseInfantry = Renderer.prototype.infantry;
Renderer.prototype.infantry = function enhancedInfantry(q, unit, type, z) {
  if (!type.worker) return baseInfantry.call(this, q, unit, type, z);
  const colors = palette(unit.team);
  const moving = Boolean(unit.order);
  const bob = moving ? Math.sin(this.g.time * 9 + (unit.id || 0)) * 0.9 * z : 0;
  q.save();
  q.translate(0, bob);
  px(q, -11*z, -8*z, 22*z, 23*z, colors.base);
  outline(q, -11*z, -8*z, 22*z, 23*z, z);
  px(q, -10*z, -7*z, 7*z, 19*z, colors.light);
  px(q, 4*z, -5*z, 7*z, 18*z, colors.dark);
  px(q, -12*z, -4*z, 24*z, 7*z, '#c9873e');
  px(q, -3*z, -4*z, 6*z, 7*z, colors.accent);
  px(q, -12*z, 2*z, 7*z, 13*z, '#76502e');
  outline(q, -12*z, 2*z, 7*z, 13*z, z);
  q.fillStyle = colors.accent;
  q.beginPath();
  q.arc(0, -13*z, 8*z, Math.PI, Math.PI*2);
  q.fill();
  px(q, -9*z, -13*z, 18*z, 5*z, colors.accent);
  outline(q, -9*z, -13*z, 18*z, 5*z, z);
  line(q, -11*z, 9*z, 9*z, -25*z, colors.deep, 7*z);
  line(q, -10*z, 8*z, 8*z, -24*z, colors.metal, 2*z);
  line(q, 5*z, -26*z, 13*z, -20*z, '#b48142', 6*z);
  const stride = moving ? Math.sin(this.g.time * 9 + (unit.id || 0)) * 2*z : 0;
  px(q, -10*z + stride, 10*z, 6*z, 8*z, colors.deep);
  px(q, 4*z - stride, 10*z, 6*z, 8*z, colors.deep);
  this.factionMark(q, unit.team, 8*z, 5*z, 2.7*z);
  q.restore();
};

function drawSandbags(q, z, x, y, count, color) {
  for (let index = 0; index < count; index += 1) {
    const row = index % 2;
    px(q, x + index * 11 * z, y - row * 3 * z, 12 * z, 7 * z, color);
    outline(q, x + index * 11 * z, y - row * 3 * z, 12 * z, 7 * z, z * 0.7);
  }
}

function drawBuildingBase(renderer, q, building, type, colors, z) {
  const width = type.w * z;
  const height = type.h * z;
  q.fillStyle = 'rgba(0,0,0,.44)';
  q.beginPath();
  q.ellipse(7 * z, 18 * z, width * 0.62, height * 0.44, 0, 0, Math.PI * 2);
  q.fill();
  px(q, -width * 0.55, height * 0.18, width * 1.1, height * 0.25, colors.deep);
  px(q, -width * 0.52, -height * 0.3, width * 1.04, height * 0.57, colors.wall);
  outline(q, -width * 0.52, -height * 0.3, width * 1.04, height * 0.57, z);
  px(q, -width * 0.48, -height * 0.26, 8 * z, height * 0.48, colors.light);
  px(q, width * 0.39, -height * 0.23, 8 * z, height * 0.45, colors.dark);
  renderer.factionMark(q, building.team, -width * 0.38, -height * 0.05, 8 * z);
}

Renderer.prototype.building = function building(building) {
  const q = this.x;
  const screen = this.sp(building.x, building.y);
  const z = this.g.camera.z;
  const type = BUILDING_TYPES[building.type];
  const colors = palette(building.team);
  const width = type.w * z;
  const height = type.h * z;
  const detail = highDetail(z);
  const construction = building.underConstruction;
  q.save();
  q.translate(Math.round(screen.x), Math.round(screen.y));
  drawBuildingBase(this, q, building, type, colors, z);

  if (building.type === 'hq') {
    poly(q,[[-width*.48,-height*.29],[-width*.27,-height*.54],[width*.31,-height*.54],[width*.49,-height*.29]],colors.roof,INK,Math.max(1,2*z));
    px(q,-width*.2,-height*.47,width*.4,height*.2,colors.dark);
    outline(q,-width*.2,-height*.47,width*.4,height*.2,z);
    px(q,-12*z,-7*z,24*z,28*z,colors.deep);
    outline(q,-12*z,-7*z,24*z,28*z,z);
    px(q,-7*z,-2*z,14*z,5*z,colors.glass);
    line(q,26*z,-height*.52,26*z,-height*.95,colors.metal,4*z);
    line(q,10*z,-height*.75,42*z,-height*.75,colors.metal,3*z);
    q.strokeStyle=colors.metal;q.lineWidth=Math.max(1,2*z);q.beginPath();q.arc(26*z,-height*.84,10*z,Math.PI*1.1,Math.PI*1.9);q.stroke();
    px(q,31*z,-height*.95,24*z,14*z,colors.accent);
    outline(q,31*z,-height*.95,24*z,14*z,z);
    drawSandbags(q,z,-width*.5,height*.23,7,'#9b8b68');
  } else if (building.type === 'depot') {
    poly(q,[[-width*.5,-height*.29],[-width*.31,-height*.56],[width*.31,-height*.56],[width*.5,-height*.29]],colors.roof,INK,Math.max(1,2*z));
    px(q,-width*.42,-height*.21,width*.84,6*z,colors.light);
    for(let index=0;index<3;index+=1){const x=(-27+index*27)*z;px(q,x,-2*z,19*z,25*z,index===1?'#5e6d48':'#6d5c42');outline(q,x,-2*z,19*z,25*z,z);px(q,x+4*z,3*z,11*z,4*z,colors.accent);}
    px(q,-width*.48,height*.14,width*.96,8*z,'#4a4538');
    if(detail){px(q,-width*.38,-height*.49,22*z,7*z,colors.accent);line(q,-width*.36,-height*.46,-width*.1,-height*.46,INK,z);}
  } else if (building.type === 'barracks') {
    poly(q,[[-width*.5,-height*.29],[-width*.28,-height*.58],[width*.32,-height*.58],[width*.5,-height*.29]],colors.roof,INK,Math.max(1,2*z));
    for(let index=0;index<4;index+=1){px(q,(-34+index*22)*z,-height*.48,15*z,8*z,colors.light);outline(q,(-34+index*22)*z,-height*.48,15*z,8*z,z*.7);}
    px(q,-11*z,-7*z,22*z,29*z,colors.deep);outline(q,-11*z,-7*z,22*z,29*z,z);px(q,-7*z,-2*z,14*z,6*z,colors.glass);
    line(q,-width*.41,height*.21,width*.42,height*.21,'#b2a17a',5*z);
    if(detail){for(let index=0;index<4;index+=1)line(q,(-30+index*20)*z,11*z,(-30+index*20)*z,19*z,colors.metal,2*z);}
  } else if (building.type === 'workshop') {
    poly(q,[[-width*.5,-height*.29],[-width*.36,-height*.57],[-width*.1,-height*.42],[width*.12,-height*.61],[width*.35,-height*.43],[width*.5,-height*.29]],colors.roof,INK,Math.max(1,2*z));
    px(q,-width*.34,-4*z,width*.68,28*z,colors.deep);outline(q,-width*.34,-4*z,width*.68,28*z,z);
    for(let index=0;index<5;index+=1)px(q,(-28+index*14)*z,2*z,8*z,5*z,colors.metal);
    line(q,width*.36,-height*.42,width*.36,-height*.92,colors.deep,5*z);line(q,width*.36,-height*.89,width*.7,-height*.89,colors.metal,4*z);line(q,width*.66,-height*.89,width*.66,-height*.58,colors.metal,3*z);px(q,width*.6,-height*.59,12*z,8*z,'#b9823f');
    if(building.queue.length&&detail){const pulse=.45+Math.sin(this.g.time*8)*.2;q.globalAlpha=pulse;px(q,-4*z,1*z,8*z,6*z,'#ffd477');q.globalAlpha=1;}
  }

  if (construction) {
    const progress = building.hp / building.maxHp;
    q.globalAlpha=.78;
    line(q,-width*.56,-height*.62,-width*.56,height*.32,'#c7a565',4*z);line(q,width*.56,-height*.62,width*.56,height*.32,'#c7a565',4*z);line(q,-width*.6,-height*.48,width*.6,-height*.48,'#c7a565',3*z);line(q,-width*.6,-height*.16,width*.6,-height*.16,'#c7a565',3*z);
    for(let x=-width*.54;x<width*.55;x+=13*z)line(q,x,-height*.48,x+9*z,-height*.16,'#9b743c',2*z);
    q.globalAlpha=1;px(q,-width*.42,height*.36,width*.84,7*z,'#1b1d19');px(q,-width*.4,height*.38,width*.8*progress,3*z,colors.accent);
  }
  if(building.selected){q.strokeStyle='#ffe47a';q.lineWidth=3;q.strokeRect(-width/2-7,-height*.68-7,width+14,height*1.08+14);}
  this.health(building,-width/2,-height*.7-11,width);
  q.restore();
};

Renderer.prototype.resourceNode = function resourceNode(node) {
  const q=this.x,screen=this.sp(node.x,node.y),z=this.g.camera.z,depleted=node.amount<=0,ratio=node.maxAmount?Math.max(0,node.amount/node.maxAmount):1;
  q.save();q.translate(Math.round(screen.x),Math.round(screen.y));q.fillStyle='rgba(0,0,0,.42)';q.beginPath();q.ellipse(7*z,13*z,41*z,19*z,0,0,Math.PI*2);q.fill();q.globalAlpha=depleted?.5:1;
  if(node.kind==='metal'){
    px(q,-34*z,7*z,68*z,9*z,'#373b39');for(let index=0;index<4;index+=1){px(q,(-29+index*15)*z,(-4+(index%2)*6)*z,18*z,12*z,index%2?'#737b7e':'#969d9f');outline(q,(-29+index*15)*z,(-4+(index%2)*6)*z,18*z,12*z,z);}line(q,-24*z,4*z,22*z,-26*z,'#555e61',6*z);line(q,22*z,-26*z,34*z,-19*z,'#a6adaf',4*z);line(q,30*z,-20*z,30*z,-4*z,'#c7a45b',2*z);px(q,26*z,-5*z,8*z,7*z,'#8c6135');
  }else if(node.kind==='fuel'){
    px(q,-35*z,9*z,70*z,9*z,'#39352d');for(const x of[-23,5]){px(q,x*z,-18*z,23*z,31*z,'#6b6b58');outline(q,x*z,-18*z,23*z,31*z,z);px(q,(x+3)*z,-14*z,17*z,5*z,'#b47a34');px(q,(x+4)*z,3*z,15*z,4*z,'#3d392f');}line(q,-28*z,-18*z,-18*z,-29*z,'#98988b',3*z);line(q,17*z,-18*z,28*z,-29*z,'#98988b',3*z);px(q,30*z,-4*z,9*z,22*z,'#41463f');px(q,28*z,-8*z,13*z,7*z,'#c48b3f');line(q,35*z,-2*z,43*z,10*z,'#1d201d',3*z);
  }else{
    px(q,-31*z,7*z,62*z,10*z,'#343944');px(q,-21*z,-7*z,24*z,17*z,'#5c6478');outline(q,-21*z,-7*z,24*z,17*z,z);px(q,-17*z,-3*z,16*z,5*z,'#8fa8c8');line(q,15*z,10*z,15*z,-37*z,'#a8adb0',3*z);line(q,2*z,-23*z,28*z,-23*z,'#a8adb0',2*z);q.strokeStyle='#91b0d8';q.lineWidth=Math.max(1,2*z);q.beginPath();q.arc(16*z,-27*z,12*z,Math.PI*1.15,Math.PI*1.85);q.stroke();line(q,15*z,-27*z,25*z,-35*z,'#91b0d8',2*z);px(q,22*z,5*z,13*z,12*z,'#786345');outline(q,22*z,5*z,13*z,12*z,z);
  }
  q.globalAlpha=1;const labelWidth=Math.max(74,node.label.length*6.5)*z;px(q,-labelWidth/2,-48*z,labelWidth,16*z,'rgba(17,21,18,.88)');outline(q,-labelWidth/2,-48*z,labelWidth,16*z,z);q.font=`bold ${Math.max(8,Math.round(9*z))}px monospace`;q.textAlign='center';q.fillStyle=depleted?'#9b9480':'#f4e3a8';q.fillText(depleted?`${node.label} — depleted`:node.label,0,-37*z);px(q,-31*z,22*z,62*z,6*z,'#1c1d1a');px(q,-30*z,23*z,60*z*ratio,4*z,node.kind==='fuel'?'#c8893c':node.kind==='intel'?'#82a4cf':'#a7b0b2');q.restore();
};

Renderer.prototype.buildingGhost = function buildingGhost() {
  if(!this.g.pendingBuild)return;const{type}=this.g.pendingBuild,stats=BUILDING_TYPES[type],valid=this.g.canPlaceBuilding(type,this.g.mouse.wx,this.g.mouse.wy),screen=this.sp(this.g.mouse.wx,this.g.mouse.wy),z=this.g.camera.z,q=this.x;
  q.save();q.translate(Math.round(screen.x),Math.round(screen.y));q.globalAlpha=.55;q.fillStyle=valid?'#71d17c':'#d15d58';q.fillRect((-stats.w/2)*z,(-stats.h/2)*z,stats.w*z,stats.h*z);q.globalAlpha=1;q.strokeStyle=valid?'#b8ffc0':'#ffaaa5';q.lineWidth=3;q.setLineDash([7,5]);q.strokeRect((-stats.w/2)*z,(-stats.h/2)*z,stats.w*z,stats.h*z);q.setLineDash([]);q.font=`bold ${Math.max(10,12*z)}px monospace`;q.textAlign='center';q.fillStyle=valid?'#d9ffdd':'#ffd2ce';q.fillText(valid?'VALID SITE':'BLOCKED',0,(-stats.h/2-12)*z);q.restore();
};

Renderer.prototype.render = function render() {
  this.x.clearRect(0,0,innerWidth,innerHeight);this.terrain();this.g.nodes.forEach((node)=>this.resourceNode(node));this.g.buildings.slice().sort((a,b)=>a.y-b.y).forEach((building)=>this.building(building));this.buildingGhost();this.g.units.slice().sort((a,b)=>a.y-b.y).forEach((unit)=>this.unit(unit));this.effects();this.fog();this.mini();this.portrait(this.g.selectedEntities()[0]);
};
