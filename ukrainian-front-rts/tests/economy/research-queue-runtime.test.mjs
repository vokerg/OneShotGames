import test from 'node:test';
import assert from 'node:assert/strict';
import { TEAM, UPGRADES } from '../../src/config.js';
import {
  createResearchQueueRuntime,
  researchDurationSeconds,
} from '../../src/systems/research-queue-runtime.js';

function fixture() {
  const game = {
    time: 0,
    gameOver: false,
    lastError: '',
    nextId: 1,
    selected: new Set(),
    buildings: [],
    units: [],
    player: null,
    start() {
      this.time = 0;
      this.gameOver = false;
      this.nextId = 1;
      this.selected = new Set();
      this.buildings = [];
      this.units = [];
      this.player = { metal: 1000, fuel: 1000, intel: 1000, upgrades: new Set() };
      const workshop = this.addBuilding('workshop', TEAM.UA);
      this.selected.add(workshop.id);
      this.units.push({ id: this.nextId++, type: 'uaTank', team: TEAM.UA, hp: 100, maxHp: 100 });
    },
    update(stepSeconds) { this.time += stepSeconds; },
    addBuilding(type, team) {
      const building = { id: this.nextId++, type, team, hp: 100, underConstruction: false, queue: [], productionPaused: false };
      this.buildings.push(building);
      return building;
    },
    selectedEntities() { return this.buildings.filter((building) => this.selected.has(building.id)); },
    unitStats() { return { hp: this.player.upgrades.has('cageArmor') ? 118 : 100 }; },
    fail(message) { this.lastError = message; return false; },
    research() { throw new Error('legacy research should be replaced'); },
  };
  return game;
}

function advance(game, stepSeconds) {
  game.updateResearch(stepSeconds);
  game.update(stepSeconds);
}

test('queues, charges, advances, and completes modernization deterministically', () => {
  const game = fixture();
  createResearchQueueRuntime(game);
  game.start();
  assert.equal(researchDurationSeconds(UPGRADES.cageArmor), 20);
  assert.equal(game.research('cageArmor'), true);
  assert.equal(game.player.metal, 860);
  assert.equal(game.player.intel, 960);
  const workshop = game.selectedEntities()[0];
  assert.equal(workshop.researchQueueState.queue.length, 1);
  advance(game, 10);
  assert.equal(workshop.researchQueueState.queue[0].remaining, 10);
  advance(game, 10);
  assert.equal(workshop.researchQueueState.queue.length, 0);
  assert.equal(game.player.upgrades.has('cageArmor'), true);
  assert.equal(game.units[0].maxHp, 118);
  assert.equal(game.units[0].hp, 118);
});

test('enforces prerequisites and pauses research while production uses the workshop', () => {
  const game = fixture();
  createResearchQueueRuntime(game);
  game.start();
  assert.equal(game.research('activeProtection'), false);
  assert.match(game.lastError, /prerequisites/i);
  assert.equal(game.research('cageArmor'), true);
  const workshop = game.selectedEntities()[0];
  workshop.queue.push({ type: 'uaTank' });
  advance(game, 5);
  assert.equal(workshop.researchQueueState.queue[0].remaining, 20);

  workshop.queue.length = 0;
  game.researchProductionBusyBuildingIds = new Set([workshop.id]);
  advance(game, 5);
  delete game.researchProductionBusyBuildingIds;
  assert.equal(workshop.researchQueueState.queue[0].remaining, 20);

  assert.equal(game.setResearchPaused(workshop.researchQueueState.facilityId, true), true);
  advance(game, 5);
  assert.equal(workshop.researchQueueState.queue[0].remaining, 20);
  assert.equal(game.setResearchPaused(workshop.researchQueueState.facilityId, false), true);
  advance(game, 5);
  assert.equal(workshop.researchQueueState.queue[0].remaining, 15);
});

test('shares completed prerequisites across multiple research facilities', () => {
  const game = fixture();
  createResearchQueueRuntime(game);
  game.start();
  const first = game.selectedEntities()[0];
  const second = game.addBuilding('workshop', TEAM.UA);
  assert.equal(game.research('cageArmor'), true);
  advance(game, 20);
  game.selected = new Set([second.id]);
  assert.equal(game.research('activeProtection'), true);
  assert.equal(second.researchQueueState.completedTechIds.includes('cageArmor'), true);
  assert.equal(first.researchQueueState.completedTechIds.includes('cageArmor'), true);
});

test('cancels with remaining-value refunds and refunds a lost facility', () => {
  const game = fixture();
  createResearchQueueRuntime(game);
  game.start();
  const workshop = game.selectedEntities()[0];
  assert.equal(game.research('thermal'), true);
  advance(game, 10);
  const item = workshop.researchQueueState.queue[0];
  assert.equal(game.cancelResearch(workshop.researchQueueState.facilityId, item.id), true);
  assert.equal(game.player.metal, 945);
  assert.equal(game.player.intel, 967);

  assert.equal(game.research('natoAmmo'), true);
  const beforeLoss = { metal: game.player.metal, fuel: game.player.fuel, intel: game.player.intel };
  game.buildings = [];
  advance(game, 1);
  assert.equal(game.player.metal, beforeLoss.metal + UPGRADES.natoAmmo.cost.metal);
  assert.equal(game.player.fuel, beforeLoss.fuel + UPGRADES.natoAmmo.cost.fuel);
  assert.equal(game.player.intel, beforeLoss.intel + UPGRADES.natoAmmo.cost.intel);
  assert.ok(game.researchQueueEvents.some((event) => event.type === 'researchFacilityLost'));
});

test('mission restart clears queues, events, and completed modernization', () => {
  const game = fixture();
  createResearchQueueRuntime(game);
  game.start();
  game.research('cageArmor');
  advance(game, 20);
  assert.equal(game.player.upgrades.has('cageArmor'), true);
  game.start();
  assert.equal(game.player.upgrades.size, 0);
  assert.equal(game.researchQueueEvents.length, 0);
  assert.equal(game.selectedEntities()[0].researchQueueState.queue.length, 0);
});
