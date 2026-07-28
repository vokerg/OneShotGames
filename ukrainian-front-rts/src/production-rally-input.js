export function installProductionRallyInput({ game, ui, canvas, windowTarget = window }) {
  const stop = (event) => {
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };

  const onMouseUp = (event) => {
    if (event.button !== 0 || game.gameOver || !game.pendingRally || game.mouse.drag) return;
    stop(event);
    game.mouse.down = false;
    game.mouse.drag = false;
    const world = game.worldPos(event.clientX, event.clientY);
    if (game.placeRallyPoint(world.x, world.y)) ui.toast('Rally point set. New units will assemble there.');
    else ui.toast(game.lastError);
    ui.refresh();
  };

  const onContextMenu = (event) => {
    if (game.gameOver) return;
    if (game.pendingRally) {
      stop(event);
      game.cancelRallyPoint();
      ui.toast('Rally-point placement cancelled.');
      ui.refresh();
      return;
    }
    if (game.selectedUnits().length || !game.selectedProductionBuilding()) return;
    stop(event);
    const world = game.worldPos(event.clientX, event.clientY);
    if (game.setSelectedBuildingRallyPoint(world.x, world.y)) {
      ui.toast('Rally point set. New units will assemble there.');
    } else {
      ui.toast(game.lastError);
    }
    ui.refresh();
  };

  const onKeyDown = (event) => {
    if (game.gameOver || event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === 'escape' && game.pendingRally) {
      stop(event);
      game.cancelRallyPoint();
      ui.toast('Rally-point placement cancelled.');
      ui.refresh();
      return;
    }
    if (key !== 'r' || !game.selectedProductionBuilding()) return;
    stop(event);
    if (game.armRallyPoint()) ui.toast('Choose a rally point on the battlefield. Right-click or Esc cancels.');
    else ui.toast(game.lastError);
    ui.refresh();
  };

  canvas.addEventListener('mouseup', onMouseUp, true);
  canvas.addEventListener('contextmenu', onContextMenu, true);
  windowTarget.addEventListener('keydown', onKeyDown, true);

  return () => {
    canvas.removeEventListener('mouseup', onMouseUp, true);
    canvas.removeEventListener('contextmenu', onContextMenu, true);
    windowTarget.removeEventListener('keydown', onKeyDown, true);
  };
}
