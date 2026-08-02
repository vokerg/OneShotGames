import { registerSimulationDelegate } from '../core/simulation-delegates.js';

function captureProperties(target, names) {
  return names.map((property) => Object.freeze({
    property,
    descriptor: Object.getOwnPropertyDescriptor(target, property) ?? null,
  }));
}

function restoreProperties(target, snapshots) {
  for (const { property, descriptor } of snapshots) {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else delete target[property];
  }
}

export function installControllerWithSimulationDelegates({
  game,
  name,
  install,
  delegates = [],
  preserve = [],
}) {
  if (!game || typeof game.update !== 'function') {
    throw new TypeError(`Controller ${name ?? '<unknown>'} requires game.update().`);
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('Controller adapter requires a non-empty name.');
  }
  if (typeof install !== 'function') throw new TypeError(`Controller ${name} requires install().`);
  if (!Array.isArray(delegates)) throw new TypeError(`Controller ${name} delegates must be an array.`);
  if (!Array.isArray(preserve) || preserve.some((property) => typeof property !== 'string' || !property)) {
    throw new TypeError(`Controller ${name} preserve must be an array of property names.`);
  }

  const preservedProperties = [...new Set(['update', ...preserve])];
  const propertySnapshots = captureProperties(game, preservedProperties);
  const authoritativeUpdate = game.update;
  let disposeController;
  try {
    disposeController = install();
  } catch (error) {
    restoreProperties(game, propertySnapshots);
    throw error;
  }
  if (disposeController != null && typeof disposeController !== 'function') {
    restoreProperties(game, propertySnapshots);
    throw new TypeError(`Controller ${name} must return a disposer or nothing.`);
  }

  const installedWrapper = game.update;
  restoreProperties(game, propertySnapshots);
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
      restoreProperties(game, propertySnapshots);
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
      restoreProperties(game, propertySnapshots);
    }
    return true;
  };
}
