import test from 'node:test';
import assert from 'node:assert/strict';

import { UNIT_TYPES } from '../../src/config.js';
import { loadAuthoredMap } from '../../src/core/authored-map.js';
import {
  ARTILLERY_STATES,
  beginSetup,
  canFire,
  createArtilleryState,
  startSalvo,
  tickArtillery,
} from '../../src/combat/artillery-system.js';
import {
  DRONE_STATES,
  beginDroneLaunch,
  createDroneState,
  executeDroneStrike,
  tickDrone,
} from '../../src/combat/drone-ew-system.js';
import {
  AIR_TARGET_CLASSES,
  createAirDefenseState,
  createDroneInterceptionThreat,
} from '../../src/combat/air-defense-system.js';
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
import {
  DEEP_STRIKE_OPERATION,
  DEEP_STRIKE_OPERATION_BRIEFING_SOURCE,
  DEEP_STRIKE_OPERATION_MAP_SOURCE,
  DEEP_STRIKE_OPERATION_MISSION,
  DEEP_STRIKE_OPERATION_OBJECTIVES,
  DEEP_STRIKE_OPERATION_SCRIPT_SOURCE,
} from '../../src/content/campaign/deep-strike-logistics-operation.js';

const POSITIONS = Object.freeze({
  'branch-air-defense-node': { x: 1010, y: 208 },
  'branch-fuel-depot': { x: 1020, y: 650 },
  'main-logistics-hub': { x: 1320, y: 448 },
  'enemy-artillery-battery': { x: 1200, y: 128 },
});

function createScenario() {
  let nextId = 100;
  const game = {
    time: 0,
    mission: DEEP_STRIKE_OPERATION_MISSION,
    player: {
      metal: DEEP_STRIKE_OPERATION_MISSION.start.metal,
      fuel: DEEP_STRIKE_OPERATION_MISSION.start.fuel,
      intel: DEEP_STRIKE_OPERATION_MISSION.start.intel,
      mined: 0,
      objectives: [],
    },
    units: [
      {
        id: 1,
        type: 'uaDrone',
        team: 0,
        scriptId: 'recon-drone-1',
        scriptTag: 'recon-drone',
        hp: 58,
        maxHp: 58,
        x: 560,
        y: 360,
      },
      {
        id: 2,
        type: 'uaInfantry',
        team: 0,
        scriptId: 'strike-package-1',
        scriptTag: 'strike-package',
        hp: 112,
        maxHp: 112,
        x: 160,
        y: 420,
      },
      {
        id: 3,
        type: 'uaIfv',
        team: 0,
        scriptId: 'strike-package-2',
        scriptTag: 'strike-package',
        hp: 305,
        maxHp: 305,
        x: 190,
        y: 450,
      },
      {
        id: 4,
        type: 'uaArtillery',
        team: 0,
        scriptId: 'support-artillery-1',
        scriptTag: 'support-artillery',
        hp: 180,
        maxHp: 180,
        x: 160,
        y: 600,
      },
    ],
    buildings: DEEP_STRIKE_OPERATION_MISSION.composition.enemyTargets.map((target, index) => ({
      id: 20 + index,
      type: target.mechanic,
      team: target.team,
      scriptId: target.scriptId,
      scriptTag: target.tag,
      hp: 100,
      maxHp: 100,
      underConstruction: false,
      ...POSITIONS[target.scriptId],
    })),
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
        x,
        y,
        underConstruction: false,
      };
      this.buildings.push(building);
      return building;
    },
  };
  initializeMissionScripts(game);
  return game;
}

function destroyBuilding(game, scriptId) {
  game.buildings = game.buildings.filter((building) => building.scriptId !== scriptId);
}

function moveStrikePackageToExtraction(game) {
  for (const unit of game.units.filter((candidate) => candidate.scriptTag === 'strike-package')) {
    unit.x = 160;
    unit.y = 720;
  }
}

function runBranch(branchTarget) {
  const game = createScenario();
  updateMissionScripts(game);
  destroyBuilding(game, branchTarget);
  updateMissionScripts(game);
  updateMissionScripts(game);
  destroyBuilding(game, 'main-logistics-hub');
  updateMissionScripts(game);
  moveStrikePackageToExtraction(game);
  updateMissionScripts(game);
  return game;
}

