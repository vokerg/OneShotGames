function normalizeModule(module, index) {
  if (!module || typeof module !== 'object') {
    throw new TypeError(`Application module at index ${index} must be an object.`);
  }
  if (typeof module.name !== 'string' || !module.name.trim()) {
    throw new TypeError(`Application module at index ${index} requires a non-empty name.`);
  }
  if (typeof module.install !== 'function') {
    throw new TypeError(`Application module ${module.name} requires install().`);
  }
  return Object.freeze({ name: module.name, install: module.install });
}

function disposerFor(name, installed) {
  if (installed == null) return () => {};
  if (typeof installed === 'function') return installed;
  if (typeof installed.dispose === 'function') return () => installed.dispose();
  throw new TypeError(`Application module ${name} must return a disposer, a disposable object, or nothing.`);
}

function aggregateFailure(message, primary, rollbackFailures) {
  if (!rollbackFailures.length) return primary;
  return new AggregateError(
    [primary, ...rollbackFailures],
    message,
    { cause: primary },
  );
}

export function createApplicationComposition({ context = {}, modules = [] } = {}) {
  if (!context || typeof context !== 'object') {
    throw new TypeError('Application composition context must be an object.');
  }
  if (!Array.isArray(modules)) throw new TypeError('Application composition modules must be an array.');

  const definitions = Object.freeze(modules.map(normalizeModule));
  const names = definitions.map((module) => module.name);
  if (new Set(names).size !== names.length) {
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    throw new Error(`Duplicate application module name: ${duplicate}`);
  }

  const installed = [];
  let state = 'idle';

  const snapshot = () => Object.freeze(installed.map(({ name }) => name));

  const disposeEntries = (entries) => {
    const failures = [];
    for (const entry of [...entries].reverse()) {
      try {
        entry.dispose();
      } catch (error) {
        failures.push(error);
      }
    }
    return failures;
  };

  const install = () => {
    if (state === 'installed') return snapshot();
    if (state === 'installing' || state === 'disposing') {
      throw new Error(`Application composition cannot install while ${state}.`);
    }
    if (state === 'disposed') throw new Error('Disposed application composition cannot be reinstalled.');

    state = 'installing';
    try {
      for (const definition of definitions) {
        const result = definition.install(context);
        installed.push(Object.freeze({
          name: definition.name,
          dispose: disposerFor(definition.name, result),
        }));
      }
      state = 'installed';
      return snapshot();
    } catch (error) {
      const rollbackFailures = disposeEntries(installed);
      installed.length = 0;
      state = 'idle';
      throw aggregateFailure('Application installation failed and rollback was incomplete.', error, rollbackFailures);
    }
  };

  const dispose = () => {
    if (state === 'disposed') return false;
    if (state === 'installing') throw new Error('Application composition cannot dispose while installing.');
    if (state === 'disposing') return false;

    state = 'disposing';
    const failures = disposeEntries(installed);
    installed.length = 0;
    state = 'disposed';
    if (failures.length) throw new AggregateError(failures, 'Application disposal failed.');
    return true;
  };

  return Object.freeze({
    install,
    dispose,
    installedModules: snapshot,
    state: () => state,
    moduleNames: Object.freeze([...names]),
  });
}
