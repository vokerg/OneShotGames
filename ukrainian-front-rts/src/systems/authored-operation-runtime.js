import { MISSIONS, TEAM, UNIT_TYPES, WORLD } from '../config.js';
import { loadAuthoredMap } from '../core/authored-map.js';

const RUNTIME_TERRAIN = Object.freeze({
  open: 0, road: 5, mud: 1, shelterbelt: 2, rubble: 3, blocked: 6, water: 4, bridge: 0,
});
const RUNTIME_UNIT_ALIASES = Object.freeze({
  uaCommandVarta: 'uaIfv',
  ruCommandBastion: 'ruIfv',
});
const SUPPORTED_OBJECTIVE_TYPES = new Set([
  'build', 'gather', 'capture', 'escort', 'defend', 'survive',
  'destroy', 'disable', 'rescue', 'recon', 'extract',
]);
const DEFAULT_STARTING_RESOURCES = Object.freeze({ metal: 240, fuel: 110, intel: 25 });

const finiteResource = (value, fallback) => Number.isFinite(value) && value >= 0 ? value : fallback;
const cellCenter = (cell, tileSize) => Object.freeze({ x: (cell.x + 0.5) * tileSize, y: (cell.y + 0.5) * tileSize });

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

function finaleObjectiveDefinition(objective) {
  const common = {
    id: objective.id,
    label: objective.label ?? objective.id,
    optional: Boolean(objective.optional),
    failureReason: `${objective.label ?? objective.id} failed.`,
  };
  if (objective.id === 'restore-battlefield-picture') return { ...common, type: 'survive', durationSeconds: 20 };
  if (objective.id === 'silence-long-range-fires') {
    return { ...common, type: 'destroy', target: { collection: 'units', team: TEAM.RU, type: 'ruArtillery' }, count: 1 };
  }
  if (objective.id === 'open-final-corridor') {
    return { ...common, type: 'destroy', target: { collection: 'units', team: TEAM.RU, type: 'ruIfv' }, count: 1 };
  }
  if (objective.id === 'hold-against-counterattack') return { ...common, type: 'survive', durationSeconds: 180 };
  if (objective.id === 'break-command-network') {
    return { ...common, type: 'destroy', target: { collection: 'units', scriptId: 'ru-finale-8' }, count: 1 };
  }
  return { ...common, type: 'survive', durationSeconds: 30 };
}

function runtimeObjectiveDefinitions(operation) {
  const definitions = operation.mission?.objectiveDefinitions ?? [];
  if (definitions.every((objective) => SUPPORTED_OBJECTIVE_TYPES.has(objective.type))) return definitions;
  return definitions.map(finaleObjectiveDefinition);
}

function missionPresentation(operation, map) {
  const objectiveDefinitions = runtimeObjectiveDefinitions(operation);
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
    objectiveIds: objectiveDefinitions.map((objective) => objective.id),
    objectiveDefinitions,
    heroes: [], enemyHeroes: [], trainableHeroes: [],
    waves: { firstDelay: firstScriptPressureDelay(operation), interval: 0, maxWaves: 0, maxActive: 0, composition: [] },
  };
}

function runtimeCell(position) {
  return Object.freeze({
    x: Math.max(0, Math.min(WORLD.w / WORLD.tile - 1, Math.floor(position.x / WORLD.tile))),
    y: Math.max(0, Math.min(WORLD.h / WORLD.tile - 1, Math.floor(position.y / WORLD.tile))),
  });
}

function generatedCompositionMap(operation) {
  const composition = operation.mission?.composition ?? {};
  const player = Array.isArray(composition.player) ? composition.player : [];
  const enemy = Array.isArray(composition.enemy) ? composition.enemy : [];
  const cells = Object.freeze(Array((WORLD.w / WORLD.tile) * (WORLD.h / WORLD.tile)).fill('open'));
  return Object.freeze({
    id: `${operation.id}.runtime-map`,
    name: `${operation.title ?? operation.id} battlefield`,
    tileSize: WORLD.tile,
    grid: Object.freeze({ width: WORLD.w / WORLD.tile, height: WORLD.h / WORLD.tile }),
    terrain: Object.freeze({ cells }),
    roads: Object.freeze([]), bridges: Object.freeze([]), props: Object.freeze([]), resources: Object.freeze([]),
    starts: Object.freeze({
      player: Object.freeze(player.map((entry) => ({ id: entry.id, cell: runtimeCell(entry.position), facing: 0 }))),
      enemy: Object.freeze(enemy.map((entry) => ({ id: entry.id, cell: runtimeCell(entry.position), facing: 180 }))),
    }),
    navigation: Object.freeze({ shelterbelts: Object.freeze([]), passabilityOverrides: Object.freeze([]) }),
    metadata: Object.freeze({ generatedFromMissionComposition: true, regionId: 'donbas' }),
  });
}

