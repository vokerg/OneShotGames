import test from 'node:test';
import assert from 'node:assert/strict';

import { UNIT_TYPES } from '../../src/config.js';
import { loadAuthoredMap } from '../../src/core/authored-map.js';
import { TARGET_DOMAINS } from '../../src/combat/combat-schema.js';
import {
  DESTRUCTION_PHASES,
  applyDestructionDamage,
  applyWreckSalvage,
  createDestructionPolicy,
  createDestructionState,
  materializeWreck,
} from '../../src/combat/destruction-system.js';
import {
  initializeMissionScripts,
  updateMissionScripts,
  validateMissionScript,
} from '../../src/systems/mission-script-system.js';
import {
  updateObjectiveLibrary,
  validateObjectiveDefinitions,
} from '../../src/systems/objective-library.js';
import {
  createMissionBriefingModel,
  createMissionDebriefModel,
} from '../../src/ui/campaign-flow.js';
import {
  DEFENSIVE_WITHDRAWAL_BRIEFING_SOURCE,
  DEFENSIVE_WITHDRAWAL_FORCE_IDS,
  DEFENSIVE_WITHDRAWAL_MAP_SOURCE,
  DEFENSIVE_WITHDRAWAL_MISSION,
  DEFENSIVE_WITHDRAWAL_OBJECTIVES,
  DEFENSIVE_WITHDRAWAL_OPERATION,
  DEFENSIVE_WITHDRAWAL_SCORING_POLICY,
  DEFENSIVE_WITHDRAWAL_SCRIPT_SOURCE,
  createDefensiveWithdrawalDebriefSource,
  scoreDefensiveWithdrawal,
} from '../../src/content/campaign/defensive-withdrawal-operation.js';

const START_POSITIONS = Object.freeze({
  'command-ifv-1': { x: 1184, y: 448 },
  'mechanized-infantry-1': { x: 1130, y: 470 },
  'mechanized-infantry-2': { x: 1160, y: 490 },
  'support-artillery-1': { x: 1100, y: 390 },
  'rear-guard-1': { x: 1210, y: 340 },
  'disabled-recovery-vehicle': { x: 1000, y: 640 },
  'enemy-pursuit-command': { x: 1420, y: 448 },
  'enemy-pursuit-1': { x: 1460, y: 470 },
  'enemy-pursuit-2': { x: 1480, y: 490 },
});

function createScenario() {
  let nextId = 100;
  const forces = [
    ...DEFENSIVE_WITHDRAWAL_MISSION.composition.startingForces,
    ...DEFENSIVE_WITHDRAWAL_MISSION.composition.enemyForces,
  ];
  const game = {
    time: 0,
    mission: DEFENSIVE_WITHDRAWAL_MISSION,
    player: {
      metal: DEFENSIVE_WITHDRAWAL_MISSION.start.metal,
      fuel: DEFENSIVE_WITHDRAWAL_MISSION.start.fuel,
      intel: DEFENSIVE_WITHDRAWAL_MISSION.start.intel,
      mined: 0,
      objectives: [],
    },
    units: forces.map((force, index) => ({
      id: index + 1,
      type: force.type,
      team: force.team,
      scriptId: force.id,
      scriptTag: force.tag,
      tags: [...(force.tags ?? [])],
      hp: force.state?.disabled ? Math.ceil((UNIT_TYPES[force.type]?.hp ?? 100) * 0.25) : (UNIT_TYPES[force.type]?.hp ?? 100),
      maxHp: UNIT_TYPES[force.type]?.hp ?? 100,
      disabled: Boolean(force.state?.disabled),
      underConstruction: false,
      ...START_POSITIONS[force.id],
    })),
    buildings: [],
    reconRegions: new Set(),
    objectiveMetrics: {},
    gameOver: false,
    outcome: null,
    endReason: '',
    finish(outcome, reason) {
      this.gameOver = true;
      this.outcome = outcome;
      this.endReason = reason;
    },
    addUnit(type, team, x, y) {
      const unit = {
        id: nextId++,
        type,
        team,
        hp: UNIT_TYPES[type]?.hp ?? 100,
        maxHp: UNIT_TYPES[type]?.hp ?? 100,
        x,
        y,
      };
      this.units.push(unit);
      return unit;
    },
    addBuilding(type, team, x, y) {
      const building = {
        id: nextId++,
        type,
        team,
        hp: 100,
        maxHp: 100,
        underConstruction: false,
        x,
        y,
      };
      this.buildings.push(building);
      return building;
    },
  };
  initializeMissionScripts(game);
  return game;
}

