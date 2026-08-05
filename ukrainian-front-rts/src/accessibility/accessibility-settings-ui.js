import {
  INPUT_ACTION_IDS,
  INPUT_ACTION_LABELS,
  normalizeInputKey,
} from '../input/action-map.js';
import {
  COLOR_VISION_PRESETS,
  CONTRAST_MODES,
  createAccessibilitySettingsController,
  CURSOR_SIZES,
  TEXT_SCALE_OPTIONS,
  UI_SCALE_OPTIONS,
} from './accessibility-settings.js';
import { createAccessibilityRuntime } from './accessibility-runtime.js';

export const ACCESSIBILITY_REBINDABLE_KEYS = Object.freeze([
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
  'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
  'escape', 'tab', 'enter', 'backspace',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function option(value, label) {
  return `<option value="${value}">${label}</option>`;
}

function percent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function displayKey(value) {
  const key = normalizeInputKey(value);
  const labels = Object.freeze({
    arrowup: 'Arrow Up',
    arrowdown: 'Arrow Down',
    arrowleft: 'Arrow Left',
    arrowright: 'Arrow Right',
    escape: 'Escape',
    tab: 'Tab',
    enter: 'Enter',
    backspace: 'Backspace',
  });
  return labels[key] ?? (key.length === 1 ? key.toUpperCase() : key || 'Unbound');
}

function buildFieldset(documentTarget) {
  const fieldset = documentTarget.createElement('fieldset');
  fieldset.className = 'audioSettingsFieldset accessibilitySettingsFieldset';
  fieldset.dataset.accessibilitySettings = 'true';
  const keyOptions = ACCESSIBILITY_REBINDABLE_KEYS.map((key) => option(key, displayKey(key))).join('');
  fieldset.innerHTML = `
    <legend>Visual, motion & controls</legend>
    <div class="accessibilitySettingsGrid">
      <label class="audioSettingChoice"><span>UI scale</span><select data-accessibility-setting="uiScale">${UI_SCALE_OPTIONS.map((value) => option(value, percent(value))).join('')}</select></label>
      <label class="audioSettingChoice"><span>Text scale</span><select data-accessibility-setting="textScale">${TEXT_SCALE_OPTIONS.map((value) => option(value, percent(value))).join('')}</select></label>
      <label class="audioSettingChoice"><span>Color-vision preset</span><select data-accessibility-setting="colorVisionPreset">${COLOR_VISION_PRESETS.map((value) => option(value, value === 'standard' ? 'Standard' : `${value[0].toUpperCase()}${value.slice(1)} assist`)).join('')}</select></label>
      <label class="audioSettingChoice"><span>Contrast</span><select data-accessibility-setting="contrastMode">${CONTRAST_MODES.map((value) => option(value, value === 'high' ? 'High contrast' : 'Standard')).join('')}</select></label>
      <label class="audioSettingChoice"><span>Cursor size</span><select data-accessibility-setting="cursorSize">${CURSOR_SIZES.map((value) => option(value, value.split('-').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' '))).join('')}</select></label>
      <label class="audioSettingChoice"><input data-accessibility-setting="reducedMotion" type="checkbox" /> <span>Reduce animation and motion</span></label>
      <label class="audioSettingChoice"><input data-accessibility-setting="reduceFlashes" type="checkbox" /> <span>Reduce screen flashes and alert pulses</span></label>
      <label class="audioSettingChoice"><input data-accessibility-setting="pauseOnFocusLoss" type="checkbox" /> <span>Request pause when the game loses focus</span></label>
    </div>
    <div class="accessibilityBindingsHeader"><strong>Key bindings</strong><small> Choose a key, then Assign. A conflicting assignment requires a second confirmation.</small></div>
    <div class="accessibilityBindings" role="group" aria-label="Gameplay key bindings">
      ${INPUT_ACTION_IDS.map((action) => `
        <div class="accessibilityBindingRow">
          <label><span>${INPUT_ACTION_LABELS[action]}</span><select data-accessibility-action="${action}"><option value="">Unbound</option>${keyOptions}</select></label>
          <button type="button" data-accessibility-assign="${action}">Assign</button>
        </div>
      `).join('')}
    </div>
    <p class="accessibilitySettingsStatus" data-accessibility-status role="status" aria-live="polite"></p>
  `;
  return fieldset;
}

function render(fieldset, state, runtimeState) {
  const settings = state.settings;
  for (const control of fieldset.querySelectorAll('[data-accessibility-setting]')) {
    const key = control.dataset.accessibilitySetting;
    if (control.type === 'checkbox') control.checked = Boolean(settings[key]);
    else control.value = String(settings[key]);
  }
  for (const control of fieldset.querySelectorAll('[data-accessibility-action]')) {
    const keys = settings.actionBindings[control.dataset.accessibilityAction] ?? [];
    control.value = keys[0] ?? '';
  }
  const status = fieldset.querySelector('[data-accessibility-status]');
  if (status && status.dataset.locked !== 'true') {
    const saved = ['saved', 'loaded', 'injected'].includes(state.persistence.status);
    const pauseNote = runtimeState.pauseSupported
      ? ' Focus-loss pause is connected.'
      : ' Focus-loss pause requests are exposed for the active menu/runtime owner.';
    status.textContent = `${saved ? 'Accessibility preferences saved locally.' : 'Accessibility preferences are active for this session.'}${pauseNote}`;
  }
}

export function installAccessibilitySettingsUI({
  form,
  storage = null,
  documentTarget = globalThis.document,
  windowTarget = globalThis.window,
  pause = null,
  resume = null,
} = {}) {
  if (!form || typeof form.insertBefore !== 'function' || typeof form.addEventListener !== 'function') {
    throw new TypeError('Accessibility settings UI requires the shared settings form.');
  }
  const fieldset = buildFieldset(documentTarget);
  const insertionPoint = form.querySelector('#audioSettingsStatus') ?? form.querySelector('.audioSettingsActions') ?? null;
  form.insertBefore(fieldset, insertionPoint);
  const runtime = createAccessibilityRuntime({ documentTarget, windowTarget, pause, resume });
  const controller = createAccessibilitySettingsController({ storage, apply: runtime.apply });
  let disposed = false;
  let pendingConflict = null;

  const announce = (message) => {
    const status = fieldset.querySelector('[data-accessibility-status]');
    if (!status) return;
    status.dataset.locked = 'true';
    status.textContent = message;
    windowTarget.setTimeout?.(() => {
      if (disposed) return;
      delete status.dataset.locked;
      render(fieldset, controller.snapshot(), runtime.snapshot());
    }, 3600);
  };

  const unsubscribe = controller.subscribe((state) => render(fieldset, state, runtime.snapshot()), { emitCurrent: true });

  const onChange = (event) => {
    const control = event.target;
    const key = control?.dataset?.accessibilitySetting;
    if (!key) return;
    const value = control.type === 'checkbox'
      ? Boolean(control.checked)
      : key === 'uiScale' || key === 'textScale'
        ? Number(control.value)
        : control.value;
    controller.update({ [key]: value });
  };

  const onClick = (event) => {
    const action = event.target?.dataset?.accessibilityAssign;
    if (!action) return;
    const select = fieldset.querySelector(`[data-accessibility-action="${action}"]`);
    const key = normalizeInputKey(select?.value);
    if (!key) {
      pendingConflict = null;
      controller.unbind(action);
      announce(`${INPUT_ACTION_LABELS[action]} is now unbound.`);
      return;
    }
    const confirmed = pendingConflict?.action === action && pendingConflict?.key === key;
    const result = controller.rebind(action, key, { replace: confirmed });
    if (!result.ok) {
      pendingConflict = { action, key, conflict: result.conflict };
      announce(`${displayKey(key)} is assigned to ${INPUT_ACTION_LABELS[result.conflict]}. Press Assign again to replace it.`);
      return;
    }
    pendingConflict = null;
    announce(`${INPUT_ACTION_LABELS[action]} is now bound to ${displayKey(key)}${result.conflict ? `; ${INPUT_ACTION_LABELS[result.conflict]} was unbound` : ''}.`);
  };

  fieldset.addEventListener('change', onChange);
  fieldset.addEventListener('click', onClick);

  const reset = () => {
    pendingConflict = null;
    return controller.reset();
  };
  const snapshot = () => deepFreeze({ controller: controller.snapshot(), runtime: runtime.snapshot(), disposed });
  const dispose = () => {
    if (disposed) return false;
    fieldset.removeEventListener('change', onChange);
    fieldset.removeEventListener('click', onClick);
    unsubscribe();
    controller.dispose();
    runtime.dispose();
    fieldset.remove();
    disposed = true;
    return true;
  };

  return Object.freeze({ snapshot, update: controller.update, rebind: controller.rebind, unbind: controller.unbind, reset, dispose });
}
