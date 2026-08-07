import { createAiDoctrineProfile } from '../ai/ai-contracts.js';
import {
  planEconomyForDifficulty,
  resolveAiDifficultyProfile,
} from '../ai/ai-difficulty-profiles.js';
import { BUILDING_TYPES, FACTIONS, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import {
  registerSimulationDelegate,
  SIMULATION_DELEGATE_PHASES,
} from '../core/simulation-delegates.js';
import { resetObjectiveLibrary } from '../systems/objective-library.js';
import { synchronizeNavigationGrid } from '../systems/navigation-movement-system.js';
import {
  getSkirmishMap,
  normalizeSkirmishSetup,
  SKIRMISH_FACTIONS,
  skirmishMissionForSetup,
} from './skirmish-config.js';

const TILE = 32;
const ECONOMY_PLAN_INTERVAL_SECONDS = 5;
const ABSTRACT_GATHER_RATE = 12;

const CANONICAL_FACTION_PRESENTATION = Object.freeze({
  ukraine: Object.freeze({ ...FACTIONS[TEAM.UA] }),
  russia: Object.freeze({ ...FACTIONS[TEAM.RU] }),
});

function cloneResources(resources) {
  return Object.fromEntries(Object.entries(resources).map(([id, amount]) => [id, Number(amount) || 0]));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function deterministicTerrain(seed) {
  const terrain = [];
  const width = WORLD.w / TILE;
  const height = WORLD.h / TILE;
  const phase = seed * 0.071;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const noise = Math.sin(x * 0.37 + phase) + Math.cos(y * 0.29 - phase) + Math.sin((x + y) * 0.13 + phase * 2);
      terrain.push(noise > 1.32 ? 2 : noise < -1.44 ? 1 : 0);
    }
  }
  return terrain;
}

function applyFactionPresentation(setup) {
  Object.assign(FACTIONS[TEAM.UA], CANONICAL_FACTION_PRESENTATION[setup.playerFactionId]);
  Object.assign(FACTIONS[TEAM.RU], CANONICAL_FACTION_PRESENTATION[setup.opponentFactionId]);
}

function restoreFactionPresentation() {
  Object.assign(FACTIONS[TEAM.UA], CANONICAL_FACTION_PRESENTATION.ukraine);
  Object.assign(FACTIONS[TEAM.RU], CANONICAL_FACTION_PRESENTATION.russia);
}

function baseLayout(game, faction, team, origin, mirror = 1) {
  const hq = game.addBuilding('hq', team, origin.x, origin.y);
  game.addBuilding('depot', team, origin.x + mirror * 118, origin.y - 22);
  game.addBuilding('barracks', team, origin.x + mirror * 188, origin.y + 78);
  game.addBuilding('workshop', team, origin.x + mirror * 205, origin.y - 105);
  const offsets = [
    [-45, -5],
    [25, 38],
    [105, 8],
    [135, 65],
    [170, -42],
  ];
  faction.startingUnits.forEach((type, index) => {
    const [dx, dy] = offsets[index] ?? [index * 35, 0];
    const unit = game.addUnit(type, team, origin.x + mirror * dx, origin.y + dy);
    unit.factionId = faction.id;
    if (type === faction.workerType && team === TEAM.RU) unit.skirmishEconomyWorker = true;
  });
  return hq;
}

function productionDuration(type) {
  const stats = UNIT_TYPES[type] ?? {};
  if (stats.hero) return 12;
  if (stats.armor) return 9;
  if (stats.air) return 7;
  return 5;
}

function factionProductionTypes(faction, buildingType) {
  return faction.production[buildingType] ?? [];
}

function canFactionProduce(faction, buildingType, unitType) {
  return factionProductionTypes(faction, buildingType).includes(unitType);
}

function customPlayerQueue(game, type) {
  const state = game.skirmish;
  if (!state) return false;
  const faction = SKIRMISH_FACTIONS[state.setup.playerFactionId];
  const building = game.selectedEntities?.()[0] ?? null;
  const stats = UNIT_TYPES[type];
  const cost = faction.costs[type];
  game.lastError = '';
  if (!building || building.team !== TEAM.UA || !BUILDING_TYPES[building.type]) {
    game.lastError = 'Select a player production building that should train this unit.';
    return false;
  }
  if (building.underConstruction) {
    game.lastError = 'Finish constructing this facility first.';
    return false;
  }
  if (!stats || !cost || !canFactionProduce(faction, building.type, type)) {
    game.lastError = 'This facility cannot produce that unit type.';
    return false;
  }
  if ((building.queue?.length ?? 0) >= 5) {
    game.lastError = 'Production queue is full.';
    return false;
  }
  if (!game.canAfford(cost)) {
    game.lastError = 'Insufficient resources for production.';
    return false;
  }
  const pop = Math.max(0, stats.pop || 0);
  if (game.player.pop + pop > game.player.cap) {
    game.lastError = 'Command capacity exceeded. Construct a logistics depot.';
    return false;
  }
  game.pay(cost);
  game.player.pop += pop;
  const duration = productionDuration(type);
  building.queue.push({
    type,
    left: duration,
    duration,
    cost: cloneResources(cost),
    pop,
    reserved: true,
    started: false,
  });
  return true;
}

