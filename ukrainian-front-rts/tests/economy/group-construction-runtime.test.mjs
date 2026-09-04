import assert from 'node:assert/strict';
import test from 'node:test';

import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../../src/config.js';
import {
  createConstructionProgressController,
  updateConstructionProgress,
} from '../../src/systems/construction-progress-runtime.js';
import {
  compatibleConstructionBuilders,
  createGroupConstructionController,
} from '../../src/systems/group-construction-runtime.js';

function fixture() {
  let nextBuildingId = 10;
  const engineerB = {
    id: 2,
    type: 'uaEngineer',
    team: TEAM.UA,
    hp: 80,
    x: 100,
    y: 100,
    order: null,
    target: null,
  };
  const engineerA = {
    id: 1,
    type: 'uaEngineer',
    team: TEAM.UA,
    hp: 80,
    x: 100,
    y: 100,
    order: null,
    target: null,
  };
  const infantry = {
    id: 3,
    type: 'uaInfantry',
    team: TEAM.UA,
    hp: 100,
    x: 100,
    y: 100,
    order: null,
    target: null,
  };
  const game = {
    units: [engineerB, engineerA, infantry],
    buildings: [],
    player: { cap: 14, metal: 0, fuel: 0 },
    selected: new Set([engineerA.id, engineerB.id]),
    primarySelectedId: null,
    pendingBuild: null,
    lastError: '',
    unitStats(type) {
      return UNIT_TYPES[type];
    },
    selectedUnits() {
      return this.units.filter((unit) => this.selected.has(unit.id) && unit.team === TEAM.UA);
    },
    selectedEntities() {
      return [...this.units, ...this.buildings].filter((entity) => this.selected.has(entity.id));
    },
    addBuilding(type, team, x, y, { underConstruction = false } = {}) {
      const stats = BUILDING_TYPES[type];
      const building = {
        id: nextBuildingId++,
        type,
        team,
        x,
        y,
        hp: underConstruction ? Math.min(80, stats.hp * 0.12) : stats.hp,
        maxHp: stats.hp,
        underConstruction,
        capacityGranted: !underConstruction,
        selected: false,
      };
      this.buildings.push(building);
      return building;
    },
    beginBuild(type) {
      const worker = this.selectedUnits().find((unit) => unit.type === 'uaEngineer');
      if (!worker) return this.fail('Select a combat engineer to construct buildings.');
      this.pendingBuild = { type, workerId: worker.id, rotation: 0 };
      return true;
    },
    placeBuilding(x, y) {
      const pending = this.pendingBuild;
      const worker = this.units.find((unit) => unit.id === pending?.workerId && unit.hp > 0);
      if (!worker) {
        this.pendingBuild = null;
        return this.fail('The assigned engineer is no longer available.');
      }
      const building = this.addBuilding(pending.type, TEAM.UA, x, y, { underConstruction: true });
      worker.order = { kind: 'construct', target: building };
      this.pendingBuild = null;
      this.selected = new Set([building.id]);
      return true;
    },
    issue() {
      return false;
    },
    move(unit, x, y) {
      unit.x = x;
      unit.y = y;
      return false;
    },
    updateWorker() {},
    fail(message) {
      this.lastError = message;
      return false;
    },
  };
  return { game, engineerA, engineerB, infantry };
}

test('compatible construction builders are deterministic and include the whole engineer selection', () => {
  const { game, engineerA, engineerB } = fixture();
  assert.deepEqual(
    compatibleConstructionBuilders(game, 'depot').map((unit) => unit.id),
    [engineerA.id, engineerB.id],
  );
});

test('active engineer subgroup inside a mixed selection owns construction deterministically', () => {
  const { game, engineerA, engineerB, infantry } = fixture();
  game.selected = new Set([engineerA.id, engineerB.id, infantry.id]);
  game.primarySelectedId = engineerA.id;
  createGroupConstructionController(game);

  assert.deepEqual(
    compatibleConstructionBuilders(game, 'depot').map((unit) => unit.id),
    [engineerA.id, engineerB.id],
  );
  assert.equal(game.beginBuild('depot'), true);
  assert.deepEqual(game.pendingBuild.workerIds, [engineerA.id, engineerB.id]);
  assert.equal(game.pendingBuild.workerId, engineerA.id);
  assert.equal(game.placeBuilding(200, 160), true);
  assert.equal(infantry.order, null);
  assert.equal(engineerA.order.target, game.buildings[0]);
  assert.equal(engineerB.order.target, game.buildings[0]);
});

test('non-engineer active subgroup rejects construction instead of silently borrowing engineers', () => {
  const { game, engineerA, engineerB, infantry } = fixture();
  game.selected = new Set([engineerA.id, engineerB.id, infantry.id]);
  game.primarySelectedId = infantry.id;
  createGroupConstructionController(game);

  assert.equal(game.beginBuild('depot'), false);
  assert.equal(game.pendingBuild, null);
  assert.match(game.lastError, /engineer subgroup active/);
});

test('mixed selection without an active subgroup rejects ambiguous construction ownership', () => {
  const { game, engineerA, infantry } = fixture();
  game.selected = new Set([engineerA.id, infantry.id]);
  createGroupConstructionController(game);

  assert.equal(game.beginBuild('depot'), false);
  assert.equal(game.pendingBuild, null);
  assert.match(game.lastError, /engineer subgroup active/);
});

test('group construction records all compatible builders and assigns all of them to the placed site', () => {
  const { game, engineerA, engineerB } = fixture();
  const originalBeginBuild = game.beginBuild;
  const originalPlaceBuilding = game.placeBuilding;
  const dispose = createGroupConstructionController(game);

  assert.equal(game.beginBuild('depot'), true);
  assert.deepEqual(game.pendingBuild.workerIds, [1, 2]);
  assert.equal(game.pendingBuild.workerId, 1);
  assert.equal(game.placeBuilding(200, 160), true);

  const building = game.buildings[0];
  for (const engineer of [engineerA, engineerB]) {
    assert.equal(engineer.order.kind, 'construct');
    assert.equal(engineer.order.target, building);
  }

  dispose();
  assert.equal(game.beginBuild, originalBeginBuild);
  assert.equal(game.placeBuilding, originalPlaceBuilding);
});

test('group placement feeds both engineers into deterministic construction progress', () => {
  const { game, engineerA, engineerB } = fixture();
  const disposeProgress = createConstructionProgressController(game);
  const disposeGroup = createGroupConstructionController(game);

  assert.equal(game.beginBuild('workshop'), true);
  assert.equal(game.placeBuilding(100, 100), true);
  const building = game.buildings[0];

  game.updateWorker(engineerA, UNIT_TYPES.uaEngineer, 1);
  game.updateWorker(engineerB, UNIT_TYPES.uaEngineer, 1);
  const result = updateConstructionProgress(game, 2);

  assert.deepEqual(building.constructionProgress.builderIds, [engineerA.id, engineerB.id]);
  assert.ok(Math.abs(building.constructionProgress.completedWork - 3.4) < 1e-12);
  assert.deepEqual(result.updatedSiteIds, [building.id]);

  disposeGroup();
  disposeProgress();
});

test('a lost primary engineer is deterministically replaced by the next assigned builder before placement', () => {
  const { game, engineerA, engineerB } = fixture();
  createGroupConstructionController(game);

  assert.equal(game.beginBuild('depot'), true);
  engineerA.hp = 0;
  assert.equal(game.placeBuilding(200, 160), true);
  assert.equal(engineerB.order.kind, 'construct');
  assert.equal(engineerB.order.target, game.buildings[0]);
});
