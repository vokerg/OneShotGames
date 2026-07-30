import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSION_SCRIPT_VERSION,
  createMissionScriptState,
  drainMissionScriptRecords,
  initializeMissionScripts,
  updateMissionScriptObjectivePhase,
  updateMissionScripts,
  validateMissionScript,
} from '../../src/systems/mission-script-system.js';

function baseGame(script, { objectiveMode = 'scripted' } = {}) {
  let nextId = 1;
  const game = {
    mission: {
      id: 'test-mission',
      objectiveMode,
      objectives: ['First', 'Second'],
      objectiveIds: ['first', 'second'],
      script,
    },
    time: 0,
    units: [],
    buildings: [],
    player: {
      metal: 100,
      fuel: 50,
      intel: 0,
      objectives: [false, false],
    },
    gameOver: false,
    outcome: null,
    endReason: '',
    addUnit(type, team, x, y) {
      const unit = { id: nextId++, type, team, x, y, hp: 100, maxHp: 100 };
      this.units.push(unit);
      return unit;
    },
    addBuilding(type, team, x, y, options = {}) {
      const building = {
        id: nextId++,
        type,
        team,
        x,
        y,
        hp: 500,
        maxHp: 500,
        underConstruction: Boolean(options.underConstruction),
      };
      this.buildings.push(building);
      return building;
    },
    finish(result, reason) {
      if (this.gameOver) return;
      this.gameOver = true;
      this.outcome = result;
      this.endReason = reason;
    },
    updateObjectives() {
      this.legacyObjectiveUpdates = (this.legacyObjectiveUpdates ?? 0) + 1;
    },
  };
  return game;
}

function script(triggers, extras = {}) {
  return {
    version: MISSION_SCRIPT_VERSION,
    id: 'test.script',
    regions: [],
    triggers,
    ...extras,
  };
}

test('validates identifiers, duplicate ids, and cross references', () => {
  assert.throws(
    () => validateMissionScript({ version: 99, id: 'bad', triggers: [] }),
    /Unsupported mission script version/,
  );
  assert.throws(
    () => validateMissionScript(script([
      { id: 'same', when: { kind: 'timer', value: 0 }, actions: [{ kind: 'setVariable', id: 'x', value: 1 }] },
      { id: 'same', when: { kind: 'timer', value: 0 }, actions: [{ kind: 'setVariable', id: 'x', value: 2 }] },
    ])),
    /Duplicate mission script trigger id/,
  );
  assert.throws(
    () => validateMissionScript(script([
      {
        id: 'bad-region',
        when: { kind: 'region', regionId: 'missing' },
        actions: [{ kind: 'setVariable', id: 'x', value: 1 }],
      },
    ])),
    /unknown region/,
  );
  assert.throws(
    () => validateMissionScript(script([
      {
        id: 'bad-control',
        when: { kind: 'timer', value: 0 },
        actions: [{ kind: 'enableTrigger', triggerId: 'missing' }],
      },
    ])),
    /unknown trigger/,
  );
});

test('creates deterministic mutable runtime state from frozen normalized data', () => {
  const definition = validateMissionScript(script([], { initialVariables: { z: 2, a: 1 } }));
  const state = createMissionScriptState(definition, { missionId: 'm1' });
  assert.equal(Object.isFrozen(definition), true);
  assert.deepEqual(state.variables, { a: 1, z: 2 });
  assert.equal(state.tick, 0);
  state.variables.a = 3;
  assert.equal(state.variables.a, 3);
});

