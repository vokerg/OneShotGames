import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  BUILDING_CONSTRUCTION_STAGES,
  BUILDING_LIFECYCLE_PHASES,
  advanceBuildingCapture,
  beginBuildingCapture,
  buildingCaptureEligibility,
  buildingConstructionStage,
  buildingLifecycleSnapshot,
  buildingRepairEnvelope,
  createBuildingLifecycleController,
  createBuildingLifecycleState,
  materializeBuildingRubble,
  scuttleBuilding,
  sellBuilding,
  transitionDestroyedBuilding,
} from '../../src/systems/building-lifecycle-system.js';
import { installBuildingLifecycleControls } from '../../src/input/building-lifecycle-controls.js';

function building(overrides = {}) {
  return {
    id: 10,
    type: 'depot',
    team: TEAM.UA,
    x: 100,
    y: 100,
    hp: 680,
    maxHp: 680,
    queue: [],
    underConstruction: false,
    capacityGranted: true,
    ...overrides,
  };
}

function unit(id, team, x = 100, y = 100, overrides = {}) {
  return { id, team, x, y, hp: 100, ...overrides };
}

function destructionApi() {
  return {
    createDestructionState(entity) {
      return { entity, phase: 'destroyed' };
    },
    materializeWreck(_state, entity) {
      return {
        state: {
          wreck: {
            id: `${entity.id}:wreck`,
            sourceEntityId: entity.id,
            position: entity.position,
            hp: 20,
            maxHp: 20,
            obstruction: { blocksMovement: true, blocksLineOfSight: false, cleared: false },
          },
        },
      };
    },
  };
}

function gameFixture() {
  const depot = building();
  const engineer = unit(1, TEAM.UA);
  return {
    units: [engineer],
    buildings: [depot],
    selected: new Set([depot.id]),
    player: { metal: 0, fuel: 0, intel: 0, cap: 8, pop: 0, commandCapacityBase: 0 },
    lastError: '',
    time: 0,
    start() { return true; },
    addBuilding(type, team, x, y, options = {}) {
      const added = building({ id: this.buildings.length + 20, type, team, x, y, underConstruction: Boolean(options.underConstruction) });
      this.buildings.push(added);
      return added;
    },
    update(dt) { this.time += dt; },
    removeDestroyedEntities() { this.buildings = this.buildings.filter((candidate) => candidate.hp > 0); },
    selectedEntities() { return this.buildings.filter((candidate) => this.selected.has(candidate.id)); },
    selectedUnits() { return this.units.filter((candidate) => this.selected.has(candidate.id)); },
    fail(message) { this.lastError = message; return false; },
    reconcileCommandCapacity(reason) { this.lastCapacityReason = reason; return {}; },
  };
}

test('derives repairable construction stages and stage repair caps', () => {
  const site = building({ underConstruction: true, hp: 100, constructionProgress: { completedWork: 10, requiredWork: 100 } });
  assert.equal(buildingConstructionStage(site), BUILDING_CONSTRUCTION_STAGES.FOUNDATION);
  assert.deepEqual(buildingRepairEnvelope(site), {
    stage: BUILDING_CONSTRUCTION_STAGES.FOUNDATION,
    currentHp: 100,
    maxRepairHp: 170,
    missingHp: 70,
    repairable: true,
    constructionLimited: true,
  });
  site.constructionProgress.completedWork = 70;
  assert.equal(buildingConstructionStage(site), BUILDING_CONSTRUCTION_STAGES.FITOUT);
  site.underConstruction = false;
  assert.equal(buildingConstructionStage(site), BUILDING_CONSTRUCTION_STAGES.COMPLETE);
});

test('creates stable lifecycle state for construction, operational, and destroyed buildings', () => {
  assert.equal(createBuildingLifecycleState(building({ underConstruction: true })).phase, BUILDING_LIFECYCLE_PHASES.CONSTRUCTION);
  assert.equal(createBuildingLifecycleState(building()).phase, BUILDING_LIFECYCLE_PHASES.OPERATIONAL);
  assert.equal(createBuildingLifecycleState(building({ hp: 0 })).phase, BUILDING_LIFECYCLE_PHASES.DESTROYED);
});

test('validates capture eligibility including queue, ownership, and construction restrictions', () => {
  const target = building({ team: TEAM.RU });
  const state = createBuildingLifecycleState(target);
  assert.equal(buildingCaptureEligibility(state, target, TEAM.UA).ok, true);
  assert.equal(buildingCaptureEligibility(state, target, TEAM.RU).reason, 'wrong-team');
  target.queue.push({ type: 'uaInfantry' });
  assert.equal(buildingCaptureEligibility(state, target, TEAM.UA).reason, 'queue-not-empty');
  target.queue.length = 0;
  target.underConstruction = true;
  assert.equal(buildingCaptureEligibility(state, target, TEAM.UA).reason, 'unavailable');
});

test('progresses capture deterministically and transfers ownership at the exact threshold', () => {
  const target = building({ team: TEAM.RU });
  const attacker = unit(1, TEAM.UA);
  const started = beginBuildingCapture(createBuildingLifecycleState(target), target, TEAM.UA, [attacker]);
  const half = advanceBuildingCapture(started.state, target, 4, { units: [attacker] });
  assert.equal(half.state.capture.progressSeconds, 4);
  const completed = advanceBuildingCapture(half.state, target, 4, { units: [attacker] });
  assert.equal(completed.ownerChanged, true);
  assert.equal(completed.state.ownerTeam, TEAM.UA);
  assert.equal(completed.state.phase, BUILDING_LIFECYCLE_PHASES.OPERATIONAL);
});

