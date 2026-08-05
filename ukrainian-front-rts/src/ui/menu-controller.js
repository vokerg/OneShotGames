const MENU_SCREENS = new Set([
  'pause',
  'save',
  'load',
  'settings',
  'controls',
  'accessibility',
]);

function immutableState(state) {
  return Object.freeze({
    open: state.open,
    screen: state.screen,
    previousScreen: state.previousScreen,
    confirmation: state.confirmation ? Object.freeze({ ...state.confirmation }) : null,
  });
}

export function createMenuController({
  onPause = () => {},
  onResume = () => {},
} = {}) {
  let state = immutableState({
    open: false,
    screen: 'pause',
    previousScreen: null,
    confirmation: null,
  });
  const listeners = new Set();
  let pendingConfirmation = null;

  const publish = (nextState) => {
    state = immutableState(nextState);
    for (const listener of listeners) listener(state);
    return state;
  };

  const open = (screen = 'pause') => {
    if (!MENU_SCREENS.has(screen)) throw new RangeError(`Unknown menu screen: ${screen}`);
    const wasOpen = state.open;
    publish({ open: true, screen, previousScreen: null, confirmation: null });
    if (!wasOpen) onPause();
    return state;
  };

  const close = () => {
    if (!state.open) return state;
    pendingConfirmation = null;
    publish({ open: false, screen: 'pause', previousScreen: null, confirmation: null });
    onResume();
    return state;
  };

  const show = (screen) => {
    if (!MENU_SCREENS.has(screen)) throw new RangeError(`Unknown menu screen: ${screen}`);
    if (!state.open) return open(screen);
    pendingConfirmation = null;
    return publish({ open: true, screen, previousScreen: null, confirmation: null });
  };

  const back = () => {
    if (!state.open) return state;
    if (state.confirmation) return cancelConfirmation();
    if (state.screen === 'pause') return close();
    return show('pause');
  };

  const requestConfirmation = ({ title, message, confirmLabel = 'Confirm', action }) => {
    if (!state.open) throw new Error('A confirmation requires an open menu.');
    if (typeof action !== 'function') throw new TypeError('Confirmation action must be a function.');
    pendingConfirmation = action;
    return publish({
      open: true,
      screen: state.screen,
      previousScreen: state.screen,
      confirmation: { title, message, confirmLabel },
    });
  };

  const cancelConfirmation = () => {
    if (!state.confirmation) return state;
    pendingConfirmation = null;
    return publish({
      open: true,
      screen: state.previousScreen ?? 'pause',
      previousScreen: null,
      confirmation: null,
    });
  };

  const confirm = () => {
    if (!state.confirmation || !pendingConfirmation) return false;
    const action = pendingConfirmation;
    pendingConfirmation = null;
    publish({
      open: true,
      screen: state.previousScreen ?? 'pause',
      previousScreen: null,
      confirmation: null,
    });
    action();
    return true;
  };

  const toggle = () => (state.open ? close() : open());

  const subscribe = (listener) => {
    if (typeof listener !== 'function') throw new TypeError('Menu listener must be a function.');
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  };

  return Object.freeze({
    open,
    close,
    toggle,
    show,
    back,
    requestConfirmation,
    cancelConfirmation,
    confirm,
    subscribe,
    snapshot: () => state,
    capturesGameplayInput: () => state.open,
  });
}
