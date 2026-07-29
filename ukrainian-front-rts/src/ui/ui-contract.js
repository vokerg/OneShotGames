const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export const UI_SCREEN_LAYERS = deepFreeze({
  BASE: 'base',
  OVERLAY: 'overlay',
  MODAL: 'modal',
});

export const UI_INPUT_SCOPES = deepFreeze({
  GAMEPLAY: 'gameplay',
  UI: 'ui',
  MODAL: 'modal',
});

export const UI_HUD_REGIONS = deepFreeze([
  'resources',
  'mission',
  'objectives',
  'selection',
  'commandCard',
  'minimap',
  'notifications',
]);

export const UI_REFRESH_REGIONS = deepFreeze([
  'screen',
  ...UI_HUD_REGIONS,
  'modalLayer',
]);

export const UI_REGION_OWNERS = deepFreeze({
  screen: 'screen-host',
  resources: 'resource-strip',
  mission: 'mission-header',
  objectives: 'objective-panel',
  selection: 'selection-panel',
  commandCard: 'command-card',
  minimap: 'minimap-panel',
  notifications: 'notification-feed',
  modalLayer: 'modal-host',
});

export const DEFAULT_UI_SCREENS = deepFreeze({
  operations: {
    layer: UI_SCREEN_LAYERS.BASE,
    inputScope: UI_INPUT_SCOPES.UI,
    defaultFocus: 'operations-primary',
    hudMode: 'replace',
    hudRegions: [],
    dismissible: false,
  },
  battlefield: {
    layer: UI_SCREEN_LAYERS.BASE,
    inputScope: UI_INPUT_SCOPES.GAMEPLAY,
    defaultFocus: 'battlefield',
    hudMode: 'replace',
    hudRegions: UI_HUD_REGIONS,
    dismissible: false,
  },
  briefing: {
    layer: UI_SCREEN_LAYERS.OVERLAY,
    inputScope: UI_INPUT_SCOPES.UI,
    defaultFocus: 'briefing-primary',
    hudMode: 'replace',
    hudRegions: ['mission', 'objectives', 'notifications'],
    dismissible: true,
  },
  pause: {
    layer: UI_SCREEN_LAYERS.OVERLAY,
    inputScope: UI_INPUT_SCOPES.UI,
    defaultFocus: 'pause-resume',
    hudMode: 'inherit',
    hudRegions: [],
    dismissible: true,
  },
  endgame: {
    layer: UI_SCREEN_LAYERS.OVERLAY,
    inputScope: UI_INPUT_SCOPES.UI,
    defaultFocus: 'endgame-primary',
    hudMode: 'replace',
    hudRegions: ['mission', 'objectives', 'notifications'],
    dismissible: false,
  },
  settings: {
    layer: UI_SCREEN_LAYERS.MODAL,
    inputScope: UI_INPUT_SCOPES.MODAL,
    defaultFocus: 'settings-close',
    hudMode: 'inherit',
    hudRegions: [],
    dismissible: true,
  },
  confirmation: {
    layer: UI_SCREEN_LAYERS.MODAL,
    inputScope: UI_INPUT_SCOPES.MODAL,
    defaultFocus: 'confirmation-primary',
    hudMode: 'inherit',
    hudRegions: [],
    dismissible: true,
  },
});

const VALID_LAYERS = new Set(Object.values(UI_SCREEN_LAYERS));
const VALID_INPUT_SCOPES = new Set(Object.values(UI_INPUT_SCOPES));
const VALID_HUD_MODES = new Set(['inherit', 'replace']);
const VALID_HUD_REGIONS = new Set(UI_HUD_REGIONS);

export function createUiScreenRegistry(definitions = DEFAULT_UI_SCREENS) {
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) {
    throw new TypeError('UI screen definitions must be an object keyed by screen ID.');
  }

  const registry = {};
  for (const [id, definition] of Object.entries(definitions)) {
    if (!id.trim()) throw new TypeError('UI screen IDs must be non-empty strings.');
    if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
      throw new TypeError(`UI screen ${id} must be an object.`);
    }

    const layer = definition.layer;
    const inputScope = definition.inputScope;
    const hudMode = definition.hudMode ?? 'inherit';
    const hudRegions = definition.hudRegions ?? [];
    const defaultFocus = definition.defaultFocus ?? null;
    const dismissible = definition.dismissible ?? layer !== UI_SCREEN_LAYERS.BASE;

    if (!VALID_LAYERS.has(layer)) throw new TypeError(`UI screen ${id} has invalid layer ${String(layer)}.`);
    if (!VALID_INPUT_SCOPES.has(inputScope)) throw new TypeError(`UI screen ${id} has invalid input scope ${String(inputScope)}.`);
    if (!VALID_HUD_MODES.has(hudMode)) throw new TypeError(`UI screen ${id} has invalid HUD mode ${String(hudMode)}.`);
    if (!Array.isArray(hudRegions)) throw new TypeError(`UI screen ${id} hudRegions must be an array.`);
    if (defaultFocus !== null && (typeof defaultFocus !== 'string' || !defaultFocus.trim())) {
      throw new TypeError(`UI screen ${id} defaultFocus must be null or a non-empty string.`);
    }
    if (typeof dismissible !== 'boolean') throw new TypeError(`UI screen ${id} dismissible must be a boolean.`);
    if (layer === UI_SCREEN_LAYERS.BASE && dismissible) throw new TypeError(`Base UI screen ${id} cannot be dismissible.`);
    if (layer === UI_SCREEN_LAYERS.MODAL && inputScope !== UI_INPUT_SCOPES.MODAL) {
      throw new TypeError(`Modal UI screen ${id} must use modal input scope.`);
    }

    const seenRegions = new Set();
    for (const region of hudRegions) {
      if (!VALID_HUD_REGIONS.has(region)) throw new TypeError(`UI screen ${id} references unknown HUD region ${String(region)}.`);
      if (seenRegions.has(region)) throw new TypeError(`UI screen ${id} repeats HUD region ${region}.`);
      seenRegions.add(region);
    }

    registry[id] = {
      layer,
      inputScope,
      defaultFocus,
      hudMode,
      hudRegions: [...hudRegions],
      dismissible,
    };
  }

  if (!Object.values(registry).some((definition) => definition.layer === UI_SCREEN_LAYERS.BASE)) {
    throw new TypeError('UI screen registry must define at least one base screen.');
  }

  return deepFreeze(registry);
}
