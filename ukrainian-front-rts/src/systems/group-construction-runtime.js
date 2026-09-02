import { TEAM, UNIT_TYPES } from '../config.js';

const BUILD_ABILITY_BY_TYPE = Object.freeze({
  depot: 'buildDepot',
  barracks: 'buildBarracks',
  workshop: 'buildWorkshop',
});

function stableEntityId(left, right) {
  if (Number.isInteger(left.id) && Number.isInteger(right.id)) return left.id - right.id;
  return String(left.id).localeCompare(String(right.id));
}

function isActiveUnit(game, unit) {
  return Boolean(
    unit &&
      unit.team === TEAM.UA &&
      unit.hp > 0 &&
      (game.units || []).includes(unit),
  );
}

export function canConstructType(unit, type) {
  const abilityId = BUILD_ABILITY_BY_TYPE[type];
  const stats = UNIT_TYPES[unit?.type];
  return Boolean(
    abilityId &&
      unit?.team === TEAM.UA &&
      unit.hp > 0 &&
      stats?.worker &&
      (stats.abilities || []).includes(abilityId),
  );
}

export function compatibleConstructionBuilders(game, type) {
  return (game.selectedUnits?.() || [])
    .filter((unit) => isActiveUnit(game, unit) && canConstructType(unit, type))
    .sort(stableEntityId);
}

function pendingBuilderIds(game, pending) {
  const ids = Array.isArray(pending?.workerIds) && pending.workerIds.length
    ? pending.workerIds
    : pending?.workerId == null
      ? []
      : [pending.workerId];
  const unique = new Set(ids);
  return (game.units || [])
    .filter((unit) => unique.has(unit.id) && isActiveUnit(game, unit) && canConstructType(unit, pending.type))
    .sort(stableEntityId)
    .map((unit) => unit.id);
}

export function createGroupConstructionController(game) {
  for (const method of ['beginBuild', 'placeBuilding', 'selectedUnits', 'selectedEntities', 'fail']) {
    if (typeof game?.[method] !== 'function') {
      throw new TypeError(`Group construction controller requires game.${method}().`);
    }
  }

  const originalBeginBuild = game.beginBuild;
  const originalPlaceBuilding = game.placeBuilding;

  game.beginBuild = function beginGroupBuild(type) {
    game.lastError = '';
    const selectedUnits = game.selectedUnits();
    const builders = compatibleConstructionBuilders(game, type);
    if (selectedUnits.length > 1 && builders.length !== selectedUnits.length) {
      return game.fail('Select only compatible Ukrainian engineers to construct this structure.');
    }

    const accepted = originalBeginBuild.call(game, type);
    if (!accepted || !game.pendingBuild || !builders.length) return accepted;

    const workerIds = builders.map((unit) => unit.id);
    game.pendingBuild = {
      ...game.pendingBuild,
      workerId: workerIds[0],
      workerIds,
    };
    return true;
  };

  game.placeBuilding = function placeGroupBuilding(x, y) {
    const pending = game.pendingBuild;
    if (pending?.workerIds?.length) {
      const activeIds = pendingBuilderIds(game, pending);
      if (activeIds.length) {
        pending.workerIds = activeIds;
        pending.workerId = activeIds[0];
      }
    }

    const assignedIds = pendingBuilderIds(game, game.pendingBuild);
    const placed = originalPlaceBuilding.call(game, x, y);
    if (!placed || !assignedIds.length) return placed;

    const site = game.selectedEntities().find(
      (entity) => entity.team === TEAM.UA && entity.underConstruction,
    );
    if (!site) return true;

    for (const id of assignedIds) {
      const unit = (game.units || []).find((candidate) => candidate.id === id);
      if (!isActiveUnit(game, unit) || !canConstructType(unit, site.type)) continue;
      unit.order = { kind: 'construct', target: site };
      unit.target = null;
    }
    return true;
  };

  return () => {
    game.beginBuild = originalBeginBuild;
    game.placeBuilding = originalPlaceBuilding;
  };
}
