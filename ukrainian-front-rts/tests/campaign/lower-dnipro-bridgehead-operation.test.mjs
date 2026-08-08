import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDING_TYPES, MISSIONS, TEAM, UNIT_TYPES } from '../../src/config.js';
import { loadAuthoredMap } from '../../src/core/authored-map.js';
import {
  LOWER_DNIPRO_BRIEFING,
  LOWER_DNIPRO_COMMAND_DECISIONS,
  LOWER_DNIPRO_MAP,
  LOWER_DNIPRO_MISSION_SCRIPT,
  LOWER_DNIPRO_OBJECTIVES,
  LOWER_DNIPRO_OPERATION,
  LOWER_DNIPRO_OPERATION_ID,
  LOWER_DNIPRO_WAVE_PLAN,
} from '../../src/content/campaign/lower-dnipro-bridgehead-operation.js';
import { initializeMissionScripts, updateMissionScripts, validateMissionScript } from '../../src/systems/mission-script-system.js';
import { validateObjectiveDefinitions } from '../../src/systems/objective-library.js';
import { createMissionBriefingModel } from '../../src/ui/campaign-flow.js';

function allStarts(map) {
  return Object.values(map.starts).flat();
}

function scriptedGame() {
  let nextId = 1;
  return {
    time: 0,
    mission: LOWER_DNIPRO_OPERATION.mission,
    player: { metal: 0, fuel: 0, intel: 0, objectives: Array(LOWER_DNIPRO_OBJECTIVES.length).fill(false) },
    units: [
      { id: 'logistics', scriptId: 'river-logistics-team', type: 'uaEngineer', team: TEAM.UA, x: 9 * 32, y: 9 * 32, hp: 100, maxHp: 100 },
      { id: 'liaison', scriptId: 'command-liaison', type: 'uaInfantry', team: TEAM.UA, x: 20 * 32, y: 12 * 32, hp: 100, maxHp: 100 },
    ],
    buildings: [],
    gameOver: false,
    addUnit(type, team, x, y) {
      const unit = { id: `spawn-${nextId++}`, type, team, x, y, hp: 100, maxHp: 100 };
      this.units.push(unit);
      return unit;
    },
  };
}

test('Lower Dnipro operation validates through authored map, mission script, objectives, and briefing contracts', () => {
  const map = loadAuthoredMap(LOWER_DNIPRO_MAP);
  const script = validateMissionScript(LOWER_DNIPRO_MISSION_SCRIPT);
  const objectives = validateObjectiveDefinitions(LOWER_DNIPRO_OBJECTIVES);
  const briefing = createMissionBriefingModel(LOWER_DNIPRO_BRIEFING);

  assert.equal(map.metadata.operationId, LOWER_DNIPRO_OPERATION_ID);
  assert.equal(map.metadata.legacyMissionId, 'kherson');
  assert.equal(script.id, LOWER_DNIPRO_OPERATION.mission.script.id);
  assert.deepEqual(objectives.map((objective) => objective.id), LOWER_DNIPRO_OPERATION.mission.objectiveIds);
  assert.equal(briefing.operationId, LOWER_DNIPRO_OPERATION_ID);
  assert.ok(Object.isFrozen(LOWER_DNIPRO_OPERATION));
  assert.ok(Object.isFrozen(map));
});

test('operation preserves the legacy Lower Dnipro starting economy and six-wave identity', () => {
  const legacy = MISSIONS.find((mission) => mission.id === 'kherson');
  assert.ok(legacy);
  assert.deepEqual(LOWER_DNIPRO_MAP.metadata.startingResources, legacy.start);
  assert.equal(LOWER_DNIPRO_OPERATION.mission.legacyMissionId, legacy.id);
  assert.equal(LOWER_DNIPRO_WAVE_PLAN.totalWaves, legacy.waves.maxWaves);
  assert.deepEqual(LOWER_DNIPRO_WAVE_PLAN.scheduleSeconds, [45, 90, 135, 180, 225, 270]);
});

test('authored map contains two river crossings, floodplain terrain, and night visibility phases', () => {
  const map = loadAuthoredMap(LOWER_DNIPRO_MAP);
  const terrainSymbols = LOWER_DNIPRO_MAP.terrain.rows.join('');
  assert.equal(LOWER_DNIPRO_MAP.terrain.rows.filter((row) => row.includes('bbbbbb')).length, 4);
  assert.equal([...terrainSymbols].filter((cell) => cell === 'w').length, 120);
  assert.equal(map.roads.find((road) => road.id === 'north-pontoon-route').cells.length, 24);
  assert.equal(map.roads.find((road) => road.id === 'south-pontoon-route').cells.length, 24);
  assert.deepEqual(map.metadata.visibilityPhases.map((phase) => phase.id), ['river-night', 'predawn-river-mist']);
  assert.equal(map.regions.bridgehead.metadata.purpose, 'bridgehead-sustainment');
});

