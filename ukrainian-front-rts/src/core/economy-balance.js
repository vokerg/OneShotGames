import { DEFAULT_RESOURCE_RULES, RESOURCE_KINDS } from './resource-policy.js';

export const ECONOMY_BALANCE_PROFILE_VERSION = 1;

const DEFAULT_PROFILE_INPUT = {
  opening: {
    missionId: 'donbas',
    package: [
      { kind: 'building', id: 'barracks' },
      { kind: 'unit', id: 'uaInfantry' },
    ],
    minimumReserve: { metal: 0, fuel: 100, intel: 20 },
  },
  expansion: {
    package: [
      { kind: 'building', id: 'depot' },
      { kind: 'building', id: 'workshop' },
    ],
    workersByResource: { metal: 2, fuel: 1, intel: 0 },
    maxGatherSeconds: 9,
    maxTripEquivalent: 8,
  },
  affordability: [
    { id: 'frontline', unitIds: ['uaInfantry', 'uaMedic'], maxTripEquivalent: 3 },
    { id: 'precision', unitIds: ['uaDrone'], maxTripEquivalent: 3.1 },
    { id: 'armor-and-fires', unitIds: ['uaIfv', 'uaTank', 'uaArtillery'], maxTripEquivalent: 9.75 },
  ],
  research: {
    referenceUnitId: 'uaTank',
    maxRatioByTier: { 1: 0.75, 2: 1.25 },
  },
  depletion: {
    sourceAmounts: { metal: 1800, fuel: 900, intel: 360 },
    workersByResource: { metal: 4, fuel: 2, intel: 1 },
    minSeconds: 20,
    maxSeconds: 45,
  },
  comeback: {
    reserve: { metal: 110, fuel: 0, intel: 0 },
    salvageResourceKind: 'metal',
    package: [
      { kind: 'unit', id: 'uaEngineer' },
      { kind: 'building', id: 'depot' },
    ],
  },
};

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
}

function assertIdentifier(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(value)) {
    throw new TypeError(`${label} must be a stable identifier.`);
  }
  return value;
}

