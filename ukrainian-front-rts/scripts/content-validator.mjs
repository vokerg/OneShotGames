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

function validateCost(errors, path, cost) {
  if (cost === undefined) return;
  if (!cost || typeof cost !== 'object' || Array.isArray(cost)) return add(errors, path, 'cost must be an object');
  for (const [resource, amount] of Object.entries(cost)) {
    if (!RESOURCE_KEYS.has(resource)) add(errors, `${path}.${resource}`, 'unknown resource');
    if (!Number.isFinite(amount) || amount < 0) add(errors, `${path}.${resource}`, 'must be a finite non-negative number');
  }
}

function validateUpgradeCycles(errors, upgrades) {
  const visiting = new Set();
  const visited = new Set();
  function visit(id, stack) {
    if (visited.has(id)) return;
    if (visiting.has(id)) return add(errors, `UPGRADES.${id}.requires`, `circular prerequisite: ${[...stack.slice(stack.indexOf(id)), id].join(' -> ')}`);
    visiting.add(id);
    const required = upgrades[id]?.requires;
    if (required && upgrades[required]) visit(required, [...stack, id]);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of Object.keys(upgrades)) visit(id, []);
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
  for (const [id, upgrade] of entries(upgrades)) {
    validateCost(errors, `UPGRADES.${id}.cost`, upgrade?.cost);
    if (upgrade?.requires && !upgrades[upgrade.requires]) add(errors, `UPGRADES.${id}.requires`, `missing upgrade reference ${upgrade.requires}`);
  }
  validateUpgradeCycles(errors, upgrades);
  validateCommandCardHotkeys(errors, units, abilities);

  if (!Array.isArray(missions)) add(errors, 'MISSIONS', 'must be an array');
  else missions.forEach((mission, index) => {
    const path = `MISSIONS[${index}]`;
    if (!regions[mission?.region]) add(errors, `${path}.region`, `missing region reference ${JSON.stringify(mission?.region)}`);
    validateCost(errors, `${path}.start`, mission?.start);
    for (const field of ['heroes', 'trainableHeroes', 'enemyHeroes']) for (const unitId of mission?.[field] ?? []) {
      if (!units[unitId]) add(errors, `${path}.${field}`, `missing unit reference ${unitId}`);
      else if (!units[unitId].hero) add(errors, `${path}.${field}`, `${unitId} is not a hero unit`);
    }
    validateObjectives(errors, mission, index);
  });
  return errors;
}

export function assertValidContent(content) {
  const errors = validateContent(content);
  if (errors.length) throw new Error(`Content validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}`);
}
