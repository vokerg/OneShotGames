import { TEAM } from '../config.js';
import {
  createKeyBindings,
  INPUT_ACTIONS,
  isHeldInputAction,
  resolveInputAction,
} from './action-map.js';
import {
  createCameraNavigation,
} from './camera-navigation.js';
import {
  createControlGroupController,
  resolveControlGroupCommand,
} from './control-groups.js';
import {
  cycleSelectionSubgroup,
  selectAllOfTypeOnScreen,
  synchronizePrimarySelection,
} from './selection-subgroups.js';

const DRAG_THRESHOLD = 6;
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 1.45;
const WORLD_WIDTH = 2560;
const WORLD_HEIGHT = 1664;

export function installBattlefieldInput({
  game,
  ui,
  canvas,
  minimap,
  windowTarget = window,
  keyBindings: keyBindingOverrides = {},
  cameraSettings = {},
}) {
  const disposers = [];
  const keyBindings = createKeyBindings(keyBindingOverrides);
  const controlGroups = createControlGroupController();
  const cameraNavigation = createCameraNavigation(
    game,
    {
      width: () => windowTarget.innerWidth,
      height: () => windowTarget.innerHeight,
    },
    cameraSettings,
  );
  const heldActionsByKey = new Map();
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  };

  let animationFrame = null;
  let previousFrameTime = null;
  const requestFrame = windowTarget.requestAnimationFrame?.bind(windowTarget);
  const cancelFrame = windowTarget.cancelAnimationFrame?.bind(windowTarget);
  const animateCamera = (time) => {
    if (previousFrameTime != null) cameraNavigation.update(Math.min(0.05, (time - previousFrameTime) / 1000));
    previousFrameTime = time;
    animationFrame = requestFrame(animateCamera);
  };
  if (requestFrame) {
    animationFrame = requestFrame(animateCamera);
    disposers.push(() => {
      if (animationFrame != null && cancelFrame) cancelFrame(animationFrame);
    });
  }

  const onMouseDown = (event) => {
    if (cameraNavigation.pointerDown(event)) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || game.gameOver) return;
    game.mouse.down = true;
    game.mouse.drag = false;
    game.mouse.startX = event.clientX;
    game.mouse.startY = event.clientY;
  };

  const onMouseMove = (event) => {
    if (cameraNavigation.pointerMove(event)) event.preventDefault();
    game.mouse.x = event.clientX;
    game.mouse.y = event.clientY;
    const world = game.worldPos(event.clientX, event.clientY);
    game.mouse.wx = world.x;
    game.mouse.wy = world.y;
    if (
      game.mouse.down &&
      Math.hypot(event.clientX - game.mouse.startX, event.clientY - game.mouse.startY) > DRAG_THRESHOLD
    ) {
      game.mouse.drag = true;
    }
  };

  const onMouseUp = (event) => {
    if (cameraNavigation.pointerUp(event)) {
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || game.gameOver) return;
    game.mouse.down = false;
    const world = game.worldPos(event.clientX, event.clientY);
    if (game.pendingBuild && !game.mouse.drag) {
      if (game.placeBuilding(world.x, world.y)) ui.toast('Construction started. The assigned engineer is moving to the site.');
      else ui.toast(game.lastError);
      game.mouse.drag = false;
      ui.refresh();
      return;
    }
    if (game.mouse.drag) {
      const start = game.worldPos(game.mouse.startX, game.mouse.startY);
      game.select(null);
      for (const unit of game.units) {
        if (
          unit.team === TEAM.UA &&
          unit.x >= Math.min(start.x, world.x) &&
          unit.x <= Math.max(start.x, world.x) &&
          unit.y >= Math.min(start.y, world.y) &&
          unit.y <= Math.max(start.y, world.y)
        ) {
          game.selected.add(unit.id);
          unit.selected = true;
        }
      }
      synchronizePrimarySelection(game);
    } else {
      const hit = game.hit(world.x, world.y);
      if (event.ctrlKey && hit?.team === TEAM.UA && game.units.includes(hit)) {
        const result = selectAllOfTypeOnScreen(game, hit, {
          width: windowTarget.innerWidth,
          height: windowTarget.innerHeight,
        });
        ui.toast(`${result.count} matching unit${result.count === 1 ? '' : 's'} selected on screen.`);
      } else {
        game.select(hit?.team === TEAM.UA ? hit : null, event.shiftKey);
        synchronizePrimarySelection(game, hit?.id);
      }
    }
    game.mouse.drag = false;
    ui.refresh();
  };

  const onContextMenu = (event) => {
    event.preventDefault();
    if (game.gameOver) return;
    if (game.pendingBuild) {
      game.cancelBuild();
      ui.toast('Construction placement cancelled.');
      ui.refresh();
      return;
    }
    const world = game.worldPos(event.clientX, event.clientY);
    game.issue(world.x, world.y, game.hit(world.x, world.y));
  };

  const onWheel = (event) => {
    event.preventDefault();
    const before = game.worldPos(event.clientX, event.clientY);
    const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
    game.camera.z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, game.camera.z * zoomFactor));
    game.camera.x = event.clientX - before.x * game.camera.z;
    game.camera.y = event.clientY - before.y * game.camera.z;
  };

  const onKeyDown = (event) => {
    const bookmarkResult = cameraNavigation.handleBookmark(event);
    if (bookmarkResult) {
      event.preventDefault();
      if (!event.repeat && bookmarkResult.message) ui.toast(bookmarkResult.message);
      return;
    }
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      if (cameraNavigation.focusSelected()) ui.toast('Camera focused on selection.');
      else ui.toast('Select a unit or facility to focus the camera.');
      return;
    }

    const controlGroupCommand = resolveControlGroupCommand(event);
    if (controlGroupCommand) {
      event.preventDefault();
      if (game.gameOver || event.repeat) return;
      const result = controlGroups.execute(game, controlGroupCommand, {
        width: windowTarget.innerWidth,
        height: windowTarget.innerHeight,
      });
      synchronizePrimarySelection(game);
      if (result.message) ui.toast(result.message);
      if (result.changed) ui.refresh();
      return;
    }
    const action = resolveInputAction(keyBindings, event.key);
    if (!action) return;
    if (isHeldInputAction(action)) {
      game.keys.add(action);
      heldActionsByKey.set(event.code || event.key, action);
    }
    if (game.gameOver) return;
    if (action === INPUT_ACTIONS.CYCLE_SELECTION_SUBGROUP && !event.repeat) {
      event.preventDefault();
      const result = cycleSelectionSubgroup(game, event.shiftKey ? -1 : 1);
      if (result.type) ui.toast(`Active subgroup: ${result.count} × ${result.type}.`);
      ui.refresh();
    } else if (action === INPUT_ACTIONS.CANCEL && game.pendingBuild) {
      game.cancelBuild();
      ui.toast('Construction placement cancelled.');
      ui.refresh();
    } else if (action === INPUT_ACTIONS.ATTACK_MOVE && !event.repeat) {
      if (game.armAttackMove()) ui.toast('Attack-move: right-click destination.');
      else ui.toast(game.lastError);
    } else if (action === INPUT_ACTIONS.STOP && !event.repeat) {
      if (game.stopSelected()) ui.toast('Orders cancelled.');
      else ui.toast(game.lastError);
    } else if (action === INPUT_ACTIONS.TOGGLE_AUTO_FIRE && !event.repeat) {
      const state = game.toggleAutoFire();
      if (game.lastError) ui.toast(game.lastError);
      else ui.toast(`Auto-fire ${state ? 'enabled' : 'disabled'} for selected combat units.`);
      ui.refresh();
    }
  };

  const onKeyUp = (event) => {
    const keyId = event.code || event.key;
    const action = heldActionsByKey.get(keyId) || resolveInputAction(keyBindings, event.key);
    if (action && isHeldInputAction(action)) game.keys.delete(action);
    heldActionsByKey.delete(keyId);
  };

  const onBlur = () => {
    game.keys.clear();
    heldActionsByKey.clear();
    game.mouse.down = false;
    game.mouse.drag = false;
    cameraNavigation.pointerLeave();
  };

  const onMinimapMouseDown = (event) => {
    if (game.gameOver) return;
    const bounds = minimap.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WORLD_WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * WORLD_HEIGHT;
    game.camera.x = windowTarget.innerWidth / 2 - x * game.camera.z;
    game.camera.y = windowTarget.innerHeight / 2 - y * game.camera.z;
  };

  listen(canvas, 'mousedown', onMouseDown);
  listen(canvas, 'mousemove', onMouseMove);
  listen(canvas, 'mouseup', onMouseUp);
  listen(canvas, 'mouseleave', () => cameraNavigation.pointerLeave());
  listen(canvas, 'contextmenu', onContextMenu);
  listen(canvas, 'wheel', onWheel, { passive: false });
  listen(windowTarget, 'keydown', onKeyDown);
  listen(windowTarget, 'keyup', onKeyUp);
  listen(windowTarget, 'blur', onBlur);
  listen(minimap, 'mousedown', onMinimapMouseDown);
  return () => disposers.splice(0).reverse().forEach((dispose) => dispose());
}