test('validates the authored map, objectives, mission script, briefing, and stable references', () => {
  const map = loadAuthoredMap(DEEP_STRIKE_OPERATION_MAP_SOURCE);
  const objectives = validateObjectiveDefinitions(DEEP_STRIKE_OPERATION_OBJECTIVES);
  const script = validateMissionScript(DEEP_STRIKE_OPERATION_SCRIPT_SOURCE);
  const briefing = createMissionBriefingModel(DEEP_STRIKE_OPERATION_BRIEFING_SOURCE);

  assert.equal(map.id, DEEP_STRIKE_OPERATION_MISSION.mapId);
  assert.deepEqual(map.grid, { width: 48, height: 28 });
  assert.ok(Object.isFrozen(map));
  assert.ok(Object.isFrozen(objectives));
  assert.ok(Object.isFrozen(script));
  assert.ok(Object.isFrozen(briefing));
  assert.ok(Object.isFrozen(DEEP_STRIKE_OPERATION));

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

  const props = new Map(map.props.map((prop) => [prop.id, prop]));
  const scriptText = JSON.stringify(script);
  for (const target of DEEP_STRIKE_OPERATION_MISSION.composition.enemyTargets) {
    const prop = props.get(target.propId);
    assert.ok(prop, `missing authored prop ${target.propId}`);
    assert.equal(prop.metadata.scriptId, target.scriptId);
    assert.equal(prop.metadata.tag, target.tag);
    assert.equal(prop.metadata.mechanic, target.mechanic);
    assert.match(scriptText, new RegExp(target.scriptId));
  }

  for (const force of DEEP_STRIKE_OPERATION_MISSION.composition.startingForces) {
    assert.ok(UNIT_TYPES[force.type], `unknown starting-force type ${force.type}`);
  }

  assert.equal(DEEP_STRIKE_OPERATION_MISSION.checkpointPolicy.contract, 'UFR-090');
  assert.deepEqual(
    DEEP_STRIKE_OPERATION_MISSION.checkpointPolicy.stablePoints.map((point) => point.afterPhase),
    [1, 2, 3],
  );
});

test('air-defense-first route grants drone support, destroys the hub, and extracts deterministically', () => {
  const first = runBranch('branch-air-defense-node');
  const second = runBranch('branch-air-defense-node');

  const summarize = (game) => ({
    variables: { ...game.missionScriptState.variables },
    intel: game.player.intel,
    outcome: game.outcome,
    support: game.units
      .filter((unit) => unit.scriptTag === 'drone-strike-support')
      .map((unit) => ({ type: unit.type, team: unit.team, x: unit.x, y: unit.y, scriptId: unit.scriptId })),
    triggers: game.missionScriptRecords
      .filter((record) => record.type === 'mission.trigger')
      .map((record) => record.triggerId),
  });

  assert.deepEqual(summarize(second), summarize(first));
  assert.deepEqual(first.missionScriptState.variables, {
    phase: 4,
    branch: 'air-defense',
    branchCandidate: 'air-defense',
    branchTargetsDestroyed: 1,
    mainTargetDestroyed: 1,
    artilleryBatteryDestroyed: 0,
    extracted: 1,
  });
  assert.equal(first.player.intel, DEEP_STRIKE_OPERATION_MISSION.start.intel + 30);
  assert.equal(first.outcome, 'victory');
  assert.equal(first.units.filter((unit) => unit.scriptTag === 'drone-strike-support').length, 1);
  assert.deepEqual(
    summarize(first).triggers,
    [
      'recon-corridor-entered',
      'air-defense-node-destroyed',
      'commit-air-defense-route',
      'main-logistics-hub-destroyed',
      'strike-package-extracted',
    ],
  );
});

test('fuel-first route grants artillery support and simultaneous target loss has a stable tie-break', () => {
  const fuel = runBranch('branch-fuel-depot');
  assert.equal(fuel.missionScriptState.variables.branch, 'fuel-depot');
  assert.equal(fuel.units.filter((unit) => unit.scriptTag === 'support-artillery').length, 1);
  assert.equal(fuel.units.filter((unit) => unit.scriptTag === 'counter-battery-support').length, 1);
  assert.equal(fuel.units.some((unit) => unit.scriptTag === 'drone-strike-support'), false);
  assert.equal(fuel.outcome, 'victory');

  const tie = createScenario();
  updateMissionScripts(tie);
  destroyBuilding(tie, 'branch-air-defense-node');
  destroyBuilding(tie, 'branch-fuel-depot');
  updateMissionScripts(tie);
  updateMissionScripts(tie);

  assert.equal(tie.missionScriptState.variables.branchTargetsDestroyed, 2);
  assert.equal(tie.missionScriptState.variables.branchCandidate, 'fuel-depot');
  assert.equal(tie.missionScriptState.variables.branch, 'fuel-depot');
  assert.equal(tie.units.filter((unit) => unit.scriptTag === 'support-artillery').length, 1);
  assert.equal(tie.units.filter((unit) => unit.scriptTag === 'counter-battery-support').length, 1);
  assert.equal(tie.units.some((unit) => unit.scriptTag === 'drone-strike-support'), false);
});

