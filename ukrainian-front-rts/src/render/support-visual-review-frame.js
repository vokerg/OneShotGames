import {
  SUPPORT_VISUAL_REQUIRED_DIRECTIONS,
  SUPPORT_VISUAL_REQUIRED_STATES,
  validateSupportVisualSource,
} from './support-visual-atlas-generator.js';

const ANGLES=Object.freeze({n:-90,ne:-45,e:0,se:45,s:90,sw:135,w:180,nw:-135});

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

export function supportVisualReviewFrameSvg(source,unitId,state='idle',direction='e',frameIndex=0){
  const errors=validateSupportVisualSource(source);
  if(errors.length)throw new Error(errors.join('\n'));
  const unit=source.units.find((candidate)=>candidate.id===unitId);
  if(!unit)throw new Error(`Unknown support visual identity: ${unitId}`);
  if(!SUPPORT_VISUAL_REQUIRED_STATES.includes(state))throw new Error(`Unknown support visual state: ${state}`);
  if(!SUPPORT_VISUAL_REQUIRED_DIRECTIONS.includes(direction))throw new Error(`Unknown support visual direction: ${direction}`);
  const definition=source.states[state];
  const safeFrame=((Math.trunc(frameIndex)%definition.frames)+definition.frames)%definition.frames;
  const p=palette(source,unit),angle=ANGLES[direction],phase=state==='move'?safeFrame:0;
  const shift=state==='move'?(safeFrame===0?-1:1):0;
  const recoil=state==='attack'&&safeFrame===0?-2:0;
  const deathTilt=state==='death'?safeFrame*3:state==='wreck'?8:0;
  const opacity=state==='death'?Math.max(.3,1-safeFrame*.16):(state==='wreck'?.68:1);
  return `<g transform="translate(${shift+recoil} 0) rotate(${angle+deathTilt} 32 32)" opacity="${opacity}"><ellipse cx="32" cy="53" rx="22" ry="5" fill="rgba(0,0,0,.3)"/>${profileSvg(unit,p,phase)}</g>${stateOverlay(state,safeFrame,p)}`;
}

export function supportVisualReviewImageSvg(source,unitId,state='idle',direction='e',frameIndex=0){
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${supportVisualReviewFrameSvg(source,unitId,state,direction,frameIndex)}</svg>`;
}

export function supportVisualReviewFrameCount(source,state){
  const errors=validateSupportVisualSource(source);
  if(errors.length)throw new Error(errors.join('\n'));
  if(!SUPPORT_VISUAL_REQUIRED_STATES.includes(state))throw new Error(`Unknown support visual state: ${state}`);
  return source.states[state].frames;
}
