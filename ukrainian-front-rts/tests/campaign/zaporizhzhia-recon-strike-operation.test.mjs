import test from 'node:test';
import assert from 'node:assert/strict';

import { BUILDING_TYPES, MISSIONS, TEAM, UNIT_TYPES } from '../../src/config.js';
import { loadAuthoredMap } from '../../src/core/authored-map.js';
import {
  ZAPORIZHZHIA_RECON_STRIKE_BRIEFING,
  ZAPORIZHZHIA_RECON_STRIKE_MAP,
  ZAPORIZHZHIA_RECON_STRIKE_MISSION_SCRIPT,
  ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES,
  ZAPORIZHZHIA_RECON_STRIKE_OPERATION,
  ZAPORIZHZHIA_RECON_STRIKE_OPERATION_ID,
  ZAPORIZHZHIA_STRIKE_CHAIN,
} from '../../src/content/campaign/zaporizhzhia-recon-strike-operation.js';
import { initializeMissionScripts, updateMissionScripts, validateMissionScript } from '../../src/systems/mission-script-system.js';
import { updateObjectiveLibrary, validateObjectiveDefinitions } from '../../src/systems/objective-library.js';
import { createMissionBriefingModel } from '../../src/ui/campaign-flow.js';

function allStarts(map) {
  return Object.values(map.starts).flat();
}

function scriptedGame() {
  let nextId = 1;
  const recon = { id: 'ua-recon', scriptId: 'primary-recon-drone', type: 'uaDrone', team: TEAM.UA, x: 192, y: 384, hp: 100, maxHp: 100 };
  return {
    time: 0,
    mission: ZAPORIZHZHIA_RECON_STRIKE_OPERATION.mission,
    player: { metal: 0, fuel: 0, intel: 0, objectives: Array(ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES.length).fill(false) },
    units: [recon],
    buildings: [],
    gameOver: false,
    addUnit(type, team, x, y) {
      const unit = { id: `spawn-${nextId++}`, type, team, x, y, hp: 100, maxHp: 100 };
      this.units.push(unit);
      return unit;
    },
  };
}

test('Zaporizhzhia operation validates through all prerequisite campaign contracts', () => {
  const map = loadAuthoredMap(ZAPORIZHZHIA_RECON_STRIKE_MAP);
  const script = validateMissionScript(ZAPORIZHZHIA_RECON_STRIKE_MISSION_SCRIPT);
  const objectives = validateObjectiveDefinitions(ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES);
  const briefing = createMissionBriefingModel(ZAPORIZHZHIA_RECON_STRIKE_BRIEFING);

  assert.equal(map.metadata.operationId, ZAPORIZHZHIA_RECON_STRIKE_OPERATION_ID);
  assert.equal(map.metadata.legacyMissionId, 'zaporizhzhia');
  assert.equal(script.id, ZAPORIZHZHIA_RECON_STRIKE_OPERATION.mission.script.id);
  assert.deepEqual(objectives.map((objective) => objective.id), ZAPORIZHZHIA_RECON_STRIKE_OPERATION.mission.objectiveIds);
  assert.equal(briefing.operationId, ZAPORIZHZHIA_RECON_STRIKE_OPERATION_ID);
  assert.equal(briefing.objectives.filter((objective) => objective.optional).length, 1);
  assert.ok(Object.isFrozen(ZAPORIZHZHIA_RECON_STRIKE_OPERATION));
});

test('operation preserves the legacy Zaporizhzhia economy and makes the required intelligence target reachable without optional intel', () => {
  const legacy = MISSIONS.find((mission) => mission.id === 'zaporizhzhia');
  assert.ok(legacy);
  assert.deepEqual(ZAPORIZHZHIA_RECON_STRIKE_MAP.metadata.startingResources, legacy.start);
  const target = ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES.find((objective) => objective.id === 'accumulate-intelligence').amount;
  assert.equal(target, 250);

  const intelCache = ZAPORIZHZHIA_RECON_STRIKE_MAP.resources.find((resource) => resource.id === 'legacy-target-intel-cache');
  assert.ok(intelCache);
  assert.equal(intelCache.type, 'intel');
  assert.equal(intelCache.amount, 220);
  assert.deepEqual(intelCache.cell, { x: 22, y: 7 });
  assert.ok(legacy.start.intel + intelCache.amount >= target);
  assert.equal(ZAPORIZHZHIA_RECON_STRIKE_OPERATION.mission.legacyMissionId, legacy.id);
});