function enemyResourceSites(game, state) {
  const origin = state.map.enemyStart;
  return game.nodes
    .filter((node) => node.amount > 0)
    .map((node) => ({ node, distance: Math.hypot(node.x - origin.x, node.y - origin.y) }))
    .sort((left, right) => left.distance - right.distance || left.node.skirmishId.localeCompare(right.node.skirmishId))
    .slice(0, 3);
}

function gatherEnemyResources(game, state, stepSeconds) {
  const workers = game.units.filter((unit) =>
    unit.team === TEAM.RU &&
    unit.type === state.enemyFaction.workerType &&
    unit.hp > 0,
  );
  if (!workers.length) return;
  const sites = enemyResourceSites(game, state);
  if (!sites.length) return;
  workers.forEach((worker, index) => {
    const site = sites[index % sites.length]?.node;
    if (!site || site.amount <= 0) return;
    const gathered = Math.min(site.amount, ABSTRACT_GATHER_RATE * stepSeconds);
    site.amount -= gathered;
    state.enemyResources[site.kind] = (state.enemyResources[site.kind] ?? 0) + gathered;
    state.enemyGathered += gathered;
    worker.skirmishEconomySite = site.skirmishId;
  });
}

function enemyEconomySnapshot(game, state) {
  const enemyBuildings = game.buildings.filter((building) => building.team === TEAM.RU && building.hp > 0);
  const productionBuildings = enemyBuildings.filter((building) => ['barracks', 'workshop'].includes(building.type) && !building.underConstruction);
  const workers = game.units
    .filter((unit) => unit.team === TEAM.RU && unit.type === state.enemyFaction.workerType && unit.hp > 0)
    .map((unit) => ({ id: `unit:${unit.id}`, available: true, priority: 1 }));
  const sites = enemyResourceSites(game, state).map(({ node, distance }) => ({
    id: node.skirmishId,
    resourceId: node.kind,
    capacity: 2,
    threat: 0,
    distance,
    active: node.amount > 0,
    depleted: node.amount <= 0,
    claimed: true,
  }));
  const trainable = Object.values(state.enemyFaction.production).flat();
  const unitOptions = [...new Set(trainable)].map((type, index) => ({
    id: type,
    kind: 'unit',
    priority: (trainable.length - index) + (UNIT_TYPES[type]?.armor ? 4 : 0),
    cost: state.enemyFaction.costs[type] ?? {},
    available: productionBuildings.some((building) => canFactionProduce(state.enemyFaction, building.type, type)) &&
      (buildingQueueSpace(productionBuildings, state.enemyFaction, type) > 0),
  }));
  const enemyUnits = game.units.filter((unit) => unit.team === TEAM.RU && unit.hp > 0);
  const depots = enemyBuildings.filter((building) => building.type === 'depot').length;
  return {
    tick: state.economyTick,
    factionId: state.enemyFaction.id,
    resources: cloneResources(state.enemyResources),
    workers,
    bases: enemyBuildings.filter((building) => building.type === 'hq').map((building) => ({ id: `building:${building.id}`, operational: true })),
    productionBuildings: productionBuildings.map((building) => ({ id: `building:${building.id}`, operational: true })),
    resourceSites: sites,
    damagedStructures: [],
    buildOptions: [],
    unitOptions,
    researchOptions: [],
    capacity: { used: enemyUnits.length, maximum: 18 + depots * 8 },
    targets: {
      desiredBases: 1,
      desiredProductionBuildings: Math.max(1, Math.min(2, productionBuildings.length || 1)),
      desiredCapacityBuffer: 2,
      expansionWorkerSaturation: 0.85,
      reserveFraction: 0.08,
    },
  };
}

function buildingQueueSpace(buildings, faction, type) {
  return buildings
    .filter((building) => canFactionProduce(faction, building.type, type))
    .reduce((total, building) => total + Math.max(0, 5 - (building.queue?.length ?? 0)), 0);
}

