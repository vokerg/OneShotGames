import {
  DEFAULT_SIMULATION_SEED,
  deriveSimulationSeed,
  setSimulationSeed,
  snapshotSimulationRandom,
} from '../core/random.js';
import { Game } from '../game.js';

export const DEFAULT_SIMULATION_TICK_SECONDS = 1 / 30;
export const DEFAULT_HEADLESS_VIEWPORT = Object.freeze({ width: 1280, height: 720 });

function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
  return value;
}

function normalizeViewport(viewport) {
  if (!viewport || typeof viewport !== 'object') {
    throw new TypeError('Headless viewport must be an object with width and height.');
  }
  return Object.freeze({
    width: positiveFinite(viewport.width, 'Headless viewport width'),
    height: positiveFinite(viewport.height, 'Headless viewport height'),
  });
}

function withViewportGlobals(viewport, callback) {
  const previous = new Map();
  for (const [name, value] of [
    ['innerWidth', viewport.width],
    ['innerHeight', viewport.height],
  ]) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: false,
      writable: true,
      value,
    });
  }

  try {
    return callback();
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

function copyRecord(value) {
  return value && typeof value === 'object' ? { ...value } : value;
}

function snapshotOrder(order) {
  if (!order) return null;
  return {
    kind: order.kind,
    ...(Number.isFinite(order.x) ? { x: order.x } : {}),
    ...(Number.isFinite(order.y) ? { y: order.y } : {}),
    ...(order.target?.id !== undefined ? { targetId: order.target.id } : {}),
  };
}

function snapshotUnit(unit) {
  return {
    id: unit.id,
    type: unit.type,
    team: unit.team,
    x: unit.x,
    y: unit.y,
    hp: unit.hp,
    maxHp: unit.maxHp,
    cool: unit.cool,
    abilityCd: copyRecord(unit.abilityCd),
    order: snapshotOrder(unit.order),
    targetId: unit.target?.id ?? null,
    selected: Boolean(unit.selected),
    angle: unit.angle,
    flash: unit.flash,
    carry: unit.carry,
    carryKind: unit.carryKind,
    buffs: copyRecord(unit.buffs),
    kills: unit.kills,
    autoFire: Boolean(unit.autoFire),
    waveSpawned: Boolean(unit.waveSpawned),
    waveId: unit.waveId,
  };
}

function snapshotBuilding(building) {
  return {
    id: building.id,
    type: building.type,
    team: building.team,
    x: building.x,
    y: building.y,
    hp: building.hp,
    maxHp: building.maxHp,
    selected: Boolean(building.selected),
    underConstruction: Boolean(building.underConstruction),
    capacityGranted: Boolean(building.capacityGranted),
    queue: (building.queue || []).map((item) => ({ ...item })),
  };
}

function snapshotPlayer(player) {
  if (!player) return null;
  return {
    ...player,
    objectives: [...(player.objectives || [])],
    upgrades: [...(player.upgrades || [])].sort(),
  };
}

function commandResult(game, value, { falseIsFailure = true } = {}) {
  return {
    ok: falseIsFailure ? value !== false : !game.lastError,
    value,
    error: game.lastError || '',
  };
}

export function createSimulationHarness({
  gameFactory = () => new Game(),
  tickSeconds = DEFAULT_SIMULATION_TICK_SECONDS,
  viewport = DEFAULT_HEADLESS_VIEWPORT,
  simulationSeed = DEFAULT_SIMULATION_SEED,
} = {}) {
  if (typeof gameFactory !== 'function') throw new TypeError('gameFactory must be a function.');
  positiveFinite(tickSeconds, 'Simulation tick duration');
  const activeViewport = normalizeViewport(viewport);
  const game = gameFactory();
  for (const method of ['start', 'update', 'select', 'issue']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Headless game must provide a ${method}() method.`);
    }
  }

  let tick = 0;

  function requireStarted() {
    if (!game.mission) throw new Error('Start a scenario before issuing commands or advancing ticks.');
  }

  function entities() {
    return [...(game.units || []), ...(game.buildings || [])];
  }

  function entityById(id) {
    return entities().find((entity) => entity.id === id) || null;
  }

  function requireEntity(id, label = 'entity') {
    const entity = entityById(id);
    if (!entity) throw new Error(`Unknown simulation ${label} id: ${id}`);
    return entity;
  }

  function snapshot() {
    requireStarted();
    return {
      tick,
      tickSeconds,
      simulationSeed: game.simulationSeed,
      random: snapshotSimulationRandom(),
      missionIndex: game.missionIndex,
      missionId: game.mission?.id ?? null,
      time: game.time,
      wave: game.wave,
      gameOver: Boolean(game.gameOver),
      outcome: game.outcome,
      endReason: game.endReason,
      lastError: game.lastError,
      camera: copyRecord(game.camera),
      player: snapshotPlayer(game.player),
      enemy: copyRecord(game.enemy),
      selectedIds: [...(game.selected || [])].sort((left, right) => left - right),
      units: (game.units || []).map(snapshotUnit),
      buildings: (game.buildings || []).map(snapshotBuilding),
      nodes: (game.nodes || []).map((node) => ({ ...node })),
      projectiles: (game.projectiles || []).map((projectile) => ({
        x: projectile.x,
        y: projectile.y,
        team: projectile.team,
        speed: projectile.speed,
        damage: projectile.damage,
        life: projectile.life,
        kind: projectile.kind,
        sourceId: projectile.source?.id ?? null,
        targetId: projectile.target?.id ?? null,
      })),
      effects: (game.effects || []).map((effect) => ({ ...effect })),
    };
  }

  function startScenario({ missionIndex = 0, seed = simulationSeed } = {}) {
    if (!Number.isInteger(missionIndex) || missionIndex < 0) {
      throw new RangeError('missionIndex must be a non-negative integer.');
    }
    const activeSeed = deriveSimulationSeed(seed, missionIndex);
    setSimulationSeed(activeSeed);
    game.simulationSeed = activeSeed;
    withViewportGlobals(activeViewport, () => game.start(missionIndex));
    tick = 0;
    return snapshot();
  }

  function selectEntities(entityIds = []) {
    if (!Array.isArray(entityIds)) throw new TypeError('select.entityIds must be an array.');
    game.select(null);
    entityIds.forEach((id, index) => game.select(requireEntity(id), index > 0));
    return commandResult(game, true);
  }

  function point(command) {
    if (!Number.isFinite(command.x) || !Number.isFinite(command.y)) {
      throw new TypeError(`${command.type} requires finite x and y coordinates.`);
    }
    return [command.x, command.y];
  }

  function issueCommand(command) {
    requireStarted();
    if (!command || typeof command !== 'object' || typeof command.type !== 'string') {
      throw new TypeError('Simulation command must be an object with a string type.');
    }

    game.lastError = '';

    switch (command.type) {
      case 'select':
        return selectEntities(command.entityIds || []);
      case 'move': {
        const [x, y] = point(command);
        return commandResult(game, game.issue(x, y, null));
      }
      case 'attackMove': {
        const [x, y] = point(command);
        const armed = game.armAttackMove();
        if (armed === false) return commandResult(game, false);
        return commandResult(game, game.issue(x, y, null));
      }
      case 'attack': {
        const target = requireEntity(command.targetId, 'target');
        return commandResult(game, game.issue(target.x, target.y, target));
      }
      case 'stop':
        return commandResult(game, game.stopSelected());
      case 'toggleAutoFire':
        return commandResult(game, game.toggleAutoFire(), { falseIsFailure: false });
      case 'research':
        return commandResult(game, game.research(command.upgradeId));
      case 'queue':
        if (command.buildingId !== undefined) selectEntities([command.buildingId]);
        return commandResult(game, game.queue(command.unitType));
      case 'ability':
        return commandResult(game, game.useAbility(command.abilityId));
      case 'spawnWave': {
        const spawned = game.spawnWave();
        return commandResult(game, (spawned || []).map((unit) => unit.id));
      }
      default:
        throw new Error(`Unknown simulation command type: ${command.type}`);
    }
  }

  function advanceTicks(count = 1) {
    requireStarted();
    if (!Number.isInteger(count) || count < 0) {
      throw new RangeError('Tick count must be a non-negative integer.');
    }
    withViewportGlobals(activeViewport, () => {
      for (let index = 0; index < count; index += 1) {
        game.update(tickSeconds);
        tick += 1;
      }
    });
    return snapshot();
  }

  function assertState(predicate, message = 'Simulation state assertion failed.') {
    if (typeof predicate !== 'function') throw new TypeError('State assertion must be a function.');
    const state = snapshot();
    if (!predicate(state, game)) throw new Error(message);
    return state;
  }

  return {
    game,
    viewport: activeViewport,
    tickSeconds,
    startScenario,
    issueCommand,
    advanceTicks,
    snapshot,
    assertState,
    entityById,
  };
}
