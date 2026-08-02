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

function captureObjectShape(target) {
  return new Map(Reflect.ownKeys(target).map((property) => [
    property,
    Object.getOwnPropertyDescriptor(target, property),
  ]));
}

function restoreObjectShape(target, descriptors) {
  for (const property of Reflect.ownKeys(target)) {
    if (!descriptors.has(property)) delete target[property];
  }
  for (const [property, descriptor] of descriptors) {
    Object.defineProperty(target, property, descriptor);
  }
}

export function installControllerWithSimulationDelegates({
  game,
  name,
  install,
  delegates = [],
  restore = [],
}) {
  if (!game || typeof game.update !== 'function') {
    throw new TypeError(`Controller ${name ?? '<unknown>'} requires game.update().`);
  }
  if (typeof name !== 'string' || !name.trim()) {
    throw new TypeError('Controller adapter requires a non-empty name.');
  }
  if (typeof install !== 'function') throw new TypeError(`Controller ${name} requires install().`);
  if (!Array.isArray(delegates)) throw new TypeError(`Controller ${name} delegates must be an array.`);
  if (!Array.isArray(restore) || restore.some((property) => typeof property !== 'string' || !property)) {
    throw new TypeError(`Controller ${name} restore must be an array of property names.`);
  }

  const initialShape = captureObjectShape(game);
  const updateSnapshot = captureProperties(game, ['update']);
  const lifecycleSnapshots = captureProperties(game, [...new Set(['update', ...restore])]);
  let disposeController;
  try {
    disposeController = install();
  } catch (error) {
    restoreObjectShape(game, initialShape);
    throw error;
  }
  if (disposeController != null && typeof disposeController !== 'function') {
    restoreObjectShape(game, initialShape);
    throw new TypeError(`Controller ${name} must return a disposer or nothing.`);
  }

  const installedWrapper = game.update;
  restoreProperties(game, updateSnapshot);
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
      restoreObjectShape(game, initialShape);
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
      restoreProperties(game, lifecycleSnapshots);
    }
    return true;
  };
}
