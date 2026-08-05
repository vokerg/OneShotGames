import { DOMAIN_EVENT_TYPES } from '../core/events.js';
import {
  AUDIO_BUS_IDS,
} from './audio-mixer.js';
import {
  AUDIO_DYNAMIC_RANGE_MODES,
  BACKGROUND_AUDIO_POLICIES,
  createAudioSettingsController,
  createBackgroundAudioController,
  isAudioSettingTarget,
} from './audio-settings.js';

const VISUAL_CUE_URGENCIES = new Set(['normal', 'high', 'critical']);

const VISUAL_CUE_DEFAULTS = Object.freeze({
  'ui.alert': Object.freeze({ label: 'Alert', urgency: 'critical' }),
  'ui.error': Object.freeze({ label: 'Command unavailable', urgency: 'high' }),
  'unit.error': Object.freeze({ label: 'Unit cannot comply', urgency: 'high' }),
  'mission.objective': Object.freeze({ label: 'Objective updated', urgency: 'high' }),
  'production.complete': Object.freeze({ label: 'Production complete', urgency: 'normal' }),
  'research.complete': Object.freeze({ label: 'Research complete', urgency: 'normal' }),
  victory: Object.freeze({ label: 'Victory', urgency: 'critical' }),
  defeat: Object.freeze({ label: 'Defeat', urgency: 'critical' }),
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cueKey(payload = {}) {
  return text(payload.cue) ?? text(payload.eventId) ?? text(payload.id) ?? 'audio-event';
}

export function describeAudioVisualCue(payload = {}) {
  const key = cueKey(payload);
  const fallback = VISUAL_CUE_DEFAULTS[key] ?? Object.freeze({ label: 'Audio cue', urgency: 'normal' });
  const direction = text(payload.direction);
  const source = text(payload.sourceLabel) ?? text(payload.source);
  const detail = [source, direction].filter(Boolean).join(' · ');
  return deepFreeze({
    key,
    label: text(payload.visualLabel) ?? text(payload.label) ?? fallback.label,
    urgency: VISUAL_CUE_URGENCIES.has(text(payload.urgency)) ? text(payload.urgency) : fallback.urgency,
    detail,
  });
}

function requiredElement(documentTarget, selector) {
  const element = documentTarget?.querySelector?.(selector);
  if (!element) throw new Error(`Audio settings markup is incomplete: ${selector}`);
  return element;
}

function resolveElements(documentTarget, supplied = {}) {
  const query = (key, selector) => supplied[key] ?? requiredElement(documentTarget, selector);
  return Object.freeze({
    toggle: query('toggle', '#audioSettingsToggle'),
    panel: query('panel', '#audioSettings'),
    close: query('close', '#audioSettingsClose'),
    form: query('form', '#audioSettingsForm'),
    reset: query('reset', '#audioSettingsReset'),
    done: query('done', '#audioSettingsDone'),
    testCue: query('testCue', '#audioVisualCueTest'),
    status: query('status', '#audioSettingsStatus'),
    visualCue: query('visualCue', '#audioVisualCue'),
    background: query('background', '#shell'),
  });
}

function controlList(panel) {
  return [...(panel.querySelectorAll?.('button, input, select, [href], [tabindex]:not([tabindex="-1"])') ?? [])]
    .filter((element) => !element.disabled && element.getAttribute?.('aria-hidden') !== 'true');
}

function setOpenState({ documentTarget, elements, open, previousFocus, backgroundState }) {
  elements.panel.classList.toggle('hidden', !open);
  elements.toggle.setAttribute('aria-expanded', String(open));
  documentTarget?.body?.classList?.toggle('audio-settings-open', open);
  if (open) {
    backgroundState.inert = Boolean(elements.background.inert);
    backgroundState.ariaHidden = elements.background.getAttribute?.('aria-hidden');
    elements.background.inert = true;
    elements.background.setAttribute?.('aria-hidden', 'true');
    const controls = controlList(elements.panel);
    (elements.close ?? controls[0])?.focus?.();
    return documentTarget?.activeElement ?? previousFocus;
  }
  elements.background.inert = backgroundState.inert;
  if (backgroundState.ariaHidden === null || backgroundState.ariaHidden === undefined) elements.background.removeAttribute?.('aria-hidden');
  else elements.background.setAttribute?.('aria-hidden', backgroundState.ariaHidden);
  previousFocus?.focus?.();
  return null;
}

function valuePercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

function renderSettings(elements, snapshot) {
  const { settings, persistence } = snapshot;
  for (const control of elements.form.querySelectorAll?.('[data-audio-level]') ?? []) {
    const target = control.dataset.audioLevel;
    if (!isAudioSettingTarget(target)) continue;
    control.value = String(Math.round(settings.levels[target] * 100));
    const output = elements.form.querySelector?.(`[data-audio-level-output="${target}"]`);
    if (output) output.textContent = valuePercent(settings.levels[target]);
  }
  for (const control of elements.form.querySelectorAll?.('[data-audio-muted]') ?? []) {
    const target = control.dataset.audioMuted;
    if (!isAudioSettingTarget(target)) continue;
    control.checked = settings.muted[target];
  }
  const dynamicRange = elements.form.querySelector?.('[data-audio-setting="dynamicRangeMode"]');
  const background = elements.form.querySelector?.('[data-audio-setting="backgroundPolicy"]');
  const subtitles = elements.form.querySelector?.('[data-audio-setting="subtitles"]');
  const speakerLabels = elements.form.querySelector?.('[data-audio-setting="speakerLabels"]');
  const visualCues = elements.form.querySelector?.('[data-audio-setting="visualCues"]');
  if (dynamicRange) dynamicRange.value = settings.dynamicRangeMode;
  if (background) background.value = settings.backgroundPolicy;
  if (subtitles) subtitles.checked = settings.subtitles;
  if (speakerLabels) {
    speakerLabels.checked = settings.speakerLabels;
    speakerLabels.disabled = !settings.subtitles;
  }
  if (visualCues) visualCues.checked = settings.visualCues;
  elements.status.textContent = persistence.status === 'saved' || persistence.status === 'loaded' || persistence.status === 'injected'
    ? 'Audio preferences saved locally.'
    : persistence.status === 'unavailable' || persistence.status === 'empty'
      ? 'Audio preferences are active for this session.'
      : 'Audio preferences are active, but local persistence is unavailable.';
}

function normalizeLevelInput(control) {
  const value = Number(control.value);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value / 100)) : 0;
}

