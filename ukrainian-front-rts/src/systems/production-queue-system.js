import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';
import { randomBetween } from '../core/math.js';

export const MAX_PRODUCTION_QUEUE_LENGTH = 5;
export const PRODUCTION_DURATIONS = Object.freeze({
  default: 5,
  air: 7,
  armor: 9,
  hero: 12,
});

const EPSILON = 1e-9;

function durationFor(stats) {
  if (stats.hero) return PRODUCTION_DURATIONS.hero;
  if (stats.armor) return PRODUCTION_DURATIONS.armor;
  if (stats.air) return PRODUCTION_DURATIONS.air;
  return PRODUCTION_DURATIONS.default;
}

function copyCost(cost = {}) {
  return Object.fromEntries(
    Object.entries(cost).map(([resource, amount]) => [resource, Number(amount) || 0]),
  );
}

function fail(game, message, { publish = true } = {}) {
  if (publish) game.lastError = message;
  return { ok: false, reason: message };
}

function succeed(game, result = {}, { publish = true } = {}) {
  if (publish) {
    game.lastError = '';
    game.lastProductionResult = Object.freeze({ ok: true, ...result });
  }
  return { ok: true, ...result };
}

function productionBuilding(game, building = null) {
  if (building) return building;
  return game.selectedEntities?.()[0] ?? null;
}

function validProductionBuilding(game, building) {
  return Boolean(
    building &&
    building.team === TEAM.UA &&
    (game.buildings || []).includes(building) &&
    BUILDING_TYPES[building.type],
  );
}

export function ensureProductionQueueState(building) {
  if (!Array.isArray(building.queue)) building.queue = [];
  if (!Number.isInteger(building.productionNextId) || building.productionNextId < 1) {
    building.productionNextId = 1;
  }
  if (typeof building.productionPaused !== 'boolean') building.productionPaused = false;
  if (typeof building.productionRepeat !== 'boolean') building.productionRepeat = false;
  if (typeof building.productionRepeatType !== 'string') building.productionRepeatType = null;
  if (typeof building.productionRepeatBlocked !== 'string') building.productionRepeatBlocked = '';

  building.queue.forEach((item) => normalizeQueueItem(building, item));
  return building;
}

function normalizeQueueItem(building, item) {
  const stats = UNIT_TYPES[item.type];
  const duration = Number.isFinite(item.duration) && item.duration > 0
    ? item.duration
    : durationFor(stats || {});
  if (!item.id) item.id = `${building.id ?? building.type}:${building.productionNextId++}`;
  item.duration = duration;
  item.left = Number.isFinite(item.left) ? Math.max(0, Math.min(duration, item.left)) : duration;
  item.cost = copyCost(item.cost ?? stats?.cost);
  item.pop = Number.isFinite(item.pop) ? Math.max(0, item.pop) : Math.max(0, stats?.pop || 0);
  item.reserved = item.reserved !== false;
  item.started = Boolean(item.started || item.left < duration - EPSILON);
  return item;
}

function canAfford(game, cost) {
  return Object.entries(cost).every(([resource, amount]) => (game.player?.[resource] || 0) >= amount);
}

function pay(game, cost) {
  for (const [resource, amount] of Object.entries(cost)) game.player[resource] -= amount;
}

function refund(game, cost, fraction) {
  const refunded = {};
  for (const [resource, amount] of Object.entries(cost)) {
    const value = Math.max(0, Math.min(amount, Math.floor(amount * fraction + EPSILON)));
    if (!value) continue;
    game.player[resource] = (game.player[resource] || 0) + value;
    refunded[resource] = value;
  }
  return refunded;
}

function releaseReservation(game, item) {
  if (!item.reserved) return 0;
  item.reserved = false;
  const released = Math.max(0, item.pop || UNIT_TYPES[item.type]?.pop || 0);
  game.player.pop = Math.max(0, game.player.pop - released);
  return released;
}