function assertFinite(value, label, { positive = false } = {}) {
  if (!Number.isFinite(value) || value < 0 || (positive && value <= 0)) {
    throw new TypeError(`${label} must be a ${positive ? 'positive' : 'non-negative'} finite number.`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeResourceRecord(candidate, label, { integer = false } = {}) {
  assertPlainObject(candidate, label);
  const normalized = {};
  for (const kind of RESOURCE_KINDS) {
    const value = assertFinite(candidate[kind] ?? 0, `${label}.${kind}`);
    if (integer && !Number.isInteger(value)) throw new TypeError(`${label}.${kind} must be an integer.`);
    normalized[kind] = value;
  }
  for (const kind of Object.keys(candidate)) {
    if (!RESOURCE_KINDS.includes(kind)) throw new RangeError(`Unknown resource kind in ${label}: ${kind}`);
  }
  return normalized;
}

function normalizePackage(candidate, label) {
  if (!Array.isArray(candidate) || candidate.length === 0) throw new TypeError(`${label} must be a non-empty array.`);
  return candidate.map((entry, index) => {
    assertPlainObject(entry, `${label}[${index}]`);
    if (entry.kind !== 'unit' && entry.kind !== 'building') {
      throw new RangeError(`${label}[${index}].kind must be unit or building.`);
    }
    return { kind: entry.kind, id: assertIdentifier(entry.id, `${label}[${index}].id`) };
  });
}

export function createEconomyBalanceProfile(candidate = DEFAULT_PROFILE_INPUT) {
  assertPlainObject(candidate, 'Economy balance profile');
  assertPlainObject(candidate.opening, 'Economy balance opening');
  assertPlainObject(candidate.expansion, 'Economy balance expansion');
  assertPlainObject(candidate.research, 'Economy balance research');
  assertPlainObject(candidate.depletion, 'Economy balance depletion');
  assertPlainObject(candidate.comeback, 'Economy balance comeback');
  if (!Array.isArray(candidate.affordability) || candidate.affordability.length === 0) {
    throw new TypeError('Economy balance affordability must be a non-empty array.');
  }

  const affordability = candidate.affordability.map((group, index) => {
    assertPlainObject(group, `Economy balance affordability[${index}]`);
    if (!Array.isArray(group.unitIds) || group.unitIds.length === 0) {
      throw new TypeError(`Economy balance affordability[${index}].unitIds must be a non-empty array.`);
    }
    return {
      id: assertIdentifier(group.id, `Economy balance affordability[${index}].id`),
      unitIds: group.unitIds.map((id, unitIndex) =>
        assertIdentifier(id, `Economy balance affordability[${index}].unitIds[${unitIndex}]`)),
      maxTripEquivalent: assertFinite(
        group.maxTripEquivalent,
        `Economy balance affordability[${index}].maxTripEquivalent`,
        { positive: true },
      ),
    };
  });

  assertPlainObject(candidate.research.maxRatioByTier, 'Economy balance research.maxRatioByTier');
  const maxRatioByTier = {};
  for (const [tier, value] of Object.entries(candidate.research.maxRatioByTier)) {
    if (!/^[1-9][0-9]*$/.test(tier)) throw new TypeError(`Economy balance research tier must be a positive integer: ${tier}`);
    maxRatioByTier[tier] = assertFinite(value, `Economy balance research.maxRatioByTier.${tier}`, { positive: true });
  }

  const salvageResourceKind = candidate.comeback.salvageResourceKind;
  if (!RESOURCE_KINDS.includes(salvageResourceKind)) {
    throw new RangeError(`Unknown comeback salvage resource kind: ${salvageResourceKind}`);
  }

  return deepFreeze({
    version: ECONOMY_BALANCE_PROFILE_VERSION,
    opening: {
      missionId: assertIdentifier(candidate.opening.missionId, 'Economy balance opening.missionId'),
      package: normalizePackage(candidate.opening.package, 'Economy balance opening.package'),
      minimumReserve: normalizeResourceRecord(candidate.opening.minimumReserve, 'Economy balance opening.minimumReserve'),
    },
    expansion: {
      package: normalizePackage(candidate.expansion.package, 'Economy balance expansion.package'),
      workersByResource: normalizeResourceRecord(
        candidate.expansion.workersByResource,
        'Economy balance expansion.workersByResource',
        { integer: true },
      ),
      maxGatherSeconds: assertFinite(candidate.expansion.maxGatherSeconds, 'Economy balance expansion.maxGatherSeconds', {
        positive: true,
      }),
      maxTripEquivalent: assertFinite(
        candidate.expansion.maxTripEquivalent,
        'Economy balance expansion.maxTripEquivalent',
        { positive: true },
      ),
    },
    affordability,
    research: {
      referenceUnitId: assertIdentifier(candidate.research.referenceUnitId, 'Economy balance research.referenceUnitId'),
      maxRatioByTier,
    },
    depletion: {
      sourceAmounts: normalizeResourceRecord(candidate.depletion.sourceAmounts, 'Economy balance depletion.sourceAmounts'),
      workersByResource: normalizeResourceRecord(
        candidate.depletion.workersByResource,
        'Economy balance depletion.workersByResource',
        { integer: true },
      ),
      minSeconds: assertFinite(candidate.depletion.minSeconds, 'Economy balance depletion.minSeconds', { positive: true }),
      maxSeconds: assertFinite(candidate.depletion.maxSeconds, 'Economy balance depletion.maxSeconds', { positive: true }),
    },
    comeback: {
      reserve: normalizeResourceRecord(candidate.comeback.reserve, 'Economy balance comeback.reserve'),
      salvageResourceKind,
      package: normalizePackage(candidate.comeback.package, 'Economy balance comeback.package'),
    },
  });
}

export const DEFAULT_ECONOMY_BALANCE_PROFILE = createEconomyBalanceProfile();

function normalizeCost(cost, label = 'Cost') {
  if (cost === undefined) return Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, 0]));
  assertPlainObject(cost, label);
  return normalizeResourceRecord(cost, label);
}

function sumCosts(left, right) {
  return Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, left[kind] + right[kind]]));
}

function subtractCosts(left, right) {
  return Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, left[kind] - right[kind]]));
}

function resolvePackageCost(packageEntries, { unitTypes, buildingTypes }, label) {
  let total = Object.fromEntries(RESOURCE_KINDS.map((kind) => [kind, 0]));
  for (const entry of packageEntries) {
    const catalog = entry.kind === 'unit' ? unitTypes : buildingTypes;
    const definition = catalog?.[entry.id];
    if (!definition) throw new RangeError(`${label} references unknown ${entry.kind}: ${entry.id}`);
    total = sumCosts(total, normalizeCost(definition.cost, `${entry.kind} ${entry.id} cost`));
  }
  return total;
}

