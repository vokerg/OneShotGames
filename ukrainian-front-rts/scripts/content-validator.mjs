const RESOURCE_KEYS = new Set(['metal', 'fuel', 'intel']);
const LEGACY_RUNTIME_ABILITIES = new Set(['repair', 'digIn', 'smoke', 'suppress', 'mobilize', 'propaganda', 'mercenaryWave', 'mutiny']);
const OBJECTIVE_PATTERNS = [
  /^Recover \d+ units of materiel$/,
  /^Establish infantry and repair facilities$/,
  /^Destroy the Russian forward command post$/,
  /^Accumulate \d+ intelligence$/,
  /^Field four Ukrainian FPV teams$/,
  /^Destroy all Russian artillery batteries$/,
  /^Assemble both Ukrainian command heroes$/,
  /^Defeat six Russian assault waves$/,
  /^Destroy the Russian command bunker$/,
];
const entries = (value) => Object.entries(value ?? {});
const add = (errors, path, message) => errors.push(`${path}: ${message}`);

function normalizeReferenceList(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function validateReferenceList(errors, path, value, knownIds, label, { allowScalar = false } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) && !(allowScalar && typeof value === 'string')) {
    add(errors, path, allowScalar ? 'must be a string or an array of strings' : 'must be an array of strings');
    return [];
  }

  const references = normalizeReferenceList(value);
  const seen = new Set();
  references.forEach((reference, index) => {
    const itemPath = Array.isArray(value) ? `${path}[${index}]` : path;
    if (typeof reference !== 'string' || reference.length === 0) {
      add(errors, itemPath, 'must be a non-empty string');
      return;
    }
    if (seen.has(reference)) add(errors, itemPath, `duplicate ${label} reference ${reference}`);
    seen.add(reference);
    if (!knownIds.has(reference)) add(errors, itemPath, `missing ${label} reference ${reference}`);
  });
  return references.filter((reference) => typeof reference === 'string' && reference.length > 0);
}

function validateCost(errors, path, cost) {
  if (cost === undefined) return;
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return add(errors, path, 'cost must be an object');
  for (const [resource, amount] of Object.entries(cost)) {
    if (!RESOURCE_KEYS.has(resource)) add(errors, `${path}.${resource}`, 'unknown resource');
    if (!Number.isFinite(amount) || amount < 0) add(errors, `${path}.${resource}`, 'must be a finite non-negative number');
  }
}

function collectTechNodes(errors, buildings, upgrades) {
  const nodes = new Map();
  for (const [id, data] of entries(buildings)) nodes.set(id, { id, data, path: `BUILDING_TYPES.${id}`, family: 'building' });
  for (const [id, data] of entries(upgrades)) {
    if (nodes.has(id)) add(errors, `UPGRADES.${id}`, `duplicate tech-node id ${id}; building and upgrade IDs share one namespace`);
    else nodes.set(id, { id, data, path: `UPGRADES.${id}`, family: 'upgrade' });
  }
  return nodes;
}

function validateTechCycles(errors, nodes, requirements) {
  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack) {
    if (visited.has(id)) return;
    if (visiting.has(id)) {
      const cycleStart = stack.indexOf(id);
      return add(errors, `${nodes.get(id)?.path ?? `TECH.${id}`}.requires`, `circular prerequisite: ${[...stack.slice(cycleStart), id].join(' -> ')}`);
    }
    visiting.add(id);
    for (const requiredId of requirements.get(id) ?? []) if (nodes.has(requiredId)) visit(requiredId, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of nodes.keys()) visit(id, []);
}

function allowedForFaction(node, factionId) {
  const restrictions = normalizeReferenceList(node.data?.factions);
  return restrictions.length === 0 || restrictions.includes(factionId);
}

function computeReachableTech(nodes, requirements, factionId, blocked = new Set()) {
  const reachable = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, node] of nodes) {
      if (reachable.has(id) || blocked.has(id) || !allowedForFaction(node, factionId)) continue;
      const requiredIds = requirements.get(id) ?? [];
      if ((node.data?.techRoot === true || requiredIds.length === 0) && requiredIds.every((requiredId) => reachable.has(requiredId))) {
        reachable.add(id);
        changed = true;
        continue;
      }
      if (requiredIds.length > 0 && requiredIds.every((requiredId) => reachable.has(requiredId))) {
        reachable.add(id);
        changed = true;
      }
    }
  }
  return reachable;
}