function validateQueueRequest(game, building, type) {
  const stats = UNIT_TYPES[type];
  if (!validProductionBuilding(game, building)) {
    return fail(game, 'Select the Ukrainian production building that should train this unit.', { publish: false });
  }
  ensureProductionQueueState(building);
  if (building.underConstruction) {
    return fail(game, 'Finish constructing this facility first.', { publish: false });
  }
  if (!stats || stats.faction !== 'ukraine' || !game.buildingCanProduce?.(building, type)) {
    return fail(game, 'This facility cannot produce that unit type.', { publish: false });
  }
  if (stats.hero && game.heroAlreadyFieldedOrQueued?.(type)) {
    return fail(game, 'That command hero is already deployed or queued.', { publish: false });
  }
  if (building.queue.length >= MAX_PRODUCTION_QUEUE_LENGTH) {
    return fail(game, 'Production queue is full.', { publish: false });
  }
  const cost = copyCost(stats.cost);
  if (!canAfford(game, cost)) {
    return fail(game, 'Insufficient resources for production.', { publish: false });
  }
  const pop = Math.max(0, stats.pop || 0);
  if (game.player.pop + pop > game.player.cap) {
    return fail(game, 'Command capacity exceeded. Construct a logistics depot.', { publish: false });
  }
  return { ok: true, stats, cost, pop };
}

function enqueue(game, building, type, { publish = true, repeated = false } = {}) {
  const validation = validateQueueRequest(game, building, type);
  if (!validation.ok) return fail(game, validation.reason, { publish });

  pay(game, validation.cost);
  game.player.pop += validation.pop;
  const duration = durationFor(validation.stats);
  const item = normalizeQueueItem(building, {
    id: `${building.id ?? building.type}:${building.productionNextId++}`,
    type,
    left: duration,
    duration,
    cost: validation.cost,
    pop: validation.pop,
    reserved: true,
    started: false,
    repeated,
  });
  building.queue.push(item);
  building.productionRepeatBlocked = '';
  return succeed(game, { building, item, repeated }, { publish });
}

export function queueProduction(game, type, building = null) {
  const target = productionBuilding(game, building);
  return enqueue(game, target, type).ok;
}

export function cancelProduction(game, index = 0, building = null) {
  const target = productionBuilding(game, building);
  game.lastError = '';
  if (!validProductionBuilding(game, target)) {
    return fail(game, 'Select the Ukrainian production building whose queue should change.').ok;
  }
  ensureProductionQueueState(target);
  if (!Number.isInteger(index) || index < 0 || index >= target.queue.length) {
    return fail(game, 'Choose a valid production queue item to cancel.').ok;
  }

  const [item] = target.queue.splice(index, 1);
  const started = item.started || item.left < item.duration - EPSILON;
  const refundFraction = started ? Math.max(0, Math.min(1, item.left / item.duration)) : 1;
  const refunded = refund(game, item.cost, refundFraction);
  const releasedPop = releaseReservation(game, item);
  if (!target.queue.length) {
    target.productionPaused = false;
    target.productionRepeat = false;
    target.productionRepeatType = null;
    target.productionRepeatBlocked = '';
  }
  succeed(game, { building: target, item, refunded, releasedPop, refundFraction });
  return true;
}

export function moveProduction(game, fromIndex, toIndex, building = null) {
  const target = productionBuilding(game, building);
  game.lastError = '';
  if (!validProductionBuilding(game, target)) {
    return fail(game, 'Select the Ukrainian production building whose queue should change.').ok;
  }
  ensureProductionQueueState(target);
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= target.queue.length ||
    toIndex >= target.queue.length
  ) {
    return fail(game, 'Choose valid production queue positions to reorder.').ok;
  }
  if (fromIndex === toIndex) {
    succeed(game, { building: target, item: target.queue[fromIndex], fromIndex, toIndex });
    return true;
  }
  const [item] = target.queue.splice(fromIndex, 1);
  target.queue.splice(toIndex, 0, item);
  succeed(game, { building: target, item, fromIndex, toIndex });
  return true;
}

export function setProductionPaused(game, paused, building = null) {
  const target = productionBuilding(game, building);
  game.lastError = '';
  if (!validProductionBuilding(game, target)) {
    return fail(game, 'Select the Ukrainian production building whose queue should pause.').ok;
  }
  ensureProductionQueueState(target);
  if (!target.queue.length && paused) return fail(game, 'The production queue is empty.').ok;
  target.productionPaused = Boolean(paused);
  succeed(game, { building: target, paused: target.productionPaused });
  return true;
}

