export const UPGRADE_MODIFIER_VERSION = 1;

export const UPGRADE_MODIFIER_OPERATIONS = Object.freeze({
  ADD: 'add',
  MULTIPLY: 'multiply',
});

export const UPGRADE_HEALTH_POLICIES = Object.freeze({
  PRESERVE_RATIO: 'preserve-ratio',
  PRESERVE_DEFICIT: 'preserve-deficit',
  CLAMP_CURRENT: 'clamp-current',
});

const OPERATIONS = new Set(Object.values(UPGRADE_MODIFIER_OPERATIONS));
const HEALTH_POLICIES = new Set(Object.values(UPGRADE_HEALTH_POLICIES));
const freeze = (value) => Object.freeze(value);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function stableId(value, label) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new TypeError(`${label} must be a stable non-empty identifier.`);
  }
  return String(value).trim();
}

function normalizeIds(values = [], label = 'Identifiers') {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  return freeze([...new Set(values.map((value) => stableId(value, label)))].sort());
}

function assertPlainObject(value, label) {
  const prototype = value && typeof value === 'object' ? Object.getPrototypeOf(value) : null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (prototype !== Object.prototype && prototype !== null)
  ) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function cloneSemantic(value, label = 'Value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return finite(value, label);
  if (Array.isArray(value)) return freeze(value.map((child, index) => cloneSemantic(child, `${label}[${index}]`)));
  assertPlainObject(value, label);
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = cloneSemantic(value[key], `${label}.${key}`);
  return freeze(result);
}

function normalizeTarget(target = {}) {
  assertPlainObject(target, 'Upgrade target');
  return freeze({
    factions: normalizeIds(target.factions, 'Target factions'),
    unitTypes: normalizeIds(target.unitTypes, 'Target unit types'),
    archetypes: normalizeIds(target.archetypes, 'Target archetypes'),
    vehicleClasses: normalizeIds(target.vehicleClasses, 'Target vehicle classes'),
    tags: normalizeIds(target.tags, 'Target tags'),
    requiresAbilities: normalizeIds(target.requiresAbilities, 'Required abilities'),
  });
}

function normalizeNumericModifier(modifier, label) {
  assertPlainObject(modifier, label);
  const operation = stableId(modifier.operation, `${label} operation`);
  if (!OPERATIONS.has(operation)) throw new RangeError(`Unknown ${label} operation: ${operation}`);
  const value = finite(modifier.value, `${label} value`);
  if (operation === UPGRADE_MODIFIER_OPERATIONS.MULTIPLY && value < 0) {
    throw new RangeError(`${label} multiplier must be non-negative.`);
  }
  return freeze({
    stat: stableId(modifier.stat, `${label} stat`),
    operation,
    value,
  });
}

function normalizeStatModifiers(modifiers = []) {
  if (!Array.isArray(modifiers)) throw new TypeError('Upgrade statModifiers must be an array.');
  return freeze(modifiers.map((modifier, index) => normalizeNumericModifier(modifier, `Stat modifier ${index}`)));
}

function normalizeAbilityModifiers(modifiers = []) {
  if (!Array.isArray(modifiers)) throw new TypeError('Upgrade abilityModifiers must be an array.');
  return freeze(modifiers.map((modifier, index) => {
    const normalized = normalizeNumericModifier(modifier, `Ability modifier ${index}`);
    return freeze({
      abilityId: stableId(modifier.abilityId, `Ability modifier ${index} abilityId`),
      stat: normalized.stat,
      operation: normalized.operation,
      value: normalized.value,
    });
  }));
}

function normalizeVisual(visual = {}) {
  assertPlainObject(visual, 'Upgrade visual descriptor');
  const variants = visual.variants ?? {};
  assertPlainObject(variants, 'Upgrade visual variants');
  const normalizedVariants = {};
  for (const slot of Object.keys(variants).sort()) {
    normalizedVariants[stableId(slot, 'Visual variant slot')] = stableId(variants[slot], `Visual variant ${slot}`);
  }
  return freeze({
    tokens: normalizeIds(visual.tokens, 'Upgrade visual tokens'),
    variants: freeze(normalizedVariants),
  });
}

