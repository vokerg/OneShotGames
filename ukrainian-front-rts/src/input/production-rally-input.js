import { BUILDING_TYPES, TEAM } from '../config.js';

function selectedProductionBuilding(game) {
  return game.selectedEntities?.().find((entity) =>
    entity.team === TEAM.UA &&
    Array.isArray(BUILDING_TYPES[entity.type]?.produces) &&
    BUILDING_TYPES[entity.type].produces.length > 0,
  ) ?? null;
}

export function installProductionRallyInput({ game, ui, canvas }) {
  if (!game || typeof game.worldPos !== 'function' || typeof game.setProductionRally !== 'function') {
    throw new TypeError('Production rally input requires an installed production-exit controller.');
  }
  if (!ui || typeof ui.toast !== 'function' || typeof ui.refresh !== 'function') {
    throw new TypeError('Production rally input requires UI toast and refresh methods.');
  }
  if (!canvas?.addEventListener || !canvas?.removeEventListener) {
    throw new TypeError('Production rally input requires an event target canvas.');
  }

  const onContextMenu = (event) => {
    if (game.gameOver || game.pendingBuild || game.selectedUnits?.().length) return;
    const building = selectedProductionBuilding(game);
    if (!building) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = game.worldPos(event.clientX, event.clientY);
    const accepted = game.setProductionRally(point.x, point.y, {
      append: Boolean(event.shiftKey),
      building,
    });
    if (accepted) {
      const count = building.rallyWaypoints.length;
      ui.toast(event.shiftKey
        ? `Rally waypoint ${count} queued.`
        : 'Rally point set for newly produced units.');
    } else {
      ui.toast(game.lastError);
    }
    ui.refresh();
  };

  canvas.addEventListener('contextmenu', onContextMenu, true);
  return () => canvas.removeEventListener('contextmenu', onContextMenu, true);
}
