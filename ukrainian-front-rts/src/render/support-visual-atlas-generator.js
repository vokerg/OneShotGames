export const SUPPORT_VISUAL_REQUIRED_FAMILIES = Object.freeze(['drone','artillery','rocket','air-defense','logistics','command','bridging','support']);
export const SUPPORT_VISUAL_REQUIRED_DIRECTIONS = Object.freeze(['n','ne','e','se','s','sw','w','nw']);
export const SUPPORT_VISUAL_REQUIRED_STATES = Object.freeze(['idle','move','attack','damaged','wreck']);

function escapeXml(value){return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function shape(profile,base,accent,state){
  const damage=state==='damaged'||state==='wreck';
  const common=`stroke="#171a18" stroke-width="2" fill="${base}"`;
  const mark=`fill="${damage?'#875044':accent}"`;
  switch(profile){
    case'quad':return `<path d="M18 32h28M32 18v28" ${common}/><circle cx="18" cy="18" r="7" ${common}/><circle cx="46" cy="18" r="7" ${common}/><circle cx="18" cy="46" r="7" ${common}/><circle cx="46" cy="46" r="7" ${common}/><circle cx="32" cy="32" r="8" ${mark}/>`;
    case'gun':return `<rect x="15" y="28" width="34" height="17" rx="5" ${common}/><path d="M32 29V8h5v21" ${mark}/><circle cx="22" cy="47" r="6" ${common}/><circle cx="43" cy="47" r="6" ${common}/>`;
    case'launcher':return `<rect x="13" y="31" width="38" height="17" rx="5" ${common}/><path d="M20 30l8-20h19l-7 20z" ${mark}/><circle cx="22" cy="49" r="5" ${common}/><circle cx="43" cy="49" r="5" ${common}/>`;
    case'radar':return `<rect x="15" y="33" width="34" height="15" rx="4" ${common}/><path d="M32 33V17" ${common}/><path d="M18 14q14-12 28 0q-14 20-28 0" ${mark}/>`;
    case'truck':return `<path d="M10 29h31l12 10v10H10z" ${common}/><rect x="13" y="20" width="24" height="13" ${mark}/><circle cx="20" cy="50" r="5" ${common}/><circle cx="44" cy="50" r="5" ${common}/>`;
    case'mast':return `<rect x="12" y="32" width="40" height="17" rx="4" ${common}/><path d="M32 32V9m-9 8h18M26 13h12" ${mark}/><circle cx="20" cy="50" r="5" ${common}/><circle cx="44" cy="50" r="5" ${common}/>`;
    case'bridge':return `<rect x="10" y="34" width="44" height="14" rx="4" ${common}/><path d="M13 33l12-18h14l12 18M18 25h28" ${mark}/><circle cx="20" cy="50" r="5" ${common}/><circle cx="44" cy="50" r="5" ${common}/>`;
    default:return `<rect x="13" y="26" width="38" height="23" rx="7" ${common}/><path d="M22 26v-8h20v8M32 31v13M25 37h14" ${mark}/><circle cx="20" cy="50" r="5" ${common}/><circle cx="44" cy="50" r="5" ${common}/>`;
  }
}

export function validateSupportVisualSource(source){
  const errors=[];
  if(source?.schema!=='fields-of-resolve.support-visual-source')errors.push('invalid support visual schema');
  if(source?.version!==1)errors.push('support visual version must be 1');
  for(const key of ['ukraine','russia'])if(!source?.factions?.[key])errors.push(`missing faction: ${key}`);
  for(const family of SUPPORT_VISUAL_REQUIRED_FAMILIES)if(!source?.identities?.some((item)=>item.family===family))errors.push(`missing support family: ${family}`);
  for(const direction of SUPPORT_VISUAL_REQUIRED_DIRECTIONS)if(!source?.directions?.includes(direction))errors.push(`missing direction: ${direction}`);
  for(const state of SUPPORT_VISUAL_REQUIRED_STATES)if(!source?.states?.includes(state))errors.push(`missing state: ${state}`);
  for(const field of ['creator','source','license','redistribution'])if(!String(source?.provenance?.[field]??'').trim())errors.push(`missing provenance.${field}`);
  return errors;
}

export function generateSupportVisualAtlas(source){
  const errors=validateSupportVisualSource(source);if(errors.length)throw new Error(errors.join('\n'));
  const frames=[];let index=0;
  for(const [faction,factionData] of Object.entries(source.factions))for(const identity of source.identities)for(const direction of source.directions)for(const state of source.states){
    const x=(index%16)*64,y=Math.floor(index/16)*64,id=`${factionData.prefix}.${identity.family}.${state}.${direction}`;
    const rotation=source.directions.indexOf(direction)*45;
    frames.push({id,faction,family:identity.family,state,direction,x,y,width:64,height:64});
    frames[index].svg=`<g transform="translate(${x} ${y})"><g transform="rotate(${rotation} 32 32)">${shape(identity.profile,factionData.base,factionData.accent,state)}</g>${state==='attack'?`<circle cx="52" cy="12" r="4" fill="#efc56d"/>`:''}${state==='wreck'?`<path d="M12 52L52 12" stroke="#1b1b1b" stroke-width="5"/>`:''}</g>`;index++;
  }
  const rows=Math.ceil(frames.length/16),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="${rows*64}" viewBox="0 0 1024 ${rows*64}"><title>${escapeXml('Fields of Resolve fires and support atlas')}</title>${frames.map((frame)=>frame.svg).join('')}</svg>`;
  return Object.freeze({svg,frames:Object.freeze(frames.map(({svg,...frame})=>Object.freeze(frame))),frameCount:frames.length,width:1024,height:rows*64});
}