test('fires timer actions once in declared order and emits stable records', () => {
  const game = baseGame(script([
    {
      id: 'opening',
      when: { kind: 'timer', clock: 'seconds', value: 5 },
      actions: [
        { kind: 'setVariable', id: 'phase', value: 1 },
        { kind: 'addResource', resource: 'metal', amount: 25 },
        { kind: 'setObjective', id: 'first', complete: true },
      ],
    },
  ]));
  initializeMissionScripts(game);
  game.time = 4.9;
  assert.equal(updateMissionScripts(game, 1 / 30).length, 0);
  game.time = 5;
  const records = updateMissionScripts(game, 1 / 30);
  assert.equal(game.missionScriptState.variables.phase, 1);
  assert.equal(game.player.metal, 125);
  assert.equal(game.player.objectives[0], true);
  assert.deepEqual(records.map((record) => record.type), [
    'mission.trigger',
    'mission.variable',
    'mission.resource',
    'mission.objective',
  ]);
  updateMissionScripts(game, 1 / 30);
  assert.equal(game.player.metal, 125);
});

test('repeating triggers obey cooldown ticks', () => {
  const game = baseGame(script([
    {
      id: 'pulse',
      once: false,
      cooldownTicks: 2,
      when: { kind: 'timer', clock: 'ticks', value: 1 },
      actions: [{ kind: 'addVariable', id: 'pulses', amount: 1 }],
    },
  ], { initialVariables: { pulses: 0 } }));
  for (let index = 0; index < 7; index += 1) updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.pulses, 3);
  assert.equal(game.missionScriptState.triggers.pulse.activations, 3);
});

test('region enter and exit transitions are edge-triggered', () => {
  const definition = script([
    {
      id: 'enter',
      once: false,
      when: {
        kind: 'region',
        regionId: 'zone',
        event: 'enter',
        selector: { collection: 'units', team: 0 },
      },
      actions: [{ kind: 'addVariable', id: 'entered', amount: 1 }],
    },
    {
      id: 'exit',
      once: false,
      when: {
        kind: 'region',
        regionId: 'zone',
        event: 'exit',
        selector: { collection: 'units', team: 0 },
      },
      actions: [{ kind: 'addVariable', id: 'exited', amount: 1 }],
    },
  ], {
    regions: [{ id: 'zone', shape: 'rect', x: 0, y: 0, width: 100, height: 100 }],
    initialVariables: { entered: 0, exited: 0 },
  });
  const game = baseGame(definition);
  const unit = game.addUnit('infantry', 0, 150, 50);
  updateMissionScripts(game);
  unit.x = 50;
  updateMissionScripts(game);
  updateMissionScripts(game);
  unit.x = 150;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.entered, 1);
  assert.equal(game.missionScriptState.variables.exited, 1);
});

test('destroyed entity conditions require prior observation and stable identity', () => {
  const game = baseGame(script([
    {
      id: 'destroyed',
      when: {
        kind: 'entity',
        selector: { collection: 'units', scriptId: 'target-1' },
        state: 'destroyed',
      },
      actions: [{ kind: 'setVariable', id: 'destroyed', value: true }],
    },
  ]));
  const target = game.addUnit('tank', 1, 10, 10);
  target.scriptId = 'target-1';
  initializeMissionScripts(game);
  updateMissionScripts(game);
  game.units = [];
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.destroyed, true);
});

test('composite resource and objective conditions support scripted objective mode', () => {
  const game = baseGame(script([
    {
      id: 'complete-second',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'resource', resource: 'intel', operator: 'gte', value: 20 },
          { kind: 'objective', id: 'first', state: 'complete' },
        ],
      },
      actions: [{ kind: 'setObjective', id: 'second', complete: true }],
    },
  ]));
  game.player.intel = 20;
  game.player.objectives[0] = true;
  updateMissionScriptObjectivePhase(game, 1 / 30);
  assert.deepEqual(game.player.objectives, [true, true]);
  assert.equal(game.legacyObjectiveUpdates, undefined);

  const legacy = baseGame(script([]), { objectiveMode: 'legacy' });
  updateMissionScriptObjectivePhase(legacy, 1 / 30);
  assert.equal(legacy.legacyObjectiveUpdates, 1);
});

