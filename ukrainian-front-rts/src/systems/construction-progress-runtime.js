import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';
import { distance } from '../core/math.js';
import {
  advanceConstruction,
  assignConstructionBuilder,
  cancelConstruction,
  constructionProgressFraction,
  createConstructionProgress,
  reconcileConstructionBuilders,
  removeConstructionBuilder,
  setConstructionPaused,
} from './construction-progress-system.js';

export const CONSTRUCTION_INTERACTION_RANGE = 55;

function stableSiteOrder(left, right) {
  if (Number.isInteger(left.id) && Number.isInteger(right.id)) return left.id - right.id;
  return String(left.id).localeCompare(String(right.id));
}

function buildingStats(building) {
  return BUILDING_TYPES[building?.type] || null;
}

function workerStats(game, unit) {
  return unit?.team === TEAM.UA
    ? game.unitStats?.(unit.type) ?? UNIT_TYPES[unit?.type]
    : UNIT_TYPES[unit?.type];
}

function isEligibleBuilder(game, unit) {
  return Boolean(
    unit &&
      unit.team === TEAM.UA &&
      unit.hp > 0 &&
      (game.units || []).includes(unit) &&
      workerStats(game, unit)?.worker,
  );
}

function isConstructionSite(game, building) {
  return Boolean(
    building &&
      building.team === TEAM.UA &&
      building.hp > 0 &&
      building.underConstruction &&
      (game.buildings || []).includes(building),
  );
}

function clearBuilderOrder(unit, building = null) {
  if (!unit || unit.order?.kind !== 'construct') return;
  if (building && unit.order.target !== building) return;
  unit.order = null;
  unit.target = null;
}

function clearSiteOrders(game, building) {
  for (const unit of game.units || []) clearBuilderOrder(unit, building);
}

function selectedConstructionSite(game, explicit = null) {
  if (explicit) return isConstructionSite(game, explicit) ? explicit : null;
  return (game.selectedEntities?.() || []).find((entity) => isConstructionSite(game, entity)) || null;
}

function prepareBuilderOrder(unit, building) {
  unit.gatherKind = null;
  if (Array.isArray(unit.orderQueue)) unit.orderQueue.length = 0;
  unit.order = { kind: 'construct', target: building };
  unit.target = null;
}

export function attachConstructionProgress(game, building) {
  if (!isConstructionSite(game, building) || building.constructionProgress) return building;
  const stats = buildingStats(building);
  if (!stats) throw new TypeError(`Construction progress requires building data for ${building.type}.`);
  building.constructionStartHp = building.hp;
  building.constructionProgress = createConstructionProgress({
    buildingId: building.id,
    buildTime: stats.buildTime || 8,
    cost: stats.cost || {},
  });
  return building;
}

function reconcileSiteBuilders(game, building) {
  const progress = building.constructionProgress;
  const builders = progress.builderIds.map((id) => {
    const unit = (game.units || []).find((candidate) => candidate.id === id);
    return {
      id,
      alive: Boolean(unit && unit.hp > 0 && (game.units || []).includes(unit)),
      worker: Boolean(unit && workerStats(game, unit)?.worker),
      available: Boolean(unit?.order?.kind === 'construct' && unit.order.target === building),
    };
  });
  building.constructionProgress = reconcileConstructionBuilders(progress, builders);
}

export function updateConstructionProgress(game, elapsedSeconds) {
  const updatedSiteIds = [];
  const completedSiteIds = [];
  const sites = [...(game.buildings || [])]
    .filter((building) => isConstructionSite(game, building))
    .sort(stableSiteOrder);

  for (const building of sites) {
    attachConstructionProgress(game, building);
    reconcileSiteBuilders(game, building);
    const result = advanceConstruction(building.constructionProgress, elapsedSeconds);
    building.constructionProgress = result.state;

    if (result.workApplied > 0) {
      const startHp = Number.isFinite(building.constructionStartHp)
        ? building.constructionStartHp
        : Math.min(building.hp, building.maxHp);
      const hpPerWork = (building.maxHp - startHp) / result.state.requiredWork;
      building.hp = Math.min(building.maxHp, building.hp + result.workApplied * hpPerWork);
      updatedSiteIds.push(building.id);
    }

    if (!result.completedNow) continue;
    building.underConstruction = false;
    building.hp = building.maxHp;
    if (!building.capacityGranted) {
      game.player.cap += buildingStats(building)?.pop || 0;
      building.capacityGranted = true;
    }
    clearSiteOrders(game, building);
    completedSiteIds.push(building.id);
  }

  return Object.freeze({
    updatedSiteIds: Object.freeze(updatedSiteIds),
    completedSiteIds: Object.freeze(completedSiteIds),
  });
}