function assertResourceRules(resourceRules) {
  assertPlainObject(resourceRules, 'Resource rules');
  for (const kind of RESOURCE_KINDS) {
    const rule = resourceRules[kind];
    assertPlainObject(rule, `Resource rules.${kind}`);
    assertFinite(rule.carryCapacity, `Resource rules.${kind}.carryCapacity`, { positive: true });
    assertFinite(rule.extractionRate, `Resource rules.${kind}.extractionRate`, { positive: true });
    assertFinite(rule.salvageBurst, `Resource rules.${kind}.salvageBurst`, { positive: true });
  }
}

export function calculateTripEquivalents(cost, resourceRules = DEFAULT_RESOURCE_RULES) {
  assertResourceRules(resourceRules);
  const normalizedCost = normalizeCost(cost);
  const byResource = {};
  let total = 0;
  for (const kind of RESOURCE_KINDS) {
    byResource[kind] = normalizedCost[kind] / resourceRules[kind].carryCapacity;
    total += byResource[kind];
  }
  return deepFreeze({ byResource, total });
}

export function calculateGatherSeconds({
  cost,
  availableResources = {},
  workersByResource,
  resourceRules = DEFAULT_RESOURCE_RULES,
}) {
  assertResourceRules(resourceRules);
  const normalizedCost = normalizeCost(cost);
  const available = normalizeResourceRecord(availableResources, 'Available resources');
  const workers = normalizeResourceRecord(workersByResource, 'Workers by resource', { integer: true });
  const deficits = {};
  const byResource = {};
  for (const kind of RESOURCE_KINDS) {
    deficits[kind] = Math.max(0, normalizedCost[kind] - available[kind]);
    byResource[kind] = deficits[kind] === 0
      ? 0
      : workers[kind] === 0
        ? Infinity
        : deficits[kind] / (workers[kind] * resourceRules[kind].extractionRate);
  }
  return deepFreeze({ deficits, byResource, totalSeconds: Math.max(...Object.values(byResource)) });
}

export function calculateDepletionWindow({
  sourceAmounts,
  workersByResource,
  resourceRules = DEFAULT_RESOURCE_RULES,
}) {
  assertResourceRules(resourceRules);
  const sources = normalizeResourceRecord(sourceAmounts, 'Source amounts');
  const workers = normalizeResourceRecord(workersByResource, 'Workers by resource', { integer: true });
  const byResource = {};
  for (const kind of RESOURCE_KINDS) {
    byResource[kind] = workers[kind] === 0
      ? Infinity
      : sources[kind] / (workers[kind] * resourceRules[kind].extractionRate);
  }
  const finiteValues = Object.values(byResource).filter(Number.isFinite);
  return deepFreeze({
    byResource,
    earliestSeconds: finiteValues.length ? Math.min(...finiteValues) : Infinity,
    latestSeconds: finiteValues.length ? Math.max(...finiteValues) : Infinity,
  });
}

function createCheck(id, passed, details) {
  return deepFreeze({ id, passed: Boolean(passed), ...details });
}