function unit(game, scriptId) {
  return game.units.find((candidate) => candidate.scriptId === scriptId);
}

function move(game, ids, x, y) {
  ids.forEach((id, index) => {
    const target = unit(game, id);
    assert.ok(target, `missing scenario unit ${id}`);
    target.x = x + index * 8;
    target.y = y + index * 8;
  });
}

function reachFirstRelease(game) {
  updateMissionScripts(game);
  game.time = 120;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.phase, 1);
  assert.equal(game.missionScriptState.variables.firstLineHeld, 1);
}

function commitSalvageDecision(game, decision) {
  if (decision === 'recovered') game.player.metal = 180;
  else game.units = game.units.filter((candidate) => candidate.scriptId !== 'disabled-recovery-vehicle');
  updateMissionScripts(game);
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.salvageDecision, decision);
}

function completeWithdrawal(decision = 'recovered') {
  const game = createScenario();
  reachFirstRelease(game);
  commitSalvageDecision(game, decision);

  move(game, ['rear-guard-1'], 800, 340);
  game.time = 240;
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.phase, 2);
  assert.equal(game.missionScriptState.variables.secondLineHeld, 1);

  move(game, ['command-ifv-1', 'mechanized-infantry-1', 'mechanized-infantry-2'], 500, 300);
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.phase, 3);
  assert.equal(game.missionScriptState.variables.checkpointCrossed, 1);

  move(game, ['rear-guard-1'], 350, 320);
  updateMissionScripts(game);

  move(game, ['command-ifv-1', 'mechanized-infantry-1', 'mechanized-infantry-2', 'rear-guard-1'], 128, 320);
  updateMissionScripts(game);
  return game;
}

test('validates the authored map, objectives, mission script, briefing, and stable cross references', () => {
  const map = loadAuthoredMap(DEFENSIVE_WITHDRAWAL_MAP_SOURCE);
  const objectives = validateObjectiveDefinitions(DEFENSIVE_WITHDRAWAL_OBJECTIVES);
  const script = validateMissionScript(DEFENSIVE_WITHDRAWAL_SCRIPT_SOURCE);
  const briefing = createMissionBriefingModel(DEFENSIVE_WITHDRAWAL_BRIEFING_SOURCE);

  assert.equal(map.id, DEFENSIVE_WITHDRAWAL_MISSION.mapId);
  assert.deepEqual(map.grid, { width: 48, height: 30 });
  assert.ok(Object.isFrozen(map));
  assert.ok(Object.isFrozen(objectives));
  assert.ok(Object.isFrozen(script));
  assert.ok(Object.isFrozen(briefing));
  assert.ok(Object.isFrozen(DEFENSIVE_WITHDRAWAL_OPERATION));

  assert.deepEqual(
    map.triggers.map((trigger) => trigger.id),
    script.triggers.map((trigger) => trigger.id),
  );
  assert.deepEqual(
    briefing.objectives.map((objective) => objective.id),
    objectives.map((objective) => objective.id),
  );

  const roadCells = map.roads.flatMap((road) => road.cells.map((cell) => `${cell.x},${cell.y}`));
  assert.equal(new Set(roadCells).size, roadCells.length);

  const startIds = new Set(Object.values(map.starts).flat().map((start) => start.id));
  for (const force of [
    ...DEFENSIVE_WITHDRAWAL_MISSION.composition.startingForces,
    ...DEFENSIVE_WITHDRAWAL_MISSION.composition.enemyForces,
  ]) {
    assert.ok(UNIT_TYPES[force.type], `unknown force type ${force.type}`);
    assert.ok(startIds.has(force.startId), `missing start ${force.startId}`);
  }

  const regionIds = new Set(script.regions.map((region) => region.id));
  for (const objective of objectives.filter((definition) => definition.regionId)) {
    assert.ok(regionIds.has(objective.regionId), `missing objective region ${objective.regionId}`);
  }

  const salvageProp = map.props.find((prop) => prop.id === 'disabled-recovery-vehicle-prop');
  const salvageResource = map.resources.find((resource) => resource.id === 'disabled-vehicle-salvage');
  assert.equal(salvageProp.metadata.contract, 'UFR-044');
  assert.equal(salvageResource.metadata.contract, 'UFR-054');
  assert.equal(DEFENSIVE_WITHDRAWAL_MISSION.composition.salvageChoice.tieBreak, 'scuttled');
  assert.equal(DEFENSIVE_WITHDRAWAL_MISSION.checkpointPolicy.contract, 'UFR-090');
  assert.deepEqual(
    DEFENSIVE_WITHDRAWAL_MISSION.checkpointPolicy.stablePoints.map((point) => point.afterPhase),
    [1, 2, 3],
  );
  assert.equal(DEFENSIVE_WITHDRAWAL_MISSION.debriefPolicy.contract, 'UFR-089');
});

