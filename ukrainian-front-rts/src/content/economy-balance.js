export const ECONOMY_BALANCE_SCHEMA_VERSION = 1;
export const ECONOMY_BALANCE_PROFILE_ID = 'gate-b2-baseline-v1';
export const ECONOMY_RESOURCE_IDS = Object.freeze(['metal', 'fuel', 'intel']);

const RESOURCE_ID_SET = new Set(ECONOMY_RESOURCE_IDS);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function finiteNonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${label} must be a non-negative finite number.`);
  }
  return number;
}

function positiveFinite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${label} must be a positive finite number.`);
  }
  return number;
}

function stableId(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value)) {
    throw new TypeError(`${label} must be a stable identifier.`);
  }
  return value;
}

export function normalizeEconomyVector(candidate = {}, label = 'Economy vector') {
  if (!plainObject(candidate)) throw new TypeError(`${label} must be an object.`);
  for (const resource of Object.keys(candidate)) {
    if (!RESOURCE_ID_SET.has(resource)) throw new RangeError(`${label} contains unknown resource ${resource}.`);
  }
  return Object.freeze(Object.fromEntries(
    ECONOMY_RESOURCE_IDS.map((resource) => [
      resource,
      finiteNonNegative(candidate[resource] ?? 0, `${label}.${resource}`),
    ]),
  ));
}

export function addEconomyVectors(...vectors) {
  const total = Object.fromEntries(ECONOMY_RESOURCE_IDS.map((resource) => [resource, 0]));
  vectors.forEach((vector, index) => {
    const normalized = normalizeEconomyVector(vector, `Economy vector ${index}`);
    for (const resource of ECONOMY_RESOURCE_IDS) total[resource] += normalized[resource];
  });
  return Object.freeze(total);
}

export function subtractEconomyVector(available, cost) {
  const normalizedAvailable = normalizeEconomyVector(available, 'Available resources');
  const normalizedCost = normalizeEconomyVector(cost, 'Resource cost');
  const result = {};
  for (const resource of ECONOMY_RESOURCE_IDS) {
    if (normalizedAvailable[resource] + 1e-9 < normalizedCost[resource]) {
      throw new RangeError(`Insufficient ${resource} for deterministic economy projection.`);
    }
    result[resource] = Math.max(0, normalizedAvailable[resource] - normalizedCost[resource]);
  }
  return Object.freeze(result);
}

export function canAffordEconomyCost(available, cost) {
  const normalizedAvailable = normalizeEconomyVector(available, 'Available resources');
  const normalizedCost = normalizeEconomyVector(cost, 'Resource cost');
  return ECONOMY_RESOURCE_IDS.every(
    (resource) => normalizedAvailable[resource] + 1e-9 >= normalizedCost[resource],
  );
}

function normalizeRules(resourceRules) {
  if (!plainObject(resourceRules)) throw new TypeError('Resource rules must be an object.');
  const rules = {};
  for (const resource of ECONOMY_RESOURCE_IDS) {
    const rule = resourceRules[resource];
    if (!plainObject(rule)) throw new TypeError(`Resource rule ${resource} is required.`);
    rules[resource] = Object.freeze({
      extractionRate: positiveFinite(rule.extractionRate, `${resource} extractionRate`),
      carryCapacity: positiveFinite(rule.carryCapacity, `${resource} carryCapacity`),
      regenerationRate: finiteNonNegative(rule.regenerationRate ?? 0, `${resource} regenerationRate`),
      salvageBurst: positiveFinite(rule.salvageBurst, `${resource} salvageBurst`),
    });
  }
  return Object.freeze(rules);
}

export function incomeRatesForWorkers(workersByResource, resourceRules) {
  const workers = normalizeEconomyVector(workersByResource, 'Worker allocation');
  const rules = normalizeRules(resourceRules);
  return Object.freeze(Object.fromEntries(
    ECONOMY_RESOURCE_IDS.map((resource) => [
      resource,
      workers[resource] * rules[resource].extractionRate,
    ]),
  ));
}

export function timeToAffordEconomyCost({ available, cost, incomeRates }) {
  const normalizedAvailable = normalizeEconomyVector(available, 'Available resources');
  const normalizedCost = normalizeEconomyVector(cost, 'Resource cost');
  const normalizedIncome = normalizeEconomyVector(incomeRates, 'Income rates');
  let seconds = 0;
  for (const resource of ECONOMY_RESOURCE_IDS) {
    const deficit = Math.max(0, normalizedCost[resource] - normalizedAvailable[resource]);
    if (!deficit) continue;
    if (normalizedIncome[resource] <= 0) return Infinity;
    seconds = Math.max(seconds, deficit / normalizedIncome[resource]);
  }
  return seconds;
}

