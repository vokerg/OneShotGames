import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, UNIT_TYPES, BUILDING_TYPES } from '../../src/config.js';
import {
  CONSTRUCTION_INTERACTION_RANGE,
  constructionPresentation,
  createConstructionProgressController,
  updateConstructionProgress,
} from '../../src/systems/construction-progress-runtime.js';

function makeGame() {
  let nextId = 1;
  const game = {
    buildings: [],
    units: [],
    player: { metal: 0, fuel: 0, cap: 14 },
    selected: new Set(),
    lastError: '',
    legacyWorkerCalls: 0,
    delegatedIssues: 0,
    unitStats(type) { return UNIT_TYPES[type]; },
    addBuilding(type, team, x, y, { underConstruction = false } = {}) {
      const stats = BUILDING_TYPES[type];
      const building = {
        id: nextId++, type, team, x, y,
        hp: underConstruction ? Math.min(80, stats.hp * 0.12) : stats.hp,
        maxHp: stats.hp,
        underConstruction,
        capacityGranted: !underConstruction,
        selected: false,
      };
      this.buildings.push(building);
      if (team === TEAM.UA && building.capacityGranted) this.player.cap += stats.pop || 0;
      return building;
    },
    addWorker(x = 0, y = 0) {
      const unit = { id: nextId++, type: 'uaEngineer', team: TEAM.UA, x, y, hp: 100, order: null, target: null };
      this.units.push(unit);
      return unit;
    },
    addInfantry(x = 0, y = 0) {
      const unit = { id: nextId++, type: 'uaInfantry', team: TEAM.UA, x, y, hp: 100, order: null, target: null };
      this.units.push(unit);
      return unit;
    },
    selectedUnits() { return this.units.filter((unit) => this.selected.has(unit.id)); },
    selectedEntities() { return [...this.units, ...this.buildings].filter((entity) => this.selected.has(entity.id)); },
    updateWorker() { this.legacyWorkerCalls += 1; },
    issue() { this.delegatedIssues += 1; return 'delegated'; },
    move(unit, x, y) { unit.x = x; unit.y = y; return false; },
    fail(message) { this.lastError = message; return false; },
  };
  return game;
}

test('attaches progress to newly placed unfinished buildings', () => {
  const game = makeGame();
  createConstructionProgressController(game);
  const site = game.addBuilding('depot', TEAM.UA, 100, 100, { underConstruction: true });
  assert.equal(site.constructionProgress.requiredWork, BUILDING_TYPES.depot.buildTime);
  assert.deepEqual(site.constructionProgress.cost, { metal: 100 });
  assert.equal(site.constructionStartHp, 80);
  assert.equal(game.player.cap, 14);
});

test('right-click assignment moves builders and only assigns them in range', () => {
  const game = makeGame();
  createConstructionProgressController(game);
  const site = game.addBuilding('depot', TEAM.UA, 100, 100, { underConstruction: true });
  const worker = game.addWorker(0, 0);
  game.selected.add(worker.id);
  assert.equal(game.issue(100, 100, site), true);
  game.updateWorker(worker, UNIT_TYPES.uaEngineer, 1);
  assert.deepEqual(site.constructionProgress.builderIds, []);
  assert.equal(worker.x, 100);
  game.updateWorker(worker, UNIT_TYPES.uaEngineer, 1);
  assert.deepEqual(site.constructionProgress.builderIds, [worker.id]);
});

test('multiple active builders apply deterministic diminishing returns once per tick', () => {
  const game = makeGame();
  createConstructionProgressController(game);
  const site = game.addBuilding('workshop', TEAM.UA, 100, 100, { underConstruction: true });
  const first = game.addWorker(100, 100);
  const second = game.addWorker(100 + CONSTRUCTION_INTERACTION_RANGE, 100);
  game.assignConstructionBuilders(site, [second, first]);
  game.updateWorker(first, UNIT_TYPES.uaEngineer, 1);
  game.updateWorker(second, UNIT_TYPES.uaEngineer, 1);
  const result = updateConstructionProgress(game, 2);
  assert.deepEqual(site.constructionProgress.builderIds, [first.id, second.id]);
  assert.ok(Math.abs(site.constructionProgress.completedWork - 3.4) < 1e-12);
  assert.deepEqual(result.updatedSiteIds, [site.id]);
});

