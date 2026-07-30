const freeze = (value) => Object.freeze(value);
const NODES = [
  ['ua_hq', 'structure', [], ['command'], ['ru_hq']], ['ua_barracks', 'structure', ['ua_hq'], ['infantry'], ['ru_barracks']], ['ua_motor_pool', 'structure', ['ua_hq'], ['mobility'], ['ru_motor_pool']], ['ua_networked_fires', 'technology', ['ua_barracks'], ['recon', 'fires'], ['ru_mass_fires']],
  ['ru_hq', 'structure', [], ['command'], ['ua_hq']], ['ru_barracks', 'structure', ['ru_hq'], ['infantry'], ['ua_barracks']], ['ru_motor_pool', 'structure', ['ru_hq'], ['mobility'], ['ua_motor_pool']], ['ru_mass_fires', 'technology', ['ru_barracks'], ['fires', 'attrition'], ['ua_networked_fires']],
];

function createFaction(prefix, doctrine, uniqueMechanic) {
  return freeze({
    id: prefix,
    doctrine,
    uniqueMechanic,
    productionStructures: freeze(NODES.filter((node) => node[0].startsWith(prefix) && node[1] === 'structure').map((node) => node[0])),
    rosterSlots: freeze(['infantry', 'mobility', 'recon', 'fires', 'air-defense', 'engineer', 'command']),
    nodes: freeze(NODES.filter((node) => node[0].startsWith(prefix)).map(([id, type, requires, roles, counters]) => freeze({ id, type, requires: freeze(requires), roles: freeze(roles), counters: freeze(counters) }))),
  });
}

export const FACTION_TECH_TREE_SCHEMA_VERSION = 1;
export const FACTION_TECH_TREES = freeze({ schemaVersion: 1, factions: freeze({ ua: createFaction('ua', 'networked-maneuver', 'shared-target-network'), ru: createFaction('ru', 'echeloned-pressure', 'operational-mass') }) });

export function validateFactionTechTrees(data = FACTION_TECH_TREES) {
  const errors = [];
  if (data.schemaVersion !== FACTION_TECH_TREE_SCHEMA_VERSION) errors.push('unsupported schemaVersion');
  const allNodes = new Map();
  for (const [factionId, faction] of Object.entries(data.factions ?? {})) {
    if (!faction.uniqueMechanic) errors.push(`${factionId}: missing unique mechanic`);
    if (new Set(faction.rosterSlots ?? []).size < 7) errors.push(`${factionId}: incomplete roster slots`);
    for (const node of faction.nodes ?? []) {
      if (allNodes.has(node.id)) errors.push(`duplicate node ${node.id}`);
      allNodes.set(node.id, node);
    }
  }
  for (const faction of Object.values(data.factions ?? {})) for (const node of faction.nodes ?? []) {
    for (const dependency of node.requires ?? []) if (!allNodes.has(dependency)) errors.push(`${node.id}: missing prerequisite ${dependency}`);
    if (!(node.counters ?? []).length) errors.push(`${node.id}: missing counter relationship`);
  }
  return freeze(errors);
}
