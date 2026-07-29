import { TEAM } from '../config.js';

function byId(left, right) {
  return left.id - right.id;
}

function friendlyLivingUnits(game) {
  return game.units.filter((unit) => unit.team === TEAM.UA && unit.hp > 0).sort(byId);
}

function selectedFriendlyUnits(game) {
  return friendlyLivingUnits(game).filter((unit) => game.selected.has(unit.id));
}

function subgroupTypes(units) {
  return [...new Set(units.map((unit) => unit.type))].sort();
}

function setPrimary(game, unitId = null) {
  game.primarySelectedId = unitId;
  return unitId;
}

export function resolvePrimarySelection(game) {
  const selected = selectedFriendlyUnits(game);
  if (!selected.length) return setPrimary(game, null);
  if (selected.some((unit) => unit.id === game.primarySelectedId)) return game.primarySelectedId;
  return setPrimary(game, selected[0].id);
}

export function synchronizePrimarySelection(game, preferredId = null) {
  const selected = selectedFriendlyUnits(game);
  if (!selected.length) return setPrimary(game, null);
  if (preferredId != null && selected.some((unit) => unit.id === preferredId)) {
    return setPrimary(game, preferredId);
  }
  return resolvePrimarySelection(game);
}

export function cycleSelectionSubgroup(game, direction = 1) {
  const selected = selectedFriendlyUnits(game);
  const types = subgroupTypes(selected);
  if (types.length < 2) {
    const primaryId = synchronizePrimarySelection(game);
    return { changed: false, primaryId, type: selected[0]?.type || null, count: selected.length };
  }

  const primaryId = resolvePrimarySelection(game);
  const primary = selected.find((unit) => unit.id === primaryId) || selected[0];
  const currentIndex = Math.max(0, types.indexOf(primary.type));
  const step = direction < 0 ? -1 : 1;
  const nextType = types[(currentIndex + step + types.length) % types.length];
  const nextPrimary = selected.find((unit) => unit.type === nextType);
  setPrimary(game, nextPrimary.id);
  return {
    changed: true,
    primaryId: nextPrimary.id,
    type: nextType,
    count: selected.filter((unit) => unit.type === nextType).length,
  };
}

export function selectAllOfTypeOnScreen(game, source, viewport) {
  if (!source || source.team !== TEAM.UA || source.hp <= 0) return { changed: false, count: 0 };
  const width = Math.max(0, viewport?.width || 0);
  const height = Math.max(0, viewport?.height || 0);
  const visible = friendlyLivingUnits(game).filter((unit) => {
    if (unit.type !== source.type) return false;
    const screenX = unit.x * game.camera.z + game.camera.x;
    const screenY = unit.y * game.camera.z + game.camera.y;
    return screenX >= 0 && screenX <= width && screenY >= 0 && screenY <= height;
  });

  game.select(null);
  for (const unit of visible) {
    game.selected.add(unit.id);
    unit.selected = true;
  }
  synchronizePrimarySelection(game, source.id);
  return { changed: true, count: visible.length, primaryId: game.primarySelectedId };
}

export function primarySelectedEntity(game, entities = game.selectedEntities()) {
  const primaryId = resolvePrimarySelection(game);
  return entities.find((entity) => entity.id === primaryId) || entities[0] || null;
}
