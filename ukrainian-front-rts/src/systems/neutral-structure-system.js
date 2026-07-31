import { DOMAIN_EVENT_TYPES } from '../core/events.js';
import {
  DEFAULT_BUILDING_LIFECYCLE_POLICY,
  advanceBuildingCapture,
  beginBuildingCapture,
  createBuildingLifecycleState,
} from './building-lifecycle-system.js';

export const NEUTRAL_STRUCTURE_VERSION = 1;
export const NEUTRAL_STRUCTURE_KINDS = Object.freeze(['civilian', 'industrial', 'logistics']);
export const NEUTRAL_STRUCTURE_RESULTS = Object.freeze({
  READY: 'ready',
  STARTED: 'started',
  PROGRESSED: 'progressed',
  COMPLETED: 'completed',
  CONTESTED: 'contested',
  PAUSED: 'paused',
  INVALID_STATE: 'invalid-state',
  INVALID_SITE: 'invalid-site',
  ALREADY_OWNED: 'already-owned',
  ACTIVE_CAPTURE: 'active-capture',
});

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const KINDS = new Set(NEUTRAL_STRUCTURE_KINDS);
const MULTIPLIER_KEYS = new Set([
  'productionRateMultiplier',
  'repairRateMultiplier',
  'resupplyRateMultiplier',
]);
const ADDITIVE_KEYS = new Set([
  'metalPerMinute',
  'fuelPerMinute',
  'intelPerMinute',
  'commandCapacity',
  'visionRadius',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function stableId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must be a stable identifier.`);
  return value;
}

function finite(value, label, { min = -Infinity, max = Infinity } = {}) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${label} must be between ${min} and ${max}.`);
  }
  return value;
}

function json(value, label, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return finite(value, label);
  if (typeof value !== 'object') throw new TypeError(`${label} must be JSON-compatible.`);
  if (seen.has(value)) throw new TypeError(`${label} must not be circular.`);
  seen.add(value);
  let result;
  if (Array.isArray(value)) result = value.map((entry, index) => json(entry, `${label}[${index}]`, seen));
  else {
    object(value, label);
    result = {};
    for (const key of Object.keys(value).sort()) result[key] = json(value[key], `${label}.${key}`, seen);
  }
  seen.delete(value);
  return result;
}

