const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const cloneValue = (value) => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
};

const required = (type, options = {}) => ({ type, required: true, ...options });
const defaulted = (type, value, options = {}) => ({
  type,
  required: false,
  default: value,
  ...options,
});

const schema = ({ collection, identity, fields }) => ({
  version: CONTENT_SCHEMA_VERSION,
  collection,
  identity,
  allowExtensions: true,
  fields,
});

export const CONTENT_SCHEMA_VERSION = 1;

export const CONTENT_SCHEMA_FAMILIES = deepFreeze([
  'factions',
  'units',
  'buildings',
  'abilities',
  'upgrades',
  'missions',
  'maps',
  'aiProfiles',
]);

export const TECH_NODE_FAMILIES = deepFreeze(['buildings', 'upgrades']);
export const CONTENT_REFERENCE_TARGETS = deepFreeze([...CONTENT_SCHEMA_FAMILIES, 'tech-nodes']);

export const CONTENT_SCHEMAS = deepFreeze({
  factions: schema({
    collection: 'record',
    identity: { source: 'field', field: 'id' },
    fields: {
      id: required('string'),
      name: required('string'),
      short: required('string'),
      primary: required('color'),
      secondary: required('color'),
      marking: required('string'),
      description: defaulted('string', ''),
      playable: defaulted('boolean', true),
      aiProfile: defaulted('string|null', null, { reference: 'aiProfiles' }),
    },
  }),
  units: schema({
    collection: 'record',
    identity: { source: 'collection-key' },
    fields: {
      faction: required('string', { reference: 'factions' }),
      archetype: required('string'),
      name: required('string'),
      short: required('string'),
      role: required('string'),
      hp: required('number', { min: 0 }),
      speed: required('number', { min: 0 }),
      range: required('number', { min: 0 }),
      damage: required('number', { min: 0 }),
      rate: required('number', { minExclusive: 0 }),
      sight: required('number', { min: 0 }),
      cost: required('resource-cost'),
      pop: required('number', { min: 0 }),
      size: required('number', { minExclusive: 0 }),
      visual: required('string'),
      abilities: required('string[]', { reference: 'abilities' }),
      title: defaulted('string|null', null),
      worker: defaulted('boolean', false),
      air: defaulted('boolean', false),
      medic: defaulted('boolean', false),
      armor: defaulted('boolean', false),
      vehicleClass: defaulted('string|null', null),
      hero: defaulted('boolean', false),
    },
  }),
  buildings: schema({
    collection: 'record',
    identity: { source: 'collection-key' },
    fields: {
      name: required('string'),
      desc: required('string'),
      hp: required('number', { minExclusive: 0 }),
      w: required('number', { minExclusive: 0 }),
      h: required('number', { minExclusive: 0 }),
      sight: required('number', { min: 0 }),
      ruName: defaulted('string|null', null),
      pop: defaulted('number', 0, { min: 0 }),
      cost: defaulted('resource-cost', {}),
      buildTime: defaulted('number', 0, { min: 0 }),
      produces: defaulted('string[]', [], { reference: 'units' }),
      requires: defaulted('string[]', [], { reference: 'tech-nodes', acceptsLegacyScalar: true }),
      factions: defaulted('string[]', [], { reference: 'factions' }),
      missionLocks: defaulted('string[]', [], { reference: 'missions' }),
      exclusiveGroup: defaulted('string|null', null),
      techRoot: defaulted('boolean', false),
    },
  }),
  abilities: schema({
    collection: 'record',
    identity: { source: 'collection-key' },
    fields: {
      name: required('string'),
      key: required('string'),
      desc: required('string'),
      cooldown: defaulted('number', 0, { min: 0 }),
      target: defaulted('string', 'none'),
      range: defaulted('number', 0, { min: 0 }),
      radius: defaulted('number', 0, { min: 0 }),
      cost: defaulted('resource-cost', {}),
    },
  }),
  upgrades: schema({
    collection: 'record',
    identity: { source: 'collection-key' },
    fields: {
      name: required('string'),
      tier: required('integer', { min: 0 }),
      applies: required('string[]'),
      cost: required('resource-cost'),
      desc: required('string'),
      mods: required('modifier-map'),
      requires: defaulted('string[]', [], { reference: 'tech-nodes', acceptsLegacyScalar: true }),
      factions: defaulted('string[]', [], { reference: 'factions' }),
      missionLocks: defaulted('string[]', [], { reference: 'missions' }),
      exclusiveGroup: defaulted('string|null', null),
      techRoot: defaulted('boolean', false),
      researchTime: defaulted('number', 0, { min: 0 }),
    },
  }),
  missions: schema({
    collection: 'array',
    identity: { source: 'field', field: 'id' },
    fields: {
      id: required('string'),
      region: required('string'),
      title: required('string'),
      story: required('string'),
      objectives: required('string[]'),
      start: required('resource-state'),
      heroes: required('string[]', { reference: 'units' }),
      trainableHeroes: required('string[]', { reference: 'units' }),
      enemyHeroes: required('string[]', { reference: 'units' }),
      waves: required('wave-policy'),
      map: defaulted('string|null', null, { reference: 'maps' }),
      playerFaction: defaulted('string', 'ukraine', { reference: 'factions' }),
      enemyFaction: defaulted('string', 'russia', { reference: 'factions' }),
      aiProfile: defaulted('string|null', null, { reference: 'aiProfiles' }),
      availableTech: defaulted('string[]', [], { reference: 'tech-nodes' }),
      lockedTech: defaulted('string[]', [], { reference: 'tech-nodes' }),
      briefing: defaulted('string[]', []),
      debriefing: defaulted('string[]', []),
      triggers: defaulted('object[]', []),
    },
  }),
  maps: schema({
    collection: 'record',
    identity: { source: 'field', field: 'id' },
    fields: {
      id: required('string'),
      name: required('string'),
      width: required('number', { minExclusive: 0 }),
      height: required('number', { minExclusive: 0 }),
      tileSize: required('number', { minExclusive: 0 }),
      terrain: required('terrain-data'),
      spawns: required('spawn-map'),
      resources: defaulted('object[]', []),
      roads: defaulted('point[][]', []),
      blockers: defaulted('object[]', []),
      decorations: defaulted('object[]', []),
      metadata: defaulted('object', {}),
    },
  }),
  aiProfiles: schema({
    collection: 'record',
    identity: { source: 'field', field: 'id' },
    fields: {
      id: required('string'),
      name: required('string'),
      faction: defaulted('string|null', null, { reference: 'factions' }),
      difficulty: defaulted('string', 'normal'),
      scouting: defaulted('object', {}),
      economy: defaulted('object', {}),
      production: defaulted('object', {}),
      combat: defaulted('object', {}),
      missionOverrides: defaulted('object', {}),
    },
  }),
});

export const getContentSchema = (family) => {
  const result = CONTENT_SCHEMAS[family];
  if (!result) throw new Error(`Unknown content schema family: ${family}`);
  return result;
};

export const requiredFieldsFor = (family) =>
  Object.entries(getContentSchema(family).fields)
    .filter(([, field]) => field.required)
    .map(([name]) => name);

export const defaultFieldsFor = (family) =>
  Object.fromEntries(
    Object.entries(getContentSchema(family).fields)
      .filter(([, field]) => !field.required)
      .map(([name, field]) => [name, cloneValue(field.default)]),
  );

export const applyContentDefaults = (family, value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`Content value for ${family} must be an object.`);
  }

  const result = { ...value };
  for (const [name, field] of Object.entries(getContentSchema(family).fields)) {
    if (!field.required && !hasOwn(result, name)) result[name] = cloneValue(field.default);
  }
  return result;
};
