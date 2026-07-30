export const OBJECTIVE_LIBRARY_VERSION = 1;
export const OBJECTIVE_TYPES = Object.freeze([
  'build', 'gather', 'capture', 'escort', 'defend', 'survive',
  'destroy', 'disable', 'rescue', 'recon', 'extract',
]);
export const OBJECTIVE_STATUSES = Object.freeze({ ACTIVE: 'active', COMPLETE: 'complete', FAILED: 'failed' });

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const COLLECTIONS = new Set(['units', 'buildings', 'entities']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function plain(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function stableId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must be a stable identifier.`);
  return value;
}

function finite(value, label, { min = -Infinity } = {}) {
  if (!Number.isFinite(value) || value < min) throw new TypeError(`${label} must be a finite number >= ${min}.`);
  return value;
}

function selector(value = {}, label = 'selector') {
  plain(value, label);
  const collection = value.collection ?? 'entities';
  if (!COLLECTIONS.has(collection)) throw new RangeError(`${label}.collection is invalid.`);
  const result = { collection };
  if (value.id !== undefined) result.id = value.id;
  for (const key of ['scriptId', 'type', 'tag']) if (value[key] !== undefined) result[key] = stableId(value[key], `${label}.${key}`);
  if (value.team !== undefined) result.team = value.team;
  return result;
}

function normalizeRegion(value, label) {
  if (value == null) return null;
  plain(value, label);
  const shape = value.shape ?? 'rect';
  const result = { shape, x: finite(value.x, `${label}.x`), y: finite(value.y, `${label}.y`) };
  if (shape === 'circle') result.radius = finite(value.radius, `${label}.radius`, { min: 0 });
  else if (shape === 'rect') {
    result.width = finite(value.width, `${label}.width`, { min: 0 });
    result.height = finite(value.height, `${label}.height`, { min: 0 });
  } else throw new RangeError(`${label}.shape is invalid.`);
  return result;
}

function needsTarget(type) {
  return ['build','capture','escort','defend','destroy','disable','rescue','extract'].includes(type);
}

export function createObjectiveDefinition(value) {
  plain(value, 'Objective definition');
  const type = value.type;
  if (!OBJECTIVE_TYPES.includes(type)) throw new RangeError(`Unknown objective type: ${type}`);
  const result = {
    version: OBJECTIVE_LIBRARY_VERSION,
    id: stableId(value.id, 'Objective id'),
    type,
    label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : value.id,
    optional: Boolean(value.optional),
    hidden: Boolean(value.hidden),
    failOnTimeout: value.failOnTimeout !== false,
    timeLimitSeconds: value.timeLimitSeconds == null ? null : finite(value.timeLimitSeconds, 'Objective timeLimitSeconds', { min: 0 }),
    count: Math.max(1, Math.floor(value.count ?? 1)),
    durationSeconds: finite(value.durationSeconds ?? 0, 'Objective durationSeconds', { min: 0 }),
    target: needsTarget(type) ? selector(value.target, 'Objective target') : null,
    observer: type === 'recon' ? selector(value.observer ?? {}, 'Objective observer') : null,
    regionId: value.regionId == null ? null : stableId(value.regionId, 'Objective regionId'),
    region: normalizeRegion(value.region, 'Objective region'),
    resource: value.resource == null ? null : stableId(value.resource, 'Objective resource'),
    amount: finite(value.amount ?? (type === 'gather' ? 1 : 0), 'Objective amount', { min: 0 }),
    ownerTeam: value.ownerTeam ?? null,
    disableThreshold: finite(value.disableThreshold ?? 0.35, 'Objective disableThreshold', { min: 0 }),
    failIfTargetLost: value.failIfTargetLost ?? ['escort','defend','rescue','extract'].includes(type),
    failureReason: typeof value.failureReason === 'string' && value.failureReason.trim()
      ? value.failureReason.trim()
      : `${value.label || value.id} failed.`,
  };
  if (result.disableThreshold > 1) throw new RangeError('Objective disableThreshold must not exceed 1.');
  if (type === 'gather' && !result.resource) throw new Error('Gather objectives require resource.');
  if (['capture','escort','defend','rescue','recon','extract'].includes(type) && !result.regionId && !result.region) {
    throw new Error(`${type} objectives require regionId or region.`);
  }
  if (type === 'capture' && result.ownerTeam === null) throw new Error('Capture objectives require ownerTeam.');
  return deepFreeze(result);
}

export function validateObjectiveDefinitions(values) {
  if (!Array.isArray(values) || !values.length) throw new TypeError('Objective definitions must be a non-empty array.');
  const definitions = values.map(createObjectiveDefinition);
  const ids = new Set();
  for (const definition of definitions) {
    if (ids.has(definition.id)) throw new Error(`Duplicate objective id: ${definition.id}`);
    ids.add(definition.id);
  }
  return deepFreeze(definitions);
}

function entities(game, collection = 'entities') {
  if (collection === 'units') return game.units || [];
  if (collection === 'buildings') return game.buildings || [];
  return [...(game.units || []), ...(game.buildings || [])];
}

function matches(entity, match) {
  if (match.id !== undefined && entity.id !== match.id) return false;
  if (match.scriptId !== undefined && entity.scriptId !== match.scriptId) return false;
  if (match.type !== undefined && entity.type !== match.type) return false;
  if (match.team !== undefined && entity.team !== match.team) return false;
  if (match.tag !== undefined && entity.scriptTag !== match.tag && !(entity.tags || []).includes(match.tag)) return false;
  return true;
}

const alive = (entity) => entity.hp === undefined || entity.hp > 0;

function regionFor(game, definition) {
  if (definition.region) return definition.region;
  return game.missionScript?.regions?.find((region) => region.id === definition.regionId)
    || game.mission?.regions?.find((region) => region.id === definition.regionId)
    || null;
}

function inside(region, entity) {
  if (!region || !Number.isFinite(entity?.x) || !Number.isFinite(entity?.y)) return false;
  if (region.shape === 'circle') return Math.hypot(entity.x - region.x, entity.y - region.y) <= region.radius;
  return entity.x >= region.x && entity.x <= region.x + region.width
    && entity.y >= region.y && entity.y <= region.y + region.height;
}

function targetEntities(game, definition) {
  return entities(game, definition.target?.collection).filter((entity) => matches(entity, definition.target));
}

function rememberTargets(runtime, found) {
  for (const entity of found) {
    if (entity.id !== undefined) runtime.seenIds.add(`id:${entity.id}`);
    if (entity.scriptId !== undefined) runtime.seenIds.add(`script:${entity.scriptId}`);
  }
}

function targetLost(runtime, found) {
  return runtime.seenIds.size > 0 && !found.some(alive);
}

function metric(game, definition, runtime, now) {
  const found = definition.target ? targetEntities(game, definition) : [];
  rememberTargets(runtime, found);
  const living = found.filter(alive);
  const region = regionFor(game, definition);
  let current = 0;
  let complete = false;
  let failed = false;

  if (definition.type === 'build') {
    current = living.filter((entity) => entity.underConstruction === false).length;
    complete = current >= definition.count;
  } else if (definition.type === 'gather') {
    current = Number(game.objectiveMetrics?.gathered?.[definition.resource]
      ?? (definition.resource === 'all' ? game.player?.mined : game.player?.[definition.resource])) || 0;
    complete = current >= definition.amount;
  } else if (definition.type === 'capture') {
    current = living.filter((entity) => entity.team === definition.ownerTeam && inside(region, entity)).length;
    complete = current >= definition.count;
  } else if (definition.type === 'escort' || definition.type === 'rescue' || definition.type === 'extract') {
    current = living.filter((entity) => inside(region, entity)).length;
    complete = current >= definition.count;
    failed = definition.failIfTargetLost && targetLost(runtime, found);
  } else if (definition.type === 'defend') {
    current = living.length;
    failed = definition.failIfTargetLost && targetLost(runtime, found);
    complete = !failed && now - runtime.startedAt >= definition.durationSeconds;
  } else if (definition.type === 'survive') {
    current = Math.max(0, now - runtime.startedAt);
    complete = current >= definition.durationSeconds;
  } else if (definition.type === 'destroy') {
    const external = Number(game.objectiveMetrics?.destroyed?.[definition.id]);
    current = Number.isFinite(external) ? external : runtime.seenIds.size > 0 && !found.some(alive) ? runtime.seenIds.size : 0;
    complete = current >= definition.count;
  } else if (definition.type === 'disable') {
    current = found.filter((entity) => alive(entity) && (
      entity.disabled === true || entity.burning === true ||
      (Number.isFinite(entity.hp) && Number.isFinite(entity.maxHp) && entity.maxHp > 0 && entity.hp / entity.maxHp <= definition.disableThreshold)
    )).length;
    complete = current >= definition.count;
  } else if (definition.type === 'recon') {
    const marked = Boolean(game.reconRegions?.has?.(definition.regionId) || game.objectiveMetrics?.recon?.[definition.regionId]);
    current = marked ? definition.count : entities(game, definition.observer.collection)
      .filter((entity) => alive(entity) && matches(entity, definition.observer) && inside(region, entity)).length;
    complete = current >= definition.count;
  }
  return { current, complete, failed };
}

function progressFor(definition, current) {
  const target = definition.type === 'gather' ? definition.amount
    : ['defend','survive'].includes(definition.type) ? definition.durationSeconds
      : definition.count;
  return target <= 0 ? 1 : Math.max(0, Math.min(1, current / target));
}

export function createObjectiveLibraryState(definitions, { missionId = null, startedAt = 0 } = {}) {
  const normalized = validateObjectiveDefinitions(definitions);
  return {
    version: OBJECTIVE_LIBRARY_VERSION,
    missionId,
    definitions: normalized,
    runtime: Object.fromEntries(normalized.map((definition) => [definition.id, {
      status: OBJECTIVE_STATUSES.ACTIVE,
      startedAt,
      completedAt: null,
      failedAt: null,
      seenIds: new Set(),
    }])),
  };
}

function ensureState(game) {
  const definitions = game.mission?.objectiveDefinitions;
  if (!definitions?.length) return null;
  if (!game.objectiveLibraryState || game.objectiveLibraryState.missionId !== game.mission.id) {
    game.objectiveLibraryState = createObjectiveLibraryState(definitions, {
      missionId: game.mission.id,
      startedAt: Number(game.time) || 0,
    });
  }
  return game.objectiveLibraryState;
}

export function updateObjectiveLibrary(game) {
  if (!game || typeof game !== 'object') throw new TypeError('Objective library requires game state.');
  const state = ensureState(game);
  if (!state) return null;
  const now = Number(game.time) || 0;
  const results = [];

  for (const definition of state.definitions) {
    const runtime = state.runtime[definition.id];
    if (runtime.status === OBJECTIVE_STATUSES.ACTIVE) {
      const value = metric(game, definition, runtime, now);
      value.failed ||= Boolean(game.objectiveMetrics?.failed?.[definition.id]);
      const timedOut = definition.timeLimitSeconds !== null
        && now - runtime.startedAt > definition.timeLimitSeconds;
      if (value.complete) {
        runtime.status = OBJECTIVE_STATUSES.COMPLETE;
        runtime.completedAt = now;
      } else if (value.failed || (timedOut && definition.failOnTimeout)) {
        runtime.status = OBJECTIVE_STATUSES.FAILED;
        runtime.failedAt = now;
      }
      runtime.current = value.current;
      runtime.timedOut = timedOut;
    }
    const current = Number(runtime.current) || 0;
    results.push(deepFreeze({
      id: definition.id,
      type: definition.type,
      label: definition.label,
      optional: definition.optional,
      hidden: definition.hidden,
      status: runtime.status,
      complete: runtime.status === OBJECTIVE_STATUSES.COMPLETE,
      failed: runtime.status === OBJECTIVE_STATUSES.FAILED,
      progress: progressFor(definition, current),
      current,
      timeRemaining: definition.timeLimitSeconds === null
        ? null
        : Math.max(0, definition.timeLimitSeconds - (now - runtime.startedAt)),
      failureReason: runtime.status === OBJECTIVE_STATUSES.FAILED ? definition.failureReason : '',
    }));
  }

  const required = results.filter((result) => !result.optional);
  const summary = deepFreeze({
    version: OBJECTIVE_LIBRARY_VERSION,
    missionId: state.missionId,
    results,
    allRequiredComplete: required.length > 0 && required.every((result) => result.complete),
    requiredFailed: required.some((result) => result.failed),
    visibleResults: results.filter((result) => !result.hidden || result.complete || result.failed),
  });
  game.objectiveResults = summary.results;
  game.objectiveLibrarySummary = summary;
  if (game.player) game.player.objectives = summary.results.map((result) => result.complete);
  if (summary.allRequiredComplete && !game.gameOver) {
    if (game.finish) game.finish('victory', 'All required objectives are complete.');
    else Object.assign(game, { gameOver: true, outcome: 'victory', endReason: 'All required objectives are complete.' });
  } else if (summary.requiredFailed && !game.gameOver) {
    const failed = required.find((result) => result.failed);
    if (game.finish) game.finish('defeat', failed.failureReason);
    else Object.assign(game, { gameOver: true, outcome: 'defeat', endReason: failed.failureReason });
  }
  return summary;
}

export function resetObjectiveLibrary(game) {
  game.objectiveLibraryState = null;
  game.objectiveResults = [];
  game.objectiveLibrarySummary = null;
}
