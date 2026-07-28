import { BUILDING_TYPES, TEAM, UNIT_TYPES, WORLD } from './config.js';
import { clamp, distance } from './core/math.js';
import { Game } from './game.js';

const RALLY_MARGIN = 20;

export class ProductionGame extends Game {
  constructor() {
    super();
    this.pendingRally = null;
  }

  start(index = 0) {
    this.pendingRally = null;
    super.start(index);
  }

  addBuilding(type, team, x, y, options = {}) {
    const building = super.addBuilding(type, team, x, y, options);
    const direction = team === TEAM.UA ? 1 : -1;
    building.rallyPoint = {
      x: clamp(x, RALLY_MARGIN, WORLD.w - RALLY_MARGIN),
      y: clamp(y + direction * (BUILDING_TYPES[type].h / 2 + 90), RALLY_MARGIN, WORLD.h - RALLY_MARGIN),
    };
    return building;
  }

  isProductionBuilding(building) {
    if (!building || building.team !== TEAM.UA || building.underConstruction) return false;
    const type = BUILDING_TYPES[building.type];
    return Boolean(type?.produces?.length || building.type === 'hq');
  }

  selectedProductionBuilding() {
    return this.selectedEntities().find((entity) => this.isProductionBuilding(entity)) || null;
  }

  armRallyPoint(buildingId = null) {
    this.lastError = '';
    const building = buildingId
      ? this.buildings.find((candidate) => candidate.id === buildingId)
      : this.selectedProductionBuilding();
    if (!this.isProductionBuilding(building)) {
      return this.fail('Select a completed Ukrainian production building first.');
    }
    this.pendingBuild = null;
    this.mouse.attackMove = false;
    this.pendingRally = { buildingId: building.id };
    return true;
  }

  placeRallyPoint(x, y) {
    this.lastError = '';
    if (!this.pendingRally) return this.fail('Choose Set Rally Point from a production building first.');
    const building = this.buildings.find((candidate) => candidate.id === this.pendingRally.buildingId);
    if (!this.isProductionBuilding(building)) {
      this.pendingRally = null;
      return this.fail('That production building is no longer available.');
    }
    building.rallyPoint = {
      x: clamp(x, RALLY_MARGIN, WORLD.w - RALLY_MARGIN),
      y: clamp(y, RALLY_MARGIN, WORLD.h - RALLY_MARGIN),
    };
    this.pendingRally = null;
    return true;
  }

  setSelectedBuildingRallyPoint(x, y) {
    const building = this.selectedProductionBuilding();
    if (!building) return false;
    this.pendingRally = { buildingId: building.id };
    return this.placeRallyPoint(x, y);
  }

  cancelRallyPoint() {
    if (!this.pendingRally) return false;
    this.pendingRally = null;
    return true;
  }

  armAttackMove() {
    this.pendingRally = null;
    return super.armAttackMove();
  }

  beginBuild(type) {
    this.pendingRally = null;
    return super.beginBuild(type);
  }

  issue(x, y, target) {
    if (this.pendingRally) return this.placeRallyPoint(x, y);
    if (!this.selectedUnits().length && this.selectedProductionBuilding()) {
      return this.setSelectedBuildingRallyPoint(x, y);
    }
    return super.issue(x, y, target);
  }

  cancelQueueItem(buildingId, index) {
    this.lastError = '';
    const building = this.buildings.find(
      (candidate) => candidate.id === buildingId && candidate.team === TEAM.UA,
    );
    if (!building || !Number.isInteger(index) || index < 0 || index >= building.queue.length) {
      return this.fail('That production order is no longer queued.');
    }

    const [item] = building.queue.splice(index, 1);
    const stats = UNIT_TYPES[item.type];
    for (const [resource, amount] of Object.entries(stats.cost || {})) {
      this.player[resource] += amount;
    }
    if (item.reserved) this.player.pop = Math.max(0, this.player.pop - (stats.pop || 0));
    return true;
  }

  productionExit(building, unitType) {
    const type = BUILDING_TYPES[building.type];
    const rally = building.rallyPoint || {
      x: building.x,
      y: building.y + (building.team === TEAM.UA ? 100 : -100),
    };
    let dx = rally.x - building.x;
    let dy = rally.y - building.y;
    let length = Math.hypot(dx, dy);
    if (length < 1) {
      dx = 0;
      dy = building.team === TEAM.UA ? 1 : -1;
      length = 1;
    }
    const unitRadius = UNIT_TYPES[unitType]?.size || 12;
    const exitDistance = Math.max(type.w, type.h) * 0.55 + unitRadius + 12;
    return {
      x: clamp(building.x + (dx / length) * exitDistance, RALLY_MARGIN, WORLD.w - RALLY_MARGIN),
      y: clamp(building.y + (dy / length) * exitDistance, RALLY_MARGIN, WORLD.h - RALLY_MARGIN),
    };
  }

  updateProduction(dt) {
    for (const building of this.buildings) {
      if (building.underConstruction || !building.queue.length) continue;
      building.queue[0].left -= dt;
      if (building.queue[0].left > 0) continue;

      const queuedUnit = building.queue.shift();
      const exit = this.productionExit(building, queuedUnit.type);
      const unit = this.addUnit(queuedUnit.type, building.team, exit.x, exit.y);
      if (building.team === TEAM.UA && building.rallyPoint && distance(unit, building.rallyPoint) > 8) {
        unit.order = { kind: 'move', x: building.rallyPoint.x, y: building.rallyPoint.y };
      }
      if (queuedUnit.reserved) this.player.pop -= UNIT_TYPES[queuedUnit.type].pop;
    }
  }

  finish(outcome, reason) {
    this.pendingRally = null;
    super.finish(outcome, reason);
  }
}