test('all authored starts and wave-plan compositions use canonical identifiers', () => {
  for (const start of allStarts(LOWER_DNIPRO_MAP)) {
    const { kind, type, team } = start.metadata;
    assert.ok(team === TEAM.UA || team === TEAM.RU, `${start.id} uses an unknown team.`);
    if (kind === 'unit') assert.ok(UNIT_TYPES[type], `${start.id} uses unknown unit ${type}.`);
    if (kind === 'building') assert.ok(BUILDING_TYPES[type], `${start.id} uses unknown building ${type}.`);
  }

  for (const wave of LOWER_DNIPRO_WAVE_PLAN.waves) {
    const compositions = wave.variants
      ? Object.values(wave.variants).map((variant) => variant.composition)
      : [wave.composition];
    for (const composition of compositions) {
      for (const type of composition) assert.ok(UNIT_TYPES[type], `${wave.id} references unknown ${type}.`);
    }
  }
});

test('opening establishes legacy resources and night visibility', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);

  assert.deepEqual(
    { metal: game.player.metal, fuel: game.player.fuel, intel: game.player.intel },
    { metal: 430, fuel: 260, intel: 230 },
  );
  assert.equal(game.weather.id, 'river-night');
  assert.equal(game.weather.intensity, 0.85);
  assert.equal(game.dialogueQueue.length, 1);
});

test('river logistics delivery raises the fuel reserve through the existing resource action contract', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);

  const logistics = game.units.find((unit) => unit.scriptId === 'river-logistics-team');
  logistics.x = 21 * 32;
  logistics.y = 12 * 32;
  updateMissionScripts(game);

  assert.equal(game.missionScriptState.variables.logisticsDelivered, true);
  assert.equal(game.player.fuel, 340);
});

test('single command liaison commits north and deterministically selects the north-choice wave-three response', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);

  const liaison = game.units.find((unit) => unit.scriptId === LOWER_DNIPRO_COMMAND_DECISIONS.selectorScriptId);
  liaison.x = 21 * 32;
  liaison.y = 5 * 32;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.reserveAxis, 'north');

  game.time = 135;
  updateMissionScripts(game);
  assert.ok(game.units.some((unit) => unit.scriptId?.startsWith('wave3-north-')));
  assert.equal(game.units.some((unit) => unit.scriptId?.startsWith('wave3-south-')), false);
});

test('south reserve order at the exact deadline wins without racing the automatic fallback', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);

  const liaison = game.units.find((unit) => unit.scriptId === LOWER_DNIPRO_COMMAND_DECISIONS.selectorScriptId);
  liaison.x = 21 * 32;
  liaison.y = 19 * 32;
  game.time = LOWER_DNIPRO_COMMAND_DECISIONS.decisionDeadlineSeconds;
  updateMissionScripts(game);

  assert.equal(game.missionScriptState.variables.reserveAxis, 'south');
  assert.equal(game.units.some((unit) => unit.scriptId?.startsWith('wave3-north-')), false);
  assert.equal(game.units.some((unit) => unit.scriptId?.startsWith('wave3-south-')), false);

  game.time += 0.1;
  updateMissionScripts(game);
  assert.ok(game.units.some((unit) => unit.scriptId?.startsWith('wave3-south-')));
  assert.equal(game.units.some((unit) => unit.scriptId?.startsWith('wave3-north-')), false);
});

test('uncommitted reserve defaults north immediately after wave-three deadline so inaction cannot skip authored assault windows', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);

  game.time = LOWER_DNIPRO_COMMAND_DECISIONS.decisionDeadlineSeconds + 0.1;
  updateMissionScripts(game);

  assert.equal(LOWER_DNIPRO_COMMAND_DECISIONS.defaultChoice, 'north');
  assert.equal(game.missionScriptState.variables.reserveAxis, 'north');
  assert.ok(game.units.some((unit) => unit.scriptId?.startsWith('wave3-north-')));
  assert.equal(game.units.some((unit) => unit.scriptId?.startsWith('wave3-south-')), false);
});

test('predawn transition and counterattack handoff are explicit deterministic mission phases', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);

  game.time = 240;
  updateMissionScripts(game);
  assert.equal(game.weather.id, 'predawn-river-mist');
  assert.equal(game.weather.intensity, 0.45);

  game.time = 300;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.counterattackReleased, true);
  assert.equal(game.cameraCue.label, 'Counterattack objective');
});

test('mission exposes sustainment, six-wave survival, command decision, counterattack, and checkpoint contracts', () => {
  const objectiveIds = new Set(LOWER_DNIPRO_OBJECTIVES.map((objective) => objective.id));
  for (const id of ['deliver-river-logistics', 'sustain-fuel-reserve', 'hold-bridgehead', 'survive-six-waves', 'destroy-command-bunker']) {
    assert.ok(objectiveIds.has(id));
  }
  assert.deepEqual(LOWER_DNIPRO_COMMAND_DECISIONS.choices.map((choice) => choice.id), ['north', 'south']);
  assert.equal(LOWER_DNIPRO_COMMAND_DECISIONS.decisionDeadlineSeconds, 135);
  assert.equal(LOWER_DNIPRO_COMMAND_DECISIONS.defaultChoice, 'north');
  assert.equal(LOWER_DNIPRO_OPERATION.mission.checkpointPolicy, 'enabled');
  assert.deepEqual(
    LOWER_DNIPRO_OPERATION.mission.checkpointLabels.map((checkpoint) => checkpoint.id),
    ['logistics-delivered', 'reserve-committed', 'counterattack-released'],
  );
});
