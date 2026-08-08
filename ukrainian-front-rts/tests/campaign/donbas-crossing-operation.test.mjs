import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDING_TYPES, MISSIONS, TEAM, UNIT_TYPES } from '../../src/config.js';
import { loadAuthoredMap } from '../../src/core/authored-map.js';
import {
  DONBAS_AUTHORED_AI,
  DONBAS_CROSSING_BRIEFING,
  DONBAS_CROSSING_MAP,
  DONBAS_CROSSING_MISSION_SCRIPT,
  DONBAS_CROSSING_OBJECTIVES,
  DONBAS_CROSSING_OPERATION,
  DONBAS_CROSSING_OPERATION_ID,
} from '../../src/content/campaign/donbas-crossing-operation.js';
import { initializeMissionScripts, updateMissionScripts, validateMissionScript } from '../../src/systems/mission-script-system.js';
import { validateObjectiveDefinitions } from '../../src/systems/objective-library.js';
import { createMissionBriefingModel } from '../../src/ui/campaign-flow.js';

function scriptedGame() {
  let nextId = 1;
  return {
    time: 0,
    mission: DONBAS_CROSSING_OPERATION.mission,
    player: { metal: 0, fuel: 0, intel: 0, objectives: Array(DONBAS_CROSSING_OBJECTIVES.length).fill(false) },
    units: [],
    buildings: [],
    gameOver: false,
    addUnit(type, team, x, y) {
      const unit = { id: `spawn-${nextId++}`, type, team, x, y, hp: 100, maxHp: 100 };
      this.units.push(unit);
      return unit;
    },
  };
}

function allStarts(map) {
  return Object.values(map.starts).flat();
}

test('Donbas operation validates through authored map, mission script, objectives, and briefing contracts', () => {
  const map = loadAuthoredMap(DONBAS_CROSSING_MAP);
  const script = validateMissionScript(DONBAS_CROSSING_MISSION_SCRIPT);
  const objectives = validateObjectiveDefinitions(DONBAS_CROSSING_OBJECTIVES);
  const briefing = createMissionBriefingModel(DONBAS_CROSSING_BRIEFING);

  assert.equal(map.metadata.operationId, DONBAS_CROSSING_OPERATION_ID);
  assert.equal(map.metadata.legacyMissionId, 'donbas');
  assert.equal(script.id, DONBAS_CROSSING_OPERATION.mission.script.id);
  assert.deepEqual(objectives.map((objective) => objective.id), DONBAS_CROSSING_OPERATION.mission.objectiveIds);
  assert.equal(briefing.operationId, DONBAS_CROSSING_OPERATION_ID);
  assert.equal(briefing.objectives.filter((objective) => objective.optional).length, 1);
  assert.ok(Object.isFrozen(DONBAS_CROSSING_OPERATION));
  assert.ok(Object.isFrozen(map));
});

test('operation preserves the legacy Donbas economy and mission identity while expanding it into authored content', () => {
  const legacy = MISSIONS.find((mission) => mission.id === 'donbas');
  assert.ok(legacy);
  assert.deepEqual(DONBAS_CROSSING_MAP.metadata.economyOnboarding.startingResources, legacy.start);
  assert.equal(DONBAS_CROSSING_OPERATION.mission.legacyMissionId, legacy.id);
  assert.equal(DONBAS_CROSSING_OBJECTIVES.find((objective) => objective.id === 'recover-materiel').amount, 500);
  assert.deepEqual(
    DONBAS_CROSSING_MAP.metadata.economyOnboarding.requiredFacilities,
    ['barracks', 'workshop'],
  );
});

test('crossing terrain is genuinely authored around a water obstacle and bridge cells', () => {
  const map = loadAuthoredMap(DONBAS_CROSSING_MAP);
  const terrainSymbols = map.terrain.rows.join('');
  assert.ok([...terrainSymbols].filter((cell) => cell === 'w').length >= 40);
  assert.equal(map.terrain.rows.filter((row) => row.includes('bb')).length, 2);
  assert.equal(map.roads.find((road) => road.id === 'crossing-road').cells.length, 30);
  assert.equal(map.regions['west-bridgehead'].metadata.purpose, 'crossing-defense');
});

test('all authored starts and scripted escalation units use canonical identifiers', () => {
  for (const start of allStarts(DONBAS_CROSSING_MAP)) {
    const { kind, type, team } = start.metadata;
    assert.ok(team === TEAM.UA || team === TEAM.RU, `${start.id} uses an unknown team.`);
    if (kind === 'unit') assert.ok(UNIT_TYPES[type], `${start.id} uses unknown unit ${type}.`);
    if (kind === 'building') assert.ok(BUILDING_TYPES[type], `${start.id} uses unknown building ${type}.`);
  }

  for (const phase of DONBAS_AUTHORED_AI.phases) {
    for (const type of phase.composition) assert.ok(UNIT_TYPES[type], `${phase.id} references unknown ${type}.`);
  }
  assert.deepEqual(DONBAS_AUTHORED_AI.phases.map((phase) => phase.afterSeconds), [70, 160, 250]);
});

test('opening script establishes the legacy starting economy deterministically', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);

  assert.deepEqual(
    { metal: game.player.metal, fuel: game.player.fuel, intel: game.player.intel },
    { metal: 240, fuel: 110, intel: 25 },
  );
  assert.equal(game.missionScriptState.variables.economyIntroduced, true);
  assert.equal(game.dialogueQueue.length, 1);
  assert.equal(game.cameraCues.length, 1);
});

test('authored enemy pressure escalates in deterministic phases without duplicating runtime AI ownership', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);

  game.time = 70;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.escalationLevel, 1);
  assert.equal(game.units.filter((unit) => unit.scriptTag === 'donbas-wave').length, 3);

  game.time = 160;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.escalationLevel, 2);
  assert.equal(game.units.filter((unit) => unit.scriptTag === 'donbas-wave').length, 7);

  game.time = 250;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.escalationLevel, 3);
  assert.equal(game.units.filter((unit) => unit.scriptTag === 'donbas-wave').length, 11);
});

test('mission exposes explicit economy, crossing, rescue, checkpoint, and authored-AI contracts', () => {
  const objectiveIds = new Set(DONBAS_CROSSING_OBJECTIVES.map((objective) => objective.id));
  for (const id of ['recover-materiel', 'establish-infantry-area', 'establish-repair-point', 'hold-crossing', 'destroy-forward-command', 'recover-isolated-team']) {
    assert.ok(objectiveIds.has(id));
  }
  assert.equal(DONBAS_CROSSING_OBJECTIVES.find((objective) => objective.id === 'recover-isolated-team').optional, true);
  assert.equal(DONBAS_CROSSING_OPERATION.mission.checkpointPolicy, 'enabled');
  assert.equal(DONBAS_CROSSING_OPERATION.mission.checkpointLabels.length, 3);
  assert.equal(DONBAS_CROSSING_OPERATION.mission.authoredAi.doctrine, 'probe-fix-escalate');
});
