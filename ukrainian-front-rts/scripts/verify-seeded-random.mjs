import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameRuntime } from '../src/app/runtime.js';
import { randomBetween } from '../src/core/math.js';
import {
  SeededRandom,
  deriveSimulationSeed,
  restoreSimulationRandom,
  setSimulationSeed,
  simulationRandom,
  snapshotSimulationRandom,
} from '../src/core/random.js';
import { updateProjectiles } from '../src/systems/projectile-system.js';
import { spawnEnemyWave } from '../src/systems/wave-system.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function sequence(seed, count = 8) {
  const random = new SeededRandom(seed);
  return Array.from({ length: count }, () => random.next());
}

assert.deepEqual(sequence('same-seed'), sequence('same-seed'));
assert.notDeepEqual(sequence('same-seed'), sequence('different-seed'));
assert.equal(deriveSimulationSeed('campaign', 2), deriveSimulationSeed('campaign', 2));
assert.notEqual(deriveSimulationSeed('campaign', 1), deriveSimulationSeed('campaign', 2));

const snapshotRandom = new SeededRandom('snapshot-seed');
snapshotRandom.next();
const snapshot = snapshotRandom.snapshot();
const afterSnapshot = [snapshotRandom.next(), snapshotRandom.next(), snapshotRandom.next()];
snapshotRandom.restore(snapshot);
assert.deepEqual([snapshotRandom.next(), snapshotRandom.next(), snapshotRandom.next()], afterSnapshot);

function placementSnapshot(seed) {
  setSimulationSeed(seed);
  return {
    playerHero: [390 + randomBetween(-25, 25), 1290 + randomBetween(-20, 20)],
    enemyHero: [2210 + randomBetween(-20, 20), 390 + randomBetween(-20, 20)],
    initialCooldown: randomBetween(0, 0.4),
    productionExitX: 500 + randomBetween(-70, 70),
  };
}

assert.deepEqual(placementSnapshot('placement-a'), placementSnapshot('placement-a'));
assert.notDeepEqual(placementSnapshot('placement-a'), placementSnapshot('placement-b'));

function waveSnapshot(seed) {
  setSimulationSeed(seed);
  const units = [];
  const game = {
    mission: { id: 'donbas' },
    wave: 0,
    ruHQ: { x: 2300, y: 260 },
    uaHQ: { x: 230, y: 1390 },
    addUnit(type, team, x, y) {
      const unit = { type, team, x, y };
      units.push(unit);
      return unit;
    },
  };
  spawnEnemyWave(game);
  return units.map(({ type, team, x, y, waveSpawned, waveId, order }) => ({
    type,
    team,
    x,
    y,
    waveSpawned,
    waveId,
    order,
  }));
}

assert.deepEqual(waveSnapshot('wave-a'), waveSnapshot('wave-a'));
assert.notDeepEqual(waveSnapshot('wave-a'), waveSnapshot('wave-b'));

function combatSnapshot(seed) {
  setSimulationSeed(seed);
  return Array.from({ length: 5 }, () => {
    const target = { hp: 1000, x: 0, y: 0 };
    const game = {
      projectiles: [{ life: 1, target, x: 0, y: 0, speed: 100, damage: 100 }],
      effects: [],
    };
    updateProjectiles(game, 0.1);
    return 1000 - target.hp;
  });
}

assert.deepEqual(combatSnapshot('combat-a'), combatSnapshot('combat-a'));
assert.notDeepEqual(combatSnapshot('combat-a'), combatSnapshot('combat-b'));

setSimulationSeed('global-snapshot');
simulationRandom.next();
const globalSnapshot = snapshotSimulationRandom();
const globalSequence = [simulationRandom.next(), simulationRandom.next()];
restoreSimulationRandom(globalSnapshot);
assert.deepEqual([simulationRandom.next(), simulationRandom.next()], globalSequence);

const runtimeGame = {
  mission: null,
  start(index) {
    this.mission = { waves: { firstDelay: 1 } };
    this.index = index;
    this.placement = [randomBetween(-10, 10), randomBetween(-10, 10)];
  },
};
const runtime = createGameRuntime({
  game: runtimeGame,
  renderer: { render() {} },
  ui: { setMission() {}, toast() {}, refresh() {} },
  simulationSeed: 'runtime-seed',
  requestFrame: () => 1,
  cancelFrame() {},
});
runtime.startMission(0);
const firstRuntimePlacement = [...runtimeGame.placement];
randomBetween(0, 1);
runtime.startMission(0);
assert.deepEqual(runtimeGame.placement, firstRuntimePlacement);
runtime.startMission(1);
assert.notDeepEqual(runtimeGame.placement, firstRuntimePlacement);

const simulationFiles = [
  join(projectRoot, 'src/game.js'),
  join(projectRoot, 'src/core/math.js'),
  ...readdirSync(join(projectRoot, 'src/systems'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => join(projectRoot, 'src/systems', name)),
];
const directRandomUsers = simulationFiles.filter((path) => readFileSync(path, 'utf8').includes('Math.random'));
assert.deepEqual(directRandomUsers, [], `Simulation files must not call Math.random: ${directRandomUsers.join(', ')}`);
assert.match(readFileSync(join(projectRoot, 'src/core/math.js'), 'utf8'), /simulationRandom\.range/);

console.log('Seeded random verification passed for placements, waves, combat, resets, and snapshots.');
