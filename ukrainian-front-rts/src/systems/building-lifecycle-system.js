import { BUILDING_TYPES, TEAM } from '../config.js';

export const BUILDING_LIFECYCLE_VERSION = 1;

export const BUILDING_LIFECYCLE_PHASES = Object.freeze({
  CONSTRUCTION: 'construction',
  OPERATIONAL: 'operational',
  CAPTURING: 'capturing',
  SOLD: 'sold',
  SCUTTLED: 'scuttled',
  DESTROYED: 'destroyed',
  RUBBLE: 'rubble',
  CLEARED: 'cleared',
});

export const BUILDING_CONSTRUCTION_STAGES = Object.freeze({
  FOUNDATION: 'foundation',
  FRAME: 'frame',
  FITOUT: 'fitout',
  COMPLETE: 'complete',
});

export const BUILDING_LIFECYCLE_RESULTS = Object.freeze({
  READY: 'ready', STARTED: 'started', PROGRESSED: 'progressed', COMPLETED: 'completed',
  PAUSED: 'paused', SOLD: 'sold', SCUTTLED: 'scuttled', DESTROYED: 'destroyed',
  INVALID_BUILDING: 'invalid-building', INVALID_STATE: 'invalid-state', WRONG_TEAM: 'wrong-team',
  NOT_CAPTURABLE: 'not-capturable', CONTESTED: 'contested', QUEUE_NOT_EMPTY: 'queue-not-empty',
  UNAVAILABLE: 'unavailable',
});

export const DEFAULT_BUILDING_LIFECYCLE_POLICY = Object.freeze({
  captureSeconds: 8,
  captureRange: 72,
  captureDecayPerSecond: 0.5,
  sellRefundRatio: 0.5,
  sellIntegrityFloor: 0.25,
  scuttleCreatesWreck: true,
  constructionRepairRatios: Object.freeze({
    foundation: 0.25,
    frame: 0.65,
    fitout: 0.95,
    complete: 1,
  }),
});

const TERMINAL_PHASES = new Set(['sold', 'scuttled', 'destroyed', 'rubble', 'cleared']);
const EPSILON = 1e-9;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function stableId(value, label = 'entity') {
  if (value == null || String(value).length === 0) throw new TypeError(`${label} requires a stable id.`);
  return String(value);
}

function finiteNonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} must be non-negative.`);
  return number;
}

function finitePositive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new TypeError(`${label} must be positive.`);
  return number;
}

function sortedResources(record = {}) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('Resource record must be an object.');
  return deepFreeze(Object.fromEntries(
    Object.entries(record)
      .map(([key, value]) => [key, finiteNonNegative(value, `Resource ${key}`)])
      .filter(([, value]) => value > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  ));
}

function buildingStats(building) {
  return BUILDING_TYPES[building?.type] ?? null;
}

function buildingCost(building) {
  return sortedResources(building?.cost ?? buildingStats(building)?.cost ?? {});
}

function buildingCapacity(building) {
  if (Number.isFinite(building?.commandCapacity)) return Math.max(0, building.commandCapacity);
  return Math.max(0, buildingStats(building)?.pop || 0);
}

function constructionFraction(building) {
  if (!building?.underConstruction) return 1;
  const progress = building.constructionProgress;
  if (progress && Number.isFinite(progress.requiredWork) && progress.requiredWork > 0) {
    return Math.max(0, Math.min(1, Number(progress.completedWork ?? progress.appliedWork ?? 0) / progress.requiredWork));
  }
  if (Number.isFinite(building.hp) && Number.isFinite(building.maxHp) && building.maxHp > 0) {
    return Math.max(0, Math.min(1, building.hp / building.maxHp));
  }
  return 0;
}

export function buildingConstructionStage(building) {
  const fraction = constructionFraction(building);
  if (fraction >= 1 - EPSILON) return BUILDING_CONSTRUCTION_STAGES.COMPLETE;
  if (fraction < 0.25) return BUILDING_CONSTRUCTION_STAGES.FOUNDATION;
  if (fraction < 0.65) return BUILDING_CONSTRUCTION_STAGES.FRAME;
  return BUILDING_CONSTRUCTION_STAGES.FITOUT;
}

export function buildingRepairEnvelope(building, policy = DEFAULT_BUILDING_LIFECYCLE_POLICY) {
  if (!building || !Number.isFinite(building.hp) || !Number.isFinite(building.maxHp)) {
    throw new TypeError('Repair envelope requires building hp and maxHp.');
  }
  const stage = buildingConstructionStage(building);
  const maxRepairHp = Math.max(1, Math.floor(building.maxHp * policy.constructionRepairRatios[stage]));
  const currentHp = Math.max(0, Math.min(building.hp, building.maxHp));
  return deepFreeze({
    stage,
    currentHp,
    maxRepairHp,
    missingHp: Math.max(0, maxRepairHp - currentHp),
    repairable: currentHp > 0 && currentHp < maxRepairHp,
    constructionLimited: stage !== BUILDING_CONSTRUCTION_STAGES.COMPLETE,
  });
}

function normalizeBuilding(building) {
  if (!building || typeof building !== 'object') throw new TypeError('Building lifecycle requires a building.');
  const stats = buildingStats(building);
  const maxHp = finitePositive(building.maxHp, 'Building maxHp');
  if (!Number.isFinite(building.x) || !Number.isFinite(building.y)) throw new TypeError('Building requires finite coordinates.');
  return {
    id: stableId(building.id, 'Building'), type: building.type, team: building.team,
    hp: Math.max(0, Math.min(maxHp, finiteNonNegative(building.hp, 'Building hp'))), maxHp,
    x: building.x, y: building.y,
    radius: Math.max(0, Number(building.radius ?? Math.max(stats?.w || 0, stats?.h || 0) / 2)),
    footprint: building.placement?.footprint ?? building.footprint ?? null,
    cost: buildingCost(building), capacity: buildingCapacity(building),
    underConstruction: Boolean(building.underConstruction),
    capacityGranted: building.capacityGranted !== false,
  };
}

function event(type, state, details = {}) {
  return deepFreeze({ type, buildingId: state.buildingId, sequence: state.sequence, ...details });
}

function result(state, events = [], extra = {}) {
  return deepFreeze({ state: deepFreeze(state), events: deepFreeze([...events]), ...extra });
}

export function createBuildingLifecycleState(building) {
  const normalized = normalizeBuilding(building);
  const destroyed = normalized.hp <= 0;
  return deepFreeze({
    version: BUILDING_LIFECYCLE_VERSION,
    buildingId: normalized.id,
    phase: destroyed ? 'destroyed' : normalized.underConstruction ? 'construction' : 'operational',
    ownerTeam: normalized.team,
    capture: null,
    capacityActive: !destroyed && !normalized.underConstruction && normalized.capacityGranted && normalized.capacity > 0,
    sold: null, scuttle: null, destruction: null, rubble: null,
    sequence: 0,
    lastTransition: destroyed ? 'initialized-destroyed' : 'initialized',
  });
}

function assertState(state, building = null) {
  if (!state || state.version !== BUILDING_LIFECYCLE_VERSION || !Object.values(BUILDING_LIFECYCLE_PHASES).includes(state.phase)) {
    throw new TypeError('Building lifecycle state is invalid.');
  }
  if (building && stableId(building.id, 'Building') !== state.buildingId) throw new TypeError('Lifecycle state does not match building.');
}

const activeQueue = (building) => Array.isArray(building?.queue) && building.queue.length > 0;

export function buildingCaptureEligibility(state, building, team) {
  assertState(state, building);
  if (TERMINAL_PHASES.has(state.phase)) return deepFreeze({ ok: false, reason: 'invalid-state' });
  if (building.hp <= 0 || building.underConstruction) return deepFreeze({ ok: false, reason: 'unavailable' });
  if (building.captureEligible === false || buildingStats(building)?.captureEligible === false) {
    return deepFreeze({ ok: false, reason: 'not-capturable' });
  }
  if (building.team === team) return deepFreeze({ ok: false, reason: 'wrong-team' });
  if (activeQueue(building)) return deepFreeze({ ok: false, reason: 'queue-not-empty' });
  return deepFreeze({ ok: true, reason: 'ready' });
}

function normalizedUnitIds(units) {
  return deepFreeze([...new Set((units || []).map((unit) => stableId(unit?.id, 'Capturer')))].sort());
}

export function beginBuildingCapture(state, building, team, units, policy = DEFAULT_BUILDING_LIFECYCLE_POLICY) {
  const eligibility = buildingCaptureEligibility(state, building, team);
  if (!eligibility.ok) return result(state, [], { ok: false, reason: eligibility.reason });
  const unitIds = normalizedUnitIds(units);
  if (!unitIds.length) return result(state, [], { ok: false, reason: 'unavailable' });
  const requiredSeconds = finitePositive(building.captureSeconds ?? policy.captureSeconds, 'Capture duration');
  const next = {
    ...state,
    phase: 'capturing',
    capture: deepFreeze({ team, unitIds, progressSeconds: 0, requiredSeconds, contested: false }),
    sequence: state.sequence + 1,
    lastTransition: 'capture-started',
  };
  return result(next, [event('capture-started', next, { team, unitIds, requiredSeconds })], { ok: true, reason: 'started' });
}

const inRange = (building, unit, range) => Math.hypot(unit.x - building.x, unit.y - building.y) <= range + EPSILON;

export function advanceBuildingCapture(state, building, elapsedSeconds, context = {}, policy = DEFAULT_BUILDING_LIFECYCLE_POLICY) {
  assertState(state, building);
  const elapsed = finiteNonNegative(elapsedSeconds, 'Capture elapsedSeconds');
  if (state.phase !== 'capturing' || !state.capture) return result(state, [], { reason: 'invalid-state' });
  const range = finitePositive(context.captureRange ?? policy.captureRange, 'Capture range');
  const units = context.units || [];
  const capturers = units.filter((unit) => state.capture.unitIds.includes(String(unit.id)) && unit.team === state.capture.team && unit.hp > 0 && inRange(building, unit, range));
  const contested = units.some((unit) => unit.team !== state.capture.team && unit.hp > 0 && inRange(building, unit, range));
  let progressSeconds = state.capture.progressSeconds;
  let reason = 'progressed';
  if (contested) reason = 'contested';
  else if (!capturers.length) {
    progressSeconds = Math.max(0, progressSeconds - elapsed * policy.captureDecayPerSecond);
    reason = 'paused';
  } else progressSeconds = Math.min(state.capture.requiredSeconds, progressSeconds + elapsed);
  if (progressSeconds >= state.capture.requiredSeconds - EPSILON) {
    const previousTeam = state.ownerTeam;
    const next = {
      ...state, phase: 'operational', ownerTeam: state.capture.team, capture: null,
      capacityActive: buildingCapacity(building) > 0,
      sequence: state.sequence + 1, lastTransition: 'capture-completed',
    };
    return result(next, [event('capture-completed', next, { previousTeam, team: next.ownerTeam, capacity: buildingCapacity(building) })], {
      reason: 'completed', ownerChanged: true,
    });
  }
  const next = {
    ...state,
    capture: deepFreeze({ ...state.capture, progressSeconds, contested }),
    sequence: state.sequence + (elapsed > 0 ? 1 : 0),
    lastTransition: contested ? 'capture-contested' : capturers.length ? 'capture-progressed' : 'capture-decayed',
  };
  return result(next, elapsed > 0 ? [event(next.lastTransition, next, { progressSeconds, contested })] : [], { reason });
}

function actionEligibility(state, building, team, { allowConstruction = false } = {}) {
  assertState(state, building);
  if (TERMINAL_PHASES.has(state.phase)) return 'invalid-state';
  if (building.team !== team) return 'wrong-team';
  if (building.hp <= 0 || (!allowConstruction && building.underConstruction) || state.phase === 'capturing') return 'unavailable';
  if (activeQueue(building)) return 'queue-not-empty';
  return 'ready';
}

function scaledRefund(cost, ratio) {
  return deepFreeze(Object.fromEntries(Object.entries(cost).map(([resource, value]) => [resource, Math.floor(value * ratio)]).filter(([, value]) => value > 0)));
}

export function sellBuilding(state, building, team, policy = DEFAULT_BUILDING_LIFECYCLE_POLICY) {
  const eligibility = actionEligibility(state, building, team);
  if (eligibility !== 'ready') return result(state, [], { ok: false, reason: eligibility, refund: deepFreeze({}) });
  const normalized = normalizeBuilding(building);
  const integrity = Math.max(policy.sellIntegrityFloor, normalized.hp / normalized.maxHp);
  const refund = scaledRefund(normalized.cost, policy.sellRefundRatio * integrity);
  const sold = deepFreeze({ refund, integrity, team, capacityReleased: state.capacityActive ? normalized.capacity : 0 });
  const next = { ...state, phase: 'sold', sold, capacityActive: false, sequence: state.sequence + 1, lastTransition: 'sold' };
  return result(next, [event('building-sold', next, sold)], { ok: true, reason: 'sold', refund, capacityReleased: sold.capacityReleased });
}

function destructionEntity(building) {
  const normalized = normalizeBuilding(building);
  return deepFreeze({
    id: normalized.id, team: normalized.team, domain: 'structure', maxHp: normalized.maxHp, hp: 0,
    position: deepFreeze({ x: normalized.x, y: normalized.y }), radius: normalized.radius,
    footprint: normalized.footprint ? deepFreeze({ ...normalized.footprint }) : null,
    cost: normalized.cost,
  });
}

export function scuttleBuilding(state, building, team, policy = DEFAULT_BUILDING_LIFECYCLE_POLICY) {
  const eligibility = actionEligibility(state, building, team, { allowConstruction: true });
  if (eligibility !== 'ready') return result(state, [], { ok: false, reason: eligibility });
  const entity = destructionEntity(building);
  const scuttle = deepFreeze({
    team, createsWreck: policy.scuttleCreatesWreck,
    capacityReleased: state.capacityActive ? buildingCapacity(building) : 0,
    destructionEntity: entity,
  });
  const next = { ...state, phase: 'scuttled', scuttle, capacityActive: false, sequence: state.sequence + 1, lastTransition: 'scuttled' };
  return result(next, [event('building-scuttled', next, scuttle)], {
    ok: true, reason: 'scuttled', destructionEntity: entity, capacityReleased: scuttle.capacityReleased,
  });
}

export function transitionDestroyedBuilding(state, building) {
  assertState(state, building);
  if (state.phase === 'rubble') return result(state, [], { reason: null });
  if (building.hp > 0 && state.phase !== 'scuttled') return result(state, [], { reason: 'unavailable' });
  const entity = state.scuttle?.destructionEntity ?? destructionEntity(building);
  const next = {
    ...state, phase: 'destroyed',
    destruction: deepFreeze({ entity, capacityReleased: state.capacityActive ? buildingCapacity(building) : 0 }),
    capacityActive: false, sequence: state.sequence + 1, lastTransition: 'destroyed',
  };
  return result(next, [event('building-destroyed', next, { destructionEntity: entity })], { reason: 'destroyed', destructionEntity: entity });
}

export function materializeBuildingRubble(state, wreck) {
  assertState(state);
  if (!['destroyed', 'scuttled'].includes(state.phase)) return result(state, [], { reason: 'invalid-state' });
  if (!wreck || typeof wreck !== 'object' || wreck.id == null) throw new TypeError('Rubble transition requires a wreck descriptor.');
  const next = { ...state, phase: 'rubble', rubble: deepFreeze({ ...wreck }), capacityActive: false, sequence: state.sequence + 1, lastTransition: 'rubble-created' };
  return result(next, [event('building-rubble-created', next, { rubble: next.rubble })], { reason: null });
}

export function buildingLifecycleSnapshot(state, building) {
  assertState(state, building);
  const repair = buildingRepairEnvelope(building);
  return deepFreeze({
    version: BUILDING_LIFECYCLE_VERSION, buildingId: state.buildingId, phase: state.phase,
    ownerTeam: state.ownerTeam, constructionStage: repair.stage, repair, capture: state.capture,
    capacityActive: state.capacityActive,
    sellable: actionEligibility(state, building, building.team) === 'ready',
    scuttleAvailable: actionEligibility(state, building, building.team, { allowConstruction: true }) === 'ready',
    rubble: state.rubble,
  });
}

function lifecycleStateFor(building) {
  if (!building.buildingLifecycleState) building.buildingLifecycleState = createBuildingLifecycleState(building);
  return building.buildingLifecycleState;
}

function reconcileCapacity(game, reason) {
  if (typeof game.reconcileCommandCapacity === 'function') game.reconcileCommandCapacity(reason);
  else if (game.player) {
    game.player.cap = Math.max(0, (game.player.commandCapacityBase ?? 0) + (game.buildings || [])
      .filter((building) => building.team === TEAM.UA && building.hp > 0 && !building.underConstruction && building.capacityGranted !== false)
      .reduce((sum, building) => sum + buildingCapacity(building), 0));
  }
}

function addResources(player, resources) {
  for (const [resource, value] of Object.entries(resources || {})) player[resource] = (player[resource] || 0) + value;
}

function removeBuilding(game, building) {
  const index = game.buildings.indexOf(building);
  if (index >= 0) game.buildings.splice(index, 1);
  game.selected?.delete?.(building.id);
  building.selected = false;
}

function createWreck(game, state, building, destructionApi) {
  const destroyed = transitionDestroyedBuilding(state, building);
  let wreck = {
    id: `${building.id}:rubble`, sourceEntityId: String(building.id), position: { x: building.x, y: building.y },
    hp: Math.max(1, Math.ceil(building.maxHp * 0.3)), maxHp: Math.max(1, Math.ceil(building.maxHp * 0.3)),
    obstruction: { blocksMovement: true, blocksLineOfSight: false, cleared: false },
  };
  if (destructionApi?.createDestructionState && destructionApi?.materializeWreck) {
    const destructionState = destructionApi.createDestructionState(destroyed.destructionEntity);
    wreck = destructionApi.materializeWreck(destructionState, destroyed.destructionEntity).state.wreck;
  }
  const rubble = materializeBuildingRubble(destroyed.state, wreck);
  game.buildingWrecks ??= [];
  game.buildingWrecks.push(rubble.state.rubble);
  return rubble;
}

export function updateBuildingCaptures(game, elapsedSeconds, policy = DEFAULT_BUILDING_LIFECYCLE_POLICY) {
  const records = [];
  for (const building of [...(game.buildings || [])].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
    const state = lifecycleStateFor(building);
    if (state.phase !== 'capturing') continue;
    const advanced = advanceBuildingCapture(state, building, elapsedSeconds, { units: game.units || [] }, policy);
    building.buildingLifecycleState = advanced.state;
    if (advanced.ownerChanged) {
      building.team = advanced.state.ownerTeam;
      building.capacityGranted = !building.underConstruction;
      reconcileCapacity(game, 'building-captured');
    }
    records.push(...advanced.events);
  }
  game.buildingLifecycleEvents ??= [];
  game.buildingLifecycleEvents.push(...records);
  return deepFreeze(records);
}

export function createBuildingLifecycleController(game, { policy = DEFAULT_BUILDING_LIFECYCLE_POLICY, destructionApi = null } = {}) {
  for (const method of ['start', 'addBuilding', 'update', 'removeDestroyedEntities', 'selectedEntities', 'selectedUnits', 'fail']) {
    if (typeof game?.[method] !== 'function') throw new TypeError(`Building lifecycle controller requires game.${method}().`);
  }
  const originalStart = game.start.bind(game);
  const originalAddBuilding = game.addBuilding.bind(game);
  const originalUpdate = game.update.bind(game);
  const originalCleanup = game.removeDestroyedEntities.bind(game);
  game.buildingLifecyclePolicy = policy;
  game.buildingLifecycleEvents = [];
  game.buildingWrecks = [];
  game.addBuilding = (...args) => {
    const building = originalAddBuilding(...args);
    building.buildingLifecycleState = createBuildingLifecycleState(building);
    return building;
  };
  game.start = (...args) => {
    const value = originalStart(...args);
    game.buildingLifecycleEvents = [];
    game.buildingWrecks = [];
    game.buildings.forEach((building) => { building.buildingLifecycleState = createBuildingLifecycleState(building); });
    return value;
  };
  game.update = (elapsedSeconds) => {
    const value = originalUpdate(elapsedSeconds);
    updateBuildingCaptures(game, elapsedSeconds, policy);
    return value;
  };
  game.removeDestroyedEntities = () => {
    for (const building of game.buildings.filter((candidate) => candidate.hp <= 0)) {
      const rubble = createWreck(game, lifecycleStateFor(building), building, destructionApi);
      building.buildingLifecycleState = rubble.state;
      game.buildingLifecycleEvents.push(...rubble.events);
    }
    const value = originalCleanup();
    reconcileCapacity(game, 'building-destroyed');
    return value;
  };
  game.buildingLifecycleSnapshot = (building = game.selectedEntities()[0]) => building ? buildingLifecycleSnapshot(lifecycleStateFor(building), building) : null;
  game.beginBuildingCapture = (building, team = TEAM.UA, units = game.selectedUnits()) => {
    game.lastError = '';
    if (!building || !(game.buildings || []).includes(building)) return game.fail('Select a valid building to capture.');
    const started = beginBuildingCapture(lifecycleStateFor(building), building, team, units, policy);
    if (!started.ok) return game.fail(`Building capture unavailable: ${started.reason}.`);
    building.buildingLifecycleState = started.state;
    game.buildingLifecycleEvents.push(...started.events);
    return true;
  };
  game.sellBuilding = (building = game.selectedEntities()[0]) => {
    game.lastError = '';
    if (!building || !(game.buildings || []).includes(building)) return game.fail('Select a valid building to sell.');
    const sold = sellBuilding(lifecycleStateFor(building), building, TEAM.UA, policy);
    if (!sold.ok) return game.fail(`Building cannot be sold: ${sold.reason}.`);
    building.buildingLifecycleState = sold.state;
    addResources(game.player, sold.refund);
    removeBuilding(game, building);
    game.buildingLifecycleEvents.push(...sold.events);
    reconcileCapacity(game, 'building-sold');
    return sold;
  };
  game.scuttleBuilding = (building = game.selectedEntities()[0]) => {
    game.lastError = '';
    if (!building || !(game.buildings || []).includes(building)) return game.fail('Select a valid building to scuttle.');
    const scuttled = scuttleBuilding(lifecycleStateFor(building), building, TEAM.UA, policy);
    if (!scuttled.ok) return game.fail(`Building cannot be scuttled: ${scuttled.reason}.`);
    building.hp = 0;
    const rubble = createWreck(game, scuttled.state, building, destructionApi);
    building.buildingLifecycleState = rubble.state;
    removeBuilding(game, building);
    game.buildingLifecycleEvents.push(...scuttled.events, ...rubble.events);
    reconcileCapacity(game, 'building-scuttled');
    return deepFreeze({ ...scuttled, rubble: rubble.state.rubble });
  };
  game.drainBuildingLifecycleEvents = () => {
    const records = deepFreeze([...(game.buildingLifecycleEvents || [])]);
    game.buildingLifecycleEvents.length = 0;
    return records;
  };
  return () => {
    game.start = originalStart; game.addBuilding = originalAddBuilding; game.update = originalUpdate; game.removeDestroyedEntities = originalCleanup;
    delete game.buildingLifecycleSnapshot; delete game.beginBuildingCapture; delete game.sellBuilding; delete game.scuttleBuilding;
    delete game.drainBuildingLifecycleEvents; delete game.buildingLifecyclePolicy; delete game.buildingLifecycleEvents; delete game.buildingWrecks;
  };
}
