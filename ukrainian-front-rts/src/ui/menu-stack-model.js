export const MENU_VIEWS = Object.freeze({
  MAIN: 'main',
  SAVES: 'saves',
  CONTROLS: 'controls',
  ACCESSIBILITY: 'accessibility',
  CONFIRM: 'confirm',
});

export const MENU_CONFIRMATIONS = Object.freeze({
  RESTART: 'restart',
  LOAD: 'load',
  DELETE: 'delete',
  QUIT: 'quit',
});

const VIEWS = new Set(Object.values(MENU_VIEWS));
const CONFIRMATIONS = new Set(Object.values(MENU_CONFIRMATIONS));

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function normalizeState(candidate = {}) {
  const view = VIEWS.has(candidate.view) ? candidate.view : MENU_VIEWS.MAIN;
  const confirmation = candidate.confirmation == null ? null : candidate.confirmation;
  if (confirmation !== null && !CONFIRMATIONS.has(confirmation.kind)) {
    throw new RangeError(`Unknown menu confirmation: ${confirmation.kind}`);
  }
  return freeze({
    open: Boolean(candidate.open),
    view: confirmation ? MENU_VIEWS.CONFIRM : view,
    confirmation: confirmation ? {
      kind: confirmation.kind,
      slotId: confirmation.slotId ?? null,
      title: String(confirmation.title || ''),
      message: String(confirmation.message || ''),
    } : null,
    status: candidate.status ? {
      tone: candidate.status.tone === 'error' ? 'error' : candidate.status.tone === 'success' ? 'success' : 'info',
      message: String(candidate.status.message || ''),
    } : null,
  });
}

export function createMenuState(initial = {}) {
  let state = normalizeState(initial);
  const snapshot = () => state;
  const update = (changes) => {
    state = normalizeState({ ...state, ...changes });
    return state;
  };
  return Object.freeze({
    snapshot,
    open() { return update({ open: true, view: MENU_VIEWS.MAIN, confirmation: null }); },
    close() { return update({ open: false, view: MENU_VIEWS.MAIN, confirmation: null, status: null }); },
    navigate(view) {
      if (!VIEWS.has(view) || view === MENU_VIEWS.CONFIRM) throw new RangeError(`Unknown menu view: ${view}`);
      return update({ view, confirmation: null });
    },
    confirm(confirmation) {
      if (!confirmation || !CONFIRMATIONS.has(confirmation.kind)) {
        throw new RangeError(`Unknown menu confirmation: ${confirmation?.kind}`);
      }
      return update({ confirmation });
    },
    cancelConfirmation() { return update({ view: MENU_VIEWS.MAIN, confirmation: null }); },
    setStatus(message, tone = 'info') { return update({ status: { message, tone } }); },
    clearStatus() { return update({ status: null }); },
  });
}

export function createMenuModel({ state, slots = [], missionActive = false, storageAvailable = false } = {}) {
  const current = normalizeState(state);
  return freeze({
    ...current,
    missionActive: Boolean(missionActive),
    storageAvailable: Boolean(storageAvailable),
    slots: [...slots].map((slot) => ({
      slotId: String(slot.slotId ?? ''),
      label: String(slot.label || slot.slotId || 'Campaign save'),
      status: String(slot.status || 'unknown'),
      updatedAt: Number.isInteger(slot.updatedAt) ? slot.updatedAt : null,
      hasMissionState: Boolean(slot.hasMissionState),
      error: slot.error ? String(slot.error) : null,
    })),
  });
}

export function createRuntimePauseController(runtime) {
  if (!runtime || typeof runtime.pause !== 'function' || typeof runtime.resume !== 'function' ||
      typeof runtime.isPaused !== 'function') {
    throw new TypeError('Pause controller requires runtime pause(), resume(), and isPaused().');
  }
  const initiallyPaused = Boolean(runtime.isPaused());
  let disposed = false;
  return Object.freeze({
    pause() {
      if (!disposed) runtime.pause();
      return Boolean(runtime.isPaused());
    },
    resume() {
      if (!disposed) runtime.resume();
      return Boolean(runtime.isPaused());
    },
    isPaused() { return Boolean(runtime.isPaused()); },
    dispose() {
      if (disposed) return false;
      disposed = true;
      if (initiallyPaused) runtime.pause();
      else runtime.resume();
      return true;
    },
  });
}

const PAUSE_RUNTIMES = new WeakMap();

export function registerMenuPauseRuntime(game, runtime) {
  if (!game || (typeof game !== 'object' && typeof game !== 'function')) {
    throw new TypeError('Menu pause registration requires a game object.');
  }
  if (PAUSE_RUNTIMES.has(game)) throw new Error('Menu pause runtime is already registered for this game.');
  createRuntimePauseController(runtime);
  PAUSE_RUNTIMES.set(game, runtime);
  let active = true;
  return () => {
    if (!active) return false;
    active = false;
    if (PAUSE_RUNTIMES.get(game) === runtime) PAUSE_RUNTIMES.delete(game);
    return true;
  };
}

export function createPauseController(game) {
  const runtime = PAUSE_RUNTIMES.get(game);
  if (!runtime) throw new Error('Menu pause runtime is not registered for this game.');
  return createRuntimePauseController(runtime);
}