function accrueEconomyVector(resources, incomeRates, seconds) {
  const normalizedResources = normalizeEconomyVector(resources, 'Projected resources');
  const normalizedIncome = normalizeEconomyVector(incomeRates, 'Income rates');
  const elapsed = finiteNonNegative(seconds, 'Projection elapsedSeconds');
  return Object.freeze(Object.fromEntries(
    ECONOMY_RESOURCE_IDS.map((resource) => [
      resource,
      normalizedResources[resource] + normalizedIncome[resource] * elapsed,
    ]),
  ));
}

function costReference(kind, id) {
  return Object.freeze({ kind, id });
}

export const ECONOMY_BALANCE_PROFILE = deepFreeze({
  version: ECONOMY_BALANCE_SCHEMA_VERSION,
  id: ECONOMY_BALANCE_PROFILE_ID,
  startingForce: {
    engineers: 2,
    lineSquads: 2,
    baseCapacity: 14,
    startingDepotCapacity: 8,
    startingFieldedCapacity: 6,
  },
  missionBenchmarks: {
    donbas: {
      start: { metal: 240, fuel: 110, intel: 25 },
      workers: { metal: 1, fuel: 0, intel: 1 },
      maxCompletionSeconds: 60,
      steps: [
        { id: 'first-reinforcement', ref: costReference('unit', 'uaInfantry'), duration: 5, deadline: 12 },
        { id: 'first-tech-expansion', ref: costReference('building', 'workshop'), duration: 12, deadline: 35 },
        { id: 'first-research-choice', ref: costReference('upgrade', 'thermal'), duration: 18, deadline: 60 },
      ],
    },
    zaporizhzhia: {
      start: { metal: 320, fuel: 190, intel: 70 },
      workers: { metal: 1, fuel: 1, intel: 0 },
      maxCompletionSeconds: 65,
      steps: [
        { id: 'first-recon-strike-team', ref: costReference('unit', 'uaDrone'), duration: 7, deadline: 14 },
        { id: 'first-tech-expansion', ref: costReference('building', 'workshop'), duration: 12, deadline: 36 },
        { id: 'first-research-choice', ref: costReference('upgrade', 'cageArmor'), duration: 18, deadline: 65 },
      ],
    },
    kherson: {
      start: { metal: 430, fuel: 260, intel: 230 },
      workers: { metal: 1, fuel: 0, intel: 1 },
      maxCompletionSeconds: 70,
      steps: [
        { id: 'first-heavy-unit', ref: costReference('unit', 'uaTank'), duration: 9, deadline: 18 },
        { id: 'first-fires-unit', ref: costReference('unit', 'uaArtillery'), duration: 9, deadline: 42 },
        { id: 'first-tier-two-research', ref: costReference('upgrade', 'digitalC2'), duration: 30, deadline: 70 },
      ],
    },
  },
  affordability: {
    workersPerRequiredResource: 1,
    maxSecondsByClass: {
      worker: 12,
      infantry: 15,
      air: 18,
      armor: 20,
      command: 22,
    },
  },
  researchOpportunity: {
    comparisonUnitId: 'uaInfantry',
    minUnitEquivalents: 1.5,
    maxUnitEquivalents: 6,
  },
  depletion: {
    workersPerSource: 2,
    minSecondsPerSource: 30,
    maxSecondsPerSource: 55,
    sourcePools: [
      { id: 'salvage-yard', kind: 'metal', amount: 1600 },
      { id: 'fuel-point', kind: 'fuel', amount: 1100 },
      { id: 'signals-relay', kind: 'intel', amount: 900 },
      { id: 'industrial-site', kind: 'metal', amount: 1800 },
      { id: 'forward-fuel-base', kind: 'fuel', amount: 1200 },
    ],
  },
  comeback: {
    recoveryUnitId: 'uaEngineer',
    minimumLiquidReserve: { metal: 15, fuel: 0, intel: 0 },
    salvageAloneMustNotFundRecovery: true,
    reservePlusSalvageMustFundRecovery: true,
    maxRecoveryUnitsFromReserveAndSalvage: 1,
  },
});