export function createUpgradeDefinition({
  id,
  priority = 0,
  target = {},
  statModifiers = [],
  abilityModifiers = [],
  visual = {},
} = {}) {
  return freeze({
    schemaVersion: UPGRADE_MODIFIER_VERSION,
    id: stableId(id, 'Upgrade ID'),
    priority: finite(priority, 'Upgrade priority'),
    target: normalizeTarget(target),
    statModifiers: normalizeStatModifiers(statModifiers),
    abilityModifiers: normalizeAbilityModifiers(abilityModifiers),
    visual: normalizeVisual(visual),
  });
}

export function validateUpgradeDefinition(definition) {
  try {
    createUpgradeDefinition(definition);
    return freeze([]);
  } catch (error) {
    return freeze([error.message]);
  }
}

export function createUpgradeModifierState({ activeUpgradeIds = [] } = {}) {
  return freeze({
    schemaVersion: UPGRADE_MODIFIER_VERSION,
    activeUpgradeIds: normalizeIds(activeUpgradeIds, 'Active upgrades'),
  });
}

function assertState(state) {
  if (!state || state.schemaVersion !== UPGRADE_MODIFIER_VERSION || !Array.isArray(state.activeUpgradeIds)) {
    throw new TypeError('Upgrade state must be created by createUpgradeModifierState.');
  }
}

function normalizeEntityDescriptor(entity = {}) {
  assertPlainObject(entity, 'Upgrade entity descriptor');
  return freeze({
    id: entity.id == null ? null : String(entity.id),
    faction: entity.faction == null ? null : String(entity.faction),
    unitType: entity.unitType == null ? (entity.type == null ? null : String(entity.type)) : String(entity.unitType),
    archetype: entity.archetype == null ? null : String(entity.archetype),
    vehicleClass: entity.vehicleClass == null ? null : String(entity.vehicleClass),
    tags: normalizeIds(entity.tags, 'Entity tags'),
    abilities: normalizeIds(entity.abilities, 'Entity abilities'),
  });
}

function allows(list, value) {
  return list.length === 0 || (value !== null && list.includes(value));
}

export function upgradeAppliesTo(definition, entity) {
  const normalized = createUpgradeDefinition(definition);
  const candidate = normalizeEntityDescriptor(entity);
  const target = normalized.target;
  if (!allows(target.factions, candidate.faction)) return false;
  if (!allows(target.unitTypes, candidate.unitType)) return false;
  if (!allows(target.archetypes, candidate.archetype)) return false;
  if (!allows(target.vehicleClasses, candidate.vehicleClass)) return false;
  if (target.tags.some((tag) => !candidate.tags.includes(tag))) return false;
  if (target.requiresAbilities.some((abilityId) => !candidate.abilities.includes(abilityId))) return false;
  return true;
}

function normalizeDefinitions(definitions) {
  if (!Array.isArray(definitions)) throw new TypeError('Upgrade definitions must be an array.');
  const normalized = definitions.map(createUpgradeDefinition);
  const ids = new Set();
  for (const definition of normalized) {
    if (ids.has(definition.id)) throw new Error(`Duplicate upgrade definition: ${definition.id}`);
    ids.add(definition.id);
  }
  return normalized.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}

function normalizeBaseStats(stats = {}) {
  assertPlainObject(stats, 'Base stats');
  const result = {};
  for (const key of Object.keys(stats).sort()) result[key] = cloneSemantic(stats[key], `Base stat ${key}`);
  return result;
}

function normalizeBaseAbilities(abilities = {}) {
  assertPlainObject(abilities, 'Base abilities');
  const result = {};
  for (const abilityId of Object.keys(abilities).sort()) {
    assertPlainObject(abilities[abilityId], `Ability ${abilityId}`);
    result[abilityId] = cloneSemantic(abilities[abilityId], `Ability ${abilityId}`);
  }
  return result;
}

function normalizeBaseVisual(visual = {}) {
  assertPlainObject(visual, 'Base visual descriptor');
  const variants = visual.variants ?? {};
  assertPlainObject(variants, 'Base visual variants');
  const normalizedVariants = {};
  for (const slot of Object.keys(variants).sort()) {
    normalizedVariants[String(slot)] = stableId(variants[slot], `Base visual variant ${slot}`);
  }
  return {
    tokens: [...normalizeIds(visual.tokens, 'Base visual tokens')],
    variants: normalizedVariants,
  };
}

