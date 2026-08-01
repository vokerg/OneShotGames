import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES } from '../../src/config.js';
import { DOMAIN_EVENT_TYPES, createDomainEventStream } from '../../src/core/events.js';
import { createCombatReadabilityController } from '../../src/ui/combat-readability-runtime.js';

function makeGame() {
  return {
    units: [],
    buildings: [],
    projectiles: [],
    selected: new Set(),
    time: 0,
    unitStats(type) {
      return UNIT_TYPES[type];
    },
    selectedUnits() {
      return this.units.filter((unit) => this.selected.has(unit.id));
    },
    shoot(unit, target) {
      this.projectiles.push({ kind: 'shell', impact: 'kinetic', source: unit, target });
    },
    start() {
      this.projectiles = [];
    },
    update() {
      this.time += 0.05;
    },
  };
}

test('adapts authoritative shot events into incoming cues and selected overlays', () => {
  const game = makeGame();
  const attacker = { id: 1, type: 'ruTank', team: TEAM.RU, x: 10, y: 20, hp: 100 };
  const target = {
    id: 2,
    type: 'uaArtillery',
    team: TEAM.UA,
    x: 30,
    y: 40,
    hp: 100,
    selected: true,
    artilleryConfig: { minimumRange: 90 },
    order: { kind: 'attack', target: attacker },
  };
  game.units.push(attacker, target);
  game.selected.add(target.id);
  createCombatReadabilityController(game);
  game.shoot(attacker, target);
  const snapshot = game.combatReadabilitySnapshot();
  assert.equal(snapshot.cues[0].kind, 'incoming');
  assert.equal(snapshot.rangeRings[0].minRange, 90);
  assert.equal(snapshot.targetLines[0].targetId, attacker.id);
});

test('adapts impact outcomes, armor feedback, and damage numbers', () => {
  const game = makeGame();
  const events = createDomainEventStream();
  createCombatReadabilityController(game, { eventStream: events });
  events.emit(DOMAIN_EVENT_TYPES.IMPACT, {
    sourceId: 1,
    targetId: 2,
    position: { x: 5, y: 6 },
    targetPosition: { x: 5, y: 6 },
    outcome: 'penetrate',
    damage: 27,
  });
  const cues = game.combatReadabilitySnapshot().cues;
  assert.deepEqual(cues.map((cue) => cue.kind), ['armor', 'impact', 'damage']);
  assert.equal(cues.at(-1).value, 27);
});

test('adapts suppression and morale alerts using authoritative entity position', () => {
  const game = makeGame();
  const events = createDomainEventStream();
  game.units.push({ id: 7, type: 'uaArtillery', team: TEAM.UA, x: 44, y: 55, hp: 100 });
  createCombatReadabilityController(game, { eventStream: events });
  events.emit(DOMAIN_EVENT_TYPES.ALERT, {
    category: 'unit-status',
    unitId: '7',
    suppression: 70,
    morale: 'pinned',
  });
  const cue = game.combatReadabilitySnapshot().cues[0];
  assert.equal(cue.kind, 'status');
  assert.equal(cue.severity, 'warning');
  assert.deepEqual(cue.position, { x: 44, y: 55 });
  assert.equal(cue.text, 'Morale: pinned');
});

test('persists and restores the damage-number preference', () => {
  const values = new Map([
    ['fields-of-resolve:combat-readability', JSON.stringify({ version: 1, showDamageNumbers: false })],
  ]);
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const game = makeGame();
  createCombatReadabilityController(game, { storage });
  assert.equal(game.combatReadabilitySnapshot().preferences.showDamageNumbers, false);
  assert.equal(game.toggleDamageNumbers(), true);
  assert.equal(
    JSON.parse(values.get('fields-of-resolve:combat-readability')).showDamageNumbers,
    true,
  );
});

test('expires cues by fixed update tick and drains controller-owned event batches', () => {
  const game = makeGame();
  const events = createDomainEventStream();
  createCombatReadabilityController(game, { eventStream: events });
  events.emit(DOMAIN_EVENT_TYPES.ALERT, {
    kind: 'status',
    position: { x: 0, y: 0 },
    text: 'Suppressed',
    severity: 'warning',
  });
  assert.equal(game.combatReadabilitySnapshot().cues.length, 1);
  for (let index = 0; index < 121; index += 1) game.update(0.05);
  assert.equal(game.combatReadabilitySnapshot().cues.length, 0);
  assert.ok(Array.isArray(game.lastDomainEvents));
});

test('preserves and does not drain a pre-existing shared event stream', () => {
  const game = makeGame();
  const shared = createDomainEventStream();
  game.events = shared;
  const dispose = createCombatReadabilityController(game);
  shared.emit(DOMAIN_EVENT_TYPES.ALERT, { position: { x: 0, y: 0 }, text: 'Shared' });
  game.update(0.05);
  assert.equal(shared.peek().length, 1);
  dispose();
  assert.equal(game.events, shared);
});

test('mission reset clears transient cues but preserves preference', () => {
  const game = makeGame();
  const events = createDomainEventStream();
  createCombatReadabilityController(game, { eventStream: events });
  game.setDamageNumbersVisible(false);
  events.emit(DOMAIN_EVENT_TYPES.ALERT, { position: { x: 0, y: 0 }, text: 'Alert' });
  game.start(0);
  const snapshot = game.combatReadabilitySnapshot();
  assert.equal(snapshot.cues.length, 0);
  assert.equal(snapshot.preferences.showDamageNumbers, false);
});

test('disposer restores wrapped game methods and removes presentation API', () => {
  const game = makeGame();
  const originalShoot = game.shoot;
  const dispose = createCombatReadabilityController(game);
  dispose();
  assert.equal(game.shoot, originalShoot);
  assert.equal(game.combatReadabilitySnapshot, undefined);
});