test('delayed actions execute by due tick and stable sequence without same-tick cascades', () => {
  const game = baseGame(script([
    {
      id: 'starter',
      when: { kind: 'timer', clock: 'ticks', value: 1 },
      actions: [
        { kind: 'setVariable', id: 'ready', value: true, delayTicks: 2 },
        { kind: 'addVariable', id: 'order', amount: 1, delayTicks: 2 },
      ],
    },
    {
      id: 'dependent',
      when: { kind: 'variable', id: 'ready', operator: 'eq', value: true },
      actions: [{ kind: 'addVariable', id: 'order', amount: 10 }],
    },
  ], { initialVariables: { order: 0, ready: false } }));
  updateMissionScripts(game);
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.order, 0);
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.order, 1);
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.order, 11);
});

test('queues dialogue, camera, and expiring weather cues', () => {
  const game = baseGame(script([
    {
      id: 'presentation',
      when: { kind: 'timer', value: 0 },
      actions: [
        { kind: 'dialogue', speaker: 'command', text: 'Hold the crossing.', durationSeconds: 4 },
        { kind: 'camera', x: 120, y: 240, zoom: 1.2, durationSeconds: 2 },
        { kind: 'weather', weatherId: 'rain', intensity: 0.7, durationSeconds: 3 },
      ],
    },
  ]));
  updateMissionScripts(game);
  assert.equal(game.dialogueQueue[0].text, 'Hold the crossing.');
  assert.deepEqual({ x: game.cameraCue.x, y: game.cameraCue.y, zoom: game.cameraCue.zoom }, {
    x: 120,
    y: 240,
    zoom: 1.2,
  });
  assert.equal(game.weather.id, 'rain');
  game.time = 3;
  updateMissionScripts(game);
  assert.equal(game.weather, null);
});

test('spawns deterministic reinforcement formations from region centers', () => {
  const game = baseGame(script([
    {
      id: 'reinforce',
      when: { kind: 'timer', value: 0 },
      actions: [{
        kind: 'reinforcement',
        team: 0,
        label: 'reserve',
        entities: [{
          kind: 'unit',
          type: 'infantry',
          count: 3,
          regionId: 'spawn',
          spacingX: 20,
          spacingY: 5,
          scriptIdPrefix: 'reserve',
          tag: 'reinforcement',
        }],
      }],
    },
  ], {
    regions: [{ id: 'spawn', shape: 'rect', x: 100, y: 200, width: 40, height: 20 }],
  }));
  updateMissionScripts(game);
  assert.deepEqual(game.units.map((unit) => [unit.x, unit.y, unit.scriptId, unit.scriptTag]), [
    [120, 210, 'reserve-1', 'reinforcement'],
    [140, 215, 'reserve-2', 'reinforcement'],
    [160, 220, 'reserve-3', 'reinforcement'],
  ]);
});

test('trigger controls defer dependent activation until the next tick', () => {
  const game = baseGame(script([
    {
      id: 'unlock',
      when: { kind: 'timer', clock: 'ticks', value: 1 },
      actions: [{ kind: 'enableTrigger', triggerId: 'locked' }],
    },
    {
      id: 'locked',
      enabled: false,
      when: { kind: 'timer', clock: 'ticks', value: 1 },
      actions: [{ kind: 'setVariable', id: 'unlocked', value: true }],
    },
  ]));
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.unlocked, undefined);
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.unlocked, true);
});

test('finish actions resolve explicit outcomes and record drains are isolated', () => {
  const game = baseGame(script([
    {
      id: 'victory',
      when: { kind: 'timer', value: 0 },
      actions: [{ kind: 'finish', result: 'victory', reason: 'Extraction complete.' }],
    },
  ]));
  const records = updateMissionScripts(game);
  assert.equal(game.gameOver, true);
  assert.equal(game.outcome, 'victory');
  assert.equal(game.endReason, 'Extraction complete.');
  assert.equal(records.at(-1).type, 'mission.outcome');
  const drained = drainMissionScriptRecords(game);
  assert.equal(drained.length, records.length);
  assert.deepEqual(drainMissionScriptRecords(game), []);
  assert.deepEqual(updateMissionScripts(game), []);
});