test('authored map exposes distinct north and south approaches into a fortified artillery belt', () => {
  const map = loadAuthoredMap(ZAPORIZHZHIA_RECON_STRIKE_MAP);
  assert.deepEqual(map.metadata.multipleApproaches, ['north-approach', 'south-approach']);
  assert.equal(map.roads.find((road) => road.id === 'north-shelterbelt-route').cells.length, 20);
  assert.equal(map.roads.find((road) => road.id === 'south-farm-track').cells.length, 20);
  assert.ok(map.terrain.cells.filter((cell) => cell === 'shelterbelt').length > 80);
  assert.equal(map.regions['artillery-belt'].metadata.purpose, 'recon-and-fires-target');
});

test('all authored starts and approach-response compositions use canonical identifiers', () => {
  for (const start of allStarts(ZAPORIZHZHIA_RECON_STRIKE_MAP)) {
    const { kind, type, team } = start.metadata;
    assert.ok(team === TEAM.UA || team === TEAM.RU, `${start.id} uses an unknown team.`);
    if (kind === 'unit') assert.ok(UNIT_TYPES[type], `${start.id} uses unknown unit ${type}.`);
    if (kind === 'building') assert.ok(BUILDING_TYPES[type], `${start.id} uses unknown building ${type}.`);
  }
  for (const response of Object.values(ZAPORIZHZHIA_STRIKE_CHAIN.approachResponses)) {
    for (const type of response.composition) assert.ok(UNIT_TYPES[type], `Approach response references unknown ${type}.`);
  }
});

test('opening establishes legacy resources and each approach independently provokes its authored response', () => {
  const game = scriptedGame();
  initializeMissionScripts(game);
  updateMissionScripts(game);
  assert.deepEqual(
    { metal: game.player.metal, fuel: game.player.fuel, intel: game.player.intel },
    { metal: 320, fuel: 190, intel: 70 },
  );

  const recon = game.units[0];
  recon.x = 12 * 32;
  recon.y = 5 * 32;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.northApproachUsed, true);
  assert.equal(game.units.filter((unit) => unit.scriptTag === 'approach-response').length, 2);

  recon.x = 12 * 32;
  recon.y = 18 * 32;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.southApproachUsed, true);
  assert.equal(game.units.filter((unit) => unit.scriptTag === 'approach-response').length, 4);
});

test('EW counterplay uses the objective-library disable contract rather than a bespoke subsystem', () => {
  const game = scriptedGame();
  game.player.intel = 250;
  game.buildings = [
    { id: 'ew', scriptId: 'enemy-ew-node', type: 'workshop', team: TEAM.RU, x: 768, y: 352, hp: 30, maxHp: 100 },
  ];
  game.units.push(
    { id: 'art-1', scriptId: 'enemy-artillery-1', scriptTag: 'enemy-artillery', type: 'ruArtillery', team: TEAM.RU, x: 832, y: 224, hp: 100, maxHp: 100 },
    { id: 'art-2', scriptId: 'enemy-artillery-2', scriptTag: 'enemy-artillery', type: 'ruArtillery', team: TEAM.RU, x: 864, y: 448, hp: 100, maxHp: 100 },
  );
  initializeMissionScripts(game);

  const summary = updateObjectiveLibrary(game);
  const ew = summary.results.find((result) => result.id === 'disable-ew-node');
  assert.equal(ew.complete, true);
  assert.equal(ew.failed, false);
  assert.equal(game.gameOver, false);

  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.ewSuppressed, true);
});

test('strike chain explicitly composes recon, EW suppression, artillery suppression, optional intel, and checkpoints', () => {
  assert.deepEqual(ZAPORIZHZHIA_STRIKE_CHAIN.stages.map((stage) => stage.id), ['find', 'blind', 'suppress', 'exploit']);
  assert.equal(ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES.find((objective) => objective.id === 'identify-target-relay').optional, true);
  assert.equal(ZAPORIZHZHIA_RECON_STRIKE_OPERATION.mission.checkpointPolicy, 'enabled');
  assert.deepEqual(
    ZAPORIZHZHIA_RECON_STRIKE_OPERATION.mission.checkpointLabels.map((checkpoint) => checkpoint.id),
    ['artillery-fixed', 'ew-suppressed', 'artillery-suppressed'],
  );
});
