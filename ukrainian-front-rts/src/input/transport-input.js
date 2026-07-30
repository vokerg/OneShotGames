import {
  createKeyBindings,
  INPUT_ACTIONS,
  resolveInputAction,
} from './action-map.js';

export function installTransportInput({
  game,
  ui,
  windowTarget = globalThis,
  keyBindings: keyBindingOverrides = {},
} = {}) {
  if (!game || typeof game.issue !== 'function') {
    throw new TypeError('Transport input requires a game command boundary.');
  }
  const keyBindings = createKeyBindings(keyBindingOverrides);
  const originalIssue = game.issue;

  const showCommandResult = (accepted) => {
    const message = game.lastCommandMessage;
    if (message) {
      ui?.toast?.(message);
      ui?.refresh?.();
      game.lastCommandMessage = '';
      return true;
    }
    if (!accepted && game.lastError) ui?.toast?.(game.lastError);
    return false;
  };

  game.issue = function issueWithTransportFeedback(...args) {
    const accepted = originalIssue.apply(this, args);
    showCommandResult(accepted);
    return accepted;
  };

  const onKeyDown = (event) => {
    if (event.repeat || game.gameOver) return;
    if (resolveInputAction(keyBindings, event.key) !== INPUT_ACTIONS.DISEMBARK) return;
    event.preventDefault?.();
    const accepted = game.disembarkSelected?.() ?? false;
    if (!showCommandResult(accepted)) ui?.refresh?.();
  };

  windowTarget?.addEventListener?.('keydown', onKeyDown);

  return () => {
    game.issue = originalIssue;
    windowTarget?.removeEventListener?.('keydown', onKeyDown);
  };
}
