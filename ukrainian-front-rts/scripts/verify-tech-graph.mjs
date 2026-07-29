const asList = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const add = (errors, path, message) => errors.push(`${path}: ${message}`);

export function validateTechGraph({ buildings = {}, upgrades = {}, factions = {}, missions = [] }) {
  const errors = [];
  const nodes = { ...buildings, ...upgrades };
  const factionIds = new Set(Object.values(factions).map((faction) => faction?.id));
  const missionIds = new Set(missions.map((mission) => mission?.id));
  const exclusiveGroups = new Map();

  for (const [id, node] of Object.entries(nodes)) {
    const path = buildings[id] ? `BUILDING_TYPES.${id}` : `UPGRADES.${id}`;
    for (const required of asList(node.requires)) if (!nodes[required]) add(errors, `${path}.requires`, `missing tech node ${required}`);
    for (const faction of asList(node.factions)) if (!factionIds.has(faction)) add(errors, `${path}.factions`, `missing faction ${faction}`);
    for (const mission of asList(node.missionLocks)) if (!missionIds.has(mission)) add(errors, `${path}.missionLocks`, `missing mission ${mission}`);
    if (node.exclusiveGroup != null) {
      if (typeof node.exclusiveGroup !== 'string' || !node.exclusiveGroup.trim()) add(errors, `${path}.exclusiveGroup`, 'must be a non-empty string or null');
      else exclusiveGroups.set(node.exclusiveGroup, [...(exclusiveGroups.get(node.exclusiveGroup) ?? []), id]);
    }
  }

  for (const [group, ids] of exclusiveGroups) if (ids.length < 2) add(errors, `exclusiveGroup.${group}`, 'must contain at least two technology choices');

  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack) {
    if (visited.has(id)) return;
    if (visiting.has(id)) return add(errors, `${id}.requires`, `circular technology path: ${[...stack.slice(stack.indexOf(id)), id].join(' -> ')}`);
    visiting.add(id);
    for (const required of asList(nodes[id]?.requires)) if (nodes[required]) visit(required, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of Object.keys(nodes)) visit(id, []);

  const roots = Object.keys(nodes).filter((id) => nodes[id].techRoot || asList(nodes[id].requires).length === 0);
  const reachable = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, node] of Object.entries(nodes)) {
      if (!reachable.has(id) && asList(node.requires).every((required) => reachable.has(required))) {
        reachable.add(id);
        changed = true;
      }
    }
  }
  for (const id of Object.keys(nodes)) if (!reachable.has(id)) add(errors, `${id}.requires`, 'technology node is unreachable from any root');

  for (const [index, mission] of missions.entries()) {
    for (const id of asList(mission.availableTech)) if (!nodes[id]) add(errors, `MISSIONS[${index}].availableTech`, `missing tech node ${id}`);
    for (const id of asList(mission.lockedTech)) if (!nodes[id]) add(errors, `MISSIONS[${index}].lockedTech`, `missing tech node ${id}`);
    const overlap = asList(mission.availableTech).filter((id) => asList(mission.lockedTech).includes(id));
    for (const id of overlap) add(errors, `MISSIONS[${index}]`, `${id} cannot be both available and locked`);
  }
  return errors;
}

export function assertValidTechGraph(content) {
  const errors = validateTechGraph(content);
  if (errors.length) throw new Error(`Technology graph validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
}
