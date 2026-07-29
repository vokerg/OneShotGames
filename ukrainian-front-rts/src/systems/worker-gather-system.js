import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';
import { distance } from '../core/math.js';

export const RESOURCE_KINDS = Object.freeze(['metal', 'fuel', 'intel']);
export const WORKER_CARRY_CAPACITY = 40;
export const WORKER_GATHER_RATE = 18;
export const RESOURCE_INTERACTION_RANGE = 35;
export const DROP_OFF_INTERACTION_RANGE = 70;

const RESOURCE_KIND_SET = new Set(RESOURCE_KINDS);
const EPSILON = 1e-9;

function collectionIndex(collection, candidate) {
  const index = collection.indexOf(candidate);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function stableEntityKey(entity, fallbackIndex) {
  if (Number.isInteger(entity?.id)) return entity.id;
  if (typeof entity?.id === 'string') return entity.id;
  return fallbackIndex;
}

function compareByDistanceThenIdentity(origin, collection, left, right) {
  const distanceDifference = distance(origin, left) - distance(origin, right);
  if (Math.abs(distanceDifference) > EPSILON) return distanceDifference;

  const leftIndex = collectionIndex(collection, left);
  const rightIndex = collectionIndex(collection, right);
  const leftKey = stableEntityKey(left, leftIndex);
  const rightKey = stableEntityKey(right, rightIndex);
  if (typeof leftKey === 'number' && typeof rightKey === 'number') return leftKey - rightKey;
  return String(leftKey).localeCompare(String(rightKey)) || leftIndex - rightIndex;
}

export function isResourceKind(resourceKind) {
  return RESOURCE_KIND_SET.has(resourceKind);
}

export function isGatherWorker(game, unit) {
  const stats = unit?.team === TEAM.UA
    ? game.unitStats?.(unit.type) ?? UNIT_TYPES[unit?.type]
    : UNIT_TYPES[unit?.type];
  return Boolean(unit && unit.team === TEAM.UA && stats?.worker);
}

export function findNearestResourceNode(game, origin, resourceKind, { exclude = null } = {}) {
  if (!isResourceKind(resourceKind)) return null;
  return (game.nodes || [])
    .filter(
      (node) =>
        node !== exclude &&
        node?.kind === resourceKind &&
        Number.isFinite(node.amount) &&
        node.amount > EPSILON,
    )
    .sort((left, right) =>
      compareByDistanceThenIdentity(origin, game.nodes || [], left, right),
    )[0] || null;
}

export function buildingAcceptsResource(game, building, resourceKind, team = TEAM.UA) {
  if (
    !building ||
    building.team !== team ||
    building.hp <= 0 ||
    building.underConstruction ||
    !(game.buildings || []).includes(building)
  ) {
    return false;
  }

  const configuredKinds =
    building.dropOffKinds ??
    BUILDING_TYPES[building.type]?.dropOffKinds ??
    (building.type === 'hq' ? RESOURCE_KINDS : []);
  return Array.isArray(configuredKinds) && configuredKinds.includes(resourceKind);
}

export function findNearestDropOff(game, origin, resourceKind, team = TEAM.UA) {
  if (!isResourceKind(resourceKind)) return null;
  return (game.buildings || [])
    .filter((building) => buildingAcceptsResource(game, building, resourceKind, team))
    .sort((left, right) =>
      compareByDistanceThenIdentity(origin, game.buildings || [], left, right),
    )[0] || null;
}

export function findResourceNodeAt(game, x, y, radius = 42) {
  const point = { x, y };
  return (game.nodes || [])
    .filter((node) => node.amount > EPSILON && distance(point, node) <= radius)
    .sort((left, right) =>
      compareByDistanceThenIdentity(point, game.nodes || [], left, right),
    )[0] || null;
}

function clearQueuedOrders(unit) {
  if (Array.isArray(unit.orderQueue)) unit.orderQueue.length = 0;
}

function gatherOrder(game, node, resourceKind) {
  return {
    kind: 'gather',
    target: node,
    resourceKind,
    sourceIndex: (game.nodes || []).indexOf(node),
  };
}

function returnOrder(game, dropOff, carriedKind, resumeKind, preferredSource = null) {
  return {
    kind: 'return',
    target: dropOff,
    resourceKind: carriedKind,
    resumeKind,
    preferredSource,
    preferredSourceIndex: preferredSource ? (game.nodes || []).indexOf(preferredSource) : -1,
  };
}

function validPreferredSource(game, source, resourceKind) {
  return Boolean(
    source &&
    (game.nodes || []).includes(source) &&
    source.kind === resourceKind &&
    source.amount > EPSILON,
  );
}

function nextResourceSource(game, origin, resourceKind, preferredSource = null, exclude = null) {
  if (validPreferredSource(game, preferredSource, resourceKind) && preferredSource !== exclude) {
    return preferredSource;
  }
  return findNearestResourceNode(game, origin, resourceKind, { exclude });
}

function beginReturn(game, unit, resumeKind = unit.gatherKind, preferredSource = null) {
  if (!(unit.carry > EPSILON) || !isResourceKind(unit.carryKind)) return false;
  const dropOff = findNearestDropOff(game, unit, unit.carryKind, unit.team);
  if (!dropOff) {
    unit.order = null;
    return false;
  }
  unit.order = returnOrder(game, dropOff, unit.carryKind, resumeKind, preferredSource);
  unit.target = null;
  return true;
}

function resumeGather(game, unit, resourceKind, preferredSource = null, exclude = null) {
  const source = nextResourceSource(game, unit, resourceKind, preferredSource, exclude);
  unit.order = source ? gatherOrder(game, source, resourceKind) : null;
  unit.target = null;
  return source;
}

export function clearWorkerGatherAssignment(unit, { clearOrder = true, clearQueue = true } = {}) {
  if (!unit) return;
  unit.gatherKind = null;
  if (clearOrder && ['gather', 'return'].includes(unit.order?.kind)) unit.order = null;
  unit.target = null;
  if (clearQueue) clearQueuedOrders(unit);
}

function planWorkerAssignment(game, unit, resourceKind, source = null) {
  if (!isGatherWorker(game, unit)) {
    return { ok: false, reason: 'Only Ukrainian worker units can gather resources.' };
  }
  if (!isResourceKind(resourceKind)) {
    return { ok: false, reason: `Unknown resource type: ${resourceKind}` };
  }
  if (
    source &&
    (!(game.nodes || []).includes(source) ||
      source.kind !== resourceKind ||
      source.amount <= EPSILON)
  ) {
    return { ok: false, reason: `The selected ${resourceKind} source is unavailable.` };
  }

  const selectedSource = source || findNearestResourceNode(game, unit, resourceKind);
  if (!selectedSource) {
    return { ok: false, reason: `No active ${resourceKind} source is available.` };
  }

  const carryingOtherKind =
    unit.carry > EPSILON &&
    isResourceKind(unit.carryKind) &&
    unit.carryKind !== resourceKind;
  const carryingFullLoad = unit.carry >= WORKER_CARRY_CAPACITY - EPSILON;
  if (
    (carryingOtherKind || carryingFullLoad) &&
    !findNearestDropOff(game, unit, unit.carryKind, unit.team)
  ) {
    return { ok: false, reason: `No valid drop-off accepts ${unit.carryKind}.` };
  }

  return { ok: true, source: selectedSource, carryingOtherKind, carryingFullLoad };
}

function applyWorkerAssignment(game, unit, resourceKind, plan) {
  clearQueuedOrders(unit);
  unit.gatherKind = resourceKind;
  unit.target = null;
  if (plan.carryingOtherKind || plan.carryingFullLoad) {
    beginReturn(game, unit, resourceKind, plan.source);
  } else {
    unit.order = gatherOrder(game, plan.source, resourceKind);
  }
  return { ok: true, source: plan.source, order: unit.order };
}

export function assignWorkerToResource(game, unit, resourceKind, source = null) {
  const plan = planWorkerAssignment(game, unit, resourceKind, source);
  return plan.ok ? applyWorkerAssignment(game, unit, resourceKind, plan) : plan;
}

function retargetDepletedSource(game, unit, depletedSource, resourceKind) {
  const nextSource = findNearestResourceNode(game, unit, resourceKind, {
    exclude: depletedSource,
  });
  if (nextSource && unit.carry < WORKER_CARRY_CAPACITY - EPSILON) {
    unit.order = gatherOrder(game, nextSource, resourceKind);
    return nextSource;
  }
  if (unit.carry > EPSILON) beginReturn(game, unit, resourceKind);
  else unit.order = null;
  return null;
}

export function updateWorkerGather(game, unit, stats, dt) {
  if (!stats?.worker || unit.team !== TEAM.UA) return false;
  if (unit.order?.kind === 'gather') {
    const resourceKind = unit.order.resourceKind ?? unit.gatherKind;
    const node = unit.order.target;
    if (
      !isResourceKind(resourceKind) ||
      !(game.nodes || []).includes(node) ||
      node.kind !== resourceKind ||
      node.amount <= EPSILON
    ) {
      retargetDepletedSource(game, unit, node, resourceKind);
      return true;
    }

    if (
      unit.carry > EPSILON &&
      isResourceKind(unit.carryKind) &&
      unit.carryKind !== resourceKind
    ) {
      beginReturn(game, unit, resourceKind, node);
      return true;
    }

    if (distance(unit, node) > RESOURCE_INTERACTION_RANGE) {
      game.move(unit, node.x, node.y, dt);
      return true;
    }

    const remainingCapacity = Math.max(0, WORKER_CARRY_CAPACITY - unit.carry);
    const gathered = Math.min(WORKER_GATHER_RATE * dt, remainingCapacity, node.amount);
    unit.carry += gathered;
    unit.carryKind = resourceKind;
    node.amount = Math.max(0, node.amount - gathered);

    if (unit.carry >= WORKER_CARRY_CAPACITY - EPSILON) {
      beginReturn(game, unit, resourceKind);
    } else if (node.amount <= EPSILON) {
      retargetDepletedSource(game, unit, node, resourceKind);
    }
    return true;
  }

  if (unit.order?.kind === 'return') {
    if (!(unit.carry > EPSILON) || !isResourceKind(unit.carryKind)) {
      unit.carry = 0;
      unit.carryKind = null;
      resumeGather(
        game,
        unit,
        unit.order.resumeKind ?? unit.gatherKind,
        unit.order.preferredSource,
      );
      return true;
    }

    let dropOff = unit.order.target;
    if (!buildingAcceptsResource(game, dropOff, unit.carryKind, unit.team)) {
      dropOff = findNearestDropOff(game, unit, unit.carryKind, unit.team);
      if (!dropOff) {
        unit.order = null;
        return true;
      }
      unit.order.target = dropOff;
    }

    if (distance(unit, dropOff) > DROP_OFF_INTERACTION_RANGE) {
      game.move(unit, dropOff.x, dropOff.y, dt);
      return true;
    }

    const delivered = unit.carry;
    game.player[unit.carryKind] = (game.player[unit.carryKind] || 0) + delivered;
    game.player.mined = (game.player.mined || 0) + delivered;
    const resumeKind = unit.order.resumeKind ?? unit.gatherKind;
    const preferredSource = unit.order.preferredSource;
    unit.carry = 0;
    unit.carryKind = null;
    resumeGather(game, unit, resumeKind, preferredSource);
    return true;
  }

  return false;
}

export function createWorkerGatherController(game) {
  for (const method of ['hit', 'issue', 'selectedUnits', 'stopSelected', 'updateWorker', 'placeBuilding']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Worker gather controller requires game.${method}().`);
    }
  }

  const originalHit = game.hit.bind(game);
  const originalIssue = game.issue.bind(game);
  const originalStopSelected = game.stopSelected.bind(game);
  const originalUpdateWorker = game.updateWorker.bind(game);
  const originalPlaceBuilding = game.placeBuilding.bind(game);

  const selectedWorkers = () =>
    game.selectedUnits().filter((unit) => isGatherWorker(game, unit));

  game.resourceAt = (x, y, radius) => findResourceNodeAt(game, x, y, radius);
  game.assignGather = (resourceKind, source = null) => {
    game.lastError = '';
    if (game.gameOver) return false;
    const workers = selectedWorkers();
    if (!workers.length) return game.fail('Select at least one Ukrainian engineer first.');

    if (!isResourceKind(resourceKind)) return game.fail(`Unknown resource type: ${resourceKind}`);
    const plans = workers.map((worker) => ({
      worker,
      plan: planWorkerAssignment(game, worker, resourceKind, source),
    }));
    const rejected = plans.find(({ plan }) => !plan.ok);
    if (rejected) return game.fail(rejected.plan.reason);

    plans.forEach(({ worker, plan }) => applyWorkerAssignment(game, worker, resourceKind, plan));
    return true;
  };

  game.hit = (x, y) => originalHit(x, y) || game.resourceAt(x, y);

  game.issue = (x, y, target, options = {}) => {
    if ((game.nodes || []).includes(target)) {
      return game.assignGather(target.kind, target);
    }

    const workers = selectedWorkers();
    const gatheringWorkers = workers.filter(
      (unit) => unit.gatherKind || ['gather', 'return'].includes(unit.order?.kind),
    );
    if (gatheringWorkers.length) {
      gatheringWorkers.forEach((unit) => clearWorkerGatherAssignment(unit));
      return originalIssue(x, y, target, { ...options, append: false });
    }

    return originalIssue(x, y, target, options);
  };

  game.stopSelected = () => {
    const workers = selectedWorkers();
    const stopped = originalStopSelected();
    if (stopped) workers.forEach((unit) => clearWorkerGatherAssignment(unit));
    return stopped;
  };

  game.updateWorker = (unit, stats, dt) => {
    if (stats?.worker && unit.team === TEAM.UA) {
      if (['gather', 'return'].includes(unit.order?.kind)) {
        updateWorkerGather(game, unit, stats, dt);
        return;
      }
      if (!unit.order && !unit.target) return;
    }
    originalUpdateWorker(unit, stats, dt);
  };

  game.placeBuilding = (x, y) => {
    const workerId = game.pendingBuild?.workerId;
    const placed = originalPlaceBuilding(x, y);
    if (placed) {
      const worker = game.units.find((unit) => unit.id === workerId);
      if (worker) clearWorkerGatherAssignment(worker, { clearOrder: false });
    }
    return placed;
  };

  return () => {
    game.hit = originalHit;
    game.issue = originalIssue;
    game.stopSelected = originalStopSelected;
    game.updateWorker = originalUpdateWorker;
    game.placeBuilding = originalPlaceBuilding;
    delete game.resourceAt;
    delete game.assignGather;
  };
}