const operationMap = (operation) => operation.map ? loadAuthoredMap(operation.map) : generatedCompositionMap(operation);

function footprintCells(prop) {
  const cells = [];
  const width = Math.max(1, prop.footprint?.width ?? 1);
  const height = Math.max(1, prop.footprint?.height ?? 1);
  for (let y = prop.cell.y; y < prop.cell.y + height; y += 1) {
    for (let x = prop.cell.x; x < prop.cell.x + width; x += 1) cells.push({ x, y });
  }
  return cells;
}

function copyTerrainToRuntime(map) {
  if (map.tileSize !== WORLD.tile) throw new Error(`Authored operation map ${map.id} uses ${map.tileSize}px tiles; runtime requires ${WORLD.tile}px tiles.`);
  const runtimeWidth = WORLD.w / WORLD.tile;
  const runtimeHeight = WORLD.h / WORLD.tile;
  if (map.grid.width > runtimeWidth || map.grid.height > runtimeHeight) {
    throw new Error(`Authored operation map ${map.id} exceeds the ${runtimeWidth}x${runtimeHeight} runtime grid.`);
  }
  const terrain = Array(runtimeWidth * runtimeHeight).fill(0);
  for (let y = 0; y < map.grid.height; y += 1) {
    for (let x = 0; x < map.grid.width; x += 1) {
      terrain[y * runtimeWidth + x] = RUNTIME_TERRAIN[map.terrain.cells[y * map.grid.width + x]] ?? 0;
    }
  }
  for (const prop of map.props ?? []) {
    if (!(prop.blockingLayers ?? []).includes('ground')) continue;
    for (const cell of footprintCells(prop)) terrain[cell.y * runtimeWidth + cell.x] = RUNTIME_TERRAIN.blocked;
  }
  for (const override of map.navigation?.passabilityOverrides ?? []) {
    if (override.layers?.ground === false) terrain[override.cell.y * runtimeWidth + override.cell.x] = RUNTIME_TERRAIN.blocked;
  }
  return terrain;
}

function longestRoadPolyline(map) {
  const road = [...(map.roads ?? [])].sort((left, right) => right.cells.length - left.cells.length)[0];
  return road?.cells?.map((cell) => { const center = cellCenter(cell, map.tileSize); return [center.x, center.y]; }) ?? [];
}

const copyCells = (features = []) => features.flatMap((feature) => feature.cells.map((cell) => ({ x: cell.x, y: cell.y })));

function resetMissionRuntime(game, mission, map, resources) {
  Object.assign(game, {
    mission,
    missionScript: null,
    missionScriptState: null,
    missionScriptRecords: [],
    dialogueQueue: [], cameraCues: [], cameraCue: null, weather: null,
    objectiveLibraryState: null, objectiveLibrarySummary: null, objectiveResults: [], objectiveMetrics: {},
    reconRegions: new Set(), time: 0, wave: 0,
    enemy: { clock: mission.waves.firstDelay, pausedForCap: false },
    player: { ...resources, pop: 0, cap: 14, mined: 0, objectives: Array(mission.objectiveDefinitions.length).fill(false), upgrades: new Set() },
    units: [], buildings: [], nodes: [], projectiles: [], effects: [], pendingBuild: null,
    gameOver: false, outcome: null, endReason: '', nextId: 1,
    authoredMap: map,
    terrain: copyTerrainToRuntime(map),
    road: longestRoadPolyline(map),
    bridges: copyCells(map.bridges),
    shelterbelts: map.navigation?.shelterbelts?.map((cell) => ({ x: cell.x, y: cell.y })) ?? [],
    navigationState: null,
  });
  game.selected?.clear?.();
  if (game.mouse) game.mouse.attackMove = false;
}

