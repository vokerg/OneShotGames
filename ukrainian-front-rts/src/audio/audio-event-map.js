import { AUDIO_BUS_IDS } from './audio-mixer.js';

export const AUDIO_EVENT_MAP_VERSION = 1;

export const AUDIO_EVENT_IDS = deepFreeze({
  WEAPON_FIRE: 'combat.weapon-fire',
  IMPACT: 'combat.impact',
  EXPLOSION: 'combat.explosion',
  DESTRUCTION: 'combat.destruction',
  REPAIR: 'combat.repair',
  CONSTRUCTION: 'economy.construction',
  UNIT_SELECTION: 'unit.selection',
  UNIT_ACKNOWLEDGEMENT: 'unit.acknowledgement',
  UNIT_ERROR: 'unit.error',
  UNDER_ATTACK: 'unit.under-attack',
  PRODUCTION_QUEUED: 'economy.production-queued',
  PRODUCTION_COMPLETE: 'economy.production-complete',
  RESEARCH_COMPLETE: 'economy.research-complete',
  RESOURCE_WARNING: 'economy.resource-warning',
  OBJECTIVE_UPDATE: 'mission.objective-update',
  VICTORY: 'mission.victory',
  DEFEAT: 'mission.defeat',
  UI_CONFIRM: 'ui.confirm',
  UI_CANCEL: 'ui.cancel',
  UI_ERROR: 'ui.error',
  UI_ALERT: 'ui.alert',
  AMBIENCE_BIOME: 'ambience.biome',
  MUSIC_STATE: 'music.state',
  VOICE_DIALOGUE: 'voice.dialogue',
});

export const AUDIO_EVENT_PRIORITIES = Object.freeze({
  BACKGROUND: 10,
  LOW: 25,
  NORMAL: 50,
  HIGH: 75,
  CRITICAL: 100,
});

export const AUDIO_ATTENUATION_MODES = Object.freeze(['none', 'linear']);
export const AUDIO_FACTION_MODES = Object.freeze(['shared', 'prefer', 'require']);
export const AUDIO_MISSING_ASSET_POLICIES = Object.freeze(['fallback', 'silent', 'reject']);

const BUS_SET = new Set(AUDIO_BUS_IDS);
const EVENT_ID_SET = new Set(Object.values(AUDIO_EVENT_IDS));
const ATTENUATION_SET = new Set(AUDIO_ATTENUATION_MODES);
const FACTION_MODE_SET = new Set(AUDIO_FACTION_MODES);
const MISSING_POLICY_SET = new Set(AUDIO_MISSING_ASSET_POLICIES);
const ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function plainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
}