function stringList(values, label) {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  const normalized = values.map((value, index) => stableId(value, `${label}[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new TypeError(`${label} must not contain duplicates.`);
  return normalized.sort();
}

function effects(value = {}, label = 'Neutral structure effects') {
  object(value, label);
  const normalized = {};
  for (const [key, amount] of Object.entries(value)) {
    if (MULTIPLIER_KEYS.has(key)) normalized[key] = finite(amount, `${label}.${key}`, { min: 0 });
    else if (ADDITIVE_KEYS.has(key)) normalized[key] = finite(amount, `${label}.${key}`, { min: 0 });
    else if (key === 'dropOffResources' || key === 'scriptFlags') normalized[key] = stringList(amount, `${label}.${key}`);
    else throw new TypeError(`${label} contains unsupported key: ${key}`);
  }
  return normalized;
}

export const DEFAULT_NEUTRAL_STRUCTURE_DEFINITIONS = deepFreeze([
  {
    id: 'neutral.civilian-site',
    kind: 'civilian',
    label: 'Civilian Coordination Site',
    description: 'A non-combat community coordination point that improves local awareness without representing civilians as targetable units.',
    captureSeconds: 10,
    effects: { intelPerMinute: 4, visionRadius: 220, scriptFlags: ['civilian-network'] },
    missionTags: ['civilian', 'coordination'],
  },
  {
    id: 'neutral.industrial-site',
    kind: 'industrial',
    label: 'Industrial Support Site',
    description: 'A workshop or industrial compound that supports repair and production throughput while controlled.',
    captureSeconds: 12,
    effects: { metalPerMinute: 12, productionRateMultiplier: 1.08, repairRateMultiplier: 1.1 },
    missionTags: ['industrial', 'repair'],
  },
  {
    id: 'neutral.logistics-site',
    kind: 'logistics',
    label: 'Logistics Transfer Site',
    description: 'A neutral transfer yard that provides fuel throughput, resupply support, and eligible drop-off services.',
    captureSeconds: 11,
    effects: {
      fuelPerMinute: 8,
      resupplyRateMultiplier: 1.1,
      dropOffResources: ['ammunition', 'fuel', 'repair-parts'],
    },
    missionTags: ['logistics', 'supply'],
  },
]);

export function validateNeutralStructureDefinition(value) {
  object(value, 'Neutral structure definition');
  if (value.version !== undefined && value.version !== NEUTRAL_STRUCTURE_VERSION) {
    throw new RangeError(`Unsupported neutral structure definition version: ${value.version}`);
  }
  const kind = value.kind;
  if (!KINDS.has(kind)) throw new RangeError(`Unknown neutral structure kind: ${kind}`);
  if (typeof value.label !== 'string' || !value.label.trim()) throw new TypeError('Neutral structure label is required.');
  if (typeof value.description !== 'string' || !value.description.trim()) throw new TypeError('Neutral structure description is required.');
  return deepFreeze({
    version: NEUTRAL_STRUCTURE_VERSION,
    id: stableId(value.id, 'Neutral structure definition id'),
    kind,
    label: value.label,
    description: value.description,
    captureSeconds: finite(value.captureSeconds ?? DEFAULT_BUILDING_LIFECYCLE_POLICY.captureSeconds, 'Neutral capture duration', { min: Number.EPSILON }),
    effects: effects(value.effects),
    missionTags: stringList(value.missionTags ?? [], 'Neutral structure mission tags'),
    metadata: json(value.metadata ?? {}, 'Neutral structure metadata'),
  });
}

export function createNeutralStructureCatalog(definitions = DEFAULT_NEUTRAL_STRUCTURE_DEFINITIONS) {
  if (!Array.isArray(definitions) || !definitions.length) throw new TypeError('Neutral structure catalog must be a non-empty array.');
  const records = definitions.map(validateNeutralStructureDefinition);
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw new TypeError(`Duplicate neutral structure definition id: ${record.id}`);
    ids.add(record.id);
  }
  return deepFreeze(Object.fromEntries(records.map((record) => [record.id, record])));
}

export const NEUTRAL_STRUCTURE_CATALOG = createNeutralStructureCatalog();

function normalizeSite(site) {
  object(site, 'Neutral structure site');
  const id = site.id == null ? null : String(site.id);
  if (!id) throw new TypeError('Neutral structure site requires a stable id.');
  if (!Number.isFinite(site.x) || !Number.isFinite(site.y)) throw new TypeError('Neutral structure site requires finite coordinates.');
  if (!Number.isFinite(site.hp) || !Number.isFinite(site.maxHp) || site.maxHp <= 0) {
    throw new TypeError('Neutral structure site requires valid hp and maxHp.');
  }
  return {
    ...site,
    id,
    team: site.team ?? null,
    queue: Array.isArray(site.queue) ? site.queue : [],
    captureEligible: site.captureEligible !== false,
    underConstruction: Boolean(site.underConstruction),
  };
}

function resolveDefinition(definition, catalog = NEUTRAL_STRUCTURE_CATALOG) {
  if (typeof definition === 'string') {
    const found = catalog[definition];
    if (!found) throw new RangeError(`Unknown neutral structure definition: ${definition}`);
    return found;
  }
  return validateNeutralStructureDefinition(definition);
}

function localEvent(type, state, payload = {}) {
  return deepFreeze({
    type,
    siteId: state.siteId,
    sequence: state.sequence,
    ownerTeam: state.ownerTeam,
    payload: deepFreeze({ ...payload }),
  });
}

function result(state, events = [], extra = {}) {
  return deepFreeze({ state: deepFreeze(state), events: deepFreeze([...events]), ...extra });
}

export function createNeutralStructureState(site, definition, catalog = NEUTRAL_STRUCTURE_CATALOG) {
  const normalizedSite = normalizeSite(site);
  const normalizedDefinition = resolveDefinition(definition, catalog);
  const lifecycle = createBuildingLifecycleState({
    ...normalizedSite,
    team: normalizedSite.team,
    captureSeconds: normalizedDefinition.captureSeconds,
  });
  const controlled = lifecycle.ownerTeam !== null && lifecycle.ownerTeam !== undefined;
  return deepFreeze({
    version: NEUTRAL_STRUCTURE_VERSION,
    siteId: normalizedSite.id,
    definitionId: normalizedDefinition.id,
    kind: normalizedDefinition.kind,
    ownerTeam: controlled ? lifecycle.ownerTeam : null,
    lifecycle,
    controlled,
    sequence: 0,
    lastTransition: controlled ? 'initialized-controlled' : 'initialized-neutral',
  });
}

function assertState(state, site = null) {
  if (!state || state.version !== NEUTRAL_STRUCTURE_VERSION || typeof state.siteId !== 'string') {
    throw new TypeError('Neutral structure state is invalid.');
  }
  if (site && String(site.id) !== state.siteId) throw new TypeError('Neutral structure state does not match site.');
}

function siteForLifecycle(state, site, definition) {
  const normalized = normalizeSite(site);
  return {
    ...normalized,
    team: state.ownerTeam,
    captureSeconds: definition.captureSeconds,
  };
}

export function beginNeutralStructureCapture(
  state,
  site,
  team,
  units,
  { catalog = NEUTRAL_STRUCTURE_CATALOG, lifecyclePolicy = DEFAULT_BUILDING_LIFECYCLE_POLICY } = {},
) {
  assertState(state, site);
  const definition = resolveDefinition(state.definitionId, catalog);
  if (state.lifecycle.phase === 'capturing') return result(state, [], { ok: false, reason: NEUTRAL_STRUCTURE_RESULTS.ACTIVE_CAPTURE });
  if (state.ownerTeam === team) return result(state, [], { ok: false, reason: NEUTRAL_STRUCTURE_RESULTS.ALREADY_OWNED });
  const started = beginBuildingCapture(
    state.lifecycle,
    siteForLifecycle(state, site, definition),
    team,
    units,
    lifecyclePolicy,
  );
  if (!started.ok) return result(state, [], { ok: false, reason: started.reason });
  const next = {
    ...state,
    lifecycle: started.state,
    sequence: state.sequence + 1,
    lastTransition: 'capture-started',
  };
  return result(next, [localEvent('neutral.capture-started', next, {
    team,
    unitIds: started.state.capture.unitIds,
    requiredSeconds: started.state.capture.requiredSeconds,
  })], { ok: true, reason: NEUTRAL_STRUCTURE_RESULTS.STARTED });
}

export function advanceNeutralStructureCapture(
  state,
  site,
  elapsedSeconds,
  context = {},
  { catalog = NEUTRAL_STRUCTURE_CATALOG, lifecyclePolicy = DEFAULT_BUILDING_LIFECYCLE_POLICY } = {},
) {
  assertState(state, site);
  const definition = resolveDefinition(state.definitionId, catalog);
  if (state.lifecycle.phase !== 'capturing') {
    return result(state, [], { reason: NEUTRAL_STRUCTURE_RESULTS.INVALID_STATE, ownerChanged: false });
  }
  const previousOwner = state.ownerTeam;
  const advanced = advanceBuildingCapture(
    state.lifecycle,
    siteForLifecycle(state, site, definition),
    elapsedSeconds,
    context,
    lifecyclePolicy,
  );
  const ownerChanged = Boolean(advanced.ownerChanged);
  const ownerTeam = ownerChanged ? advanced.state.ownerTeam : state.ownerTeam;
  const transition = ownerChanged
    ? 'capture-completed'
    : advanced.reason === 'contested'
      ? 'capture-contested'
      : advanced.reason === 'paused'
        ? 'capture-paused'
        : 'capture-progressed';
  const next = {
    ...state,
    lifecycle: advanced.state,
    ownerTeam,
    controlled: ownerTeam !== null && ownerTeam !== undefined,
    sequence: state.sequence + (elapsedSeconds > 0 ? 1 : 0),
    lastTransition: transition,
  };
  const capture = advanced.state.capture;
  const eventType = ownerChanged ? 'neutral.capture-completed' : `neutral.${transition}`;
  return result(next, elapsedSeconds > 0 ? [localEvent(eventType, next, {
    previousOwner,
    team: ownerChanged ? ownerTeam : capture?.team ?? null,
    contested: capture?.contested ?? false,
    progressSeconds: capture?.progressSeconds ?? definition.captureSeconds,
    requiredSeconds: capture?.requiredSeconds ?? definition.captureSeconds,
  })] : [], {
    reason: ownerChanged ? NEUTRAL_STRUCTURE_RESULTS.COMPLETED : advanced.reason,
    ownerChanged,
  });
}

export function neutralStructureEffectSnapshot(state, { catalog = NEUTRAL_STRUCTURE_CATALOG } = {}) {
  assertState(state);
  const definition = resolveDefinition(state.definitionId, catalog);
  if (!state.controlled) return deepFreeze({
    siteId: state.siteId,
    definitionId: definition.id,
    kind: definition.kind,
    ownerTeam: null,
    active: false,
    effects: {},
  });
  return deepFreeze({
    siteId: state.siteId,
    definitionId: definition.id,
    kind: definition.kind,
    ownerTeam: state.ownerTeam,
    active: true,
    effects: definition.effects,
  });
}

export function aggregateNeutralStructureEffects(states, team, { catalog = NEUTRAL_STRUCTURE_CATALOG } = {}) {
  if (!Array.isArray(states)) throw new TypeError('Neutral structure states must be an array.');
  const totals = {
    metalPerMinute: 0,
    fuelPerMinute: 0,
    intelPerMinute: 0,
    commandCapacity: 0,
    visionRadius: 0,
    productionRateMultiplier: 1,
    repairRateMultiplier: 1,
    resupplyRateMultiplier: 1,
    dropOffResources: [],
    scriptFlags: [],
    siteIds: [],
  };
  const dropOffResources = new Set();
  const scriptFlags = new Set();
  for (const state of [...states].sort((left, right) => left.siteId.localeCompare(right.siteId))) {
    assertState(state);
    if (!state.controlled || state.ownerTeam !== team) continue;
    const snapshot = neutralStructureEffectSnapshot(state, { catalog });
    totals.siteIds.push(state.siteId);
    for (const [key, value] of Object.entries(snapshot.effects)) {
      if (MULTIPLIER_KEYS.has(key)) totals[key] *= value;
      else if (ADDITIVE_KEYS.has(key)) totals[key] += value;
      else if (key === 'dropOffResources') value.forEach((entry) => dropOffResources.add(entry));
      else if (key === 'scriptFlags') value.forEach((entry) => scriptFlags.add(entry));
    }
  }
  totals.dropOffResources = [...dropOffResources].sort();
  totals.scriptFlags = [...scriptFlags].sort();
  return deepFreeze(totals);
}

export function neutralStructureScriptFacts(state, { catalog = NEUTRAL_STRUCTURE_CATALOG } = {}) {
  assertState(state);
  const definition = resolveDefinition(state.definitionId, catalog);
  const capture = state.lifecycle.capture;
  const progressSeconds = capture?.progressSeconds ?? 0;
  const requiredSeconds = capture?.requiredSeconds ?? definition.captureSeconds;
  return deepFreeze({
    siteId: state.siteId,
    definitionId: definition.id,
    kind: definition.kind,
    missionTags: definition.missionTags,
    ownerTeam: state.ownerTeam,
    controlled: state.controlled,
    contested: Boolean(capture?.contested),
    captureTeam: capture?.team ?? null,
    captureProgressSeconds: progressSeconds,
    captureRequiredSeconds: requiredSeconds,
    captureProgressRatio: requiredSeconds > 0 ? progressSeconds / requiredSeconds : 0,
    scriptFlags: state.controlled ? definition.effects.scriptFlags ?? [] : [],
  });
}

export function neutralStructureScriptVariables(state, options = {}) {
  const facts = neutralStructureScriptFacts(state, options);
  const prefix = `neutral.${facts.siteId}`;
  return deepFreeze({
    [`${prefix}.captureProgress`]: facts.captureProgressRatio,
    [`${prefix}.captureTeam`]: facts.captureTeam,
    [`${prefix}.controlled`]: facts.controlled,
    [`${prefix}.contested`]: facts.contested,
    [`${prefix}.owner`]: facts.ownerTeam,
  });
}

export function emitNeutralStructureDomainEvents(stream, records, metadata = {}) {
  if (!stream || typeof stream.emit !== 'function') throw new TypeError('Neutral structure event adapter requires a domain event stream.');
  if (!Array.isArray(records)) throw new TypeError('Neutral structure records must be an array.');
  return deepFreeze(records.map((record) => stream.emit(DOMAIN_EVENT_TYPES.CAPTURE, {
    siteId: record.siteId,
    transition: record.type,
    ownerTeam: record.ownerTeam,
    ...record.payload,
  }, {
    source: metadata.source ?? 'neutral-structure-system',
    ...(metadata.tick === undefined ? {} : { tick: metadata.tick }),
  })));
}
