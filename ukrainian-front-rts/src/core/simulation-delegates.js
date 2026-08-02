export const SIMULATION_DELEGATE_PHASES = Object.freeze({
  STEP_BEGIN: 'step-begin',
  TACTICAL_PREPARE: 'tactical-prepare',
  STANCE_PREPARE: 'stance-prepare',
  BUILDING_LIFECYCLE: 'building-lifecycle',
  STANCE_RECONCILE: 'stance-reconcile',
  TACTICAL_RECONCILE: 'tactical-reconcile',
  COMMAND_CAPACITY: 'command-capacity',
  STEP_END: 'step-end',
});

const PHASE_IDS = new Set(Object.values(SIMULATION_DELEGATE_PHASES));
const REGISTRIES = new WeakMap();

function requireGame(game) {
  if (!game || (typeof game !== 'object' && typeof game !== 'function')) {
    throw new TypeError('Simulation delegates require a game object.');
  }
  return game;
}

function requirePhase(phase) {
  if (!PHASE_IDS.has(phase)) throw new TypeError(`Unknown simulation delegate phase: ${phase}`);
  return phase;
}

function registryFor(game, { create = true } = {}) {
  requireGame(game);
  let registry = REGISTRIES.get(game);
  if (!registry && create) {
    registry = new Map();
    REGISTRIES.set(game, registry);
  }
  return registry ?? null;
}

function entriesFor(game, phase, { create = true } = {}) {
  const registry = registryFor(game, { create });
  if (!registry) return null;
  let entries = registry.get(phase);
  if (!entries && create) {
    entries = new Map();
    registry.set(phase, entries);
  }
  return entries ?? null;
}

function ordered(entries) {
  return [...entries.values()].sort((left, right) =>
    left.order - right.order || left.id.localeCompare(right.id));
}

export function registerSimulationDelegate(game, {
  phase,
  id,
  run,
  order = 0,
}) {
  requirePhase(phase);
  if (typeof id !== 'string' || !id.trim()) {
    throw new TypeError('Simulation delegate id must be a non-empty string.');
  }
  if (typeof run !== 'function') throw new TypeError(`Simulation delegate ${id} requires run().`);
  if (!Number.isFinite(order)) throw new TypeError(`Simulation delegate ${id} order must be finite.`);

  const entries = entriesFor(game, phase);
  if (entries.has(id)) throw new Error(`Duplicate simulation delegate: ${phase}/${id}`);
  const entry = Object.freeze({ phase, id, run, order });
  entries.set(id, entry);
  let active = true;

  return () => {
    if (!active) return false;
    active = false;
    const current = entriesFor(game, phase, { create: false });
    if (!current || current.get(id) !== entry) return false;
    current.delete(id);
    if (!current.size) registryFor(game, { create: false })?.delete(phase);
    return true;
  };
}

export function runSimulationDelegates(game, phase, stepSeconds) {
  requirePhase(phase);
  const entries = entriesFor(game, phase, { create: false });
  if (!entries?.size) return Object.freeze([]);
  const results = ordered(entries).map((entry) => Object.freeze({
    id: entry.id,
    result: entry.run(game, stepSeconds),
  }));
  return Object.freeze(results);
}

export function simulationDelegateSnapshot(game) {
  const registry = registryFor(game, { create: false });
  if (!registry) return Object.freeze([]);
  const snapshot = [];
  for (const phase of Object.values(SIMULATION_DELEGATE_PHASES)) {
    const entries = registry.get(phase);
    if (!entries?.size) continue;
    for (const entry of ordered(entries)) {
      snapshot.push(Object.freeze({ phase, id: entry.id, order: entry.order }));
    }
  }
  return Object.freeze(snapshot);
}

export function clearSimulationDelegates(game) {
  const registry = registryFor(game, { create: false });
  if (!registry) return false;
  REGISTRIES.delete(game);
  return true;
}