test('recovery branch holds both lines, crosses the checkpoint, and extracts deterministically', () => {
  const first = completeWithdrawal('recovered');
  const second = completeWithdrawal('recovered');
  const summarize = (game) => ({
    variables: { ...game.missionScriptState.variables },
    metal: game.player.metal,
    intel: game.player.intel,
    outcome: game.outcome,
    reason: game.endReason,
  });

  assert.deepEqual(summarize(first), summarize(second));
  assert.equal(first.outcome, 'victory');
  assert.equal(first.missionScriptState.variables.phase, 4);
  assert.equal(first.missionScriptState.variables.rearGuardExtracted, 1);
  assert.equal(first.missionScriptState.variables.salvageDecision, 'recovered');
  assert.equal(first.player.intel, 40);
});

test('scuttle branch is deterministic and does not award recovery resources', () => {
  const game = completeWithdrawal('scuttled');
  assert.equal(game.outcome, 'victory');
  assert.equal(game.missionScriptState.variables.salvageDecision, 'scuttled');
  assert.equal(game.player.metal, 80);
  assert.equal(game.player.intel, 20);
});

test('simultaneous recovery and scuttle signals use the authored fail-safe scuttle tie-break', () => {
  const game = createScenario();
  reachFirstRelease(game);
  game.player.metal = 180;
  game.units = game.units.filter((candidate) => candidate.scriptId !== 'disabled-recovery-vehicle');
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.salvageCandidate, 'scuttled');
  updateMissionScripts(game);
  assert.equal(game.missionScriptState.variables.salvageDecision, 'scuttled');
  assert.equal(game.player.intel, 20);
});

test('the ten-minute deadline fails closed before extraction', () => {
  const game = createScenario();
  updateMissionScripts(game);
  game.time = 600;
  updateMissionScripts(game);
  assert.equal(game.outcome, 'defeat');
  assert.match(game.endReason, /closed the extraction route/i);
});

test('optional salvage and rear-guard results do not block required objective completion', () => {
  const game = createScenario();
  updateObjectiveLibrary(game);
  game.time = 240;
  move(game, ['command-ifv-1', 'mechanized-infantry-1', 'mechanized-infantry-2', 'support-artillery-1'], 128, 320);
  const summary = updateObjectiveLibrary(game);

  assert.equal(summary.allRequiredComplete, true);
  assert.equal(summary.requiredFailed, false);
  assert.equal(summary.results.find((result) => result.id === 'recover-disabled-vehicle-salvage').complete, false);
  assert.equal(summary.results.find((result) => result.id === 'extract-rear-guard').complete, false);
});