test('fuel-route reinforcement cannot substitute for the original fire-support objective target', () => {
  const game = createScenario();
  updateObjectiveLibrary(game);
  updateMissionScripts(game);
  destroyBuilding(game, 'branch-fuel-depot');
  updateMissionScripts(game);
  updateMissionScripts(game);

  assert.equal(game.units.filter((unit) => unit.scriptTag === 'counter-battery-support').length, 1);
  game.units = game.units.filter((unit) => unit.scriptId !== 'support-artillery-1');
  game.time = 1;

  const summary = updateObjectiveLibrary(game);
  const preservation = summary.results.find((result) => result.id === 'preserve-fire-support');
  assert.equal(preservation.failed, true);
  assert.equal(preservation.complete, false);
});

test('objective-library progress requires reconnaissance, one branch target, the hub, and both extracted elements', () => {
  const game = createScenario();
  let summary = updateObjectiveLibrary(game);
  const initial = Object.fromEntries(summary.results.map((result) => [result.id, result.complete]));

  assert.equal(initial['recon-logistics-corridor'], true);
  assert.equal(initial['neutralize-air-defense-node'], false);
  assert.equal(initial['destroy-fuel-depot'], false);
  assert.equal(initial['destroy-logistics-hub'], false);
  assert.equal(initial['extract-strike-package'], false);
  assert.equal(initial['neutralize-artillery-battery'], false);
  assert.equal(game.gameOver, false);

  destroyBuilding(game, 'branch-air-defense-node');
  destroyBuilding(game, 'main-logistics-hub');
  moveStrikePackageToExtraction(game);
  game.time = 200;
  summary = updateObjectiveLibrary(game);

  assert.equal(summary.allRequiredComplete, true);
  assert.equal(summary.results.find((result) => result.id === 'neutralize-air-defense-node').complete, true);
  assert.equal(summary.results.find((result) => result.id === 'destroy-fuel-depot').complete, false);
  assert.equal(summary.results.find((result) => result.id === 'neutralize-artillery-battery').complete, false);
  assert.equal(summary.results.find((result) => result.id === 'preserve-fire-support').complete, false);
  assert.equal(game.outcome, 'victory');
});

test('the ten-minute extraction deadline fails closed', () => {
  const game = createScenario();
  for (const unit of game.units) {
    unit.x = 64;
    unit.y = 64;
  }
  game.time = 601;

  updateMissionScripts(game);

  assert.equal(game.outcome, 'defeat');
  assert.match(game.endReason, /closed the extraction corridor/);
  assert.ok(game.missionScriptRecords.some(
    (record) => record.type === 'mission.trigger' && record.triggerId === 'extraction-deadline',
  ));
});

test('declared drone, artillery, and air-defense mechanics compose through existing public contracts', () => {
  let drone = createDroneState({ payload: 1 });
  drone = beginDroneLaunch(drone, { launchTime: 0, loiterDuration: 60 });
  drone = tickDrone(drone, 0, {}, { launchTime: 0, loiterDuration: 60 });
  assert.equal(drone.state, DRONE_STATES.AIRBORNE);

  const strike = executeDroneStrike(
    drone,
    { distance: 120, targetSpotted: true },
    { linkRange: 500, requiresSpottedTarget: true, strikeCooldown: 2 },
  );
  assert.equal(strike.verdict.ok, true);
  assert.equal(strike.state.payload, 0);

  let artillery = createArtilleryState({ ammo: 3 });
  artillery = beginSetup(artillery, { setupTime: 0 });
  artillery = tickArtillery(artillery, 0, { setupTime: 0 });
  assert.equal(artillery.state, ARTILLERY_STATES.READY);
  assert.deepEqual(
    canFire(artillery, { distance: 240, spotted: true }, { minimumRange: 100, requiresSpotter: true }),
    { ok: true, reason: null },
  );
  const salvo = startSalvo(
    artillery,
    { distance: 240, spotted: true },
    { minimumRange: 100, requiresSpotter: true, salvoSize: 2 },
  );
  assert.equal(salvo.verdict.ok, true);
  assert.equal(salvo.state.salvoRemaining, 2);

  const airDefense = createAirDefenseState({ ammunition: 2 });
  const threat = createDroneInterceptionThreat(
    { x: 0, y: 0 },
    {
      id: 'route-drone',
      x: 120,
      y: 0,
      hp: 50,
      air: true,
      state: 'airborne',
      altitude: 40,
      targetClass: AIR_TARGET_CLASSES.STRIKE_DRONE,
      signature: 0.7,
    },
    { lineOfSight: true, radarOnline: true },
    { opticalRange: 150, minimumRange: 20, maximumRange: 300, interceptionChance: 0.8 },
  );
  assert.equal(airDefense.ammunition, 2);
  assert.equal(threat.canEngage, true);
  assert.equal(threat.reason, null);
});