export function installAudioSettingsAccessibility({
  mixer,
  events = null,
  storage = null,
  documentTarget = globalThis.document,
  windowTarget = globalThis.window,
  elements: suppliedElements = {},
  cueDurationMs = 3200,
} = {}) {
  if (!mixer || typeof mixer.bindUnlock !== 'function' || typeof mixer.dispose !== 'function') {
    throw new TypeError('Audio settings UI requires the shared audio mixer lifecycle.');
  }
  if (!documentTarget || typeof documentTarget.addEventListener !== 'function') {
    throw new TypeError('Audio settings UI requires a document event target.');
  }
  if (!windowTarget || typeof windowTarget.addEventListener !== 'function') {
    throw new TypeError('Audio settings UI requires a window event target.');
  }
  if (!Number.isFinite(cueDurationMs) || cueDurationMs < 0) {
    throw new TypeError('Audio visual cue duration must be a non-negative finite number.');
  }

  const cleanupStack = [];
  let disposed = false;
  const registerCleanup = (cleanup) => {
    if (typeof cleanup !== 'function') throw new TypeError('Audio settings cleanup must be a function.');
    cleanupStack.push(cleanup);
    return cleanup;
  };
  const unwind = () => {
    if (disposed) return false;
    disposed = true;
    const failures = [];
    while (cleanupStack.length) {
      const cleanup = cleanupStack.pop();
      try {
        cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) throw new AggregateError(failures, 'Audio settings cleanup was incomplete.');
    return true;
  };
  registerCleanup(() => {
    const result = mixer.dispose();
    if (result && typeof result.catch === 'function') void result.catch(() => {});
  });

  try {
    const elements = resolveElements(documentTarget, suppliedElements);
    const controller = createAudioSettingsController({ mixer, storage });
    registerCleanup(() => controller.dispose());
    const background = createBackgroundAudioController({ mixer, visibilityTarget: documentTarget });
    registerCleanup(() => background.dispose());
    const disposeUnlock = mixer.bindUnlock(windowTarget);
    registerCleanup(disposeUnlock);
    let previousFocus = null;
    let cueTimer = null;
    const backgroundState = { inert: false, ariaHidden: null };

    const clearCueTimer = () => {
      if (cueTimer !== null) {
        windowTarget.clearTimeout?.(cueTimer);
        cueTimer = null;
      }
    };
    const announceCue = (payload = {}) => {
      const state = controller.snapshot();
      if (!state.settings.visualCues) return deepFreeze({ shown: false, reason: 'disabled' });
      const cue = describeAudioVisualCue(payload);
      clearCueTimer();
      elements.visualCue.textContent = cue.detail ? `${cue.label} — ${cue.detail}` : cue.label;
      elements.visualCue.dataset.urgency = cue.urgency;
      elements.visualCue.classList.remove('hidden');
      cueTimer = windowTarget.setTimeout?.(() => {
        elements.visualCue.classList.add('hidden');
        cueTimer = null;
      }, cueDurationMs) ?? null;
      return deepFreeze({ shown: true, cue });
    };

    const isOpen = () => !elements.panel.classList.contains('hidden');
    const open = () => {
      if (isOpen()) return false;
      previousFocus = documentTarget.activeElement ?? elements.toggle;
      setOpenState({ documentTarget, elements, open: true, previousFocus, backgroundState });
      return true;
    };
    const close = () => {
      if (!isOpen()) return false;
      setOpenState({ documentTarget, elements, open: false, previousFocus, backgroundState });
      previousFocus = null;
      return true;
    };
    const toggle = () => (isOpen() ? close() : open());
    registerCleanup(() => {
      clearCueTimer();
      close();
    });

    const syncBackground = (snapshot = controller.snapshot()) => background.configure({
      backgroundPolicy: snapshot.settings.backgroundPolicy,
      masterMuted: snapshot.settings.muted.master,
    });
    const unsubscribeSettings = controller.subscribe((snapshot) => {
      renderSettings(elements, snapshot);
      syncBackground(snapshot);
    }, { emitCurrent: true });
    registerCleanup(unsubscribeSettings);

    const onFormInput = (event) => {
      const control = event.target;
      const target = control?.dataset?.audioLevel;
      if (!isAudioSettingTarget(target)) return;
      controller.update({ levels: { [target]: normalizeLevelInput(control) } });
    };
    const onFormChange = (event) => {
      const control = event.target;
      const mutedTarget = control?.dataset?.audioMuted;
      if (isAudioSettingTarget(mutedTarget)) {
        controller.update({ muted: { [mutedTarget]: Boolean(control.checked) } });
        return;
      }
      const setting = control?.dataset?.audioSetting;
      if (setting === 'dynamicRangeMode' && AUDIO_DYNAMIC_RANGE_MODES.includes(control.value)) {
        controller.update({ dynamicRangeMode: control.value });
      } else if (setting === 'backgroundPolicy' && BACKGROUND_AUDIO_POLICIES.includes(control.value)) {
        controller.update({ backgroundPolicy: control.value });
      } else if (setting === 'subtitles' || setting === 'speakerLabels' || setting === 'visualCues') {
        controller.update({ [setting]: Boolean(control.checked) });
      }
    };
    const onReset = () => controller.reset();
    const onTestCue = () => announceCue({ cue: 'ui.alert', visualLabel: 'Incoming attack', direction: 'north-east', urgency: 'critical' });
    const onKeyDown = (event) => {
      if (!isOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault?.();
        event.stopPropagation?.();
        close();
        return;
      }
      if (event.key === 'Tab') {
        const controls = controlList(elements.panel);
        if (!controls.length) return;
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && documentTarget.activeElement === first) {
          event.preventDefault?.();
          last.focus?.();
        } else if (!event.shiftKey && documentTarget.activeElement === last) {
          event.preventDefault?.();
          first.focus?.();
        }
      }
      event.stopPropagation?.();
    };
    const addListener = (target, type, listener, options) => {
      target.addEventListener(type, listener, options);
      registerCleanup(() => target.removeEventListener(type, listener, options));
    };

    addListener(elements.toggle, 'click', toggle);
    addListener(elements.close, 'click', close);
    addListener(elements.done, 'click', close);
    addListener(elements.form, 'input', onFormInput);
    addListener(elements.form, 'change', onFormChange);
    addListener(elements.reset, 'click', onReset);
    addListener(elements.testCue, 'click', onTestCue);
    addListener(documentTarget, 'keydown', onKeyDown, true);

    const unsubscribeAudio = events?.subscribe?.(DOMAIN_EVENT_TYPES.AUDIO, (event) => {
      try { announceCue(event.payload ?? {}); } catch { /* accessibility presentation must not affect simulation */ }
    }) ?? (() => {});
    registerCleanup(unsubscribeAudio);

    const snapshot = () => deepFreeze({
      settings: controller.snapshot(),
      background: background.snapshot(),
      panelOpen: isOpen(),
      disposed,
    });

    return Object.freeze({
      snapshot,
      update: controller.update,
      reset: controller.reset,
      announceCue,
      open,
      close,
      dispose: unwind,
    });
  } catch (error) {
    try {
      unwind();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Audio settings installation failed and rollback was incomplete.',
        { cause: error },
      );
    }
    throw error;
  }
}

export const AUDIO_SETTINGS_BUS_IDS = AUDIO_BUS_IDS;
