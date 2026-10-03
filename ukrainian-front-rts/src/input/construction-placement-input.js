import { shouldIgnoreBattlefieldKey } from './keyboard-focus.js';
export function installConstructionPlacementInput({
  game,
  ui,
  windowTarget = window,
  rotateKey = 'r',
} = {}) {
  if (!game || typeof game.rotatePendingBuild !== 'function') {
    throw new TypeError('Construction placement input requires game.rotatePendingBuild().');
  }
  if (!windowTarget?.addEventListener || !windowTarget?.removeEventListener) {
    throw new TypeError('Construction placement input requires an event target.');
  }

  const normalizedKey = String(rotateKey).toLowerCase();
  const onKeyDown = (event) => {
    if (shouldIgnoreBattlefieldKey(event)) return;
    if (
      !game.pendingBuild ||
      event.repeat ||
      String(event.key).toLowerCase() !== normalizedKey
    ) {
      return;
    }
    event.preventDefault?.();
    const rotation = game.rotatePendingBuild();
    if (rotation === false) ui?.toast?.(game.lastError);
    else ui?.toast?.(`Construction footprint rotated to ${rotation}°.`);
    ui?.refresh?.();
  };

  windowTarget.addEventListener('keydown', onKeyDown);
  return () => windowTarget.removeEventListener('keydown', onKeyDown);
}
