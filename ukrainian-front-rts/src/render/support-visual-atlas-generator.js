export const SUPPORT_VISUAL_REQUIRED_FAMILIES = Object.freeze(['drone','artillery','rocket','air-defense','logistics','command','bridging','support']);
export const SUPPORT_VISUAL_REQUIRED_DIRECTIONS = Object.freeze(['n','ne','e','se','s','sw','w','nw']);
export const SUPPORT_VISUAL_REQUIRED_STATES = Object.freeze(['idle','move','attack','hit','damaged','death','wreck']);
export const SUPPORT_VISUAL_EXPECTED_UNIT_IDS = Object.freeze([
  'ua.recon-drone','ua.recon-drone.fpv-strike','ua.recon-drone.relay','ua.ew-team','ua.ew-team.counter-uas','ua.ew-team.targeting',
  'ua.self-propelled-artillery.mortar','ua.self-propelled-artillery','ua.self-propelled-artillery.rocket','ua.mobile-sam.point-defense','ua.mobile-sam.medium-range',
  'ua.support.mobile-logistics','ua.support.forward-resupply','ua.support.protected-transport','ua.support.distributed-command','ua.support.armored-recovery','ua.support.mobile-bridge','ua.support.off-map-coordination',
  'ru.recon-uav','ru.recon-uav.strike','ru.jammer','ru.self-propelled-gun','ru.self-propelled-gun.rocket','ru.sam-battery.point-defense','ru.sam-battery',
  'ru.support.supply-column','ru.support.forward-ammunition','ru.support.mass-transport','ru.support.regimental-command','ru.support.repair-tractor','ru.support.pontoon-bridge','ru.support.off-map-fires',
]);

const ANGLES=Object.freeze({n:-90,ne:-45,e:0,se:45,s:90,sw:135,w:180,nw:-135});
const EXPECTED_IDS=new Set(SUPPORT_VISUAL_EXPECTED_UNIT_IDS);
const ID_SAFE=/^(?:ua|ru)\.[a-z0-9.-]+$/;

