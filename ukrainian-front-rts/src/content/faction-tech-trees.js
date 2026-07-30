export const FACTION_TECH_TREE_SCHEMA_VERSION = 1;
export const REQUIRED_ROSTER_SLOTS = Object.freeze(['worker','line-infantry','specialist-infantry','reconnaissance','medical','mobility','armor','drone-ew','fires','air-defense','engineering','logistics','recovery','command']);
export const COUNTER_DOMAINS = Object.freeze(['infantry-mass','armor','drones','fires','fortifications','reconnaissance','air-defense','logistics']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

const structure = (id,tier,requires,produces,role) => ({id,kind:'structure',tier,requires,produces,role});
const technology = (id,tier,requires,role) => ({id,kind:'technology',tier,requires,role});
const roster = (id,tier,requires,producer,slot,role) => ({id,kind:'roster',tier,requires,producer,slot,role});

const ua = [
  structure('ua.command-post',0,[],['ua.combat-engineers','ua.command-team'],'Distributed command and initial engineering'),
  structure('ua.logistics-hub',0,['ua.command-post'],['ua.logistics-section'],'Flexible supply and capacity'),
  structure('ua.infantry-center',1,['ua.command-post'],['ua.line-infantry','ua.anti-armor-team','ua.recon-team','ua.casevac-team'],'Modular infantry task groups'),
  structure('ua.motor-pool',1,['ua.logistics-hub'],['ua.protected-mobility','ua.tank','ua.recovery-vehicle'],'Protected mobility and preservation'),
  structure('ua.uas-ew-cell',1,['ua.command-post'],['ua.recon-drone','ua.ew-team'],'Reconnaissance-strike support'),
  structure('ua.fires-center',2,['ua.infantry-center','ua.shared-target-network'],['ua.self-propelled-artillery'],'Responsive observed fires'),
  structure('ua.air-defense-site',2,['ua.uas-ew-cell'],['ua.mobile-sam'],'Mobile layered air defence'),
  structure('ua.engineer-park',2,['ua.motor-pool'],['ua.breaching-section'],'Breaching and crossing support'),
  technology('ua.distributed-c2',1,['ua.command-post'],'Faster retasking across separated groups'),
  technology('ua.shared-target-network',2,['ua.distributed-c2','ua.uas-ew-cell'],'Share high-quality contacts with fires'),
  technology('ua.spectrum-agility',2,['ua.uas-ew-cell'],'Recover relay and drone links quickly'),
  technology('ua.mobile-recovery',2,['ua.motor-pool'],'Recover premium platforms after disengagement'),
  technology('ua.precision-fires',3,['ua.shared-target-network','ua.fires-center'],'Improve observed fire and counter-battery'),
  technology('ua.layered-air-defense',3,['ua.air-defense-site','ua.spectrum-agility'],'Link mobile air-defence layers'),
  technology('ua.breach-support',3,['ua.engineer-park','ua.shared-target-network'],'Coordinate reconnaissance, smoke, and breaching'),
  roster('ua.combat-engineers',0,['ua.command-post'],'ua.command-post','worker','Construction, repair, and field logistics'),
  roster('ua.command-team',0,['ua.command-post'],'ua.command-post','command','Distributed coordination and support access'),
  roster('ua.logistics-section',1,['ua.logistics-hub'],'ua.logistics-hub','logistics','Distributed supply transport'),
  roster('ua.line-infantry',1,['ua.infantry-center'],'ua.infantry-center','line-infantry','Flexible mechanized infantry'),
  roster('ua.anti-armor-team',1,['ua.infantry-center'],'ua.infantry-center','specialist-infantry','Ambush-oriented anti-armor infantry'),
  roster('ua.recon-team',1,['ua.infantry-center','ua.distributed-c2'],'ua.infantry-center','reconnaissance','Low-signature forward observation'),
  roster('ua.casevac-team',1,['ua.infantry-center'],'ua.infantry-center','medical','Casualty stabilization and evacuation'),
  roster('ua.protected-mobility',1,['ua.motor-pool'],'ua.motor-pool','mobility','Rapid protected transport'),
  roster('ua.tank',2,['ua.motor-pool'],'ua.motor-pool','armor','Premium armored direct fire'),
  roster('ua.recovery-vehicle',2,['ua.motor-pool','ua.mobile-recovery'],'ua.motor-pool','recovery','Recover disabled vehicles'),
  roster('ua.recon-drone',1,['ua.uas-ew-cell'],'ua.uas-ew-cell','drone-ew','Mobile contact-quality provider'),
  roster('ua.ew-team',2,['ua.uas-ew-cell','ua.spectrum-agility'],'ua.uas-ew-cell','drone-ew','Local jamming and relay protection'),
  roster('ua.self-propelled-artillery',2,['ua.fires-center','ua.shared-target-network'],'ua.fires-center','fires','Mobile responsive artillery'),
  roster('ua.mobile-sam',3,['ua.air-defense-site','ua.layered-air-defense'],'ua.air-defense-site','air-defense','Mobile medium-range protection'),
  roster('ua.breaching-section',2,['ua.engineer-park'],'ua.engineer-park','engineering','Mine and obstacle breaching'),
];

const ru = [
  structure('ru.regimental-command',0,[],['ru.engineer-sappers','ru.command-group'],'Echeloned command and initial engineering'),
  structure('ru.supply-depot',0,['ru.regimental-command'],['ru.supply-column'],'Throughput, reserves, and replacement'),
  structure('ru.motor-rifle-barracks',1,['ru.regimental-command'],['ru.motor-rifle-squad','ru.assault-group','ru.scout-section','ru.medical-team'],'Massable infantry echelons'),
  structure('ru.armored-park',1,['ru.supply-depot'],['ru.apc','ru.tank','ru.repair-tractor'],'Armored concentration and replacement'),
  structure('ru.uas-ew-battalion',1,['ru.regimental-command'],['ru.recon-uav','ru.jammer'],'Broad reconnaissance and denial'),
  structure('ru.fires-regiment',2,['ru.motor-rifle-barracks','ru.prepared-fires'],['ru.self-propelled-gun'],'Persistent area fires'),
  structure('ru.air-defense-battalion',2,['ru.uas-ew-battalion'],['ru.sam-battery'],'Layered support protection'),
  structure('ru.engineer-battalion',2,['ru.armored-park'],['ru.assault-engineers'],'Route preparation and obstacles'),
  technology('ru.echelon-command',1,['ru.regimental-command'],'Improve prepared sectors and reserve timing'),
  technology('ru.operational-mass',2,['ru.supply-depot','ru.echelon-command'],'Increase replacement and successive-echelon value'),
  technology('ru.prepared-fires',2,['ru.motor-rifle-barracks','ru.echelon-command'],'Improve sustained fires in designated sectors'),
  technology('ru.spectrum-denial',2,['ru.uas-ew-battalion'],'Degrade enemy reconnaissance-to-fire links'),
  technology('ru.replacement-depth',2,['ru.armored-park','ru.operational-mass'],'Restore formation numbers through supply depth'),
  technology('ru.layered-air-defense',3,['ru.air-defense-battalion','ru.spectrum-denial'],'Protect prepared support networks'),
  technology('ru.fortified-corridors',3,['ru.engineer-battalion','ru.operational-mass'],'Strengthen prepared routes and gains'),
  roster('ru.engineer-sappers',0,['ru.regimental-command'],'ru.regimental-command','worker','Construction, repair, and obstacle clearance'),
  roster('ru.command-group',0,['ru.regimental-command'],'ru.regimental-command','command','Sector preparation and reserve release'),
  roster('ru.supply-column',1,['ru.supply-depot'],'ru.supply-depot','logistics','High-throughput supply along prepared routes'),
  roster('ru.motor-rifle-squad',1,['ru.motor-rifle-barracks'],'ru.motor-rifle-barracks','line-infantry','Replaceable line infantry'),
  roster('ru.assault-group',1,['ru.motor-rifle-barracks'],'ru.motor-rifle-barracks','specialist-infantry','Close assault under suppression'),
  roster('ru.scout-section',1,['ru.motor-rifle-barracks','ru.echelon-command'],'ru.motor-rifle-barracks','reconnaissance','Sufficient contact for prepared action'),
  roster('ru.medical-team',1,['ru.motor-rifle-barracks'],'ru.motor-rifle-barracks','medical','Forward treatment and replacement continuity'),
  roster('ru.apc',1,['ru.armored-park'],'ru.armored-park','mobility','Mass protected transport'),
  roster('ru.tank',2,['ru.armored-park'],'ru.armored-park','armor','Concentrated armored breakthrough'),
  roster('ru.repair-tractor',2,['ru.armored-park','ru.replacement-depth'],'ru.armored-park','recovery','Formation-level repair support'),
  roster('ru.recon-uav',1,['ru.uas-ew-battalion'],'ru.uas-ew-battalion','drone-ew','Broad area reconnaissance'),
  roster('ru.jammer',2,['ru.uas-ew-battalion','ru.spectrum-denial'],'ru.uas-ew-battalion','drone-ew','Persistent local electronic denial'),
  roster('ru.self-propelled-gun',2,['ru.fires-regiment','ru.prepared-fires'],'ru.fires-regiment','fires','Persistent prepared artillery'),
  roster('ru.sam-battery',3,['ru.air-defense-battalion','ru.layered-air-defense'],'ru.air-defense-battalion','air-defense','Prepared medium-range air defence'),
  roster('ru.assault-engineers',2,['ru.engineer-battalion'],'ru.engineer-battalion','engineering','Obstacle reduction and fortified assault'),
];

const makeFaction = (id,name,doctrine,nodes,uniqueMechanic,counterMatrix) => ({
  id,name,doctrine,nodes,uniqueMechanic,counterMatrix,rosterSlots:REQUIRED_ROSTER_SLOTS,
  productionStructures:nodes.filter((item)=>item.kind==='structure').map((item)=>item.id),
});

export const FACTION_TECH_TREES = deepFreeze({schemaVersion:1,factions:{
  ukraine:makeFaction('ukraine','Ukraine','networked-maneuver',ua,
    {id:'shared-target-network',unlockNodeId:'ua.shared-target-network',dependency:'contact-quality',failureMode:'relay-or-spectrum-disruption'},
    {'infantry-mass':['ua.self-propelled-artillery','ua.line-infantry'],armor:['ua.anti-armor-team','ua.tank'],drones:['ua.mobile-sam','ua.ew-team'],fires:['ua.recon-drone','ua.self-propelled-artillery'],fortifications:['ua.breaching-section','ua.self-propelled-artillery'],reconnaissance:['ua.ew-team','ua.recon-team'],'air-defense':['ua.anti-armor-team','ua.self-propelled-artillery'],logistics:['ua.recon-drone','ua.recon-team']}),
  russia:makeFaction('russia','Russia','echeloned-pressure',ru,
    {id:'operational-mass',unlockNodeId:'ru.operational-mass',dependency:'supply-and-command-depth',failureMode:'route-or-depot-disruption'},
    {'infantry-mass':['ru.self-propelled-gun','ru.assault-group'],armor:['ru.tank','ru.assault-group'],drones:['ru.sam-battery','ru.jammer'],fires:['ru.recon-uav','ru.self-propelled-gun'],fortifications:['ru.assault-engineers','ru.self-propelled-gun'],reconnaissance:['ru.jammer','ru.scout-section'],'air-defense':['ru.assault-group','ru.self-propelled-gun'],logistics:['ru.recon-uav','ru.scout-section']}),
}});

function cyclic(nodesById,start,visiting=new Set(),visited=new Set()) {
  if (visiting.has(start)) return true;
  if (visited.has(start)) return false;
  visiting.add(start);
  for (const dependency of nodesById.get(start)?.requires || []) if (cyclic(nodesById,dependency,visiting,visited)) return true;
  visiting.delete(start); visited.add(start); return false;
}

export function validateFactionTechTrees(data=FACTION_TECH_TREES) {
  const errors=[];
  if (!data || data.schemaVersion!==FACTION_TECH_TREE_SCHEMA_VERSION) errors.push('unsupported schemaVersion');
  const factions=data?.factions||{};
  for (const expected of ['ukraine','russia']) if (!factions[expected]) errors.push(`missing faction ${expected}`);
  for (const [factionId,faction] of Object.entries(factions)) {
    if (faction.id!==factionId) errors.push(`${factionId}: faction id mismatch`);
    if (!faction.doctrine) errors.push(`${factionId}: missing doctrine`);
    const byId=new Map();
    for (const item of faction.nodes||[]) {
      if (!item?.id) { errors.push(`${factionId}: node missing id`); continue; }
      if (byId.has(item.id)) errors.push(`${factionId}: duplicate node ${item.id}`);
      byId.set(item.id,item);
      if (!item.id.startsWith(factionId==='ukraine'?'ua.':'ru.')) errors.push(`${item.id}: wrong faction prefix`);
      if (!['structure','technology','roster'].includes(item.kind)) errors.push(`${item.id}: invalid kind`);
      if (!Number.isInteger(item.tier)||item.tier<0||item.tier>3) errors.push(`${item.id}: invalid tier`);
      if (!Array.isArray(item.requires)) errors.push(`${item.id}: requires must be an array`);
    }
    for (const item of faction.nodes||[]) {
      for (const dependency of item.requires||[]) {
        const required=byId.get(dependency);
        if (!required) errors.push(`${item.id}: missing prerequisite ${dependency}`);
        else if (required.tier>item.tier) errors.push(`${item.id}: prerequisite ${dependency} is in a later tier`);
      }
      if (item.kind==='roster') {
        if (!REQUIRED_ROSTER_SLOTS.includes(item.slot)) errors.push(`${item.id}: invalid roster slot ${item.slot}`);
        if (byId.get(item.producer)?.kind!=='structure') errors.push(`${item.id}: invalid producer ${item.producer}`);
        if (!byId.get(item.producer)?.produces?.includes(item.id)) errors.push(`${item.id}: producer does not list roster node`);
      }
      if (cyclic(byId,item.id)) errors.push(`${factionId}: cyclic prerequisites at ${item.id}`);
    }
    const structures=new Set(faction.productionStructures||[]);
    for (const item of (faction.nodes||[]).filter((candidate)=>candidate.kind==='structure')) if (!structures.has(item.id)) errors.push(`${factionId}: production structure ${item.id} is not listed`);
    for (const id of structures) if (byId.get(id)?.kind!=='structure') errors.push(`${factionId}: invalid production structure ${id}`);
    const slots=new Set((faction.nodes||[]).filter((item)=>item.kind==='roster').map((item)=>item.slot));
    for (const slot of REQUIRED_ROSTER_SLOTS) if (!slots.has(slot)) errors.push(`${factionId}: roster slot ${slot} is uncovered`);
    if (!faction.uniqueMechanic?.id||!byId.has(faction.uniqueMechanic?.unlockNodeId)) errors.push(`${factionId}: incomplete unique mechanic`);
    for (const domain of COUNTER_DOMAINS) {
      const paths=faction.counterMatrix?.[domain];
      if (!Array.isArray(paths)||paths.length<2) errors.push(`${factionId}: counter domain ${domain} needs two paths`);
      else for (const id of paths) if (!byId.has(id)) errors.push(`${factionId}: counter ${domain} references ${id}`);
    }
  }
  if (factions.ukraine?.doctrine===factions.russia?.doctrine) errors.push('factions must have distinct doctrines');
  if (factions.ukraine?.uniqueMechanic?.id===factions.russia?.uniqueMechanic?.id) errors.push('factions must have distinct unique mechanics');
  return deepFreeze(errors);
}

export function unlockedFactionNodes(factionId,completedNodeIds=[]) {
  const faction=FACTION_TECH_TREES.factions[factionId];
  if (!faction) throw new RangeError(`Unknown faction: ${factionId}`);
  const completed=new Set(completedNodeIds);
  return deepFreeze(faction.nodes.filter((item)=>!completed.has(item.id)&&item.requires.every((dependency)=>completed.has(dependency))).map((item)=>item.id));
}
