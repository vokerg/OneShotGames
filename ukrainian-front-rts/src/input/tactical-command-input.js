import { createKeyBindings, INPUT_ACTIONS, resolveInputAction } from './action-map.js';
import { TACTICAL_COMMAND_KINDS } from '../core/tactical-command-contract.js';

const TARGET_ACTIONS = Object.freeze({
  [INPUT_ACTIONS.PATROL]: Object.freeze({ kind: TACTICAL_COMMAND_KINDS.PATROL, message: 'Patrol armed: right-click the far patrol point.' }),
  [INPUT_ACTIONS.GUARD]: Object.freeze({ kind: TACTICAL_COMMAND_KINDS.GUARD, message: 'Guard armed: right-click a friendly unit or structure.' }),
  [INPUT_ACTIONS.FOLLOW]: Object.freeze({ kind: TACTICAL_COMMAND_KINDS.FOLLOW, message: 'Follow armed: right-click another friendly unit.' }),
});

function commandMessage(game, fallback) {
  const message = game.lastCommandMessage || game.lastError || fallback;
  game.lastCommandMessage = '';
  return message;
}

export function installTacticalCommandInput({
  game,
  ui,
  canvas,
  windowTarget = globalThis,
  documentTarget = globalThis.document,
  keyBindings: keyBindingOverrides = {},
} = {}) {
  if (!game || typeof game.armTacticalCommand !== 'function' || typeof game.issueTacticalTarget !== 'function') {
    throw new TypeError('Tactical command input requires an installed tactical command controller.');
  }
  if (!canvas?.addEventListener) throw new TypeError('Tactical command input requires a canvas event target.');

  const keyBindings = createKeyBindings(keyBindingOverrides);
  const root = documentTarget?.body;
  const style = documentTarget?.createElement?.('style') || null;
  if (style) {
    style.dataset.tacticalCommandStyle = 'true';
    style.textContent = `
      [data-tactical-command="patrol"] { cursor: crosshair !important; }
      [data-tactical-command="guard"], [data-tactical-command="follow"] { cursor: alias !important; }
    `;
    documentTarget.head?.appendChild(style);
  }

  const syncTargetingState = () => {
    const kind = game.pendingTacticalCommand?.kind || '';
    if (kind) {
      canvas.dataset.tacticalCommand = kind;
      if (root?.dataset) root.dataset.tacticalCommand = kind;
    } else {
      delete canvas.dataset.tacticalCommand;
      if (root?.dataset) delete root.dataset.tacticalCommand;
    }
  };

  const notify = (fallback) => {
    const message = commandMessage(game, fallback);
    if (message) ui?.toast?.(message);
    ui?.refresh?.();
    syncTargetingState();
  };

  const onKeyDown = (event) => {
    if (event.repeat || game.gameOver) return;
    const action = resolveInputAction(keyBindings, event.key);
    if (!action) return;

    if ([INPUT_ACTIONS.ATTACK_MOVE, INPUT_ACTIONS.ATTACK_GROUND, INPUT_ACTIONS.STOP].includes(action)) {
      if (game.cancelTacticalCommand()) syncTargetingState();
      return;
    }

    if (action === INPUT_ACTIONS.CANCEL && game.cancelTacticalCommand()) {
      event.preventDefault?.();
      notify('Tactical targeting cancelled.');
      return;
    }

    const targetCommand = TARGET_ACTIONS[action];
    if (targetCommand) {
      if (game.pendingBuild) return;
      event.preventDefault?.();
      if (game.armTacticalCommand(targetCommand.kind)) notify(targetCommand.message);
      else notify('Tactical command unavailable.');
      return;
    }

    if (action === INPUT_ACTIONS.HOLD_POSITION) {
      if (game.pendingBuild) return;
      event.preventDefault?.();
      game.holdSelected();
      notify('Hold-position order issued.');
      return;
    }

    if (action === INPUT_ACTIONS.RETURN_FOR_REPAIR) {
      if (game.pendingBuild) return;
      event.preventDefault?.();
      game.returnSelectedForRepair();
      notify('Return-for-repair order issued.');
    }
  };

  const onContextMenu = (event) => {
    if (!game.pendingTacticalCommand || game.gameOver) return;
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
    const point = game.worldPos(event.clientX, event.clientY);
    const target = game.hit(point.x, point.y);
    game.issueTacticalTarget(point.x, point.y, target);
    notify('Tactical command target rejected.');
  };

  const onBlur = () => {
    if (game.cancelTacticalCommand()) syncTargetingState();
  };

  windowTarget?.addEventListener?.('keydown', onKeyDown, true);
  windowTarget?.addEventListener?.('blur', onBlur);
  canvas.addEventListener('contextmenu', onContextMenu, true);
  syncTargetingState();

  return () => {
    game.cancelTacticalCommand();
    syncTargetingState();
    windowTarget?.removeEventListener?.('keydown', onKeyDown, true);
    windowTarget?.removeEventListener?.('blur', onBlur);
    canvas.removeEventListener('contextmenu', onContextMenu, true);
    style?.remove?.();
  };
}