function validateTechGraph(errors, { buildings, upgrades, factions, missions }) {
  const factionIds = new Set(entries(factions).map(([, faction]) => faction?.id).filter((id) => typeof id === 'string'));
  const missionIds = new Set(missions.map((mission) => mission?.id).filter((id) => typeof id === 'string'));
  const nodes = collectTechNodes(errors, buildings, upgrades);
  const techIds = new Set(nodes.keys());
  const requirements = new Map();
  const exclusiveGroups = new Map();

  for (const [id, node] of nodes) {
    const requiredIds = validateReferenceList(errors, `${node.path}.requires`, node.data?.requires, techIds, 'tech-node', { allowScalar: true });
    requirements.set(id, requiredIds);
    if (requiredIds.includes(id)) add(errors, `${node.path}.requires`, 'a tech node cannot require itself');

    validateReferenceList(errors, `${node.path}.factions`, node.data?.factions, factionIds, 'faction');
    validateReferenceList(errors, `${node.path}.missionLocks`, node.data?.missionLocks, missionIds, 'mission');

    if (node.data?.techRoot !== undefined && typeof node.data.techRoot !== 'boolean') add(errors, `${node.path}.techRoot`, 'must be a boolean');
    if (node.data?.techRoot === true && requiredIds.length > 0) add(errors, `${node.path}.techRoot`, 'a tech root cannot also declare prerequisites');

    const group = node.data?.exclusiveGroup;
    if (group !== undefined && group !== null) {
      if (typeof group !== 'string' || group.trim().length === 0) add(errors, `${node.path}.exclusiveGroup`, 'must be null or a non-empty string');
      else {
        const members = exclusiveGroups.get(group) ?? [];
        members.push(id);
        exclusiveGroups.set(group, members);
      }
    }
  }

  validateTechCycles(errors, nodes, requirements);

  for (const [group, members] of exclusiveGroups) {
    if (members.length < 2) add(errors, `TECH.exclusiveGroup.${group}`, `must contain at least two choices; found ${members[0]}`);
  }

  for (const [id, requiredIds] of requirements) {
    const node = nodes.get(id);
    const ownGroup = node?.data?.exclusiveGroup;
    const requiredGroups = new Map();
    for (const requiredId of requiredIds) {
      const group = nodes.get(requiredId)?.data?.exclusiveGroup;
      if (!group) continue;
      if (group === ownGroup) add(errors, `${node.path}.requires`, `cannot require ${requiredId} from its own mutually exclusive group ${group}`);
      const previous = requiredGroups.get(group);
      if (previous) add(errors, `${node.path}.requires`, `cannot require mutually exclusive choices ${previous} and ${requiredId} from group ${group}`);
      else requiredGroups.set(group, requiredId);
    }
  }

  for (const factionId of factionIds) {
    const reachable = computeReachableTech(nodes, requirements, factionId);
    for (const [id, node] of nodes) {
      if (allowedForFaction(node, factionId) && !reachable.has(id)) add(errors, node.path, `tech node is not reachable for faction ${factionId} from compatible roots`);
    }
  }

  missions.forEach((mission, index) => {
    const path = `MISSIONS[${index}]`;
    const factionId = mission?.playerFaction ?? 'ukraine';
    const available = validateReferenceList(errors, `${path}.availableTech`, mission?.availableTech, techIds, 'tech-node');
    const locked = validateReferenceList(errors, `${path}.lockedTech`, mission?.lockedTech, techIds, 'tech-node');
    const blocked = new Set(locked);
    for (const [id, node] of nodes) if (normalizeReferenceList(node.data?.missionLocks).includes(mission?.id)) blocked.add(id);

    for (const id of available) {
      if (blocked.has(id)) add(errors, `${path}.availableTech`, `${id} is both available and locked for mission ${mission?.id ?? index}`);
      const node = nodes.get(id);
      if (node && !allowedForFaction(node, factionId)) add(errors, `${path}.availableTech`, `${id} is not available to faction ${factionId}`);
    }

    if (factionIds.has(factionId) && available.length > 0) {
      const reachable = computeReachableTech(nodes, requirements, factionId, blocked);
      for (const id of available) if (!reachable.has(id)) add(errors, `${path}.availableTech`, `${id} is not reachable after mission locks and faction restrictions`);
    }
  });
}

function validateCommandCardHotkeys(errors, units, abilities) {
  for (const [unitId, unit] of entries(units)) {
    const owners = new Map();
    for (const abilityId of unit?.abilities ?? []) {
      const ability = abilities[abilityId];
      if (!ability) continue;
      const key = ability.key;
      if (typeof key !== 'string' || key.length !== 1) {
        add(errors, `ABILITIES.${abilityId}.key`, 'must be exactly one character');
        continue;
      }
      const normalized = key.toUpperCase();
      const previous = owners.get(normalized);
      if (previous) add(errors, `UNIT_TYPES.${unitId}.abilities`, `duplicate hotkey ${normalized}: ${previous} and ${abilityId}`);
      else owners.set(normalized, abilityId);
    }
  }
}