function queueEnemyUnit(game, state, type) {
  const building = game.buildings
    .filter((candidate) =>
      candidate.team === TEAM.RU &&
      candidate.hp > 0 &&
      !candidate.underConstruction &&
      canFactionProduce(state.enemyFaction, candidate.type, type) &&
      (candidate.queue?.length ?? 0) < 5)
    .sort((left, right) => left.id - right.id)[0];
  if (!building) return false;
  const duration = productionDuration(type);
  building.queue.push({
    type,
    left: duration,
    duration,
    cost: cloneResources(state.enemyFaction.costs[type] ?? {}),
    pop: 0,
    reserved: false,
    started: false,
    skirmishAi: true,
  });
  return true;
}

function planEnemyEconomy(game, state) {
  const snapshot = enemyEconomySnapshot(game, state);
  const plan = planEconomyForDifficulty({
    snapshot,
    doctrine: state.enemyDoctrine,
    difficulty: state.setup.difficultyId,
  });
  state.lastEconomyPlan = plan;
  state.enemyResources = cloneResources(plan.remainingResources);
  for (const action of plan.actions) {
    if (action.type === 'train-unit') queueEnemyUnit(game, state, action.optionId);
  }
  state.economyTick += 1;
}

function tacticalReactionWindowSeconds(difficultyId) {
  const profile = resolveAiDifficultyProfile(difficultyId);
  return Math.max(0.12, 0.16 + (profile.observationDelayTicks + profile.reactionDelayTicks) / 90 + (1 - profile.planningQuality) * 0.7);
}

function updateSkirmishAi(game, stepSeconds) {
  const state = game.skirmish;
  if (!state || game.gameOver) return null;
  gatherEnemyResources(game, state, stepSeconds);
  state.economyAccumulator += stepSeconds;
  if (state.economyAccumulator >= ECONOMY_PLAN_INTERVAL_SECONDS) {
    state.economyAccumulator %= ECONOMY_PLAN_INTERVAL_SECONDS;
    planEnemyEconomy(game, state);
  }
  state.tacticalAccumulator += stepSeconds;
  const windowSeconds = tacticalReactionWindowSeconds(state.setup.difficultyId);
  const tacticalWindowOpen = state.tacticalAccumulator >= windowSeconds;
  if (tacticalWindowOpen) state.tacticalAccumulator %= windowSeconds;
  game.setTacticalAiEnabled?.(tacticalWindowOpen);
  return Object.freeze({
    difficultyId: state.setup.difficultyId,
    enemyResources: cloneResources(state.enemyResources),
    enemyGathered: state.enemyGathered,
    economyTick: state.economyTick,
    tacticalWindowOpen,
  });
}

function makeNodes(map) {
  return map.resources.map((resource) => ({
    x: resource.x,
    y: resource.y,
    kind: resource.kind,
    amount: resource.amount,
    maxAmount: resource.amount,
    label: `${resource.kind.toUpperCase()} Site`,
    skirmishId: resource.id,
  }));
}

function setPlayerCamera(game, origin) {
  const width = Number(globalThis.innerWidth) || 1280;
  const height = Number(globalThis.innerHeight) || 720;
  game.camera = {
    x: width / 2 - origin.x * 0.85,
    y: height / 2 - origin.y * 0.85,
    z: 0.85,
  };
}

