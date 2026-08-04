import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../../src/config.js';
import { loadAuthoredMap } from '../../src/core/authored-map.js';
import {
  COMBINED_ARMS_BRIEFING,
  COMBINED_ARMS_MAP,
  COMBINED_ARMS_OBJECTIVES,
  COMBINED_ARMS_OPERATION,
  COMBINED_ARMS_OPERATION_ID,
  COMBINED_ARMS_PERSISTENCE,
  COMBINED_ARMS_SCRIPT,
  evaluateCombinedArmsPersistence,
} from '../../src/content/campaign/combined-arms-offensive-operation.js';
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

const aliveBuilding = (scriptId, type = 'depot', team = TEAM.RU, x = 640, y = 384) => ({
  id: scriptId,
  scriptId,
  type,
  team,
  hp: 100,
  maxHp: 100,
  x,
  y,
  underConstruction: false,
});

const aliveUnit = (scriptId, type, team, x, y, tag = null) => ({
  id: scriptId,
  scriptId,
  scriptTag: tag,
  type,
  team,
  hp: 100,
  maxHp: 100,
  x,
  y,
});

function scriptSubset(ids, suffix) {
  const selected = new Set(ids);
  return {
    ...COMBINED_ARMS_SCRIPT,
    id: `${COMBINED_ARMS_SCRIPT.id}.${suffix}`,
    triggers: COMBINED_ARMS_SCRIPT.triggers.filter((trigger) => selected.has(trigger.id)),
  };
}

function scriptedGame(script) {
  let nextId = 1;
  return {
    time: 0,
    mission: { ...COMBINED_ARMS_OPERATION.mission, script },
    player: { objectives: Array(COMBINED_ARMS_OBJECTIVES.length).fill(false), intel: 0 },
    units: [aliveUnit('player-recon-1', 'uaDrone', TEAM.UA, 160, 384, 'player-recon')],
    buildings: [
      aliveBuilding('north-fire-control'),
      aliveBuilding('center-strongpoint', 'hq'),
      aliveBuilding('south-logistics-node'),
      aliveBuilding('enemy-command-post', 'hq'),
      aliveBuilding('player-forward-command', 'hq', TEAM.UA, 128, 352),
    ],
    gameOver: false,
    addUnit(type, team, x, y) {
      const unit = aliveUnit(`spawn-${nextId++}`, type, team, x, y);
      this.units.push(unit);
      return unit;
    },
    finish(outcome, reason) {
      this.gameOver = true;
      this.outcome = outcome;
      this.endReason = reason;
    },
  };
}

function reinforcementSpecs(script = COMBINED_ARMS_SCRIPT) {
  return script.triggers.flatMap((trigger) => trigger.actions)
    .filter((action) => action.kind === 'reinforcement')
    .flatMap((action) => action.entities.map((entity) => ({ ...entity, team: action.team })));
}

test('combined-arms operation validates through prerequisite campaign contracts', () => {
  const map = loadAuthoredMap(COMBINED_ARMS_MAP);
  const script = validateMissionScript(COMBINED_ARMS_SCRIPT);
  const objectives = validateObjectiveDefinitions(COMBINED_ARMS_OBJECTIVES);
  const briefing = createMissionBriefingModel(COMBINED_ARMS_BRIEFING);

  assert.equal(map.metadata.operationId, COMBINED_ARMS_OPERATION_ID);
  assert.equal(script.id, COMBINED_ARMS_OPERATION.mission.script.id);
  assert.deepEqual(objectives.map((objective) => objective.id), COMBINED_ARMS_OPERATION.mission.objectiveIds);
  assert.equal(briefing.operationId, COMBINED_ARMS_OPERATION_ID);
  assert.equal(briefing.objectives.filter((objective) => objective.optional).length, 3);
  assert.ok(Object.isFrozen(COMBINED_ARMS_OPERATION));
  assert.ok(Object.isFrozen(map));
});

test('map starts and scripted reinforcements use canonical teams and content identifiers', () => {
  for (const entries of Object.values(COMBINED_ARMS_MAP.starts)) {
    for (const start of entries) {
      const { kind, type, team } = start.metadata;
      assert.ok(team === TEAM.UA || team === TEAM.RU, `${start.id} uses an unknown team.`);
      if (kind === 'unit') assert.ok(UNIT_TYPES[type], `${start.id} uses unknown unit ${type}.`);
      if (kind === 'building') assert.ok(BUILDING_TYPES[type], `${start.id} uses unknown building ${type}.`);
    }
  }

  for (const spec of reinforcementSpecs()) {
    assert.ok(UNIT_TYPES[spec.type], `Reinforcement uses unknown unit ${spec.type}.`);
    assert.ok(spec.team === TEAM.UA || spec.team === TEAM.RU);
    assert.ok(COMBINED_ARMS_SCRIPT.regions.some((region) => region.id === spec.regionId));
  }
});