function validateObjectives(errors, mission, index) {
  const path = `MISSIONS[${index}].objectives`;
  if (!Array.isArray(mission.objectives) || mission.objectives.length === 0) return add(errors, path, 'must contain at least one objective');
  mission.objectives.forEach((objective, objectiveIndex) => {
    if (typeof objective !== 'string' || !OBJECTIVE_PATTERNS.some((pattern) => pattern.test(objective))) add(errors, `${path}[${objectiveIndex}]`, `unsupported or impossible objective: ${JSON.stringify(objective)}`);
  });
  if (mission.objectives.includes('Defeat six Russian assault waves') && mission.waves?.maxWaves < 6) add(errors, path, 'requires six waves but mission config supplies fewer than six');
  if (mission.objectives.includes('Assemble both Ukrainian command heroes')) {
    const available = new Set([...(mission.heroes ?? []), ...(mission.trainableHeroes ?? [])]);
    if (!available.has('uaZelenskyy') || !available.has('uaZaluzhnyi')) add(errors, path, 'requires both Ukrainian command heroes but they are not available');
  }
  if (mission.objectives.includes('Field four Ukrainian FPV teams') && Array.isArray(mission.trainableUnitIds) && !mission.trainableUnitIds.includes('uaDrone')) add(errors, path, 'requires uaDrone in trainableUnitIds');
}

export function validateContent(content) {
  const errors = [];
  const factions = content.FACTIONS ?? {};
  const units = content.UNIT_TYPES ?? {};
  const buildings = content.BUILDING_TYPES ?? {};
  const upgrades = content.UPGRADES ?? {};
  const abilities = content.ABILITIES ?? {};
  const missions = content.MISSIONS ?? [];
  const regions = content.REGIONS ?? {};
  const factionIds = new Set(entries(factions).map(([, faction]) => faction?.id));

  for (const [id, unit] of entries(units)) {
    if (!factionIds.has(unit?.faction)) add(errors, `UNIT_TYPES.${id}.faction`, `missing faction reference ${JSON.stringify(unit?.faction)}`);
    validateCost(errors, `UNIT_TYPES.${id}.cost`, unit?.cost);
    for (const abilityId of unit?.abilities ?? []) if (!abilities[abilityId] && !LEGACY_RUNTIME_ABILITIES.has(abilityId)) add(errors, `UNIT_TYPES.${id}.abilities`, `missing ability reference ${abilityId}`);
  }
  for (const [id, building] of entries(buildings)) {
    validateCost(errors, `BUILDING_TYPES.${id}.cost`, building?.cost);
    for (const unitId of building?.produces ?? []) if (!units[unitId]) add(errors, `BUILDING_TYPES.${id}.produces`, `missing unit reference ${unitId}`);
  }
  for (const [id, upgrade] of entries(upgrades)) validateCost(errors, `UPGRADES.${id}.cost`, upgrade?.cost);
  validateCommandCardHotkeys(errors, units, abilities);

  if (!Array.isArray(missions)) add(errors, 'MISSIONS', 'must be an array');
  else {
    missions.forEach((mission, index) => {
      const path = `MISSIONS[${index}]`;
      if (!regions[mission?.region]) add(errors, `${path}.region`, `missing region reference ${JSON.stringify(mission?.region)}`);
      if (mission?.playerFaction !== undefined && !factionIds.has(mission.playerFaction)) add(errors, `${path}.playerFaction`, `missing faction reference ${JSON.stringify(mission.playerFaction)}`);
      validateCost(errors, `${path}.start`, mission?.start);
      for (const field of ['heroes', 'trainableHeroes', 'enemyHeroes']) for (const unitId of mission?.[field] ?? []) {
        if (!units[unitId]) add(errors, `${path}.${field}`, `missing unit reference ${unitId}`);
        else if (!units[unitId].hero) add(errors, `${path}.${field}`, `${unitId} is not a hero unit`);
      }
      validateObjectives(errors, mission, index);
    });
    validateTechGraph(errors, { buildings, upgrades, factions, missions });
  }
  return errors;
}

export function assertValidContent(content) {
  const errors = validateContent(content);
  if (errors.length) throw new Error(`Content validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
}
