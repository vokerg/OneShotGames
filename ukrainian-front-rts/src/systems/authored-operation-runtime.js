import { MISSIONS, TEAM, WORLD } from '../config.js';
import { loadAuthoredMap } from '../core/authored-map.js';

const RUNTIME_TERRAIN = Object.freeze({
  open: 0,
  road: 0,
  mud: 1,
  shelterbelt: 2,
  rubble: 3,
  blocked: 3,
  water: 4,
  bridge: 0,
});

const DEFAULT_STARTING_RESOURCES = Object.freeze({ metal: 240, fuel: 110, intel: 25 });

function finiteResource(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function startingResources(operation) {
  const source = operation?.map?.metadata?.startingResources
    ?? operation?.map?.metadata?.economyOnboarding?.startingResources
    ?? operation?.mission?.startingResources
    ?? operation?.mission?.start
    ?? {};
  return Object.freeze({
    metal: finiteResource(source.metal ?? source.materiel, DEFAULT_STARTING_RESOURCES.metal),
    fuel: finiteResource(source.fuel, DEFAULT_STARTING_RESOURCES.fuel),
    intel: finiteResource(source.intel, DEFAULT_STARTING_RESOURCES.intel),
  });
}

function firstScriptPressureDelay(operation) {
  const values = (operation?.mission?.script?.triggers ?? []).flatMap((trigger) => {
    const condition = trigger?.when;
    return condition?.kind === 'timer' && condition.clock !== 'ticks' && Number.isFinite(condition.value) && condition.value > 0
      ? [condition.value]
      : [];
  });
  return values.length ? Math.min(...values) : 0;
}

function missionPresentation(operation, map) {
  const objectiveDefinitions = operation.mission?.objectiveDefinitions ?? [];
  return {
    ...operation.mission,
    id: operation.id,
    operationId: operation.id,
    authored: true,
    title: operation.title ?? operation.briefing?.title ?? operation.id,
    story: operation.briefing?.summary ?? '',
    mapId: map.id,
    region: map.metadata?.regionId ?? operation.mission?.region ?? 'donbas',
    objectives: objectiveDefinitions.map((objective) => objective.label ?? objective.id),
    objectiveIds: operation.mission?.objectiveIds ?? objectiveDefinitions.map((objective) => objective.id),
    objectiveDefinitions,
    heroes: [],
    enemyHeroes: [],
    trainableHeroes: [],
    waves: {
      firstDelay: firstScriptPressureDelay(operation),
      interval: 0,
      maxWaves: 0,
      maxActive: 0,
      composition: [],
    },
  };
}

function cellCenter(cell, tileSize) {
  return Object.freeze({ x: (cell.x + 0.5) * tileSize, y: (cell.y + 0.5) * tileSize });
}

function copyTerrainToRuntime(map) {
  if (map.tileSize !== WORLD.tile) {
    throw new Error(`Authored operation map ${map.id} uses ${map.tileSize}px tiles; runtime requires ${WORLD.tile}px tiles.`);
  }
  const runtimeWidth = WORLD.w / WORLD.tile;
  const runtimeHeight = WORLD.h / WORLD.tile;
  if (map.grid.width > runtimeWidth || map.grid.height > runtimeHeight) {
    throw new Error(`Authored operation map ${map.id} exceeds the ${runtimeWidth}x${runtimeHeight} runtime grid.`);
  }
  const terrain = Array(runtimeWidth * runtimeHeight).fill(0);
  for (let y = 0; y < map.grid.height; y += 1) {
    for (let x = 0; x < map.grid.width; x += 1) {
      const type = map.terrain.cells[y * map.grid.width + x];
      terrain[y * runtimeWidth + x] = RUNTIME_TERRAIN[type] ?? 0;
    }
  }
  return terrain;
}

function longestRoadPolyline(map) {
  const road = [...(map.roads ?? [])].sort((left, right) => right.cells.length - left.cells.length)[0];
  if (!road?.cells?.length) return [];
  return road.cells.map((cell) => {
    const center = cellCenter(cell, map.tileSize);
    return [center.x, center.y];
  });
}

function copyCells(features = []) {
  return features.flatMap((feature) => feature.cells.map((cell) => ({ x: cell.x, y: cell.y })));
}

function resetMissionRuntime(game, mission, map, resources) {
  game.mission = mission;
  game.missionScript = null;
  game.missionScriptState = null;
  game.missionScriptRecords = [];
  game.dialogueQueue = [];
  game.cameraCues = [];
  game.cameraCue = null;
  game.weather = null;
  game.objectiveLibraryState = null;
  game.objectiveLibrarySummary = null;
  game.objectiveResults = [];
  game.objectiveMetrics = {};
  game.reconRegions = new Set();
  game.time = 0;
  game.wave = 0;
  game.enemy = { clock: mission.waves.firstDelay, pausedForCap: false };
  game.player = {
    ...resources,
    pop: 0,
    cap: 14,
    mined: 0,
    objectives: Array(mission.objectiveDefinitions.length).fill(false),
    upgrades: new Set(),
  };
  game.units = [];
  game.buildings = [];
  game.nodes = [];
  game.projectiles = [];
  game.effects = [];
  game.selected?.clear?.();
  game.pendingBuild = null;
  if (game.mouse) game.mouse.attackMove = false;
  game.gameOver = false;
  game.outcome = null;
  game.endReason = '';
  game.nextId = 1;
  game.authoredMap = map;
  game.terrain = copyTerrainToRuntime(map);
  game.road = longestRoadPolyline(map);
  game.bridges = copyCells(map.bridges);
  game.shelterbelts = map.navigation?.shelterbelts?.map((cell) => ({ x: cell.x, y: cell.y })) ?? [];
  game.navigationState = null;
}

function spawnAuthoredStarts(game, map) {
  const created = [];
  for (const entries of Object.values(map.starts ?? {})) {
    for (const start of entries) {
      const metadata = start.metadata ?? {};
      const kind = metadata.kind ?? 'unit';
      const type = metadata.type;
      const team = metadata.team;
      if (!type || ![TEAM.UA, TEAM.RU].includes(team)) {
        throw new Error(`Authored start ${start.id} requires canonical type and team metadata.`);
      }
      const point = cellCenter(start.cell, map.tileSize);
      const entity = kind === 'building'
        ? game.addBuilding(type, team, point.x, point.y, metadata.options ?? {})
        : game.addUnit(type, team, point.x, point.y);
      entity.scriptId = metadata.scriptId ?? start.id;
      if (metadata.tag) entity.scriptTag = metadata.tag;
      if (Array.isArray(metadata.tags)) entity.tags = [...metadata.tags];
      if (Number.isFinite(start.facing)) entity.angle = start.facing * Math.PI / 180;
      created.push(entity);
    }
  }
  const friendlyBuildings = game.buildings.filter((building) => building.team === TEAM.UA);
  const enemyBuildings = game.buildings.filter((building) => building.team === TEAM.RU);
  game.uaHQ = friendlyBuildings.find((building) => building.type === 'hq')
    ?? friendlyBuildings.find((building) => building.type === 'depot')
    ?? friendlyBuildings[0]
    ?? null;
  game.ruHQ = enemyBuildings.find((building) => building.type === 'hq')
    ?? enemyBuildings[0]
    ?? null;
  return created;
}

function spawnAuthoredResources(game, map) {
  game.nodes = (map.resources ?? []).map((resource) => {
    const point = cellCenter(resource.cell, map.tileSize);
    return {
      id: resource.id,
      x: point.x,
      y: point.y,
      kind: resource.type === 'materiel' ? 'metal' : resource.type,
      amount: resource.amount,
      maxAmount: resource.amount,
      label: resource.metadata?.label ?? resource.id,
      authored: true,
    };
  });
}

function centerCameraOnPlayer(game, map) {
  const first = map.starts?.player?.[0] ?? Object.values(map.starts ?? {}).flat()[0];
  if (!first) return;
  const point = cellCenter(first.cell, map.tileSize);
  const zoom = Number.isFinite(game.camera?.z) ? game.camera.z : 0.75;
  const width = Number.isFinite(globalThis.innerWidth) ? globalThis.innerWidth : 1280;
  const height = Number.isFinite(globalThis.innerHeight) ? globalThis.innerHeight : 720;
  game.camera = {
    x: width / 2 - point.x * zoom,
    y: height / 2 - point.y * zoom,
    z: zoom,
  };
}

export function initializeAuthoredOperation(game, operation, { operationIndex = 0 } = {}) {
  if (!game || typeof game !== 'object') throw new TypeError('Authored operation runtime requires game state.');
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
    throw new TypeError('Authored operation runtime requires an operation object.');
  }
  if (!operation.map || !operation.mission) throw new Error(`Operation ${operation.id ?? '<unknown>'} is missing map or mission content.`);
  if (typeof game.addUnit !== 'function' || typeof game.addBuilding !== 'function') {
    throw new TypeError('Authored operation runtime requires game.addUnit() and game.addBuilding().');
  }
  const map = loadAuthoredMap(operation.map);
  const mission = missionPresentation(operation, map);
  const resources = startingResources(operation);
  game.missionIndex = operationIndex;
  game.authoredCampaignOperation = operation;
  resetMissionRuntime(game, mission, map, resources);
  const starts = spawnAuthoredStarts(game, map);
  spawnAuthoredResources(game, map);
  centerCameraOnPlayer(game, map);
  return Object.freeze({
    operationId: operation.id,
    mapId: map.id,
    missionId: mission.id,
    startCount: starts.length,
    resourceCount: game.nodes.length,
  });
}

export function installAuthoredOperationRuntime(game) {
  if (!game || typeof game.start !== 'function') {
    throw new TypeError('Authored operation installer requires game.start().');
  }
  const previousStart = game.start;
  game.start = function authoredOperationAwareStart(index = 0, ...args) {
    const prepared = game.pendingAuthoredCampaignOperation
      ?? (game.mission?.authored ? game.authoredCampaignOperation : null);
    if (!prepared) return previousStart.call(this, index, ...args);
    const operationIndex = Number.isInteger(index) && index >= 0 ? index : 0;
    const legacyIndex = Math.max(0, Math.min(MISSIONS.length - 1, operationIndex));
    previousStart.call(this, legacyIndex, ...args);
    return initializeAuthoredOperation(this, prepared, { operationIndex });
  };
  return () => {
    game.start = previousStart;
  };
}