test('pause and resume preserve builder assignments and work', () => {
  const game = makeGame();
  createConstructionProgressController(game);
  const site = game.addBuilding('barracks', TEAM.UA, 100, 100, { underConstruction: true });
  const worker = game.addWorker(100, 100);
  game.assignConstructionBuilders(site, [worker]);
  game.updateWorker(worker, UNIT_TYPES.uaEngineer, 1);
  game.pauseConstruction(site);
  updateConstructionProgress(game, 3);
  assert.equal(site.constructionProgress.completedWork, 0);
  assert.deepEqual(site.constructionProgress.builderIds, [worker.id]);
  game.resumeConstruction(site);
  updateConstructionProgress(game, 2);
  assert.equal(site.constructionProgress.completedWork, 2);
});

test('dead or reassigned builders are reconciled without resetting progress', () => {
  const game = makeGame();
  createConstructionProgressController(game);
  const site = game.addBuilding('barracks', TEAM.UA, 100, 100, { underConstruction: true });
  const first = game.addWorker(100, 100);
  const second = game.addWorker(100, 100);
  game.assignConstructionBuilders(site, [first, second]);
  game.updateWorker(first, UNIT_TYPES.uaEngineer, 1);
  game.updateWorker(second, UNIT_TYPES.uaEngineer, 1);
  updateConstructionProgress(game, 1);
  const prior = site.constructionProgress.completedWork;
  first.hp = 0;
  second.order = { kind: 'move', x: 0, y: 0 };
  updateConstructionProgress(game, 1);
  assert.equal(site.constructionProgress.completedWork, prior);
  assert.deepEqual(site.constructionProgress.builderIds, []);
});

test('completion activates capacity once and clears construction orders', () => {
  const game = makeGame();
  createConstructionProgressController(game);
  const site = game.addBuilding('depot', TEAM.UA, 100, 100, { underConstruction: true });
  const worker = game.addWorker(100, 100);
  game.assignConstructionBuilders(site, [worker]);
  game.updateWorker(worker, UNIT_TYPES.uaEngineer, 1);
  const result = updateConstructionProgress(game, 20);
  assert.equal(site.underConstruction, false);
  assert.equal(site.hp, site.maxHp);
  assert.equal(site.capacityGranted, true);
  assert.equal(game.player.cap, 22);
  assert.equal(worker.order, null);
  assert.deepEqual(result.completedSiteIds, [site.id]);
  updateConstructionProgress(game, 20);
  assert.equal(game.player.cap, 22);
});

test('cancellation refunds unfinished work, removes the site, and clears orders', () => {
  const game = makeGame();
  createConstructionProgressController(game);
  const site = game.addBuilding('workshop', TEAM.UA, 100, 100, { underConstruction: true });
  const worker = game.addWorker(100, 100);
  game.assignConstructionBuilders(site, [worker]);
  game.updateWorker(worker, UNIT_TYPES.uaEngineer, 1);
  updateConstructionProgress(game, 6);
  const cancelled = game.cancelConstructionSite(site);
  assert.equal(cancelled.progress, 0.5);
  assert.deepEqual(cancelled.refund, { fuel: 30, metal: 82 });
  assert.equal(game.player.fuel, 30);
  assert.equal(game.player.metal, 82);
  assert.equal(game.buildings.includes(site), false);
  assert.equal(worker.order, null);
});

test('non-construction worker updates and commands delegate unchanged', () => {
  const game = makeGame();
  createConstructionProgressController(game);
  const worker = game.addWorker();
  game.updateWorker(worker, UNIT_TYPES.uaEngineer, 1);
  assert.equal(game.legacyWorkerCalls, 1);
  assert.equal(game.issue(0, 0, null), 'delegated');
  assert.equal(game.delegatedIssues, 1);
  const infantry = game.addInfantry();
  assert.equal(game.assignConstructionBuilders(null, [infantry]), false);
  assert.match(game.lastError, /unfinished Ukrainian construction site/);
  assert.equal(constructionPresentation({}), null);
});
