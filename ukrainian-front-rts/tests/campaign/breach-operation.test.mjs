import test from 'node:test';
import assert from 'node:assert/strict';

import { loadAuthoredMap } from '../../src/core/authored-map.js';
import {
  breachObstacle,
  clearMine,
} from '../../src/combat/engineer-mechanics-system.js';
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
  BREACH_OPERATION,
  BREACH_OPERATION_BRIEFING_SOURCE,
  BREACH_OPERATION_MAP_SOURCE,
  BREACH_OPERATION_MISSION,
  BREACH_OPERATION_OBJECTIVES,
  BREACH_OPERATION_SCRIPT_SOURCE,
} from '../../src/content/campaign/breach-operation.js';

function createScenario({ includeObstacles = true } = {}) {
  let nextId = 100;
  const game = {
    time: 0,
    mission: BREACH_OPERATION_MISSION,
    player: {
      metal: BREACH_OPERATION_MISSION.start.metal,
      fuel: BREACH_OPERATION_MISSION.start.fuel,
      intel: 0,
      mined: 0,
      objectives: [],
    },
    units: [
      {
        id: 1,
        type: 'uaDrone',
        team: 0,
        scriptId: 'recon-team-1',
        scriptTag: 'recon-team',
        hp: 50,
        maxHp: 50,
        x: 400,
        y: 160,
      },
      {
        id: 2,
        type: 'uaEngineer',
        team: 0,
        scriptId: 'breach-engineer-1',
        scriptTag: 'breach-engineer',
        hp: 80,
        maxHp: 80,
        x: 560,
        y: 360,
      },
      {
        id: 3,
        type: 'uaInfantry',
        team: 0,
        scriptId: 'assault-force-1',
        scriptTag: 'assault-force',
        hp: 100,
        maxHp: 100,
        x: 640,
        y: 380,
      },
      {
        id: 4,
        type: 'uaIfv',
        team: 0,
        scriptId: 'assault-force-2',
        scriptTag: 'assault-force',
        hp: 250,
        maxHp: 250,
        x: 680,
        y: 400,
      },
      {
        id: 5,
        type: 'uaInfantry',
        team: 0,
        scriptId: 'decoy-force-1',
        scriptTag: 'decoy-force',
        hp: 100,
        maxHp: 100,
        x: 480,
        y: 128,
      },
    ],
    buildings: includeObstacles
      ? BREACH_OPERATION_MISSION.composition.engineerObjects.map((entry, index) => ({
          id: 20 + index,
          type: entry.mechanic,
          team: entry.team,
          scriptId: entry.scriptId,
          scriptTag: entry.tag,
          hp: 100,
          maxHp: 100,
          x: 600 + index * 32,
          y: 360,
        }))
      : [],
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
        hp: 100,
        maxHp: 100,
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

function runScriptScenario() {
  const game = createScenario();

  updateMissionScripts(game);

  game.buildings = [];
  updateMissionScripts(game);
  updateMissionScripts(game);

  for (const unit of game.units.filter((candidate) => candidate.scriptTag === 'assault-force')) {
    unit.x = 960;
    unit.y = 360;
  }
  updateMissionScripts(game);

  return {
    variables: { ...game.missionScriptState.variables },
    intel: game.player.intel,
    outcome: game.outcome,
    divertedReserves: game.units
      .filter((unit) => unit.scriptTag === 'diverted-reserve')
      .map((unit) => ({
        id: unit.id,
        type: unit.type,
        team: unit.team,
        x: unit.x,
        y: unit.y,
        scriptId: unit.scriptId,
      })),
    records: game.missionScriptRecords.map((record) => ({
      type: record.type,
      triggerId: record.triggerId,
      payload: record.payload,
    })),
  };
}

test('validates the authored breach map, objectives, script, briefing, and engineer references', () => {
  const map = loadAuthoredMap(BREACH_OPERATION_MAP_SOURCE);
  const objectives = validateObjectiveDefinitions(BREACH_OPERATION_OBJECTIVES);
  const script = validateMissionScript(BREACH_OPERATION_SCRIPT_SOURCE);
  const briefing = createMissionBriefingModel(BREACH_OPERATION_BRIEFING_SOURCE);

  assert.equal(map.id, BREACH_OPERATION_MISSION.mapId);
  assert.deepEqual(map.grid, { width: 40, height: 24 });
  assert.ok(Object.isFrozen(map));
  assert.ok(Object.isFrozen(objectives));
  assert.ok(Object.isFrozen(script));
  assert.ok(Object.isFrozen(briefing));
  assert.ok(Object.isFrozen(BREACH_OPERATION));

  assert.deepEqual(
    map.triggers.map((trigger) => trigger.id),
    script.triggers.map((trigger) => trigger.id),
  );
  assert.deepEqual(
    briefing.objectives.map((objective) => objective.id),
    objectives.map((objective) => objective.id),
  );

  const props = new Map(map.props.map((prop) => [prop.id, prop]));
  const scriptText = JSON.stringify(script);
  for (const object of BREACH_OPERATION_MISSION.composition.engineerObjects) {
    const prop = props.get(object.propId);
    assert.ok(prop, `missing authored prop ${object.propId}`);
    assert.equal(prop.metadata.scriptId, object.scriptId);
    assert.equal(prop.metadata.tag, object.tag);
    assert.equal(prop.metadata.publicOperation, object.publicOperation);
    assert.match(scriptText, new RegExp(object.scriptId));
  }

  assert.equal(typeof breachObstacle, 'function');
  assert.equal(typeof clearMine, 'function');
  assert.equal(BREACH_OPERATION_MISSION.composition.engineerObjects[0].publicOperation, 'breachObstacle');
  assert.equal(BREACH_OPERATION_MISSION.composition.engineerObjects[2].publicOperation, 'clearMine');

  const objectiveTypes = new Map(objectives.map((objective) => [objective.id, objective.type]));
  assert.equal(objectiveTypes.get('recon-breach-corridor'), 'recon');
  assert.equal(objectiveTypes.get('commit-breach-engineers'), 'escort');
  assert.equal(objectiveTypes.get('clear-breach-lane'), 'destroy');
  assert.equal(objectiveTypes.get('exploit-before-reserves'), 'escort');
  assert.equal(objectives.find((objective) => objective.id === 'western-deception').optional, true);
});

test('completes reconnaissance, engineer commitment, obstacle clearance, deception, and exploitation deterministically', () => {
  const game = createScenario();

  let summary = updateObjectiveLibrary(game);
  const initial = Object.fromEntries(summary.results.map((result) => [result.id, result.complete]));

  assert.deepEqual(initial, {
    'recon-breach-corridor': true,
    'commit-breach-engineers': true,
    'clear-breach-lane': false,
    'exploit-before-reserves': false,
    'western-deception': true,
  });
  assert.equal(game.gameOver, false);

  game.buildings = [];
  game.time = 200;
  for (const unit of game.units.filter((candidate) => candidate.scriptTag === 'assault-force')) {
    unit.x = 960;
    unit.y = 360;
  }

  summary = updateObjectiveLibrary(game);

  assert.equal(summary.allRequiredComplete, true);
  assert.ok(summary.results.every((result) => result.complete));
  assert.equal(game.outcome, 'victory');
});

test('mission-script phases and reinforcement records are reproducible', () => {
  const first = runScriptScenario();
  const second = runScriptScenario();

  assert.deepEqual(second, first);
  assert.deepEqual(first.variables, {
    phase: 3,
    reconComplete: 1,
    decoyCommitted: 1,
    obstaclesCleared: 3,
  });
  assert.equal(first.intel, 35);
  assert.equal(first.outcome, null);
  assert.equal(first.divertedReserves.length, 2);
  assert.deepEqual(
    first.records
      .filter((record) => record.type === 'mission.trigger')
      .map((record) => record.triggerId),
    [
      'recon-overlook-entered',
      'decoy-axis-entered',
      'wire-obstacle-destroyed',
      'tank-traps-destroyed',
      'minefield-cleared',
      'breach-opened',
      'exploitation-force-entered',
    ],
  );
});

test('the seven-minute exploitation deadline fails closed', () => {
  const game = createScenario();
  for (const unit of game.units) {
    unit.x = 64;
    unit.y = 64;
  }
  game.time = 421;

  updateMissionScripts(game);

  assert.equal(game.outcome, 'defeat');
  assert.match(game.endReason, /sealed the obstacle belt/);
  assert.ok(game.missionScriptRecords.some(
    (record) => record.type === 'mission.trigger'
      && record.triggerId === 'exploitation-deadline',
  ));
});