function stableId(value, label) {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) throw new TypeError(`${label} must be a stable identifier.`);
  return value;
}

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}.`);
  return value;
}

function unitInterval(value, label) {
  const number = finite(value, label);
  if (number < 0 || number > 1) throw new RangeError(`${label} must be between 0 and 1.`);
  return number;
}

function enumValue(value, allowed, label) {
  if (!allowed.has(value)) throw new RangeError(`Unknown ${label}: ${value}`);
  return value;
}

function stableIdList(value, label, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  const ids = value.map((item, index) => stableId(item, `${label}[${index}]`));
  if (!allowEmpty && ids.length === 0) throw new RangeError(`${label} must not be empty.`);
  if (new Set(ids).size !== ids.length) throw new Error(`${label} must not contain duplicate asset IDs.`);
  return Object.freeze(ids);
}

function normalizeAssets(value, factionMode, label) {
  const source = plainObject(value, label);
  const shared = stableIdList(source.shared ?? [], `${label}.shared`, { allowEmpty: true });
  const byFactionSource = source.byFaction === undefined ? {} : plainObject(source.byFaction, `${label}.byFaction`);
  const byFaction = {};
  for (const faction of Object.keys(byFactionSource).sort()) {
    const factionId = stableId(faction, `${label}.byFaction key`);
    byFaction[factionId] = stableIdList(byFactionSource[faction], `${label}.byFaction.${factionId}`);
  }

  if (factionMode === 'shared') {
    if (shared.length === 0) throw new RangeError(`${label}.shared must contain at least one asset for shared events.`);
    if (Object.keys(byFaction).length > 0) throw new Error(`${label}.byFaction is not allowed when factionMode is shared.`);
  } else if (factionMode === 'prefer') {
    if (shared.length === 0 && Object.keys(byFaction).length === 0) {
      throw new RangeError(`${label} must contain shared or faction assets.`);
    }
  } else if (Object.keys(byFaction).length === 0) {
    throw new RangeError(`${label}.byFaction must contain at least one faction for required events.`);
  }

  return deepFreeze({ shared, byFaction });
}

function normalizeAttenuation(value, label) {
  const source = value === undefined ? { mode: 'none' } : plainObject(value, label);
  const mode = enumValue(source.mode ?? 'none', ATTENUATION_SET, `${label} mode`);
  if (mode === 'none') return Object.freeze({ mode });
  const nearDistance = finite(source.nearDistance ?? 0, `${label}.nearDistance`);
  const farDistance = finite(source.farDistance, `${label}.farDistance`);
  const minimumGain = unitInterval(source.minimumGain ?? 0, `${label}.minimumGain`);
  if (nearDistance < 0) throw new RangeError(`${label}.nearDistance must be non-negative.`);
  if (farDistance <= nearDistance) throw new RangeError(`${label}.farDistance must be greater than nearDistance.`);
  return Object.freeze({ mode, nearDistance, farDistance, minimumGain });
}

function normalizeMissingAsset(value, globalFallbackAssetId, label) {
  const source = value === undefined ? { policy: 'reject' } : plainObject(value, label);
  const policy = enumValue(source.policy ?? 'reject', MISSING_POLICY_SET, `${label} policy`);
  const fallbackAssetId = source.assetId === undefined || source.assetId === null
    ? globalFallbackAssetId
    : stableId(source.assetId, `${label}.assetId`);
  if (policy === 'fallback' && !fallbackAssetId) {
    throw new Error(`${label} requires an event or catalog fallback asset ID.`);
  }
  return Object.freeze({ policy, assetId: policy === 'fallback' ? fallbackAssetId : null });
}

function normalizeDefinition(value, globalFallbackAssetId, index) {
  const source = plainObject(value, `Audio event definition ${index}`);
  const id = stableId(source.id, `Audio event definition ${index}.id`);
  if (!EVENT_ID_SET.has(id)) throw new Error(`Audio event ${id} is not registered in AUDIO_EVENT_IDS.`);
  const bus = stableId(source.bus, `Audio event ${id}.bus`);
  if (!BUS_SET.has(bus)) throw new RangeError(`Unknown audio bus: ${bus}`);
  const priority = integer(source.priority ?? AUDIO_EVENT_PRIORITIES.NORMAL, `Audio event ${id}.priority`);
  if (priority > AUDIO_EVENT_PRIORITIES.CRITICAL) throw new RangeError(`Audio event ${id}.priority must be <= 100.`);
  const cooldownTicks = integer(source.cooldownTicks ?? 0, `Audio event ${id}.cooldownTicks`);
  const factionMode = enumValue(source.factionMode ?? 'shared', FACTION_MODE_SET, `audio faction mode for ${id}`);
  const concurrencySource = source.concurrency === undefined ? {} : plainObject(source.concurrency, `Audio event ${id}.concurrency`);
  const concurrency = Object.freeze({
    key: stableId(concurrencySource.key ?? id, `Audio event ${id}.concurrency.key`),
    limit: integer(concurrencySource.limit ?? 1, `Audio event ${id}.concurrency.limit`, 1),
  });
  const tag = stableId(source.tag ?? id, `Audio event ${id}.tag`);
  const assets = normalizeAssets(source.assets, factionMode, `Audio event ${id}.assets`);
  const attenuation = normalizeAttenuation(source.attenuation, `Audio event ${id}.attenuation`);
  const missingAsset = normalizeMissingAsset(source.missingAsset, globalFallbackAssetId, `Audio event ${id}.missingAsset`);
  return deepFreeze({
    id,
    bus,
    priority,
    cooldownTicks,
    concurrency,
    attenuation,
    factionMode,
    assets,
    missingAsset,
    tag,
  });
}

export function createAudioEventMap(definitions, { fallbackAssetId = null } = {}) {
  if (!Array.isArray(definitions)) throw new TypeError('Audio event definitions must be an array.');
  const normalizedFallback = fallbackAssetId === null ? null : stableId(fallbackAssetId, 'Audio catalog fallbackAssetId');
  const normalized = definitions.map((definition, index) => normalizeDefinition(definition, normalizedFallback, index));
  const seen = new Set();
  for (const definition of normalized) {
    if (seen.has(definition.id)) throw new Error(`Duplicate audio event definition: ${definition.id}`);
    seen.add(definition.id);
  }
  const ids = [...seen].sort();
  const events = {};
  for (const id of ids) events[id] = normalized.find((definition) => definition.id === id);
  return deepFreeze({ version: AUDIO_EVENT_MAP_VERSION, fallbackAssetId: normalizedFallback, ids, events });
}

function normalizeRequest(value) {
  const source = plainObject(value, 'Audio event request');
  return Object.freeze({
    id: stableId(source.id, 'Audio event request.id'),
    tick: integer(source.tick ?? 0, 'Audio event request.tick'),
    sequence: integer(source.sequence ?? 0, 'Audio event request.sequence'),
    faction: source.faction === undefined || source.faction === null ? null : stableId(source.faction, 'Audio event request.faction'),
    distance: (() => {
      const distance = finite(source.distance ?? 0, 'Audio event request.distance');
      if (distance < 0) throw new RangeError('Audio event request.distance must be non-negative.');
      return distance;
    })(),
    gain: unitInterval(source.gain ?? 1, 'Audio event request.gain'),
    variantKey: source.variantKey === undefined || source.variantKey === null
      ? null
      : stableId(source.variantKey, 'Audio event request.variantKey'),
  });
}

function availableAssetSet(value) {
  if (value === undefined || value === null) return null;
  return new Set(stableIdList(value, 'Audio availableAssetIds', { allowEmpty: true }));
}

function readCounter(source, key, label) {
  if (source === undefined || source === null) return null;
  plainObject(source, label);
  if (!(key in source)) return null;
  return integer(source[key], `${label}.${key}`);
}

function attenuationGain(attenuation, distance) {
  if (attenuation.mode === 'none' || distance <= attenuation.nearDistance) return 1;
  if (distance >= attenuation.farDistance) return attenuation.minimumGain;
  const progress = (distance - attenuation.nearDistance) / (attenuation.farDistance - attenuation.nearDistance);
  return 1 - progress * (1 - attenuation.minimumGain);
}

function candidateAssetGroups(definition, faction) {
  if (definition.factionMode === 'shared') return Object.freeze([definition.assets.shared]);
  const factionAssets = faction === null ? [] : definition.assets.byFaction[faction] ?? [];
  if (definition.factionMode === 'require') return Object.freeze([factionAssets]);
  return factionAssets.length > 0
    ? Object.freeze([factionAssets, definition.assets.shared])
    : Object.freeze([definition.assets.shared]);
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rejection(request, definition, reason, details = {}) {
  return deepFreeze({
    ok: false,
    eventId: request.id,
    tick: request.tick,
    sequence: request.sequence,
    priority: definition?.priority ?? null,
    reason,
    ...details,
  });
}

export function resolveAudioEvent(eventMap, request, {
  availableAssetIds = null,
  lastPlayedTicks = null,
  activeCounts = null,
} = {}) {
  plainObject(eventMap, 'Audio event map');
  const normalizedRequest = normalizeRequest(request);
  const definition = eventMap.events?.[normalizedRequest.id];
  if (!definition) return rejection(normalizedRequest, null, 'unknown-event');

  const lastPlayedTick = readCounter(lastPlayedTicks, definition.id, 'Audio lastPlayedTicks');
  if (lastPlayedTick !== null) {
    if (lastPlayedTick > normalizedRequest.tick) throw new RangeError(`Audio last-played tick for ${definition.id} is in the future.`);
    const retryAtTick = lastPlayedTick + definition.cooldownTicks;
    if (normalizedRequest.tick < retryAtTick) {
      return rejection(normalizedRequest, definition, 'cooldown', { retryAtTick });
    }
  }

  const activeCount = readCounter(activeCounts, definition.concurrency.key, 'Audio activeCounts') ?? 0;
  if (activeCount >= definition.concurrency.limit) {
    return rejection(normalizedRequest, definition, 'concurrency-limit', {
      concurrencyKey: definition.concurrency.key,
      maxConcurrent: definition.concurrency.limit,
    });
  }

  const spatialGain = attenuationGain(definition.attenuation, normalizedRequest.distance);
  const gain = normalizedRequest.gain * spatialGain;
  if (gain <= 0) return rejection(normalizedRequest, definition, 'out-of-range');

  const available = availableAssetSet(availableAssetIds);
  const candidateGroups = candidateAssetGroups(definition, normalizedRequest.faction);
  let selectable = [];
  for (const candidates of candidateGroups) {
    selectable = available === null ? [...candidates] : candidates.filter((assetId) => available.has(assetId));
    if (selectable.length > 0) break;
  }
  let assetId = null;
  let fallbackUsed = false;
  if (selectable.length > 0) {
    const variantSeed = `${definition.id}|${normalizedRequest.faction ?? 'shared'}|${normalizedRequest.variantKey ?? 'default'}`;
    assetId = selectable[stableHash(variantSeed) % selectable.length];
  } else if (definition.missingAsset.policy === 'silent') {
    return rejection(normalizedRequest, definition, 'silent');
  } else if (definition.missingAsset.policy === 'fallback') {
    const fallbackAvailable = available === null || available.has(definition.missingAsset.assetId);
    if (fallbackAvailable) {
      assetId = definition.missingAsset.assetId;
      fallbackUsed = true;
    }
  }
  if (!assetId) return rejection(normalizedRequest, definition, 'missing-asset');

  return deepFreeze({
    ok: true,
    version: AUDIO_EVENT_MAP_VERSION,
    eventId: definition.id,
    tick: normalizedRequest.tick,
    sequence: normalizedRequest.sequence,
    faction: normalizedRequest.faction,
    assetId,
    fallbackUsed,
    bus: definition.bus,
    priority: definition.priority,
    gain,
    tag: definition.tag,
    cooldownTicks: definition.cooldownTicks,
    concurrencyKey: definition.concurrency.key,
    maxConcurrent: definition.concurrency.limit,
  });
}

export function selectAudioAdmissions(events, {
  availableVoiceSlots,
  activeCounts = null,
  lastPlayedTicks = null,
} = {}) {
  if (!Array.isArray(events)) throw new TypeError('Resolved audio events must be an array.');
  const slotCount = integer(availableVoiceSlots, 'Audio availableVoiceSlots');
  if (activeCounts !== null) plainObject(activeCounts, 'Audio admission activeCounts');
  if (lastPlayedTicks !== null) plainObject(lastPlayedTicks, 'Audio admission lastPlayedTicks');
  for (const [index, event] of events.entries()) {
    plainObject(event, `Resolved audio event ${index}`);
    if (event.ok !== true) throw new TypeError(`Resolved audio event ${index} must be successful.`);
    integer(event.priority, `Resolved audio event ${index}.priority`);
    integer(event.sequence, `Resolved audio event ${index}.sequence`);
    integer(event.tick, `Resolved audio event ${index}.tick`);
    integer(event.cooldownTicks, `Resolved audio event ${index}.cooldownTicks`);
    integer(event.maxConcurrent, `Resolved audio event ${index}.maxConcurrent`, 1);
    stableId(event.eventId, `Resolved audio event ${index}.eventId`);
    stableId(event.assetId, `Resolved audio event ${index}.assetId`);
    stableId(event.concurrencyKey, `Resolved audio event ${index}.concurrencyKey`);
  }
  const ranked = [...events].sort((left, right) =>
    right.priority - left.priority
    || left.sequence - right.sequence
    || left.eventId.localeCompare(right.eventId)
    || left.assetId.localeCompare(right.assetId));
  const accepted = [];
  const rejected = [];
  const admittedCounts = new Map();
  const admittedTicks = new Map();

  for (const event of ranked) {
    const priorTick = admittedTicks.has(event.eventId)
      ? admittedTicks.get(event.eventId)
      : readCounter(lastPlayedTicks, event.eventId, 'Audio admission lastPlayedTicks');
    if (priorTick !== null) {
      if (priorTick > event.tick) throw new RangeError(`Audio admission last-played tick for ${event.eventId} is in the future.`);
      const retryAtTick = priorTick + event.cooldownTicks;
      if (event.tick < retryAtTick) {
        rejected.push({ event, reason: 'cooldown', retryAtTick });
        continue;
      }
    }

    const initiallyActive = readCounter(activeCounts, event.concurrencyKey, 'Audio admission activeCounts') ?? 0;
    const admitted = admittedCounts.get(event.concurrencyKey) ?? 0;
    if (initiallyActive + admitted >= event.maxConcurrent) {
      rejected.push({
        event,
        reason: 'concurrency-limit',
        concurrencyKey: event.concurrencyKey,
        maxConcurrent: event.maxConcurrent,
      });
      continue;
    }

    if (accepted.length >= slotCount) {
      rejected.push({ event, reason: 'voice-capacity' });
      continue;
    }

    accepted.push(event);
    admittedCounts.set(event.concurrencyKey, admitted + 1);
    admittedTicks.set(event.eventId, event.tick);
  }

  return deepFreeze({ accepted, rejected });
}