test('pauses contested capture and decays progress when capturers leave', () => {
  const target = building({ team: TEAM.RU });
  const attacker = unit(1, TEAM.UA);
  const defender = unit(2, TEAM.RU);
  const started = beginBuildingCapture(createBuildingLifecycleState(target), target, TEAM.UA, [attacker]);
  const progressed = advanceBuildingCapture(started.state, target, 3, { units: [attacker] });
  const contested = advanceBuildingCapture(progressed.state, target, 2, { units: [attacker, defender] });
  assert.equal(contested.state.capture.progressSeconds, 3);
  assert.equal(contested.reason, 'contested');
  const decayed = advanceBuildingCapture(contested.state, target, 2, { units: [] });
  assert.equal(decayed.state.capture.progressSeconds, 2);
});

test('sells a completed empty building with integrity-scaled deterministic refund', () => {
  const depot = building({ hp: 340 });
  const sold = sellBuilding(createBuildingLifecycleState(depot), depot, TEAM.UA);
  assert.equal(sold.ok, true);
  assert.deepEqual(sold.refund, { metal: 25 });
  assert.equal(sold.state.phase, BUILDING_LIFECYCLE_PHASES.SOLD);
  assert.equal(sold.capacityReleased, 8);
});

test('rejects sale with active production and permits construction-site scuttle', () => {
  const depot = building({ queue: [{ type: 'uaInfantry' }] });
  assert.equal(sellBuilding(createBuildingLifecycleState(depot), depot, TEAM.UA).reason, 'queue-not-empty');
  const site = building({ underConstruction: true, capacityGranted: false });
  const scuttled = scuttleBuilding(createBuildingLifecycleState(site), site, TEAM.UA);
  assert.equal(scuttled.ok, true);
  assert.equal(scuttled.state.phase, BUILDING_LIFECYCLE_PHASES.SCUTTLED);
  assert.equal(scuttled.destructionEntity.domain, 'structure');
});

test('transitions destroyed buildings into UFR-044-compatible rubble state', () => {
  const depot = building({ hp: 0 });
  const destroyed = transitionDestroyedBuilding(createBuildingLifecycleState(depot), depot);
  assert.equal(destroyed.destructionEntity.domain, 'structure');
  assert.deepEqual(destroyed.destructionEntity.cost, { metal: 100 });
  const rubble = materializeBuildingRubble(destroyed.state, {
    id: '10:wreck', hp: 20, maxHp: 20, obstruction: { blocksMovement: true },
  });
  assert.equal(rubble.state.phase, BUILDING_LIFECYCLE_PHASES.RUBBLE);
  assert.equal(rubble.state.rubble.id, '10:wreck');
});

test('snapshot exposes repair, capture, capacity, sale, and scuttle state', () => {
  const depot = building();
  const snapshot = buildingLifecycleSnapshot(createBuildingLifecycleState(depot), depot);
  assert.equal(snapshot.constructionStage, BUILDING_CONSTRUCTION_STAGES.COMPLETE);
  assert.equal(snapshot.capacityActive, true);
  assert.equal(snapshot.sellable, true);
  assert.equal(snapshot.scuttleAvailable, true);
});

test('controller captures buildings, transfers ownership, and reconciles capacity', () => {
  const game = gameFixture();
  const target = building({ id: 30, team: TEAM.RU, x: 100, y: 100 });
  game.buildings.push(target);
  game.selected = new Set([1]);
  const dispose = createBuildingLifecycleController(game, { destructionApi: destructionApi() });
  try {
    assert.equal(game.beginBuildingCapture(target, TEAM.UA, [game.units[0]]), true);
    game.update(8);
    assert.equal(target.team, TEAM.UA);
    assert.equal(game.lastCapacityReason, 'building-captured');
  } finally { dispose(); }
});

test('controller sell and scuttle apply exact resources, wrecks, removal, and capacity reconciliation', () => {
  const game = gameFixture();
  const dispose = createBuildingLifecycleController(game, { destructionApi: destructionApi() });
  try {
    const depot = game.buildings[0];
    const sold = game.sellBuilding(depot);
    assert.equal(sold.refund.metal, 50);
    assert.equal(game.player.metal, 50);
    assert.equal(game.buildings.includes(depot), false);
    const second = game.addBuilding('depot', TEAM.UA, 120, 120);
    const scuttled = game.scuttleBuilding(second);
    assert.equal(scuttled.rubble.id, `${second.id}:wreck`);
    assert.equal(game.buildingWrecks.length, 1);
    assert.equal(game.buildings.includes(second), false);
    assert.equal(game.lastCapacityReason, 'building-scuttled');
  } finally { dispose(); }
});

test('controller cleanup materializes wreck before legacy removal and controls extend building card', () => {
  const game = gameFixture();
  const disposeController = createBuildingLifecycleController(game, { destructionApi: destructionApi() });
  const calls = [];
  const buttons = [];
  const original = (building) => calls.push(building.id);
  const ui = {
    appendProduction: original,
    commandButton(definition) { buttons.push(definition); },
    toast() {}, refresh() {},
  };
  const disposeControls = installBuildingLifecycleControls({ game, ui });
  try {
    const depot = game.buildings[0];
    ui.appendProduction(depot);
    assert.equal(buttons.length, 2);
    depot.hp = 0;
    game.removeDestroyedEntities();
    assert.equal(game.buildingWrecks[0].id, '10:wreck');
    assert.equal(game.buildings.length, 0);
  } finally {
    disposeControls();
    disposeController();
  }
  assert.equal(ui.appendProduction, original);
});