test('force-preservation scoring counts only stable authored identities and clamps all inputs', () => {
  const perfect = scoreDefensiveWithdrawal({
    outcome: 'victory',
    survivingForceIds: [...DEFENSIVE_WITHDRAWAL_FORCE_IDS, 'unknown-unit', 'rear-guard-1'],
    salvageDecision: 'recovered',
    delayingPositionsHeld: 99,
  });
  assert.equal(perfect.score, 100);
  assert.deepEqual(perfect.medalIds, ['disciplined-withdrawal']);
  assert.equal(perfect.preservedForceIds.length, 5);
  assert.equal(perfect.delayingPositionsHeld, 2);

  const partial = scoreDefensiveWithdrawal({
    outcome: 'victory',
    survivingForceIds: DEFENSIVE_WITHDRAWAL_FORCE_IDS.filter((id) => id !== 'rear-guard-1'),
    salvageDecision: 'scuttled',
    delayingPositionsHeld: 2,
  });
  assert.equal(partial.score, 77);
  assert.deepEqual(partial.medalIds, ['line-preserved']);
  assert.equal(partial.rearGuardSurvived, false);

  const repeated = scoreDefensiveWithdrawal({
    outcome: 'victory',
    survivingForceIds: DEFENSIVE_WITHDRAWAL_FORCE_IDS.filter((id) => id !== 'rear-guard-1'),
    salvageDecision: 'scuttled',
    delayingPositionsHeld: 2,
  });
  assert.deepEqual(repeated, partial);
  assert.ok(Object.isFrozen(repeated));
});

test('debrief source composes through the existing campaign-flow model', () => {
  const source = createDefensiveWithdrawalDebriefSource({
    outcome: 'victory',
    completedTick: 300,
    survivingForceIds: DEFENSIVE_WITHDRAWAL_FORCE_IDS,
    salvageDecision: 'recovered',
    delayingPositionsHeld: 2,
  });
  const debrief = createMissionDebriefModel(source);

  assert.ok(Object.isFrozen(source));
  assert.ok(Object.isFrozen(debrief));
  assert.equal(debrief.score, DEFENSIVE_WITHDRAWAL_SCORING_POLICY.maximumScore);
  assert.deepEqual(debrief.medals.map((medal) => medal.id), ['disciplined-withdrawal']);
  assert.equal(debrief.losses.totalLost, 0);
  assert.equal(debrief.campaignConsequences.salvageDecision, 'recovered');
  assert.equal(debrief.campaignConsequences.modernizationPoints, 2);
  assert.equal(debrief.nextOperations[0].operationId, 'operation-combined-arms-offensive');
});

test('salvage choice references the existing UFR-044 wreck and recovery lifecycle', () => {
  const policy = createDestructionPolicy({ salvageWorkRequired: 50 });
  const entity = {
    id: 'disabled-recovery-vehicle',
    team: 0,
    domain: TARGET_DOMAINS.GROUND,
    hp: 100,
    maxHp: 100,
    crew: 0,
    x: 1000,
    y: 640,
    radius: 20,
    cost: { metal: 400 },
    salvageBase: { metal: 100 },
  };

  let state = createDestructionState(entity, policy);
  state = applyDestructionDamage(state, entity, 100, {}, policy).state;
  assert.equal(state.phase, DESTRUCTION_PHASES.DESTROYED);
  state = materializeWreck(state, entity, policy).state;
  assert.equal(state.phase, DESTRUCTION_PHASES.WRECK);
  const salvaged = applyWreckSalvage(state, 50, policy).state;
  assert.equal(salvaged.phase, DESTRUCTION_PHASES.SALVAGED);
  assert.deepEqual(salvaged.recoveredSalvage, { metal: 100 });
});