function initializeSkirmish(game, setup) {
  const map = getSkirmishMap(setup.mapId);
  const mission = skirmishMissionForSetup(setup);
  const playerFaction = SKIRMISH_FACTIONS[setup.playerFactionId];
  const enemyFaction = SKIRMISH_FACTIONS[setup.opponentFactionId];

  game.mission = mission;
  game.missionIndex = -1;
  game.units = [];
  game.buildings = [];
  game.nodes = makeNodes(map);
  game.projectiles = [];
  game.effects = [];
  game.selected.clear();
  game.nextId = 1;
  game.time = 0;
  game.wave = 0;
  game.gameOver = false;
  game.outcome = null;
  game.endReason = '';
  game.lastError = '';
  game.pendingBuild = null;
  game.mouse.attackMove = false;
  game.player = {
    ...cloneResources(setup.startingResources),
    pop: 0,
    cap: 12,
    mined: 0,
    objectives: [false],
    upgrades: new Set(),
  };
  game.enemy = { clock: Number.POSITIVE_INFINITY, pausedForCap: false };
  game.terrain = deterministicTerrain(map.seed);
  game.road = map.road.map(([x, y]) => [x, y]);
  game.playerFactionId = playerFaction.id;
  game.enemyFactionId = enemyFaction.id;

  const playerHq = baseLayout(game, playerFaction, TEAM.UA, map.playerStart, 1);
  const enemyHq = baseLayout(game, enemyFaction, TEAM.RU, map.enemyStart, -1);
  game.uaHQ = playerHq;
  game.ruHQ = enemyHq;
  resetObjectiveLibrary(game);
  synchronizeNavigationGrid(game);
  setPlayerCamera(game, map.playerStart);

  game.skirmish = {
    setup,
    map,
    playerFaction,
    enemyFaction,
    enemyResources: cloneResources(setup.startingResources),
    enemyGathered: 0,
    economyAccumulator: 0,
    tacticalAccumulator: tacticalReactionWindowSeconds(setup.difficultyId),
    economyTick: 0,
    lastEconomyPlan: null,
    enemyDoctrine: createAiDoctrineProfile({
      id: `${enemyFaction.id}.skirmish-economy`,
      factionId: enemyFaction.id,
      strategy: enemyFaction.id === 'russia' ? 'echeloned-pressure' : 'networked-maneuver',
      riskTolerance: enemyFaction.id === 'russia' ? 0.6 : 0.52,
      retreatThreshold: enemyFaction.id === 'russia' ? 0.28 : 0.35,
    }),
  };
  game.setTacticalAiEnabled?.(true);
  return game.skirmish;
}

export function installSkirmishFramework(game) {
  if (!game || typeof game.start !== 'function' || typeof game.addUnit !== 'function' || typeof game.addBuilding !== 'function') {
    throw new TypeError('Skirmish framework requires the authoritative Game runtime.');
  }
  if (game.startSkirmish) throw new Error('Skirmish framework is already installed.');
  const originalStart = game.start;
  const originalQueue = game.queue?.bind(game);
  const originalBuildingCanProduce = game.buildingCanProduce?.bind(game);
  const disposeDelegate = registerSimulationDelegate(game, {
    phase: SIMULATION_DELEGATE_PHASES.STEP_BEGIN,
    id: 'skirmish-ai-economy',
    order: -50,
    run: (_game, stepSeconds) => updateSkirmishAi(game, stepSeconds),
  });

  game.start = (...args) => {
    restoreFactionPresentation();
    game.skirmish = null;
    game.playerFactionId = 'ukraine';
    game.enemyFactionId = 'russia';
    game.setTacticalAiEnabled?.(true);
    return originalStart.apply(game, args);
  };
  game.startSkirmish = (value = {}) => {
    const setup = normalizeSkirmishSetup(value);
    applyFactionPresentation(setup);
    originalStart.call(game, 0);
    return initializeSkirmish(game, setup);
  };
  game.buildingCanProduce = (building, type) => {
    if (!game.skirmish) return originalBuildingCanProduce?.(building, type) ?? false;
    const faction = SKIRMISH_FACTIONS[game.skirmish.setup.playerFactionId];
    return Boolean(building?.team === TEAM.UA && canFactionProduce(faction, building.type, type));
  };
  if (originalQueue) {
    game.queue = (type) => {
      if (!game.skirmish || game.skirmish.setup.playerFactionId === 'ukraine') return originalQueue(type);
      return customPlayerQueue(game, type);
    };
  }
  game.skirmishProductionTypes = (buildingType) => {
    if (!game.skirmish) return null;
    return factionProductionTypes(SKIRMISH_FACTIONS[game.skirmish.setup.playerFactionId], buildingType);
  };
  game.skirmishSnapshot = () => {
    if (!game.skirmish) return null;
    return Object.freeze({
      setup: game.skirmish.setup,
      mapId: game.skirmish.map.id,
      enemyResources: cloneResources(game.skirmish.enemyResources),
      enemyGathered: game.skirmish.enemyGathered,
      economyTick: game.skirmish.economyTick,
      lastEconomyPlan: game.skirmish.lastEconomyPlan,
    });
  };

  return () => {
    disposeDelegate();
    restoreFactionPresentation();
    game.start = originalStart;
    if (originalQueue) game.queue = originalQueue;
    if (originalBuildingCanProduce) game.buildingCanProduce = originalBuildingCanProduce;
    delete game.startSkirmish;
    delete game.skirmishProductionTypes;
    delete game.skirmishSnapshot;
    delete game.skirmish;
    delete game.playerFactionId;
    delete game.enemyFactionId;
    game.setTacticalAiEnabled?.(true);
  };
}
