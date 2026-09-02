import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  compatibleConstructionBuilders,
  createGroupConstructionController,
} from '../../src/systems/group-construction-runtime.js';

function fixture() {
  const engineerB = {
    id: 2,
    type: 'uaEngineer',
    team: TEAM.UA,
    hp: 80,
    order: null,
    target: null,
  };
  const engineerA = {
    id: 1,
    type: 'uaEngineer',
    team: TEAM.UA,
    hp: 80,
    order: null,
    target: null,
  };
  const infantry = {
    id: 3,
    type: 'uaInfantry',
    team: TEAM.UA,
    hp: 100,
    order: null,
    target: null,
  };
  const game = {
    units: [engineerB, engineerA, infantry],
    buildings: [],
    selected: new Set([engineerA.id, engineerB.id]),
    pendingBuild: null,
    lastError: '',
    selectedUnits() {
      return this.units.filter((unit) => this.selected.has(unit.id) && unit.team === TEAM.UA);
    },
    selectedEntities() {
      return [...this.units, ...this.buildings].filter((entity) => this.selected.has(entity.id));
    },
    beginBuild(type) {
      const worker = this.selectedUnits().find((unit) => unit.type === 'uaEngineer');
      if (!worker) return this.fail('Select a combat engineer to construct buildings.');
      this.pendingBuild = { type, workerId: worker.id, rotation: 0 };
      return true;
    },
    placeBuilding() {
      const pending = this.pendingBuild;
      const worker = this.units.find((unit) => unit.id === pending?.workerId && unit.hp > 0);
      if (!worker) {
        this.pendingBuild = null;
        return this.fail('The assigned engineer is no longer available.');
      }
      const building = {
        id: 10,
        type: pending.type,
        team: TEAM.UA,
        underConstruction: true,
      };
      this.buildings.push(building);
      worker.order = { kind: 'construct', target: building };
      this.pendingBuild = null;
      this.selected = new Set([building.id]);
      return true;
    },
    fail(message) {
      this.lastError = message;
      return false;
    },
  };
  return { game, engineerA, engineerB, infantry };
}

test('compatible construction builders are deterministic and include the whole engineer subgroup', () => {
  const { game, engineerA, engineerB } = fixture();
  assert.deepEqual(
    compatibleConstructionBuilders(game, 'depot').map((unit) => unit.id),
    [engineerA.id, engineerB.id],
  );
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

test('a lost primary engineer is deterministically replaced by the next assigned builder before placement', () => {
  const { game, engineerA, engineerB } = fixture();
  createGroupConstructionController(game);

  assert.equal(game.beginBuild('depot'), true);
  engineerA.hp = 0;
  assert.equal(game.placeBuilding(200, 160), true);
  assert.equal(engineerB.order.kind, 'construct');
  assert.equal(engineerB.order.target, game.buildings[0]);
});

test('mixed engineer and infantry selections are rejected instead of silently assigning only one builder', () => {
  const { game, engineerA, infantry } = fixture();
  game.selected = new Set([engineerA.id, infantry.id]);
  createGroupConstructionController(game);

  assert.equal(game.beginBuild('depot'), false);
  assert.equal(game.pendingBuild, null);
  assert.match(game.lastError, /compatible Ukrainian engineers/);
});