export function setProductionRepeat(game, enabled, building = null) {
  const target = productionBuilding(game, building);
  game.lastError = '';
  if (!validProductionBuilding(game, target)) {
    return fail(game, 'Select the Ukrainian production building whose repeat mode should change.').ok;
  }
  ensureProductionQueueState(target);
  if (enabled && !target.queue.length) return fail(game, 'Queue a unit before enabling repeat production.').ok;
  target.productionRepeat = Boolean(enabled);
  target.productionRepeatType = enabled ? target.queue[0].type : null;
  target.productionRepeatBlocked = '';
  succeed(game, {
    building: target,
    enabled: target.productionRepeat,
    type: target.productionRepeatType,
  });
  return true;
}

function tryRepeat(game, building) {
  if (!building.productionRepeat || !building.productionRepeatType) return false;
  const result = enqueue(game, building, building.productionRepeatType, {
    publish: false,
    repeated: true,
  });
  building.productionRepeatBlocked = result.ok ? '' : result.reason;
  return result.ok;
}

function completeItem(game, building, item) {
  game.addUnit(
    item.type,
    building.team,
    building.x + randomBetween(-70, 70),
    building.y + 85,
  );
  releaseReservation(game, item);
  if (building.productionRepeat && building.productionRepeatType === item.type) tryRepeat(game, building);
}

export function updateProductionQueues(game, stepSeconds) {
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new RangeError('Production step duration must be a positive finite number.');
  }

  for (const building of game.buildings || []) {
    ensureProductionQueueState(building);
    if (building.underConstruction || building.productionPaused) continue;
    if (!building.queue.length) tryRepeat(game, building);

    let remaining = stepSeconds;
    let safety = MAX_PRODUCTION_QUEUE_LENGTH * 4;
    while (remaining > EPSILON && building.queue.length && !building.productionPaused && safety-- > 0) {
      const item = normalizeQueueItem(building, building.queue[0]);
      item.started = true;
      const consumed = Math.min(remaining, item.left);
      item.left = Math.max(0, item.left - consumed);
      remaining -= consumed;
      if (item.left > EPSILON) break;
      building.queue.shift();
      completeItem(game, building, item);
    }
  }
}

export function releaseProductionReservations(game, building) {
  ensureProductionQueueState(building);
  let releasedPop = 0;
  for (const item of building.queue) releasedPop += releaseReservation(game, item);
  return releasedPop;
}

export function createProductionQueueController(game) {
  for (const method of ['selectedEntities', 'buildingCanProduce', 'heroAlreadyFieldedOrQueued', 'addUnit']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Production queue controller requires game.${method}().`);
    }
  }

  const originalQueue = game.queue?.bind(game);
  const originalUpdateProduction = game.updateProduction?.bind(game);
  const originalCancelProduction = game.cancelProduction;
  const originalMoveProduction = game.moveProduction;
  const originalSetProductionPaused = game.setProductionPaused;
  const originalSetProductionRepeat = game.setProductionRepeat;

  game.queue = (type) => queueProduction(game, type);
  game.cancelProduction = (index = 0) => cancelProduction(game, index);
  game.moveProduction = (fromIndex, toIndex) => moveProduction(game, fromIndex, toIndex);
  game.setProductionPaused = (paused) => setProductionPaused(game, paused);
  game.setProductionRepeat = (enabled) => setProductionRepeat(game, enabled);
  game.updateProduction = (stepSeconds) => updateProductionQueues(game, stepSeconds);

  return () => {
    if (originalQueue) game.queue = originalQueue;
    else delete game.queue;
    if (originalUpdateProduction) game.updateProduction = originalUpdateProduction;
    else delete game.updateProduction;
    if (originalCancelProduction) game.cancelProduction = originalCancelProduction;
    else delete game.cancelProduction;
    if (originalMoveProduction) game.moveProduction = originalMoveProduction;
    else delete game.moveProduction;
    if (originalSetProductionPaused) game.setProductionPaused = originalSetProductionPaused;
    else delete game.setProductionPaused;
    if (originalSetProductionRepeat) game.setProductionRepeat = originalSetProductionRepeat;
    else delete game.setProductionRepeat;
  };
}
