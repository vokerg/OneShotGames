import { registerSimulationDelegate } from '../core/simulation-delegates.js';

export function installControllerWithSimulationDelegates({
  game,
  name,
  install,
  delegates = [],
}) {
  if (!game || typeof game.update !== 'function') {
    throw new TypeError(`Controller ${name ?? '<unknown>'} requires game.update().`);
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('Controller adapter requires a non-empty name.');
  }
  if (typeof install !== 'function') throw new TypeError(`Controller ${name} requires install().`);
  if (!Array.isArray(delegates)) throw new TypeError(`Controller ${name} delegates must be an array.`);

  const authoritativeUpdate = game.update;
  let disposeController;
  try {
    disposeController = install();
  } catch (error) {
    game.update = authoritativeUpdate;
    throw error;
  }
  if (disposeController != null && typeof disposeController !== 'function') {
    game.update = authoritativeUpdate;
    throw new TypeError(`Controller ${name} must return a disposer or nothing.`);
  }

  const installedWrapper = game.update;
  game.update = authoritativeUpdate;
  const unregister = [];
  try {
    for (const delegate of delegates) {
      unregister.push(registerSimulationDelegate(game, {
        ...delegate,
        id: `${name}:${delegate.id}`,
      }));
    }
  } catch (error) {
    for (const remove of [...unregister].reverse()) remove();
    try {
      if (disposeController) {
        game.update = installedWrapper;
        disposeController();
      }
    } finally {
      game.update = authoritativeUpdate;
    }
    throw error;
  }

  let active = true;
  return () => {
    if (!active) return false;
    active = false;
    for (const remove of [...unregister].reverse()) remove();
    try {
      if (disposeController) {
        game.update = installedWrapper;
        disposeController();
      }
    } finally {
      game.update = authoritativeUpdate;
    }
    return true;
  };
}