export function evaluateEconomyBalanceBaseline({
  profile = DEFAULT_ECONOMY_BALANCE_PROFILE,
  missions,
  unitTypes,
  buildingTypes,
  upgrades,
  resourceRules = DEFAULT_RESOURCE_RULES,
}) {
  if (!profile || profile.version !== ECONOMY_BALANCE_PROFILE_VERSION) {
    throw new TypeError('A versioned economy balance profile is required.');
  }
  if (!Array.isArray(missions)) throw new TypeError('Economy balance missions must be an array.');
  assertPlainObject(unitTypes, 'Economy balance unit types');
  assertPlainObject(buildingTypes, 'Economy balance building types');
  assertPlainObject(upgrades, 'Economy balance upgrades');
  assertResourceRules(resourceRules);

  const openingMission = missions.find((mission) => mission.id === profile.opening.missionId);
  if (!openingMission) throw new RangeError(`Unknown opening mission: ${profile.opening.missionId}`);
  const openingStart = normalizeResourceRecord(openingMission.start, `Mission ${openingMission.id} start`);
  const catalogs = { unitTypes, buildingTypes };
  const openingCost = resolvePackageCost(profile.opening.package, catalogs, 'Opening package');
  const openingResidual = subtractCosts(openingStart, openingCost);
  const openingPassed = RESOURCE_KINDS.every(
    (kind) => openingResidual[kind] >= profile.opening.minimumReserve[kind],
  );
  const openingCheck = createCheck('opening', openingPassed, {
    start: openingStart,
    cost: openingCost,
    residual: openingResidual,
    minimumReserve: profile.opening.minimumReserve,
  });

  const expansionCost = resolvePackageCost(profile.expansion.package, catalogs, 'Expansion package');
  const expansionGather = calculateGatherSeconds({
    cost: expansionCost,
    availableResources: openingResidual,
    workersByResource: profile.expansion.workersByResource,
    resourceRules,
  });
  const expansionTrips = calculateTripEquivalents(expansionGather.deficits, resourceRules);
  const expansionPassed = expansionGather.totalSeconds <= profile.expansion.maxGatherSeconds
    && expansionTrips.total <= profile.expansion.maxTripEquivalent;
  const expansionCheck = createCheck('expansion', expansionPassed, {
    cost: expansionCost,
    gather: expansionGather,
    tripEquivalent: expansionTrips.total,
    maxGatherSeconds: profile.expansion.maxGatherSeconds,
    maxTripEquivalent: profile.expansion.maxTripEquivalent,
  });

  const affordabilityGroups = profile.affordability.map((group) => {
    const units = group.unitIds.map((unitId) => {
      const definition = unitTypes[unitId];
      if (!definition) throw new RangeError(`Affordability group ${group.id} references unknown unit: ${unitId}`);
      return {
        unitId,
        tripEquivalent: calculateTripEquivalents(definition.cost, resourceRules).total,
      };
    });
    return {
      id: group.id,
      units,
      maximum: Math.max(...units.map((unit) => unit.tripEquivalent)),
      limit: group.maxTripEquivalent,
    };
  });
  const affordabilityPassed = affordabilityGroups.every((group) => group.maximum <= group.limit);
  const affordabilityCheck = createCheck('affordability', affordabilityPassed, { groups: affordabilityGroups });

  const referenceUnit = unitTypes[profile.research.referenceUnitId];
  if (!referenceUnit) throw new RangeError(`Unknown research reference unit: ${profile.research.referenceUnitId}`);
  const referenceTripEquivalent = calculateTripEquivalents(referenceUnit.cost, resourceRules).total;
  const researchTiers = Object.entries(profile.research.maxRatioByTier).map(([tier, limit]) => {
    const tierUpgrades = Object.entries(upgrades)
      .filter(([, definition]) => String(definition.tier) === tier)
      .map(([upgradeId, definition]) => ({
        upgradeId,
        tripEquivalent: calculateTripEquivalents(definition.cost, resourceRules).total,
      }));
    if (tierUpgrades.length === 0) throw new RangeError(`Research baseline has no upgrades for tier ${tier}.`);
    const maximumTripEquivalent = Math.max(...tierUpgrades.map((upgrade) => upgrade.tripEquivalent));
    return {
      tier: Number(tier),
      upgrades: tierUpgrades,
      maximumRatio: maximumTripEquivalent / referenceTripEquivalent,
      limit,
    };
  });
  const researchPassed = researchTiers.every((tier) => tier.maximumRatio <= tier.limit);
  const researchCheck = createCheck('research-opportunity-cost', researchPassed, {
    referenceUnitId: profile.research.referenceUnitId,
    referenceTripEquivalent,
    tiers: researchTiers,
  });

  const depletionWindow = calculateDepletionWindow({
    sourceAmounts: profile.depletion.sourceAmounts,
    workersByResource: profile.depletion.workersByResource,
    resourceRules,
  });
  const depletionPassed = depletionWindow.earliestSeconds >= profile.depletion.minSeconds
    && depletionWindow.latestSeconds <= profile.depletion.maxSeconds;
  const depletionCheck = createCheck('depletion', depletionPassed, {
    window: depletionWindow,
    minimumSeconds: profile.depletion.minSeconds,
    maximumSeconds: profile.depletion.maxSeconds,
  });

  const comebackCost = resolvePackageCost(profile.comeback.package, catalogs, 'Comeback package');
  const comebackAvailable = { ...profile.comeback.reserve };
  comebackAvailable[profile.comeback.salvageResourceKind] +=
    resourceRules[profile.comeback.salvageResourceKind].salvageBurst;
  const comebackResidual = subtractCosts(comebackAvailable, comebackCost);
  const comebackPassed = RESOURCE_KINDS.every((kind) => comebackResidual[kind] >= 0);
  const comebackCheck = createCheck('comeback', comebackPassed, {
    available: comebackAvailable,
    cost: comebackCost,
    residual: comebackResidual,
    salvageResourceKind: profile.comeback.salvageResourceKind,
  });

  const checks = [
    openingCheck,
    expansionCheck,
    affordabilityCheck,
    researchCheck,
    depletionCheck,
    comebackCheck,
  ];
  return deepFreeze({
    version: ECONOMY_BALANCE_PROFILE_VERSION,
    passed: checks.every((check) => check.passed),
    checks,
  });
}
