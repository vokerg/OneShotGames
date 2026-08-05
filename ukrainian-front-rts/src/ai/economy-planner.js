import {
  AI_BUDGET_CATEGORIES,
  canonicalAiSnapshot,
  createAiBudgetPlan,
} from './ai-contracts.js';

const EPSILON = 1e-9;
const DEFAULT_TARGETS = Object.freeze({
  desiredBases: 1,
  desiredProductionBuildings: 1,
  desiredCapacityBuffer: 2,
  expansionWorkerSaturation: 0.85,
  reserveFraction: 0.1,
});

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function finite(value, label, minimum = 0) {
  if (!Number.isFinite(value) || value < minimum) {
    throw new RangeError(`${label} must be finite and >= ${minimum}`);
  }
  return value;
}

function integer(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(`${label} must be an integer >= ${minimum}`);
  }
  return value;
}

function id(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function sorted(items) {
  return [...items].sort((left, right) =>
    (right.priority ?? 0) - (left.priority ?? 0) ||
    String(left.id).localeCompare(String(right.id)));
}

function normalizeResources(resources) {
  assertRecord(resources, 'resources');
  const normalized = {};
  for (const resourceId of Object.keys(resources).sort()) {
    normalized[id(resourceId, 'resource id')] = finite(resources[resourceId], `resources.${resourceId}`);
  }
  return normalized;
}

function normalizeCost(cost = {}) {
  assertRecord(cost, 'cost');
  const normalized = {};
  for (const resourceId of Object.keys(cost).sort()) {
    normalized[id(resourceId, 'cost resource id')] = finite(cost[resourceId], `cost.${resourceId}`);
  }
  return normalized;
}

function affordable(wallet, cost, reserveFloor = {}) {
  return Object.entries(cost).every(([resourceId, amount]) =>
    (wallet[resourceId] ?? 0) - amount + EPSILON >= (reserveFloor[resourceId] ?? 0));
}

function spend(wallet, cost) {
  for (const [resourceId, amount] of Object.entries(cost)) {
    wallet[resourceId] = (wallet[resourceId] ?? 0) - amount;
  }
}

function optionFor(options, kind, wallet, reserveFloor) {
  return sorted(options.filter((option) =>
    option.available !== false &&
    option.kind === kind &&
    affordable(wallet, normalizeCost(option.cost), reserveFloor)))[0] ?? null;
}

function action(kind, option, reason, targetId = null) {
  return {
    type: kind,
    optionId: id(option.id, `${kind} option id`),
    targetId,
    reason,
    cost: normalizeCost(option.cost),
  };
}

function activeCount(items) {
  return items.filter((item) => item.operational !== false && item.destroyed !== true).length;
}

function normalizedTargets(targets = {}) {
  return {
    desiredBases: integer(targets.desiredBases ?? DEFAULT_TARGETS.desiredBases, 'desiredBases', 1),
    desiredProductionBuildings: integer(
      targets.desiredProductionBuildings ?? DEFAULT_TARGETS.desiredProductionBuildings,
      'desiredProductionBuildings',
      1,
    ),
    desiredCapacityBuffer: finite(
      targets.desiredCapacityBuffer ?? DEFAULT_TARGETS.desiredCapacityBuffer,
      'desiredCapacityBuffer',
    ),
    expansionWorkerSaturation: finite(
      targets.expansionWorkerSaturation ?? DEFAULT_TARGETS.expansionWorkerSaturation,
      'expansionWorkerSaturation',
      0,
    ),
    reserveFraction: finite(targets.reserveFraction ?? DEFAULT_TARGETS.reserveFraction, 'reserveFraction', 0),
  };
}

function budgetWeights(doctrine, recovery) {
  const source = assertRecord(doctrine?.budgetWeights ?? {}, 'doctrine.budgetWeights');
  const weights = Object.fromEntries(AI_BUDGET_CATEGORIES.map((category) => [
    category,
    finite(source[category] ?? 0, `doctrine.budgetWeights.${category}`),
  ]));
  if (Object.values(weights).every((value) => value === 0)) {
    throw new RangeError('doctrine budget weights must contain a positive value');
  }
  if (recovery.baseLost || recovery.productionLost) {
    weights.construction += 0.35;
    weights.repair += 0.2;
    weights.research *= 0.25;
    weights.operations *= 0.5;
  }
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  return Object.fromEntries(Object.entries(weights).map(([category, value]) => [category, value / total]));
}

function createBudget(resources, doctrine, recovery, tick) {
  const weights = budgetWeights(doctrine, recovery);
  const allocations = Object.fromEntries(AI_BUDGET_CATEGORIES.map((category) => [category, {}]));
  for (const [resourceId, amount] of Object.entries(resources)) {
    let allocated = 0;
    for (const category of AI_BUDGET_CATEGORIES.slice(0, -1)) {
      const value = Number((amount * weights[category]).toFixed(6));
      allocations[category][resourceId] = value;
      allocated += value;
    }
    allocations[AI_BUDGET_CATEGORIES.at(-1)][resourceId] = Math.max(0, Number((amount - allocated).toFixed(6)));
  }
  return createAiBudgetPlan({ tick, resources, allocations });
}

function workerPlan(workers, resourceSites, resourcePriorities = {}) {
  const availableWorkers = sorted(workers.filter((worker) => worker.available !== false));
  const sites = resourceSites
    .filter((site) => site.active !== false && site.depleted !== true && (site.capacity ?? 0) > 0)
    .map((site) => ({
      id: id(site.id, 'resource site id'),
      resourceId: id(site.resourceId, 'resource site resourceId'),
      capacity: integer(site.capacity, `resource site ${site.id} capacity`, 1),
      threat: finite(site.threat ?? 0, `resource site ${site.id} threat`),
      distance: finite(site.distance ?? 0, `resource site ${site.id} distance`),
      priority: finite(resourcePriorities[site.resourceId] ?? 1, `resource priority ${site.resourceId}`),
    }))
    .sort((left, right) =>
      right.priority - left.priority ||
      left.threat - right.threat ||
      left.distance - right.distance ||
      left.id.localeCompare(right.id));

  const assignments = [];
  const counts = new Map(sites.map((site) => [site.id, 0]));
  for (const worker of availableWorkers) {
    const site = sites
      .filter((candidate) => counts.get(candidate.id) < candidate.capacity)
      .sort((left, right) => {
        const leftFill = counts.get(left.id) / left.capacity;
        const rightFill = counts.get(right.id) / right.capacity;
        return leftFill - rightFill ||
          right.priority - left.priority ||
          left.threat - right.threat ||
          left.distance - right.distance ||
          left.id.localeCompare(right.id);
      })[0];
    assignments.push({
      workerId: id(worker.id, 'worker id'),
      siteId: site?.id ?? null,
      resourceId: site?.resourceId ?? null,
      role: site ? 'gather' : 'reserve',
    });
    if (site) counts.set(site.id, counts.get(site.id) + 1);
  }

  return {
    assignments,
    saturation: sites.length
      ? availableWorkers.length / sites.reduce((sum, site) => sum + site.capacity, 0)
      : 1,
    staffedSites: sites.map((site) => ({
      siteId: site.id,
      resourceId: site.resourceId,
      assigned: counts.get(site.id),
      capacity: site.capacity,
    })),
  };
}

function tryQueue(actions, wallet, reserveFloor, options, kind, reason, targetId = null) {
  const option = optionFor(options, kind, wallet, reserveFloor);
  if (!option) return false;
  const next = action(kind, option, reason, targetId);
  spend(wallet, next.cost);
  actions.push(next);
  return true;
}

export function planEconomy(snapshot, doctrine) {
  assertRecord(snapshot, 'snapshot');
  assertRecord(doctrine, 'doctrine');
  const tick = integer(snapshot.tick ?? 0, 'tick');
  const factionId = id(snapshot.factionId ?? doctrine.factionId, 'factionId');
  if (doctrine.factionId && doctrine.factionId !== factionId) {
    throw new RangeError('doctrine factionId must match snapshot factionId');
  }

  const resources = normalizeResources(snapshot.resources ?? {});
  const workers = Array.isArray(snapshot.workers) ? snapshot.workers : [];
  const bases = Array.isArray(snapshot.bases) ? snapshot.bases : [];
  const productionBuildings = Array.isArray(snapshot.productionBuildings) ? snapshot.productionBuildings : [];
  const resourceSites = Array.isArray(snapshot.resourceSites) ? snapshot.resourceSites : [];
  const damagedStructures = Array.isArray(snapshot.damagedStructures) ? snapshot.damagedStructures : [];
  const buildOptions = Array.isArray(snapshot.buildOptions) ? snapshot.buildOptions : [];
  const unitOptions = Array.isArray(snapshot.unitOptions) ? snapshot.unitOptions : [];
  const researchOptions = Array.isArray(snapshot.researchOptions) ? snapshot.researchOptions : [];
  const targets = normalizedTargets(snapshot.targets);

  const operationalBases = activeCount(bases);
  const operationalProduction = activeCount(productionBuildings);
  const recovery = {
    baseLost: operationalBases < targets.desiredBases,
    productionLost: operationalProduction < targets.desiredProductionBuildings,
    damagedInfrastructure: damagedStructures.some((structure) => structure.destroyed !== true),
  };

  const workersResult = workerPlan(workers, resourceSites, doctrine.resourcePriorities ?? {});
  const budgetPlan = createBudget(resources, doctrine, recovery, tick);
  const wallet = { ...resources };
  const reserveFloor = Object.fromEntries(Object.entries(resources).map(([resourceId, amount]) => [
    resourceId,
    amount * targets.reserveFraction,
  ]));
  const actions = [];

  for (const structure of sorted(damagedStructures.filter((item) => item.destroyed !== true))) {
    const repairOption = {
      id: `repair:${id(structure.id, 'damaged structure id')}`,
      kind: 'repair',
      priority: structure.priority ?? 0,
      cost: normalizeCost(structure.repairCost ?? {}),
      available: structure.repairable !== false,
    };
    if (!affordable(wallet, repairOption.cost, reserveFloor)) continue;
    const next = action('repair', repairOption, 'restore damaged infrastructure', structure.id);
    spend(wallet, next.cost);
    actions.push(next);
  }

  while (operationalBases + actions.filter((item) => item.type === 'base').length < targets.desiredBases) {
    if (!tryQueue(actions, wallet, reserveFloor, buildOptions, 'base', 'recover or expand base operations')) break;
  }
  while (operationalProduction + actions.filter((item) => item.type === 'production').length <
      targets.desiredProductionBuildings) {
    if (!tryQueue(actions, wallet, reserveFloor, buildOptions, 'production', 'restore production capability')) break;
  }

  const capacity = assertRecord(snapshot.capacity ?? { used: 0, maximum: 0 }, 'capacity');
  const capacityBuffer = finite(capacity.maximum ?? 0, 'capacity.maximum') - finite(capacity.used ?? 0, 'capacity.used');
  if (capacityBuffer < targets.desiredCapacityBuffer) {
    tryQueue(actions, wallet, reserveFloor, buildOptions, 'capacity', 'restore unit capacity buffer');
  }

  const availableSites = resourceSites.filter((site) => site.active !== false && site.depleted !== true);
  const unclaimedSites = availableSites.filter((site) => site.claimed !== true);
  const expansionNeeded = unclaimedSites.length > 0 &&
    (workersResult.saturation >= targets.expansionWorkerSaturation || operationalBases < targets.desiredBases);
  if (expansionNeeded) {
    const target = sorted(unclaimedSites.map((site) => ({
      ...site,
      priority: (doctrine.resourcePriorities?.[site.resourceId] ?? 1) - (site.threat ?? 0) - (site.distance ?? 0) * 0.01,
    })))[0];
    const expanded = tryQueue(actions, wallet, reserveFloor, buildOptions, 'expansion', 'open a new resource operation', target.id);
    if (!expanded && operationalBases >= targets.desiredBases) {
      tryQueue(actions, wallet, reserveFloor, buildOptions, 'base', 'open a new resource operation', target.id);
    }
  }

  const unit = sorted(unitOptions.filter((option) => option.available !== false &&
    affordable(wallet, normalizeCost(option.cost), reserveFloor)))[0];
  if (unit) {
    const next = action('train-unit', unit, 'sustain doctrine production');
    spend(wallet, next.cost);
    actions.push(next);
  }

  const research = sorted(researchOptions.filter((option) => option.available !== false &&
    affordable(wallet, normalizeCost(option.cost), reserveFloor)))[0];
  if (research && !recovery.baseLost && !recovery.productionLost) {
    const next = action('research', research, 'advance doctrine research');
    spend(wallet, next.cost);
    actions.push(next);
  }

  return canonicalAiSnapshot({
    tick,
    factionId,
    recovery,
    workerAssignments: workersResult.assignments,
    resourceOperations: workersResult.staffedSites,
    budgetPlan,
    actions,
    remainingResources: wallet,
  }, 'economy plan');
}