function resolveReferenceCost(reference, { unitTypes, buildingTypes, upgrades }) {
  if (!plainObject(reference)) throw new TypeError('Economy benchmark reference must be an object.');
  const kind = stableId(reference.kind, 'Economy benchmark reference kind');
  const id = stableId(reference.id, 'Economy benchmark reference ID');
  const collections = { unit: unitTypes, building: buildingTypes, upgrade: upgrades };
  const collection = collections[kind];
  if (!collection) throw new RangeError(`Unknown economy benchmark reference kind: ${kind}`);
  const entry = collection[id];
  if (!entry) throw new RangeError(`Missing economy benchmark reference: ${kind}:${id}`);
  return normalizeEconomyVector(entry.cost ?? {}, `${kind}:${id} cost`);
}

export function projectEconomyPlan({
  start,
  workers,
  steps,
  resourceRules,
  unitTypes,
  buildingTypes,
  upgrades,
}) {
  if (!Array.isArray(steps)) throw new TypeError('Economy benchmark steps must be an array.');
  const incomeRates = incomeRatesForWorkers(workers, resourceRules);
  let resources = normalizeEconomyVector(start, 'Economy benchmark start');
  let elapsedSeconds = 0;
  const timeline = [];

  for (const [index, step] of steps.entries()) {
    if (!plainObject(step)) throw new TypeError(`Economy benchmark step ${index} must be an object.`);
    const id = stableId(step.id, `Economy benchmark step ${index} ID`);
    const duration = positiveFinite(step.duration, `Economy benchmark step ${id} duration`);
    const cost = resolveReferenceCost(step.ref, { unitTypes, buildingTypes, upgrades });
    const waitSeconds = timeToAffordEconomyCost({ available: resources, cost, incomeRates });
    if (!Number.isFinite(waitSeconds)) {
      timeline.push(deepFreeze({
        id,
        status: 'blocked',
        startSeconds: null,
        completionSeconds: null,
        waitSeconds: Infinity,
        duration,
        cost,
        resourcesBefore: resources,
        resourcesAfter: resources,
      }));
      return deepFreeze({
        status: 'blocked',
        elapsedSeconds: Infinity,
        resources,
        incomeRates,
        timeline,
      });
    }
    resources = accrueEconomyVector(resources, incomeRates, waitSeconds);
    const resourcesBefore = resources;
    resources = subtractEconomyVector(resources, cost);
    const startSeconds = elapsedSeconds + waitSeconds;
    elapsedSeconds = startSeconds + duration;
    resources = accrueEconomyVector(resources, incomeRates, duration);
    timeline.push(deepFreeze({
      id,
      status: 'completed',
      startSeconds,
      completionSeconds: elapsedSeconds,
      waitSeconds,
      duration,
      cost,
      resourcesBefore,
      resourcesAfter: resources,
    }));
  }

  return deepFreeze({ status: 'completed', elapsedSeconds, resources, incomeRates, timeline });
}

export function resourcePressureSeconds(cost, resourceRules) {
  const normalizedCost = normalizeEconomyVector(cost, 'Pressure cost');
  const rules = normalizeRules(resourceRules);
  return ECONOMY_RESOURCE_IDS.reduce(
    (total, resource) => total + normalizedCost[resource] / rules[resource].extractionRate,
    0,
  );
}

export function projectDepletionCurves({ sourcePools, resourceRules, workersPerSource }) {
  if (!Array.isArray(sourcePools)) throw new TypeError('Economy source pools must be an array.');
  const rules = normalizeRules(resourceRules);
  const workers = positiveFinite(workersPerSource, 'Depletion workersPerSource');
  return deepFreeze(sourcePools.map((source, index) => {
    if (!plainObject(source)) throw new TypeError(`Economy source ${index} must be an object.`);
    const id = stableId(source.id ?? `source-${index}`, `Economy source ${index} ID`);
    const kind = stableId(source.kind, `Economy source ${id} kind`);
    if (!RESOURCE_ID_SET.has(kind)) throw new RangeError(`Economy source ${id} has unknown kind ${kind}.`);
    const amount = finiteNonNegative(source.amount, `Economy source ${id} amount`);
    const extractionPerSecond = workers * rules[kind].extractionRate;
    return {
      id,
      kind,
      amount,
      workers,
      extractionPerSecond,
      depletionSeconds: amount / extractionPerSecond,
    };
  }));
}

function unitAffordabilityClass(unit) {
  if (unit.hero) return 'command';
  if (unit.worker) return 'worker';
  if (unit.armor) return 'armor';
  if (unit.air) return 'air';
  return 'infantry';
}