function applyEntityMetadata(entity, source, fallbackId, authoredType = null) {
  entity.scriptId = source.scriptId ?? source.id ?? fallbackId;
  if (source.tag) entity.scriptTag = source.tag;
  if (Array.isArray(source.tags)) entity.tags = [...source.tags];
  if (source.role) entity.authoredRole = source.role;
  if (source.mechanic) entity.authoredMechanic = source.mechanic;
  if (source.contract) entity.authoredContract = source.contract;
  if (authoredType && authoredType !== entity.type) entity.authoredType = authoredType;
  if (source.state && typeof source.state === 'object' && !Array.isArray(source.state)) Object.assign(entity, source.state);
  return entity;
}

function runtimeUnitType(type) {
  if (UNIT_TYPES[type]) return type;
  const alias = RUNTIME_UNIT_ALIASES[type];
  if (alias && UNIT_TYPES[alias]) return alias;
  throw new Error(`Authored unit type ${type} has no runtime compatibility mapping.`);
}

function spawnMapMetadataStarts(game, map) {
  const created = [];
  for (const entries of Object.values(map.starts ?? {})) {
    for (const start of entries) {
      const metadata = start.metadata ?? {};
      if (!metadata.type || ![TEAM.UA, TEAM.RU].includes(metadata.team)) continue;
      const point = cellCenter(start.cell, map.tileSize);
      const entity = metadata.kind === 'building'
        ? game.addBuilding(metadata.type, metadata.team, point.x, point.y, metadata.options ?? {})
        : game.addUnit(runtimeUnitType(metadata.type), metadata.team, point.x, point.y);
      applyEntityMetadata(entity, metadata, start.id, metadata.type);
      if (Number.isFinite(start.facing)) entity.angle = start.facing * Math.PI / 180;
      created.push(entity);
    }
  }
  return created;
}

const mapStartIndex = (map) => new Map(Object.values(map.starts ?? {}).flat().map((start) => [start.id, start]));

function spawnCompositionForces(game, operation, map) {
  const composition = operation.mission?.composition ?? {};
  const startIndex = mapStartIndex(map);
  const offsets = new Map();
  const sources = ['startingForces', 'enemyForces', 'player', 'enemy']
    .flatMap((key) => Array.isArray(composition[key]) ? composition[key] : []);
  const created = [];
  for (const source of sources) {
    if (!source?.type || ![TEAM.UA, TEAM.RU].includes(source.team)) continue;
    let point = source.position;
    let facing = null;
    if (!point && source.startId) {
      const start = startIndex.get(source.startId);
      if (!start) throw new Error(`Authored force ${source.id ?? source.scriptId} references unknown start ${source.startId}.`);
      point = cellCenter(start.cell, map.tileSize);
      facing = start.facing;
      const offset = offsets.get(source.startId) ?? 0;
      offsets.set(source.startId, offset + 1);
      point = { x: point.x + (offset % 3) * 22, y: point.y + Math.floor(offset / 3) * 22 };
    }
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(`Authored force ${source.id ?? source.scriptId} requires a startId or finite position.`);
    }
    const entity = game.addUnit(runtimeUnitType(source.type), source.team, point.x, point.y);
    applyEntityMetadata(entity, source, source.id, source.type);
    if (Number.isFinite(facing)) entity.angle = facing * Math.PI / 180;
    created.push(entity);
  }
  return created;
}

function propCenter(prop, tileSize) {
  const width = Math.max(1, prop.footprint?.width ?? 1);
  const height = Math.max(1, prop.footprint?.height ?? 1);
  return Object.freeze({ x: (prop.cell.x + width / 2) * tileSize, y: (prop.cell.y + height / 2) * tileSize });
}

function spawnCompositionTargets(game, operation, map) {
  const composition = operation.mission?.composition ?? {};
  const propIndex = new Map((map.props ?? []).map((prop) => [prop.id, prop]));
  const descriptors = ['enemyTargets', 'engineerObjects'].flatMap((key) => Array.isArray(composition[key]) ? composition[key] : []);
  return descriptors.map((source) => {
    const prop = propIndex.get(source.propId);
    if (!prop) throw new Error(`Authored target ${source.scriptId ?? source.propId} references unknown prop ${source.propId}.`);
    const point = propCenter(prop, map.tileSize);
    const team = [TEAM.UA, TEAM.RU].includes(source.team) ? source.team : TEAM.RU;
    const entity = game.addBuilding('depot', team, point.x, point.y);
    applyEntityMetadata(entity, { ...prop.metadata, ...source }, source.propId);
    entity.authoredPropId = prop.id;
    entity.authoredPropType = prop.type;
    return entity;
  });
}

