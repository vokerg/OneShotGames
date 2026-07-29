import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  createSimulationHarness,
  DEFAULT_SIMULATION_TICK_SECONDS,
} from '../../src/app/simulation-harness.js';

function descriptor(name) {
  return Object.getOwnPropertyDescriptor(globalThis, name);
}

function firstEntity(game, predicate, label) {
  const entity = [...game.units, ...game.buildings].find(predicate);
  assert.ok(entity, `Expected scenario to contain ${label}.`);
  return entity;
}

test('headless startup needs no DOM or canvas and restores viewport globals', () => {
  const beforeWidth = descriptor('innerWidth');
  const beforeHeight = descriptor('innerHeight');
  assert.equal(typeof globalThis.document, 'undefined');
  assert.equal(typeof globalThis.HTMLCanvasElement, 'undefined');

  const harness = createSimulationHarness({ viewport: { width: 1024, height: 768 } });
  const state = harness.startScenario({ missionIndex: 0, seed: 'headless-start' });

  assert.equal(state.missionId, 'donbas');
  assert.equal(state.missionIndex, 0);
  assert.ok(state.units.length >= 8);
  assert.ok(state.buildings.length >= 6);
  assert.equal(state.camera.x, 1024 / 2 - 390 * 0.85);
  assert.equal(state.camera.y, 768 / 2 - 1320 * 0.85);
  assert.deepEqual(descriptor('innerWidth'), beforeWidth);
  assert.deepEqual(descriptor('innerHeight'), beforeHeight);
});

test('structured commands move selected units through fixed ticks', () => {
  const harness = createSimulationHarness({ tickSeconds: DEFAULT_SIMULATION_TICK_SECONDS });
  harness.startScenario({ missionIndex: 0, seed: 'move-command' });
  const infantry = firstEntity(
    harness.game,
    (entity) => entity.team === TEAM.UA && entity.type === 'uaInfantry',
    'a Ukrainian infantry unit',
  );
  const startX = infantry.x;

  assert.equal(harness.issueCommand({ type: 'select', entityIds: [infantry.id] }).ok, true);
  assert.equal(
    harness.issueCommand({ type: 'move', x: infantry.x + 240, y: infantry.y }).ok,
    true,
  );

  const state = harness.advanceTicks(30);
  const moved = state.units.find((unit) => unit.id === infantry.id);
  assert.equal(state.tick, 30);
  assert.ok(Math.abs(state.time - 1) < 1e-9);
  assert.ok(moved.x > startX);
  assert.equal(moved.order?.kind, 'move');
  harness.assertState(
    (snapshot) => snapshot.selectedIds.includes(infantry.id),
    'Selected unit must remain selected after issuing a move.',
  );
});

test('command dispatch exposes production success and research rejection state', () => {
  const harness = createSimulationHarness();
  harness.startScenario({ missionIndex: 0, seed: 'economy-commands' });
  const barracks = firstEntity(
    harness.game,
    (entity) => entity.team === TEAM.UA && entity.type === 'barracks',
    'a Ukrainian barracks',
  );

  const queued = harness.issueCommand({
    type: 'queue',
    buildingId: barracks.id,
    unitType: 'uaInfantry',
  });
  assert.equal(queued.ok, true);
  assert.equal(barracks.queue.at(-1)?.type, 'uaInfantry');

  const rejected = harness.issueCommand({ type: 'research', upgradeId: 'thermal' });
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /Insufficient resources/);

  harness.game.player.intel = 100;
  const researched = harness.issueCommand({ type: 'research', upgradeId: 'thermal' });
  assert.equal(researched.ok, true);
  assert.ok(harness.snapshot().player.upgrades.includes('thermal'));
});

test('identical seeds and command streams produce identical snapshots', () => {
  function run(seed) {
    const harness = createSimulationHarness({
      tickSeconds: 1 / 20,
      viewport: { width: 1200, height: 800 },
    });
    harness.startScenario({ missionIndex: 0, seed });
    const infantry = firstEntity(
      harness.game,
      (entity) => entity.team === TEAM.UA && entity.type === 'uaInfantry',
      'a Ukrainian infantry unit',
    );
    harness.issueCommand({ type: 'select', entityIds: [infantry.id] });
    harness.issueCommand({ type: 'attackMove', x: 1100, y: 900 });
    harness.issueCommand({ type: 'spawnWave' });
    return harness.advanceTicks(40);
  }

  assert.deepEqual(run('repeatable-scenario'), run('repeatable-scenario'));
  assert.notDeepEqual(run('repeatable-scenario'), run('different-scenario'));
});

test('invalid harness operations fail with actionable errors', () => {
  const harness = createSimulationHarness();
  assert.throws(
    () => harness.issueCommand({ type: 'move', x: 10, y: 10 }),
    /Start a scenario/,
  );

  harness.startScenario({ missionIndex: 0, seed: 'failure-paths' });
  assert.throws(() => harness.advanceTicks(-1), /non-negative integer/);
  assert.throws(
    () => harness.issueCommand({ type: 'attack', targetId: 999999 }),
    /Unknown simulation target id/,
  );
  assert.throws(
    () => harness.issueCommand({ type: 'teleport', x: 1, y: 2 }),
    /Unknown simulation command type/,
  );
  assert.throws(
    () => harness.assertState(() => false, 'Expected simulation assertion failure.'),
    /Expected simulation assertion failure/,
  );
});