function sortedSourceSignature(sourcePools) {
  return sourcePools
    .map((source) => `${source.kind}:${Number(source.amount)}`)
    .sort();
}

export function evaluateEconomyBalance({
  profile = ECONOMY_BALANCE_PROFILE,
  unitTypes,
  buildingTypes,
  upgrades,
  missions,
  resourceRules,
  resourceSources,
} = {}) {
  if (!profile || profile.version !== ECONOMY_BALANCE_SCHEMA_VERSION) {
    throw new TypeError('A supported economy balance profile is required.');
  }
  if (!plainObject(unitTypes) || !plainObject(buildingTypes) || !plainObject(upgrades)) {
    throw new TypeError('Economy balance evaluation requires unit, building, and upgrade records.');
  }
  if (!Array.isArray(missions) || !Array.isArray(resourceSources)) {
    throw new TypeError('Economy balance evaluation requires mission and resource-source arrays.');
  }
  const rules = normalizeRules(resourceRules);
  const errors = [];
  const missionReports = {};
  const missionById = new Map(missions.map((mission) => [mission.id, mission]));

  for (const [missionId, benchmark] of Object.entries(profile.missionBenchmarks)) {
    const mission = missionById.get(missionId);
    if (!mission) {
      errors.push(`${missionId}: mission required by the economy baseline is missing`);
      continue;
    }
    if (JSON.stringify(normalizeEconomyVector(mission.start, `${missionId} start`)) !== JSON.stringify(normalizeEconomyVector(benchmark.start, `${missionId} benchmark start`))) {
      errors.push(`${missionId}: starting resources drift from the versioned economy baseline`);
    }
    let projection;
    try {
      projection = projectEconomyPlan({
        start: mission.start,
        workers: benchmark.workers,
        steps: benchmark.steps,
        resourceRules: rules,
        unitTypes,
        buildingTypes,
        upgrades,
      });
    } catch (error) {
      errors.push(`${missionId}: ${error.message}`);
      continue;
    }
    missionReports[missionId] = projection;
    if (projection.status !== 'completed') {
      errors.push(`${missionId}: opening benchmark becomes economically blocked`);
      continue;
    }
    if (projection.elapsedSeconds > benchmark.maxCompletionSeconds + 1e-9) {
      errors.push(`${missionId}: opening benchmark completes at ${projection.elapsedSeconds.toFixed(2)}s, above ${benchmark.maxCompletionSeconds}s`);
    }
    for (const step of projection.timeline) {
      const deadline = benchmark.steps.find((candidate) => candidate.id === step.id)?.deadline;
      if (Number.isFinite(deadline) && step.completionSeconds > deadline + 1e-9) {
        errors.push(`${missionId}.${step.id}: completes at ${step.completionSeconds.toFixed(2)}s, above ${deadline}s`);
      }
    }
  }

  const affordabilityReports = {};
  for (const [unitId, unit] of Object.entries(unitTypes).sort(([a], [b]) => a.localeCompare(b))) {
    const cost = normalizeEconomyVector(unit.cost ?? {}, `${unitId} cost`);
    const workers = Object.fromEntries(ECONOMY_RESOURCE_IDS.map((resource) => [
      resource,
      cost[resource] > 0 ? profile.affordability.workersPerRequiredResource : 0,
    ]));
    const incomeRates = incomeRatesForWorkers(workers, rules);
    const seconds = timeToAffordEconomyCost({ available: {}, cost, incomeRates });
    const classId = unitAffordabilityClass(unit);
    const maximum = profile.affordability.maxSecondsByClass[classId];
    affordabilityReports[unitId] = deepFreeze({ classId, seconds, maximum, cost });
    if (!Number.isFinite(seconds) || seconds > maximum + 1e-9) {
      errors.push(`${unitId}: ${classId} affordability ${Number.isFinite(seconds) ? `${seconds.toFixed(2)}s` : 'blocked'} exceeds ${maximum}s`);
    }
  }

  const comparisonUnit = unitTypes[profile.researchOpportunity.comparisonUnitId];
  if (!comparisonUnit) errors.push(`Missing research comparison unit ${profile.researchOpportunity.comparisonUnitId}`);
  const comparisonPressure = comparisonUnit
    ? resourcePressureSeconds(comparisonUnit.cost, rules)
    : 0;
  const researchReports = {};
  for (const [upgradeId, upgrade] of Object.entries(upgrades).sort(([a], [b]) => a.localeCompare(b))) {
    const pressureSeconds = resourcePressureSeconds(upgrade.cost, rules);
    const unitEquivalents = comparisonPressure > 0 ? pressureSeconds / comparisonPressure : Infinity;
    researchReports[upgradeId] = deepFreeze({ pressureSeconds, unitEquivalents });
    if (unitEquivalents < profile.researchOpportunity.minUnitEquivalents - 1e-9) {
      errors.push(`${upgradeId}: research opportunity cost ${unitEquivalents.toFixed(2)} unit equivalents is below ${profile.researchOpportunity.minUnitEquivalents}`);
    }
    if (unitEquivalents > profile.researchOpportunity.maxUnitEquivalents + 1e-9) {
      errors.push(`${upgradeId}: research opportunity cost ${unitEquivalents.toFixed(2)} unit equivalents exceeds ${profile.researchOpportunity.maxUnitEquivalents}`);
    }
  }

  if (JSON.stringify(sortedSourceSignature(resourceSources)) !== JSON.stringify(sortedSourceSignature(profile.depletion.sourcePools))) {
    errors.push('Runtime resource-source amounts drift from the versioned depletion baseline');
  }
  const depletionReports = projectDepletionCurves({
    sourcePools: resourceSources,
    resourceRules: rules,
    workersPerSource: profile.depletion.workersPerSource,
  });
  for (const source of depletionReports) {
    if (source.depletionSeconds < profile.depletion.minSecondsPerSource - 1e-9) {
      errors.push(`${source.id}: depletion ${source.depletionSeconds.toFixed(2)}s is below ${profile.depletion.minSecondsPerSource}s`);
    }
    if (source.depletionSeconds > profile.depletion.maxSecondsPerSource + 1e-9) {
      errors.push(`${source.id}: depletion ${source.depletionSeconds.toFixed(2)}s exceeds ${profile.depletion.maxSecondsPerSource}s`);
    }
  }

  const recoveryUnit = unitTypes[profile.comeback.recoveryUnitId];
  let comebackReport = null;
  if (!recoveryUnit) {
    errors.push(`Missing comeback recovery unit ${profile.comeback.recoveryUnitId}`);
  } else {
    const recoveryCost = normalizeEconomyVector(recoveryUnit.cost, `${profile.comeback.recoveryUnitId} cost`);
    const salvage = Object.fromEntries(ECONOMY_RESOURCE_IDS.map((resource) => [resource, rules[resource].salvageBurst]));
    const reserve = normalizeEconomyVector(profile.comeback.minimumLiquidReserve, 'Comeback reserve');
    const reservePlusSalvage = addEconomyVectors(reserve, salvage);
    const salvageFundsRecovery = canAffordEconomyCost(salvage, recoveryCost);
    const combinedFundsRecovery = canAffordEconomyCost(reservePlusSalvage, recoveryCost);
    const limitingCounts = ECONOMY_RESOURCE_IDS
      .filter((resource) => recoveryCost[resource] > 0)
      .map((resource) => Math.floor(reservePlusSalvage[resource] / recoveryCost[resource]));
    const fundedRecoveryUnits = limitingCounts.length ? Math.min(...limitingCounts) : Infinity;
    comebackReport = deepFreeze({
      recoveryUnitId: profile.comeback.recoveryUnitId,
      recoveryCost,
      salvage: normalizeEconomyVector(salvage, 'Comeback salvage'),
      reserve,
      reservePlusSalvage,
      salvageFundsRecovery,
      combinedFundsRecovery,
      fundedRecoveryUnits,
    });
    if (profile.comeback.salvageAloneMustNotFundRecovery && salvageFundsRecovery) {
      errors.push('Comeback salvage alone funds a recovery worker and removes the intended reserve constraint');
    }
    if (profile.comeback.reservePlusSalvageMustFundRecovery && !combinedFundsRecovery) {
      errors.push('Comeback reserve plus salvage cannot fund the designated recovery worker');
    }
    if (fundedRecoveryUnits > profile.comeback.maxRecoveryUnitsFromReserveAndSalvage) {
      errors.push(`Comeback package funds ${fundedRecoveryUnits} recovery workers, above ${profile.comeback.maxRecoveryUnitsFromReserveAndSalvage}`);
    }
  }

  return deepFreeze({
    version: ECONOMY_BALANCE_SCHEMA_VERSION,
    profileId: profile.id,
    errors: [...new Set(errors)].sort(),
    missionReports,
    affordabilityReports,
    researchReports,
    depletionReports,
    comebackReport,
  });
}
