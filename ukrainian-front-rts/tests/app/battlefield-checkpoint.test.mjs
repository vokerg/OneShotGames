import assert from 'node:assert/strict';
import test from 'node:test';
import { createBattlefieldCheckpoint, createBattlefieldCheckpointStore, restoreBattlefieldCheckpoint } from '../../src/app/battlefield-checkpoint.js';

function gameFixture() {
  const game = {
    mission: { title: 'Test' },
    missionIndex: 1,
    time: 15,
    selected: new Set([7]),
    player: { metal: 200, upgrades: new Set(['armor']) },
    units: [],
    start(index) {
      this.missionIndex = index;
      this.mission = { title: `Mission ${index}` };
      this.units = [];
      this.selected = new Set();
      this.player = { metal: 0, upgrades: new Set() };
    },
  };
  const target = { id: 8, hp: 50 };
  const unit = { id: 7, target, order: { kind: 'attack', target } };
  game.units = [unit, target];
  game.uaHQ = target;
  return game;
}

test('checkpoint round-trip preserves sets and shared entity references', () => {
  const source = gameFixture();
  const checkpoint = createBattlefieldCheckpoint(source, { now: () => '2026-08-05T06:00:00.000Z' });
  source.time = 99;
  source.units = [];
  restoreBattlefieldCheckpoint(source, checkpoint);
  assert.equal(source.time, 15);
  assert.deepEqual([...source.selected], [7]);
  assert.deepEqual([...source.player.upgrades], ['armor']);
  assert.equal(source.units[0].target, source.units[1]);
  assert.equal(source.units[0].order.target, source.units[1]);
  assert.equal(source.uaHQ, source.units[1]);
});

test('three-slot store saves, lists, and loads checkpoints', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const store = createBattlefieldCheckpointStore({ storage });
  const game = gameFixture();
  store.save(2, game);
  assert.equal(store.list()[1].missionIndex, 1);
  game.time = 31;
  store.load(2, game);
  assert.equal(game.time, 15);
  assert.throws(() => store.load(1, game), /empty/);
});
