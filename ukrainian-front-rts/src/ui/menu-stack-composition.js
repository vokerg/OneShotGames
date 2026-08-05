import { installMenuStack } from './menu-stack.js';
import { registerMenuPauseRuntime } from './menu-stack-model.js';

export function installMenuStackComposition({
  game,
  ui,
  runtime,
  storage = null,
  createSaveRuntime = null,
  audioSettings = () => null,
  documentTarget = globalThis.document,
  windowTarget = globalThis.window,
} = {}) {
  const cleanupStack = [];
  let disposed = false;
  const registerCleanup = (cleanup) => {
    if (typeof cleanup !== 'function') throw new TypeError('Menu composition cleanup must be a function.');
    cleanupStack.push(cleanup);
  };
  const unwind = () => {
    if (disposed) return false;
    disposed = true;
    const failures = [];
    while (cleanupStack.length) {
      try { cleanupStack.pop()(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Menu stack cleanup was incomplete.');
    return true;
  };

  try {
    registerCleanup(registerMenuPauseRuntime(game, runtime));
    const onAudioSettingsKeyDown = (event) => {
      const settings = typeof audioSettings === 'function' ? audioSettings() : audioSettings;
      if (event.key !== 'Escape' || !settings?.snapshot?.().panelOpen) return;
      event.preventDefault?.();
      event.stopImmediatePropagation?.();
      settings.close?.();
    };
    windowTarget.addEventListener?.('keydown', onAudioSettingsKeyDown, true);
    registerCleanup(() => windowTarget.removeEventListener?.('keydown', onAudioSettingsKeyDown, true));
    registerCleanup(installMenuStack({
      game,
      ui,
      runtime,
      storage,
      createSaveRuntime,
      audioSettings,
      documentTarget,
      windowTarget,
    }));
    return unwind;
  } catch (error) {
    try { unwind(); } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Menu stack installation and rollback failed.', { cause: error });
    }
    throw error;
  }
}
