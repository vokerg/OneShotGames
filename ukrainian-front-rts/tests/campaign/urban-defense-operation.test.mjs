import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../../src/config.js';
import { loadAuthoredMap } from '../../src/core/authored-map.js';
import {
  URBAN_DEFENSE_BRIEFING,
  URBAN_DEFENSE_MAP,
  URBAN_DEFENSE_MISSION_SCRIPT,
  URBAN_DEFENSE_OBJECTIVES,
  URBAN_DEFENSE_OPERATION,
  URBAN_DEFENSE_OPERATION_ID,
} from '../../src/content/campaign/urban-defense-operation.js';
import {
  initializeMissionScripts,
  updateMissionScripts,
  validateMissionScript,
} from '../../src/systems/mission-script-system.js';
import {
  updateObjectiveLibrary,
  validateObjectiveDefinitions,
} from '../../src/systems/objective-library.js';
import { createMissionBriefingModel } from '../../src/ui/campaign-flow.js';

const aliveBuilding = (scriptId) => ({ id: scriptId, scriptId, type: 'depot', team: TEAM.UA, hp: 100, maxHp: 100, x: 400, y: 300, underConstruction: false });
const aliveUnit = (scriptId, type, x, y) => ({ id: scriptId, scriptId, type, team: TEAM.UA, hp: 100, maxHp: 100, x, y });

function scriptedGame() {
  return {
    time: 0,
    mission: URBAN_DEFENSE_OPERATION.mission,
    player: { objectives: Array(URBAN_DEFENSE_OBJECTIVES.length).fill(false) },
    units: [],
    buildings: [
      { ...aliveBuilding('evacuation-hub'), type: 'hq', x: 176, y: 352 },
      aliveBuilding('protected-clinic'),
      aliveBuilding('protected-waterworks'),
    ],
    gameOver: false,
    finish(outcome, reason) {
      this.gameOver = true;
      this.outcome = outcome;
      this.endReason = reason;
    },
  };
}

function collectSpawnTypes(script) {
  return script.triggers.flatMap((trigger) => trigger.actions)
    .filter((action) => action.kind === 'reinforcement')
    .flatMap((action) => action.entities)
    .map((entity) => ({ kind: entity.kind ?? 'unit', type: entity.type, team: actionTeam(script, entity) }));
}

function actionTeam(script, entity) {
  const trigger = script.triggers.find((candidate) => candidate.actions.some((action) => action.entities?.includes(entity)));
  return trigger.actions.find((action) => action.entities?.includes(entity)).team;
}

test('authored operation validates through every prerequisite public contract', () => {
  const map = loadAuthoredMap(URBAN_DEFENSE_MAP);
  const script = validateMissionScript(URBAN_DEFENSE_MISSION_SCRIPT);
  const objectives = validateObjectiveDefinitions(URBAN_DEFENSE_OBJECTIVES);
  const briefing = createMissionBriefingModel(URBAN_DEFENSE_BRIEFING);

  assert.equal(map.metadata.operationId, URBAN_DEFENSE_OPERATION_ID);
  assert.equal(script.id, URBAN_DEFENSE_OPERATION.mission.script.id);
  assert.deepEqual(objectives.map((objective) => objective.id), URBAN_DEFENSE_OPERATION.mission.objectiveIds);
  assert.equal(briefing.operationId, URBAN_DEFENSE_OPERATION_ID);
  assert.equal(briefing.objectives.filter((objective) => objective.optional).length, 3);
  assert.ok(Object.isFrozen(URBAN_DEFENSE_OPERATION));
  assert.ok(Object.isFrozen(map));
});

test('map and script use current canonical unit, building, and team identifiers', () => {
  for (const entries of Object.values(URBAN_DEFENSE_MAP.starts)) {
    for (const start of entries) {
      const { kind, type, team } = start.metadata;
      assert.ok(team === TEAM.UA || team === TEAM.RU, `${start.id} uses an unknown team.`);
      if (kind === 'unit') assert.ok(UNIT_TYPES[type], `${start.id} uses unknown unit ${type}.`);
      if (kind === 'building') assert.ok(BUILDING_TYPES[type], `${start.id} uses unknown building ${type}.`);
    }
  }

  for (const spawn of collectSpawnTypes(URBAN_DEFENSE_MISSION_SCRIPT)) {
    assert.equal(spawn.kind, 'unit');
    assert.ok(UNIT_TYPES[spawn.type], `Reinforcement uses unknown unit ${spawn.type}.`);
    assert.equal(spawn.team, TEAM.RU);
  }
});

test('civilian handling is abstracted and protected-site collateral is bounded', () => {
  const map = loadAuthoredMap(URBAN_DEFENSE_MAP);
  const allStarts = Object.values(map.starts).flat();
  assert.equal(allStarts.some((start) => start.metadata.type === 'civilian'), false);
  assert.equal(map.metadata.civilianRepresentation, 'abstracted-manifests-and-protected-sites');
  assert.deepEqual(map.metadata.collateralPolicy, { defeatAtLosses: 2, permittedProtectedSiteLosses: 1 });
  assert.equal(map.props.find((prop) => prop.id === 'abstracted-residential-zone').metadata.targetable, false);
  assert.equal(allStarts.find((start) => start.id === 'protected-column-start').metadata.abstractedManifest, true);
});

test('one protected-site loss is tolerated and the second deterministically ends the operation', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);

  game.buildings = game.buildings.filter((building) => building.scriptId !== 'protected-clinic');
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.collateralIncidents, 1);
  assert.equal(game.gameOver, false);

  game.buildings = game.buildings.filter((building) => building.scriptId !== 'protected-waterworks');
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.collateralIncidents, 2);
  assert.equal(game.gameOver, false, 'same-tick cascades must remain disabled');

  updateMissionScripts(game);
  assert.equal(game.outcome, 'defeat');
  assert.match(game.endReason, /protected-site loss limit/i);
});

test('required evacuation objectives complete while optional protection remains independent', () => {
  const game = scriptedGame();
  game.units = [
    aliveUnit('evacuation-column', 'uaIfv', 768, 384),
    aliveUnit('isolated-aid-team', 'uaMedic', 832, 128),
  ];

  const initial = updateObjectiveLibrary(game);
  assert.equal(initial.allRequiredComplete, false);
  assert.equal(game.gameOver, false);

  game.time = 420;
  game.units[0].x = 32;
  game.units[0].y = 352;
  game.units[1].x = 64;
  game.units[1].y = 384;
  const completed = updateObjectiveLibrary(game);

  assert.equal(completed.allRequiredComplete, true);
  assert.equal(completed.results.find((result) => result.id === 'rescue-aid-team').complete, true);
  assert.equal(game.outcome, 'victory');
});

test('losing one optional protected site does not fail required objectives', () => {
  const game = scriptedGame();
  game.units = [aliveUnit('evacuation-column', 'uaIfv', 768, 384)];
  updateObjectiveLibrary(game);

  game.buildings = game.buildings.filter((building) => building.scriptId !== 'protected-clinic');
  const summary = updateObjectiveLibrary(game);

  assert.equal(summary.results.find((result) => result.id === 'protect-clinic').failed, true);
  assert.equal(summary.requiredFailed, false);
  assert.equal(game.gameOver, false);
});