test('sector, allied-force, checkpoint, and persistence references are stable and complete', () => {
  const regionIds = new Set(COMBINED_ARMS_SCRIPT.regions.map((region) => region.id));
  const objectiveIds = new Set(COMBINED_ARMS_OBJECTIVES.map((objective) => objective.id));
  const triggerIds = new Set(COMBINED_ARMS_SCRIPT.triggers.map((trigger) => trigger.id));
  const authoredTags = new Set([
    ...Object.values(COMBINED_ARMS_MAP.starts).flat().map((start) => start.metadata.tag).filter(Boolean),
    ...reinforcementSpecs().map((spec) => spec.tag).filter(Boolean),
  ]);

  for (const id of ['north-sector', 'center-sector', 'south-sector', 'east-command']) assert.ok(regionIds.has(id));
  for (const id of ['secure-north-sector', 'secure-center-sector', 'secure-south-sector', 'break-east-command']) assert.ok(objectiveIds.has(id));
  for (const checkpoint of COMBINED_ARMS_OPERATION.mission.checkpointLabels) {
    if (checkpoint.authoredEvent) assert.ok(triggerIds.has(checkpoint.authoredEvent));
  }
  for (const regionId of COMBINED_ARMS_OPERATION.mission.alliedForce.routeRegionIds) assert.ok(regionIds.has(regionId));
  assert.equal(COMBINED_ARMS_OPERATION.mission.alliedForce.controlMode, 'existing-team-ai-handoff');

  for (const group of COMBINED_ARMS_PERSISTENCE.forceGroups) {
    assert.ok(authoredTags.has(group.tag));
    if (group.objectiveId) assert.ok(objectiveIds.has(group.objectiveId));
  }
  assert.equal(COMBINED_ARMS_MAP.metadata.persistentForcePolicy, COMBINED_ARMS_PERSISTENCE.policy);
});

test('first northern breach commits the northern reserve and opposite-axis counterattack next tick', () => {
  const script = scriptSubset([
    'north-sector-secured',
    'commit-north-reserve',
  ], 'north-reserve-test');
  const game = scriptedGame(script);
  initializeMissionScripts(game);
  game.missionScriptState.variables.phase = 1;

  game.buildings = game.buildings.filter((building) => building.scriptId !== 'north-fire-control');
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.sectorsSecured, 1);
  assert.equal(game.missionScriptState.variables.reserveAxisCandidate, 'north');
  assert.equal(game.missionScriptState.variables.reserveAxis, 'uncommitted');

  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.reserveAxis, 'north');
  assert.equal(game.units.filter((unit) => unit.scriptTag === 'player-reserve').length, 2);
  assert.equal(game.units.filter((unit) => unit.scriptTag === 'enemy-operational-reserve').length, 3);
});

test('simultaneous north and south breaches use deterministic declaration-order south tie-break', () => {
  const script = scriptSubset([
    'north-sector-secured',
    'south-sector-secured',
    'commit-north-reserve',
    'commit-south-reserve',
  ], 'simultaneous-reserve-test');
  const game = scriptedGame(script);
  initializeMissionScripts(game);
  game.missionScriptState.variables.phase = 1;

  game.buildings = game.buildings.filter((building) => !['north-fire-control', 'south-logistics-node'].includes(building.scriptId));
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.sectorsSecured, 2);
  assert.equal(game.missionScriptState.variables.reserveAxisCandidate, 'south');

  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.reserveAxis, 'south');
  assert.ok(game.units.some((unit) => unit.scriptId.startsWith('player-south-reserve')));
  assert.equal(game.units.some((unit) => unit.scriptId.startsWith('player-north-reserve')), false);
});

test('second secured sector deploys the final armored counterattack on the following tick', () => {
  const script = scriptSubset([
    'north-sector-secured',
    'center-sector-secured',
    'commit-north-reserve',
    'deploy-final-counterattack',
  ], 'final-counterattack-test');
  const game = scriptedGame(script);
  initializeMissionScripts(game);
  game.missionScriptState.variables.phase = 1;

  game.buildings = game.buildings.filter((building) => building.scriptId !== 'north-fire-control');
  updateMissionScripts(game);
  updateMissionScripts(game);
  game.buildings = game.buildings.filter((building) => building.scriptId !== 'center-strongpoint');
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.sectorsSecured, 2);
  assert.equal(game.missionScriptState.variables.finalCounterattackDeployed, false);

  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.finalCounterattackDeployed, true);
  assert.equal(game.units.filter((unit) => unit.scriptId.startsWith('enemy-final-')).length, 4);
});

test('required multi-sector objectives complete independently of optional force preservation', () => {
  const game = scriptedGame(COMBINED_ARMS_SCRIPT);
  game.mission = COMBINED_ARMS_OPERATION.mission;
  game.units[0].x = 560;
  game.units[0].y = 384;

  const initial = updateObjectiveLibrary(game);
  assert.equal(initial.results.find((result) => result.id === 'recon-center-axis').complete, true);
  assert.equal(initial.allRequiredComplete, false);

  game.buildings = game.buildings.filter((building) => ![
    'north-fire-control',
    'center-strongpoint',
    'south-logistics-node',
    'enemy-command-post',
  ].includes(building.scriptId));
  const completed = updateObjectiveLibrary(game);

  assert.equal(completed.allRequiredComplete, true);
  assert.equal(completed.results.filter((result) => !result.optional).every((result) => result.complete), true);
  assert.equal(completed.results.some((result) => result.optional && !result.complete), true);
  assert.equal(game.outcome, 'victory');
});

test('persistent-force summary is deterministic, immutable, and axis-specific', () => {
  const input = {
    survivorCounts: {
      'allied-ai-spearhead': 2,
      'player-reserve': 1,
      'persistent-command-cadre': 0,
    },
    reserveAxis: 'center',
  };
  const first = evaluateCombinedArmsPersistence(input);
  const second = evaluateCombinedArmsPersistence(input);

  assert.deepEqual(first, second);
  assert.equal(first.reserveAxis, 'center');
  assert.equal(first.groups['allied-spearhead'].state, 'preserved');
  assert.equal(first.groups['player-reserve'].modifier, 'reserve-retained');
  assert.equal(first.groups['command-cadre'].modifier, 'command-cadre-replaced');
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.groups));
});