export function createConstructionProgressController(game) {
  for (const method of [
    'addBuilding',
    'fail',
    'issue',
    'move',
    'selectedEntities',
    'selectedUnits',
    'updateWorker',
  ]) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Construction progress controller requires game.${method}().`);
    }
  }

  const originalAddBuilding = game.addBuilding.bind(game);
  const originalIssue = game.issue.bind(game);
  const originalUpdateWorker = game.updateWorker.bind(game);

  game.addBuilding = (...args) => {
    const building = originalAddBuilding(...args);
    return attachConstructionProgress(game, building);
  };

  game.assignConstructionBuilders = (building = null, builders = null) => {
    game.lastError = '';
    const site = selectedConstructionSite(game, building);
    if (!site) return game.fail('Select an unfinished Ukrainian construction site.');
    attachConstructionProgress(game, site);
    const candidates = builders ?? game.selectedUnits();
    if (!Array.isArray(candidates)) return game.fail('Construction builder selection is invalid.');
    const eligible = candidates.filter((unit) => isEligibleBuilder(game, unit));
    if (!eligible.length) return game.fail('Select at least one available Ukrainian engineer.');
    eligible.forEach((unit) => prepareBuilderOrder(unit, site));
    return true;
  };

  game.pauseConstruction = (building = null) => {
    game.lastError = '';
    const site = selectedConstructionSite(game, building);
    if (!site) return game.fail('Select an unfinished Ukrainian construction site.');
    attachConstructionProgress(game, site);
    site.constructionProgress = setConstructionPaused(site.constructionProgress, true);
    return true;
  };

  game.resumeConstruction = (building = null) => {
    game.lastError = '';
    const site = selectedConstructionSite(game, building);
    if (!site) return game.fail('Select an unfinished Ukrainian construction site.');
    attachConstructionProgress(game, site);
    site.constructionProgress = setConstructionPaused(site.constructionProgress, false);
    return true;
  };

  game.cancelConstructionSite = (building = null) => {
    game.lastError = '';
    const site = selectedConstructionSite(game, building);
    if (!site) return game.fail('Select an unfinished Ukrainian construction site.');
    attachConstructionProgress(game, site);
    const result = cancelConstruction(site.constructionProgress);
    site.constructionProgress = result.state;
    for (const [resource, amount] of Object.entries(result.refund)) {
      game.player[resource] = (game.player[resource] || 0) + amount;
    }
    clearSiteOrders(game, site);
    const index = game.buildings.indexOf(site);
    if (index >= 0) game.buildings.splice(index, 1);
    game.selected?.delete?.(site.id);
    site.selected = false;
    return Object.freeze({
      buildingId: site.id,
      progress: result.progress,
      refund: result.refund,
    });
  };

  game.issue = (x, y, target, options = {}) => {
    if (isConstructionSite(game, target)) {
      return game.assignConstructionBuilders(target);
    }
    return originalIssue(x, y, target, options);
  };

  game.updateWorker = (unit, stats, dt) => {
    if (unit.order?.kind !== 'construct') return originalUpdateWorker(unit, stats, dt);
    const building = unit.order.target;
    if (!isEligibleBuilder(game, unit) || !isConstructionSite(game, building)) {
      if (building?.constructionProgress) {
        building.constructionProgress = removeConstructionBuilder(building.constructionProgress, unit.id);
      }
      clearBuilderOrder(unit);
      return;
    }

    attachConstructionProgress(game, building);
    if (distance(unit, building) > CONSTRUCTION_INTERACTION_RANGE) {
      building.constructionProgress = removeConstructionBuilder(building.constructionProgress, unit.id);
      game.move(unit, building.x, building.y, dt);
      return;
    }

    building.constructionProgress = assignConstructionBuilder(building.constructionProgress, unit.id);
    unit.target = null;
  };

  return () => {
    game.addBuilding = originalAddBuilding;
    game.issue = originalIssue;
    game.updateWorker = originalUpdateWorker;
    delete game.assignConstructionBuilders;
    delete game.pauseConstruction;
    delete game.resumeConstruction;
    delete game.cancelConstructionSite;
  };
}

export function constructionPresentation(building) {
  const progress = building?.constructionProgress;
  if (!progress) return null;
  return Object.freeze({
    buildingId: building.id,
    progress: constructionProgressFraction(progress),
    paused: progress.paused,
    builderCount: progress.builderIds.length,
    completed: progress.completed,
  });
}