function assignHeadquarters(game) {
  const friendly = game.buildings.filter((building) => building.team === TEAM.UA);
  const enemy = game.buildings.filter((building) => building.team === TEAM.RU);
  game.uaHQ = friendly.find((building) => building.type === 'hq') ?? friendly.find((building) => building.type === 'depot') ?? friendly[0] ?? null;
  game.ruHQ = enemy.find((building) => building.type === 'hq') ?? enemy[0] ?? null;
}

function spawnAuthoredEntities(game, operation, map) {
  const created = [
    ...spawnMapMetadataStarts(game, map),
    ...spawnCompositionForces(game, operation, map),
    ...spawnCompositionTargets(game, operation, map),
  ];
  assignHeadquarters(game);
  return created;
}

function spawnAuthoredResources(game, map) {
  game.nodes = (map.resources ?? []).map((resource) => {
    const point = cellCenter(resource.cell, map.tileSize);
    return {
      id: resource.id, x: point.x, y: point.y,
      kind: resource.type === 'materiel' ? 'metal' : resource.type,
      amount: resource.amount, maxAmount: resource.amount,
      label: resource.metadata?.label ?? resource.id, authored: true,
    };
  });
}

function centerCameraOnPlayer(game, map) {
  const firstFriendly = game.units.find((unit) => unit.team === TEAM.UA) ?? game.buildings.find((building) => building.team === TEAM.UA);
  const firstStart = map.starts?.player?.[0] ?? Object.values(map.starts ?? {}).flat()[0];
  const point = firstFriendly ?? (firstStart ? cellCenter(firstStart.cell, map.tileSize) : null);
  if (!point) return;
  const zoom = Number.isFinite(game.camera?.z) ? game.camera.z : 0.75;
  const width = Number.isFinite(globalThis.innerWidth) ? globalThis.innerWidth : 1280;
  const height = Number.isFinite(globalThis.innerHeight) ? globalThis.innerHeight : 720;
  game.camera = { x: width / 2 - point.x * zoom, y: height / 2 - point.y * zoom, z: zoom };
}

export function initializeAuthoredOperation(game, operation, { operationIndex = 0 } = {}) {
  if (!game || typeof game !== 'object') throw new TypeError('Authored operation runtime requires game state.');
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new TypeError('Authored operation runtime requires an operation object.');
  if (!operation.mission) throw new Error(`Operation ${operation.id ?? '<unknown>'} is missing mission content.`);
  if (typeof game.addUnit !== 'function' || typeof game.addBuilding !== 'function') throw new TypeError('Authored operation runtime requires game.addUnit() and game.addBuilding().');
  const map = operationMap(operation);
  const mission = missionPresentation(operation, map);
  const resources = startingResources(operation);
  game.missionIndex = operationIndex;
  game.authoredCampaignOperation = operation;
  resetMissionRuntime(game, mission, map, resources);
  const entities = spawnAuthoredEntities(game, operation, map);
  spawnAuthoredResources(game, map);
  centerCameraOnPlayer(game, map);
  return Object.freeze({ operationId: operation.id, mapId: map.id, missionId: mission.id, startCount: entities.length, resourceCount: game.nodes.length });
}

export function installAuthoredOperationRuntime(game) {
  if (!game || typeof game.start !== 'function') throw new TypeError('Authored operation installer requires game.start().');
  const previousStart = game.start;
  game.start = function authoredOperationAwareStart(index = 0, ...args) {
    const prepared = game.pendingAuthoredCampaignOperation ?? (game.mission?.authored ? game.authoredCampaignOperation : null);
    if (!prepared) return previousStart.call(this, index, ...args);
    const operationIndex = Number.isInteger(index) && index >= 0 ? index : 0;
    const legacyIndex = Math.max(0, Math.min(MISSIONS.length - 1, operationIndex));
    previousStart.call(this, legacyIndex, ...args);
    return initializeAuthoredOperation(this, prepared, { operationIndex });
  };
  return () => { game.start = previousStart; };
}
