import {
  DEFAULT_UI_SCREENS,
  UI_HUD_REGIONS,
  UI_INPUT_SCOPES,
  UI_REFRESH_REGIONS,
  UI_SCREEN_LAYERS,
  createUiScreenRegistry,
} from './ui-contract.js';

function normalizeSemanticValue(value, path = '$', ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain only finite numbers.`);
    return value;
  }
  if (typeof value !== 'object') throw new TypeError(`${path} must contain only JSON-like semantic values.`);
  if (ancestors.has(value)) throw new TypeError(`${path} cannot contain cyclic references.`);

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) {
    return Object.freeze(value.map((child, index) => normalizeSemanticValue(child, `${path}[${index}]`, nextAncestors)));
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must be a plain object, not a class or browser object.`);
  }

  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child === undefined) throw new TypeError(`${path}.${key} cannot be undefined.`);
    normalized[key] = normalizeSemanticValue(child, `${path}.${key}`, nextAncestors);
  }
  return Object.freeze(normalized);
}

const signatureOf = (value) => JSON.stringify(value);
const nonEmptyStringOrNull = (value, label) => {
  if (value === null) return null;
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be null or a non-empty string.`);
  return value;
};

export class UiScreenStack {
  constructor({ screens = DEFAULT_UI_SCREENS, initialScreen = 'operations', initialParams = {} } = {}) {
    this.screens = createUiScreenRegistry(screens);
    this.sequence = 0;
    this.revision = 0;
    this.entries = [];
    this.focusTarget = null;
    this.pendingFocus = null;
    this.replaceBase(initialScreen, initialParams);
  }

  definition(screenId) {
    const definition = this.screens[screenId];
    if (!definition) throw new RangeError(`Unknown UI screen: ${screenId}`);
    return definition;
  }

  createEntry(screenId, params, restoreFocus) {
    const definition = this.definition(screenId);
    return Object.freeze({
      key: `${screenId}:${++this.sequence}`,
      id: screenId,
      layer: definition.layer,
      params: normalizeSemanticValue(params, `screen(${screenId}).params`),
      restoreFocus,
    });
  }

  requestFocus(target) {
    this.focusTarget = target;
    this.pendingFocus = target;
  }

  replaceBase(screenId, params = {}) {
    const definition = this.definition(screenId);
    if (definition.layer !== UI_SCREEN_LAYERS.BASE) throw new TypeError(`UI screen ${screenId} is not a base screen.`);
    this.entries = [this.createEntry(screenId, params, null)];
    this.revision += 1;
    this.requestFocus(definition.defaultFocus);
    return this.snapshot();
  }

  push(screenId, params = {}) {
    const definition = this.definition(screenId);
    if (definition.layer === UI_SCREEN_LAYERS.BASE) throw new TypeError(`Base UI screen ${screenId} must replace the stack instead of being pushed.`);
    if (definition.layer === UI_SCREEN_LAYERS.OVERLAY && this.entries.some((entry) => entry.layer === UI_SCREEN_LAYERS.MODAL)) {
      throw new Error(`Cannot push overlay ${screenId} while a modal screen is open.`);
    }
    const entry = this.createEntry(screenId, params, this.focusTarget);
    this.entries = [...this.entries, entry];
    this.revision += 1;
    this.requestFocus(definition.defaultFocus);
    return this.snapshot();
  }

  closeTop({ force = false } = {}) {
    if (this.entries.length === 1) throw new Error('Cannot close the base UI screen.');
    const closing = this.entries.at(-1);
    const definition = this.definition(closing.id);
    if (!definition.dismissible && !force) throw new Error(`UI screen ${closing.id} is not dismissible.`);
    this.entries = this.entries.slice(0, -1);
    this.revision += 1;
    const fallback = this.definition(this.entries.at(-1).id).defaultFocus;
    this.requestFocus(closing.restoreFocus ?? fallback);
    return this.snapshot();
  }

  setFocusTarget(target) {
    this.focusTarget = nonEmptyStringOrNull(target, 'UI focus target');
    return this.focusTarget;
  }

  consumeFocusRequest() {
    const target = this.pendingFocus;
    this.pendingFocus = null;
    return target;
  }

  recoverFocus(isAvailable) {
    if (typeof isAvailable !== 'function') throw new TypeError('UI focus recovery requires an availability predicate.');
    if (this.focusTarget && isAvailable(this.focusTarget)) return null;
    const fallback = this.definition(this.entries.at(-1).id).defaultFocus;
    this.requestFocus(fallback);
    return fallback;
  }

  inputPolicy() {
    const top = this.entries.at(-1);
    const definition = this.definition(top.id);
    return Object.freeze({
      screenId: top.id,
      scope: definition.inputScope,
      blocksGameplay: definition.inputScope !== UI_INPUT_SCOPES.GAMEPLAY,
      trapsFocus: definition.layer === UI_SCREEN_LAYERS.MODAL,
      dismissible: definition.dismissible,
    });
  }

  visibleHudRegions() {
    const visible = new Set();
    for (const entry of this.entries) {
      const definition = this.definition(entry.id);
      if (definition.hudMode === 'replace') visible.clear();
      for (const region of definition.hudRegions) visible.add(region);
    }
    return Object.freeze(UI_HUD_REGIONS.filter((region) => visible.has(region)));
  }

  snapshot() {
    const modalDepth = this.entries.filter((entry) => entry.layer === UI_SCREEN_LAYERS.MODAL).length;
    return Object.freeze({
      revision: this.revision,
      baseScreen: this.entries[0].id,
      topScreen: this.entries.at(-1).id,
      stack: Object.freeze(this.entries.map((entry) => Object.freeze({
        key: entry.key,
        id: entry.id,
        layer: entry.layer,
        params: entry.params,
      }))),
      modalDepth,
      focusTarget: this.focusTarget,
      visibleHudRegions: this.visibleHudRegions(),
      input: this.inputPolicy(),
    });
  }
}

export class UiRefreshStore {
  constructor({ regions = UI_REFRESH_REGIONS } = {}) {
    if (!Array.isArray(regions) || regions.length === 0) throw new TypeError('UI refresh regions must be a non-empty array.');
    this.regions = [...regions];
    this.regionSet = new Set(this.regions);
    if (this.regionSet.size !== this.regions.length) throw new TypeError('UI refresh regions must be unique.');
    this.states = new Map();
    this.signatures = new Map();
    this.dirty = new Map();
    this.revision = 0;
  }

  assertRegion(region) {
    if (!this.regionSet.has(region)) throw new RangeError(`Unknown UI refresh region: ${region}`);
  }

  markDirty(region, reason) {
    this.assertRegion(region);
    const reasons = this.dirty.get(region) ?? new Set();
    reasons.add(nonEmptyStringOrNull(reason, 'UI refresh reason') ?? 'explicit');
    this.dirty.set(region, reasons);
  }

  set(region, value, { reason = 'state-change' } = {}) {
    this.assertRegion(region);
    const normalized = normalizeSemanticValue(value, `region(${region})`);
    const signature = signatureOf(normalized);
    if (this.signatures.get(region) === signature) return false;
    this.states.set(region, normalized);
    this.signatures.set(region, signature);
    this.markDirty(region, reason);
    return true;
  }

  clear(region, { reason = 'state-clear' } = {}) {
    this.assertRegion(region);
    if (!this.states.has(region)) return false;
    this.states.delete(region);
    this.signatures.delete(region);
    this.markDirty(region, reason);
    return true;
  }

  invalidate(region, reason = 'explicit') {
    this.markDirty(region, reason);
  }

  invalidateMany(regions, reason = 'explicit') {
    if (!Array.isArray(regions)) throw new TypeError('UI refresh invalidation requires an array of regions.');
    for (const region of regions) this.markDirty(region, reason);
  }

  invalidateAll(reason = 'full-refresh') {
    this.invalidateMany(this.regions, reason);
  }

  get(region) {
    this.assertRegion(region);
    return this.states.get(region) ?? null;
  }

  hasPending() {
    return this.dirty.size > 0;
  }

  consume() {
    if (!this.hasPending()) return null;
    const dirtyRegions = this.regions.filter((region) => this.dirty.has(region));
    const state = {};
    const reasons = {};
    for (const region of dirtyRegions) {
      state[region] = this.states.get(region) ?? null;
      reasons[region] = Object.freeze([...this.dirty.get(region)].sort());
    }
    this.dirty.clear();
    this.revision += 1;
    return Object.freeze({
      revision: this.revision,
      regions: Object.freeze(dirtyRegions),
      state: Object.freeze(state),
      reasons: Object.freeze(reasons),
    });
  }

  snapshot() {
    const state = {};
    for (const region of this.regions) if (this.states.has(region)) state[region] = this.states.get(region);
    return Object.freeze({
      revision: this.revision,
      pendingRegions: Object.freeze(this.regions.filter((region) => this.dirty.has(region))),
      state: Object.freeze(state),
    });
  }
}

export class UiStateCoordinator {
  constructor(options = {}) {
    this.navigation = new UiScreenStack(options);
    this.refresh = new UiRefreshStore();
    this.syncNavigation('initial-screen');
  }

  syncNavigation(reason) {
    const navigation = this.navigation.snapshot();
    this.refresh.set('screen', navigation, { reason });
    const modal = navigation.modalDepth > 0
      ? navigation.stack.filter((entry) => entry.layer === UI_SCREEN_LAYERS.MODAL).at(-1)
      : null;
    this.refresh.set('modalLayer', modal, { reason });
    return navigation;
  }

  replaceBase(screenId, params = {}) {
    this.navigation.replaceBase(screenId, params);
    return this.syncNavigation('replace-base');
  }

  pushScreen(screenId, params = {}) {
    this.navigation.push(screenId, params);
    return this.syncNavigation('push-screen');
  }

  closeTop(options = {}) {
    this.navigation.closeTop(options);
    return this.syncNavigation('close-screen');
  }

  setFocusTarget(target) {
    return this.navigation.setFocusTarget(target);
  }

  consumeFocusRequest() {
    return this.navigation.consumeFocusRequest();
  }

  recoverFocus(isAvailable) {
    return this.navigation.recoverFocus(isAvailable);
  }

  setRegionState(region, value, options = {}) {
    if (!UI_HUD_REGIONS.includes(region)) throw new RangeError(`Semantic HUD state cannot write reserved UI region ${region}.`);
    return this.refresh.set(region, value, options);
  }

  clearRegionState(region, options = {}) {
    if (!UI_HUD_REGIONS.includes(region)) throw new RangeError(`Semantic HUD state cannot write reserved UI region ${region}.`);
    return this.refresh.clear(region, options);
  }

  invalidateRegion(region, reason = 'explicit') {
    this.refresh.invalidate(region, reason);
  }

  invalidateAll(reason = 'full-refresh') {
    this.refresh.invalidateAll(reason);
  }

  consumeRefreshPlan() {
    return this.refresh.consume();
  }

  snapshot() {
    return Object.freeze({
      navigation: this.navigation.snapshot(),
      presentation: this.refresh.snapshot(),
    });
  }
}

export const createUiState = (options) => new UiStateCoordinator(options);