function modifierComparator(left, right) {
  const phase = left.operation === right.operation
    ? 0
    : left.operation === UPGRADE_MODIFIER_OPERATIONS.ADD ? -1 : 1;
  return phase || left.priority - right.priority || left.upgradeId.localeCompare(right.upgradeId) || left.index - right.index;
}

function applyNumericField(baseValue, modifiers, label) {
  const ordered = [...modifiers].sort(modifierComparator);
  const additions = ordered.filter((modifier) => modifier.operation === UPGRADE_MODIFIER_OPERATIONS.ADD);
  const multipliers = ordered.filter((modifier) => modifier.operation === UPGRADE_MODIFIER_OPERATIONS.MULTIPLY);
  let value;
  if (baseValue === undefined) {
    if (!additions.length) throw new Error(`${label} requires a finite base value before multiplication.`);
    value = 0;
  } else {
    value = finite(baseValue, label);
  }
  for (const modifier of additions) value += modifier.value;
  for (const modifier of multipliers) value *= modifier.value;
  return value;
}

function provenanceRecord(modifier) {
  return freeze({
    upgradeId: modifier.upgradeId,
    priority: modifier.priority,
    operation: modifier.operation,
    value: modifier.value,
  });
}

export function resolveUpgradeApplication({
  baseStats = {},
  baseAbilities = {},
  baseVisual = {},
  entity = {},
  definitions = [],
  state = createUpgradeModifierState(),
} = {}) {
  assertState(state);
  const normalizedDefinitions = normalizeDefinitions(definitions);
  const byId = new Map(normalizedDefinitions.map((definition) => [definition.id, definition]));
  const unknown = state.activeUpgradeIds.filter((id) => !byId.has(id));
  if (unknown.length) throw new Error(`Unknown active upgrades: ${unknown.join(', ')}`);

  const candidate = normalizeEntityDescriptor(entity);
  const applied = normalizedDefinitions.filter(
    (definition) => state.activeUpgradeIds.includes(definition.id) && upgradeAppliesTo(definition, candidate),
  );
  const stats = normalizeBaseStats(baseStats);
  const abilities = normalizeBaseAbilities(baseAbilities);
  const visual = normalizeBaseVisual(baseVisual);
  const statGroups = new Map();
  const abilityGroups = new Map();
  const provenance = { stats: {}, abilities: {}, visuals: {} };

  for (const definition of applied) {
    definition.statModifiers.forEach((modifier, index) => {
      const record = { ...modifier, upgradeId: definition.id, priority: definition.priority, index };
      const group = statGroups.get(modifier.stat) ?? [];
      group.push(record);
      statGroups.set(modifier.stat, group);
    });
    definition.abilityModifiers.forEach((modifier, index) => {
      if (!abilities[modifier.abilityId]) {
        throw new Error(`Upgrade ${definition.id} targets unknown ability ${modifier.abilityId}.`);
      }
      const key = `${modifier.abilityId}.${modifier.stat}`;
      const record = { ...modifier, upgradeId: definition.id, priority: definition.priority, index };
      const group = abilityGroups.get(key) ?? [];
      group.push(record);
      abilityGroups.set(key, group);
    });
    for (const token of definition.visual.tokens) visual.tokens.push(token);
    for (const [slot, variant] of Object.entries(definition.visual.variants)) {
      visual.variants[slot] = variant;
      provenance.visuals[slot] = freeze({ upgradeId: definition.id, priority: definition.priority, value: variant });
    }
  }

  for (const [stat, modifiers] of [...statGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    stats[stat] = applyNumericField(stats[stat], modifiers, `Stat ${stat}`);
    provenance.stats[stat] = freeze([...modifiers].sort(modifierComparator).map(provenanceRecord));
  }
  for (const [key, modifiers] of [...abilityGroups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const separator = key.indexOf('.');
    const abilityId = key.slice(0, separator);
    const stat = key.slice(separator + 1);
    const ability = { ...abilities[abilityId] };
    ability[stat] = applyNumericField(ability[stat], modifiers, `Ability ${abilityId}.${stat}`);
    abilities[abilityId] = freeze(ability);
    provenance.abilities[key] = freeze([...modifiers].sort(modifierComparator).map(provenanceRecord));
  }

  return freeze({
    schemaVersion: UPGRADE_MODIFIER_VERSION,
    entity: candidate,
    activeUpgradeIds: state.activeUpgradeIds,
    appliedUpgradeIds: freeze(applied.map((definition) => definition.id)),
    stats: freeze(stats),
    abilities: freeze(abilities),
    visual: freeze({
      tokens: freeze([...new Set(visual.tokens)].sort()),
      variants: freeze(Object.fromEntries(Object.entries(visual.variants).sort(([left], [right]) => left.localeCompare(right)))),
    }),
    provenance: freeze({
      stats: freeze(provenance.stats),
      abilities: freeze(provenance.abilities),
      visuals: freeze(provenance.visuals),
    }),
  });
}

export function createNewEntityUpgradePatch(resolved) {
  if (!resolved || resolved.schemaVersion !== UPGRADE_MODIFIER_VERSION) {
    throw new TypeError('New entity patch requires a resolved upgrade application.');
  }
  const maximumHealth = Number.isFinite(resolved.stats.hp) ? resolved.stats.hp : null;
  return freeze({
    hp: maximumHealth,
    maxHp: maximumHealth,
    stats: resolved.stats,
    abilities: resolved.abilities,
    visual: resolved.visual,
    appliedUpgradeIds: resolved.appliedUpgradeIds,
  });
}

export function reconcileExistingEntityUpgrades(
  entity,
  previousResolved,
  nextResolved,
  { healthPolicy = UPGRADE_HEALTH_POLICIES.PRESERVE_RATIO } = {},
) {
  assertPlainObject(entity, 'Existing entity');
  if (!previousResolved || !nextResolved) throw new TypeError('Existing entity reconciliation requires previous and next resolutions.');
  if (!HEALTH_POLICIES.has(healthPolicy)) throw new RangeError(`Unknown upgrade health policy: ${healthPolicy}`);
  const oldMax = finite(entity.maxHp ?? previousResolved.stats.hp, 'Existing maximum health');
  const current = Math.max(0, Math.min(oldMax, finite(entity.hp, 'Existing current health')));
  const nextMax = finite(nextResolved.stats.hp ?? oldMax, 'Next maximum health');
  let nextHp;
  if (healthPolicy === UPGRADE_HEALTH_POLICIES.PRESERVE_RATIO) {
    nextHp = oldMax === 0 ? nextMax : nextMax * (current / oldMax);
  } else if (healthPolicy === UPGRADE_HEALTH_POLICIES.PRESERVE_DEFICIT) {
    nextHp = nextMax - (oldMax - current);
  } else {
    nextHp = current;
  }
  nextHp = Math.max(0, Math.min(nextMax, nextHp));
  return freeze({
    hp: nextHp,
    maxHp: nextMax,
    stats: nextResolved.stats,
    abilities: nextResolved.abilities,
    visual: nextResolved.visual,
    appliedUpgradeIds: nextResolved.appliedUpgradeIds,
    healthPolicy,
  });
}

export function createUpgradeSaveSnapshot(state) {
  assertState(state);
  return freeze({
    schemaVersion: UPGRADE_MODIFIER_VERSION,
    activeUpgradeIds: normalizeIds(state.activeUpgradeIds, 'Saved active upgrades'),
  });
}

export function restoreUpgradeSaveSnapshot(snapshot, { knownUpgradeIds = null } = {}) {
  assertPlainObject(snapshot, 'Upgrade save snapshot');
  if (snapshot.schemaVersion !== UPGRADE_MODIFIER_VERSION) {
    throw new Error(`Unsupported upgrade modifier version: ${String(snapshot.schemaVersion)}`);
  }
  const state = createUpgradeModifierState({ activeUpgradeIds: snapshot.activeUpgradeIds });
  if (knownUpgradeIds !== null) {
    const known = new Set(normalizeIds(knownUpgradeIds, 'Known upgrades'));
    const unknown = state.activeUpgradeIds.filter((id) => !known.has(id));
    if (unknown.length) throw new Error(`Upgrade save references unknown upgrades: ${unknown.join(', ')}`);
  }
  return state;
}