function esc(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function token(source,key,fallback){return source.paletteTokens?.[key]??fallback;}
function unitFactionPrefix(unit){return unit.faction==='ukraine'?'ua':unit.faction==='russia'?'ru':null;}
function palette(source,unit){
  const prefix=unitFactionPrefix(unit);
  return {
    ink:token(source,'ink','#111512'),metal:token(source,'metal','#8b8d84'),damage:token(source,'damage','#d45b44'),smoke:token(source,'smoke','#5b5d58'),
    base:token(source,`${prefix}Base`,prefix==='ua'?'#4f6f62':'#6c5947'),light:token(source,`${prefix}Light`,prefix==='ua'?'#789283':'#92785d'),
    accent:token(source,`${prefix}Accent`,prefix==='ua'?'#d7bb56':'#b9aa8d'),deep:token(source,`${prefix}Deep`,prefix==='ua'?'#2f443b':'#403429'),
  };
}

export function validateSupportVisualSource(source){
  const errors=[];
  if(!source||typeof source!=='object'||Array.isArray(source))return['support visual source must be an object'];
  if(source.schema!=='fields-of-resolve.support-visual-source')errors.push('invalid support visual schema');
  if(source.version!==2)errors.push('support visual version must be 2');
  if(source.frame?.width!==64||source.frame?.height!==64||!Number.isInteger(source.frame?.columns)||source.frame.columns<8)errors.push('support frame must be 64x64 with at least eight columns');
  if(source.directions?.join('|')!==SUPPORT_VISUAL_REQUIRED_DIRECTIONS.join('|'))errors.push('support directions must use canonical eight-direction order');
  if(source.families?.join('|')!==SUPPORT_VISUAL_REQUIRED_FAMILIES.join('|'))errors.push('support families must use canonical task order');
  for(const state of SUPPORT_VISUAL_REQUIRED_STATES){
    const definition=source.states?.[state];
    if(!definition||!Number.isInteger(definition.frames)||definition.frames<1)errors.push(`missing state definition: ${state}`);
    else if(!Array.isArray(definition.durationsMs)||definition.durationsMs.length!==definition.frames||definition.durationsMs.some((value)=>!Number.isFinite(value)||value<=0))errors.push(`${state} durations must match positive frame count`);
  }
  if(!Array.isArray(source.units))errors.push('support source units must be an array');
  else{
    const ids=source.units.map((unit)=>unit?.id);
    if(new Set(ids).size!==ids.length)errors.push('support source unit ids must be unique');
    const actual=new Set(ids);
    for(const id of SUPPORT_VISUAL_EXPECTED_UNIT_IDS)if(!actual.has(id))errors.push(`missing canonical support visual identity: ${id}`);
    for(const id of ids)if(!EXPECTED_IDS.has(id))errors.push(`unexpected support visual identity: ${id}`);
    for(const unit of source.units){
      if(!unit||typeof unit!=='object'||Array.isArray(unit)){errors.push('support unit records must be objects');continue;}
      const prefix=unitFactionPrefix(unit);
      if(!prefix)errors.push(`${unit.id??'<missing>'}: invalid faction`);
      if(typeof unit.id!=='string'||!ID_SAFE.test(unit.id)||!unit.id.startsWith(`${prefix}.`))errors.push(`${unit.id??'<missing>'}: invalid canonical id/faction pairing`);
      if(!SUPPORT_VISUAL_REQUIRED_FAMILIES.includes(unit.family))errors.push(`${unit.id}: invalid family`);
      for(const field of ['role','displayName','profile'])if(!String(unit[field]??'').trim())errors.push(`${unit.id}: missing ${field}`);
    }
    for(const faction of ['ukraine','russia'])for(const family of SUPPORT_VISUAL_REQUIRED_FAMILIES){
      if(!source.units.some((unit)=>unit.faction===faction&&unit.family===family))errors.push(`${faction}: missing support family ${family}`);
    }
  }
  for(const field of ['creator','source','license','redistribution'])if(!String(source.provenance?.[field]??'').trim())errors.push(`missing provenance.${field}`);
  if(!Array.isArray(source.provenance?.externalInputs))errors.push('provenance.externalInputs must be an array');
  return [...new Set(errors)].sort();
}

function chassis(p,{tracked=false,long=false}={}){
  const wheel=tracked
    ? `<rect x="10" y="18" width="11" height="34" rx="5" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/><rect x="43" y="18" width="11" height="34" rx="5" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/><path d="M12 23h7M12 31h7M12 39h7M12 47h7M45 23h7M45 31h7M45 39h7M45 47h7" stroke="${p.metal}" stroke-width="1.5"/>`
    : `<circle cx="18" cy="50" r="5" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/><circle cx="46" cy="50" r="5" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/>`;
  return `${wheel}<path d="${long?'M12 23h39l6 10-5 16H12z':'M14 24h34l6 10-5 15H14z'}" fill="${p.base}" stroke="${p.ink}" stroke-width="2.5"/><path d="M18 28h25l6 7H17z" fill="${p.light}" opacity=".55"/>`;
}
function droneSvg(profile,p,phase){
  const spin=phase*3;
  if(profile.includes('wing'))return `<path d="M7 32L28 24l5-14 5 14 20 8-20 7-5 15-5-15z" fill="${p.base}" stroke="${p.ink}" stroke-width="2"/><rect x="28" y="27" width="10" height="10" rx="4" fill="${p.accent}"/><path d="M16 31h34" stroke="${p.light}" stroke-width="2"/>`;
  const fpv=profile.includes('fpv');
  return `<path d="M16 18L48 46M48 18L16 46" stroke="${p.deep}" stroke-width="4"/><g transform="rotate(${spin} 16 18)"><ellipse cx="16" cy="18" rx="9" ry="3" fill="${p.metal}"/></g><g transform="rotate(${-spin} 48 18)"><ellipse cx="48" cy="18" rx="9" ry="3" fill="${p.metal}"/></g><g transform="rotate(${-spin} 16 46)"><ellipse cx="16" cy="46" rx="9" ry="3" fill="${p.metal}"/></g><g transform="rotate(${spin} 48 46)"><ellipse cx="48" cy="46" rx="9" ry="3" fill="${p.metal}"/></g><rect x="24" y="24" width="16" height="16" rx="5" fill="${p.base}" stroke="${p.ink}" stroke-width="2"/><circle cx="32" cy="29" r="${fpv?4:3}" fill="${p.accent}"/>${fpv?`<path d="M29 40l3 8 3-8" fill="${p.damage}"/>`:''}`;
}
function profileSvg(unit,p,phase=0){
  const profile=unit.profile;
  if(unit.family==='drone')return droneSvg(profile,p,phase);
  const tracked=/tracked|spg|sam|recovery-tractor|support-apc-heavy/.test(profile);
  let body=chassis(p,{tracked,long:/rocket|bridge|supply/.test(profile)});
  if(/mortar/.test(profile))body+=`<path d="M30 30l-8-15 5-3 9 18" stroke="${p.metal}" stroke-width="5"/><circle cx="24" cy="13" r="4" fill="${p.accent}"/>`;
  else if(/spg/.test(profile))body+=`<circle cx="33" cy="31" r="8" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/><path d="M36 27L61 18" stroke="${p.metal}" stroke-width="5"/><path d="M42 25L62 17" stroke="${p.accent}" stroke-width="2"/>`;
  else if(/rocket|ammo/.test(profile))body+=`<g transform="rotate(-18 36 24)"><rect x="22" y="11" width="28" height="18" rx="3" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/><path d="M25 15h22M25 20h22M25 25h22" stroke="${p.accent}" stroke-width="2"/></g>`;
  else if(/sam|counter-uas/.test(profile))body+=`<path d="M31 30V12" stroke="${p.metal}" stroke-width="3"/><path d="M18 14q14-10 28 0q-14 16-28 0" fill="${p.deep}" stroke="${p.accent}" stroke-width="2"/><path d="M40 31l13-13M44 34l13-13" stroke="${p.accent}" stroke-width="3"/>`;
  else if(/jammer/.test(profile))body+=`<path d="M31 31V9M24 14h14M27 10h8" stroke="${p.accent}" stroke-width="3"/><path d="M18 19q14-13 28 0M21 23q11-9 22 0" fill="none" stroke="${p.metal}" stroke-width="2"/>`;
  else if(/command|targeting|coordination|fires-coordination/.test(profile))body+=`<rect x="22" y="18" width="24" height="15" rx="2" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/><path d="M34 18V8M28 12h12" stroke="${p.accent}" stroke-width="2.5"/><circle cx="43" cy="22" r="3" fill="${p.accent}"/>`;
  else if(/recovery/.test(profile))body+=`<path d="M25 30L45 8l7 6-16 19" fill="none" stroke="${p.metal}" stroke-width="5"/><path d="M49 12l7 18" stroke="${p.accent}" stroke-width="2"/><circle cx="56" cy="32" r="3" fill="${p.accent}"/>`;
  else if(/bridge|pontoon/.test(profile))body+=`<path d="M15 31L25 13h21l8 18M20 24h29M24 18h21" fill="none" stroke="${p.accent}" stroke-width="4"/>`;
  else if(/resupply|logistics|supply/.test(profile))body+=`<rect x="19" y="17" width="29" height="17" rx="2" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/><path d="M23 21h21M23 26h21M23 31h21" stroke="${p.accent}" stroke-width="2"/>`;
  else if(/apc/.test(profile))body+=`<path d="M21 21h22l7 8-6 9H20l-5-9z" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><circle cx="34" cy="28" r="5" fill="${p.deep}"/>`;
  else body+=`<rect x="22" y="18" width="23" height="16" rx="3" fill="${p.deep}" stroke="${p.ink}" stroke-width="2"/><path d="M28 22h11M28 27h11" stroke="${p.accent}" stroke-width="2"/>`;
  return body;
}
function stateOverlay(state,frameIndex,p){
  if(state==='attack')return frameIndex===0?`<circle cx="55" cy="15" r="5" fill="#f2d57a"/><path d="M47 21L60 8" stroke="${p.damage}" stroke-width="3"/>`:`<circle cx="52" cy="18" r="3" fill="#f2d57a"/>`;
  if(state==='hit')return `<path d="M45 12l12-8M47 17l14-1M43 8l1-7" stroke="#f2d57a" stroke-width="2.5"/>`;
  if(state==='damaged')return `<path d="M19 19l11 12-7 10M44 18l-9 12 10 7" fill="none" stroke="${p.damage}" stroke-width="2.5"/><g opacity=".75"><circle cx="17" cy="12" r="5" fill="${p.smoke}"/><circle cx="13" cy="8" r="4" fill="${p.smoke}"/></g>`;
  if(state==='death'){const r=7+frameIndex*5;return `<circle cx="33" cy="30" r="${r}" fill="${frameIndex<2?'#f2d57a':p.damage}" opacity="${Math.max(.22,.85-frameIndex*.18)}"/><path d="M33 4l5 16 15-9-8 15 16 5-16 5 8 16-15-9-5 17-5-17-15 9 8-16-16-5 16-5-8-15 15 9z" fill="${p.damage}" opacity="${Math.max(.12,.6-frameIndex*.14)}"/>`;}
  if(state==='wreck')return `<path d="M14 49L51 14M20 15l30 34" stroke="${p.ink}" stroke-width="4" opacity=".7"/><g opacity=".55"><circle cx="18" cy="13" r="5" fill="${p.smoke}"/><circle cx="13" cy="8" r="4" fill="${p.smoke}"/></g>`;
  return '';
}
function renderFrame(source,unit,state,direction,frameIndex){
  const p=palette(source,unit),angle=ANGLES[direction],phase=state==='move'?frameIndex:0;
  const shift=state==='move'?(frameIndex===0?-1:1):0;
  const recoil=state==='attack'&&frameIndex===0?-2:0;
  const deathTilt=state==='death'?frameIndex*3:state==='wreck'?8:0;
  const opacity=state==='death'?Math.max(.3,1-frameIndex*.16):state==='wreck'?.68:1;
  return `<g transform="translate(${shift+recoil} 0) rotate(${angle+deathTilt} 32 32)" opacity="${opacity}"><ellipse cx="32" cy="53" rx="22" ry="5" fill="rgba(0,0,0,.3)"/>${profileSvg(unit,p,phase)}</g>${stateOverlay(state,frameIndex,p)}`;
}
function portraitSvg(source,unit){
  const p=palette(source,unit);
  return `<rect width="64" height="64" fill="#151815"/><rect x="3" y="3" width="58" height="58" rx="5" fill="${p.deep}" stroke="${p.accent}" stroke-width="3"/><g transform="translate(0 3)">${renderFrame(source,unit,'idle','se',0)}</g>`;
}
function iconSvg(source,unit){
  const p=palette(source,unit),glyph={drone:'D',artillery:'A',rocket:'R','air-defense':'AD',logistics:'L',command:'C',bridging:'B',support:'S'}[unit.family];
  return `<rect width="64" height="64" fill="#111512"/><rect x="8" y="8" width="48" height="48" rx="9" fill="${p.deep}" stroke="${p.accent}" stroke-width="4"/><text x="32" y="39" text-anchor="middle" font-family="monospace" font-size="${glyph.length>1?18:26}" font-weight="700" fill="${p.light}">${glyph}</text>`;
}
function frameRecord(cell){
  return {id:cell.id,rect:{x:cell.x,y:cell.y,w:64,h:64},sourceSize:{w:64,h:64},offset:{x:0,y:0},anchor:{x:32,y:54},
    attachments:{center:{x:32,y:32},effect:{x:50,y:15},muzzle:{x:56,y:16},selection:{x:32,y:51},shadow:{x:32,y:51}},
    masks:{hit:{x:7,y:7,w:50,h:49},selection:{x:7,y:10,w:50,h:45}},tags:cell.tags};
}

export function generateSupportVisualAtlas(input){
  const errors=validateSupportVisualSource(input);if(errors.length)throw new Error(errors.join('\n'));
  const source=input,columns=source.frame.columns,cells=[],animations={};
  const add=(id,svg,tags)=>{const index=cells.length,x=(index%columns)*64,y=Math.floor(index/columns)*64;cells.push({id,x,y,svg:`<g transform="translate(${x} ${y})">${svg}</g>`,tags});};
  add('missing','<rect width="64" height="64" fill="#111512"/><path d="M10 10L54 54M54 10L10 54" stroke="#d45b44" stroke-width="6"/>',['missing']);
  for(const unit of source.units){
    for(const state of SUPPORT_VISUAL_REQUIRED_STATES){
      const definition=source.states[state],directions={};
      for(const direction of SUPPORT_VISUAL_REQUIRED_DIRECTIONS){
        const sequence=[];
        for(let frameIndex=0;frameIndex<definition.frames;frameIndex+=1){
          const id=`${unit.id}.${state}.${direction}.${frameIndex}`;
          add(id,renderFrame(source,unit,state,direction,frameIndex),['support-visual',unit.id,unit.faction,unit.family,unit.role,state,direction]);
          sequence.push({frame:id,durationMs:definition.durationsMs[frameIndex]});
        }
        directions[direction]=sequence;
      }
      animations[`${unit.id}.${state}`]={loop:definition.loop==='hold'?'hold':'loop',defaultDurationMs:definition.durationsMs[0],directions};
    }
    add(`${unit.id}.portrait`,portraitSvg(source,unit),['support-visual',unit.id,'portrait']);
    add(`${unit.id}.icon`,iconSvg(source,unit),['support-visual',unit.id,'icon']);
  }
  const rows=Math.ceil(cells.length/columns),width=columns*64,height=rows*64;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${esc('Fields of Resolve UFR-114 support atlas')}</title>${cells.map((cell)=>cell.svg).join('')}</svg>`;
  const frames=Object.fromEntries(cells.map((cell)=>[cell.id,frameRecord(cell)]));
  const catalogObject={schema:'fields-of-resolve.support-visual-catalog',version:1,atlasId:'fields-of-resolve.support-visuals',counts:{units:source.units.length,frames:cells.length,animations:Object.keys(animations).length},units:source.units.map((unit)=>({id:unit.id,faction:unit.faction,family:unit.family,role:unit.role,displayName:unit.displayName,profile:unit.profile,portrait:`${unit.id}.portrait`,icon:`${unit.id}.icon`}))};
  return Object.freeze({
    svg,frameCount:cells.length,animationCount:Object.keys(animations).length,width,height,source,catalogObject,
    manifestObject:{schema:'fields-of-resolve.sprite-atlas',version:1,id:'fields-of-resolve.support-visuals',sampling:'nearest',
      image:{src:'support-visuals.svg',width,height,pixelRatio:1},directions:{order:[...SUPPORT_VISUAL_REQUIRED_DIRECTIONS],zero:'n',clockwise:true},
      frames,animations,fallback:{frame:'missing'}},
  });
}
