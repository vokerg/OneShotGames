import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeAudioVisualCue,
  installAudioSettingsAccessibility,
} from '../../src/audio/audio-settings-ui.js';

class FakeClassList {
  constructor(initial = []) { this.values = new Set(initial); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    if (force === undefined) force = !this.values.has(value);
    if (force) this.values.add(value); else this.values.delete(value);
    return force;
  }
}

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }
  emit(type, event = {}) {
    event.type = type;
    event.target ??= this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    event.stopPropagation ??= () => { event.stopped = true; };
    for (const listener of this.listeners.get(type) ?? []) listener(event);
    return event;
  }
}

class FakeElement extends FakeTarget {
  constructor(documentTarget, { hidden = false } = {}) {
    super();
    this.ownerDocument = documentTarget;
    this.classList = new FakeClassList(hidden ? ['hidden'] : []);
    this.dataset = {};
    this.attributes = new Map();
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.inert = false;
    this.textContent = '';
    this.queryAll = new Map();
    this.queryOne = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelectorAll(selector) { return this.queryAll.get(selector) ?? []; }
  querySelector(selector) { return this.queryOne.get(selector) ?? null; }
  focus() { this.ownerDocument.activeElement = this; this.focused = true; }
}

class FakeDocument extends FakeTarget {
  constructor() {
    super();
    this.hidden = false;
    this.activeElement = null;
    this.body = { classList: new FakeClassList() };
  }
}

class FakeWindow extends FakeTarget {
  constructor() { super(); this.timers = new Map(); this.nextTimer = 1; }
  setTimeout(callback) { const id = this.nextTimer++; this.timers.set(id, callback); return id; }
  clearTimeout(id) { this.timers.delete(id); }
  flushTimers() { for (const callback of [...this.timers.values()]) callback(); this.timers.clear(); }
}

class FakeMixer {
  constructor() {
    this.calls = [];
    this.status = 'running';
    this.disposed = false;
    this.unlockDisposed = false;
  }
  setMasterVolume(value) { this.calls.push(['master-volume', value]); }
  setMasterMuted(value) { this.calls.push(['master-muted', value]); }
  setBusVolume(bus, value) { this.calls.push(['bus-volume', bus, value]); }
  setBusMuted(bus, value) { this.calls.push(['bus-muted', bus, value]); }
  snapshot() { return { status: this.status }; }
  pause() { this.status = 'paused'; this.calls.push(['pause']); return Promise.resolve(true); }
  resume() { this.status = 'running'; this.calls.push(['resume']); return Promise.resolve(true); }
  bindUnlock(target) { this.unlockTarget = target; return () => { this.unlockDisposed = true; }; }
  dispose() { this.disposed = true; return Promise.resolve(); }
}

class FakeEvents {
  subscribe(type, listener) { this.type = type; this.listener = listener; return () => { this.unsubscribed = true; }; }
}

function buildSurface() {
  const documentTarget = new FakeDocument();
  const windowTarget = new FakeWindow();
  const elements = {
    toggle: new FakeElement(documentTarget),
    panel: new FakeElement(documentTarget, { hidden: true }),
    close: new FakeElement(documentTarget),
    form: new FakeElement(documentTarget),
    reset: new FakeElement(documentTarget),
    done: new FakeElement(documentTarget),
    testCue: new FakeElement(documentTarget),
    status: new FakeElement(documentTarget),
    visualCue: new FakeElement(documentTarget, { hidden: true }),
    background: new FakeElement(documentTarget),
  };
  const level = new FakeElement(documentTarget);
  level.dataset.audioLevel = 'music';
  const output = new FakeElement(documentTarget);
  const mute = new FakeElement(documentTarget);
  mute.dataset.audioMuted = 'music';
  const dynamic = new FakeElement(documentTarget);
  dynamic.dataset.audioSetting = 'dynamicRangeMode';
  const background = new FakeElement(documentTarget);
  background.dataset.audioSetting = 'backgroundPolicy';
  const subtitles = new FakeElement(documentTarget);
  subtitles.dataset.audioSetting = 'subtitles';
  const labels = new FakeElement(documentTarget);
  labels.dataset.audioSetting = 'speakerLabels';
  const visual = new FakeElement(documentTarget);
  visual.dataset.audioSetting = 'visualCues';
  elements.form.queryAll.set('[data-audio-level]', [level]);
  elements.form.queryAll.set('[data-audio-muted]', [mute]);
  elements.form.queryOne.set('[data-audio-level-output="music"]', output);
  elements.form.queryOne.set('[data-audio-setting="dynamicRangeMode"]', dynamic);
  elements.form.queryOne.set('[data-audio-setting="backgroundPolicy"]', background);
  elements.form.queryOne.set('[data-audio-setting="subtitles"]', subtitles);
  elements.form.queryOne.set('[data-audio-setting="speakerLabels"]', labels);
  elements.form.queryOne.set('[data-audio-setting="visualCues"]', visual);
  elements.panel.queryAll.set('button, input, select, [href], [tabindex]:not([tabindex="-1"])', [elements.close, level, elements.reset]);
  return { documentTarget, windowTarget, elements, controls: { level, output, mute, dynamic, background, subtitles, labels, visual } };
}

function listenerCount(target, type) {
  return target.listeners.get(type)?.length ?? 0;
}

test('visual cue descriptions prefer accessible labels and preserve direction/source context', () => {
  assert.deepEqual(describeAudioVisualCue({ cue: 'ui.alert', sourceLabel: 'Northern perimeter', direction: 'north-east' }), {
    key: 'ui.alert',
    label: 'Alert',
    urgency: 'critical',
    detail: 'Northern perimeter · north-east',
  });
  assert.equal(describeAudioVisualCue({ cue: 'unknown', visualLabel: 'Drone detected' }).label, 'Drone detected');
});

test('installer renders settings, captures modal input, persists controls, emits visual equivalents, and tears down exactly', () => {
  const surface = buildSurface();
  const mixer = new FakeMixer();
  const events = new FakeEvents();
  const storage = { value: null, getItem() { return this.value; }, setItem(_key, value) { this.value = value; } };
  surface.documentTarget.activeElement = surface.elements.toggle;
  const installed = installAudioSettingsAccessibility({
    mixer,
    events,
    storage,
    documentTarget: surface.documentTarget,
    windowTarget: surface.windowTarget,
    elements: surface.elements,
  });

  assert.equal(surface.controls.level.value, '80');
  assert.equal(surface.controls.output.textContent, '80%');
  assert.equal(surface.elements.status.textContent, 'Audio preferences are active for this session.');

  surface.elements.toggle.emit('click');
  assert.equal(surface.elements.panel.classList.contains('hidden'), false);
  assert.equal(surface.elements.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(surface.documentTarget.body.classList.contains('audio-settings-open'), true);
  assert.equal(surface.documentTarget.activeElement, surface.elements.close);
  assert.equal(surface.elements.background.inert, true);
  assert.equal(surface.elements.background.getAttribute('aria-hidden'), 'true');

  surface.controls.level.value = '35';
  surface.elements.form.emit('input', { target: surface.controls.level });
  assert.equal(installed.snapshot().settings.settings.levels.music, 0.35);
  assert.equal(surface.controls.output.textContent, '35%');
  assert.ok(storage.value.includes('0.35'));

  surface.controls.subtitles.checked = false;
  surface.elements.form.emit('change', { target: surface.controls.subtitles });
  assert.equal(surface.controls.labels.disabled, true);
  assert.equal(installed.snapshot().settings.voice.speakerLabels, false);

  events.listener({ payload: { cue: 'ui.alert', visualLabel: 'Base under attack', direction: 'west' } });
  assert.equal(surface.elements.visualCue.textContent, 'Base under attack — west');
  assert.equal(surface.elements.visualCue.classList.contains('hidden'), false);
  surface.windowTarget.flushTimers();
  assert.equal(surface.elements.visualCue.classList.contains('hidden'), true);

  const escape = surface.documentTarget.emit('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(surface.elements.panel.classList.contains('hidden'), true);
  assert.equal(surface.documentTarget.activeElement, surface.elements.toggle);
  assert.equal(surface.elements.background.inert, false);
  assert.equal(surface.elements.background.getAttribute('aria-hidden'), null);

  assert.equal(installed.dispose(), true);
  assert.equal(installed.dispose(), false);
  assert.equal(events.unsubscribed, true);
  assert.equal(mixer.unlockDisposed, true);
  assert.equal(mixer.disposed, true);
  assert.equal(listenerCount(surface.documentTarget, 'keydown'), 0);
  assert.equal(listenerCount(surface.documentTarget, 'visibilitychange'), 0);
});

test('late installation failure unwinds every previously acquired controller, listener, modal state, unlock hook, and mixer', () => {
  const surface = buildSurface();
  const mixer = new FakeMixer();
  const events = {
    subscribe() {
      throw new Error('subscriber unavailable');
    },
  };

  assert.throws(() => installAudioSettingsAccessibility({
    mixer,
    events,
    documentTarget: surface.documentTarget,
    windowTarget: surface.windowTarget,
    elements: surface.elements,
  }), /subscriber unavailable/);

  assert.equal(mixer.unlockDisposed, true);
  assert.equal(mixer.disposed, true);
  assert.equal(listenerCount(surface.documentTarget, 'visibilitychange'), 0);
  assert.equal(listenerCount(surface.documentTarget, 'keydown'), 0);
  assert.equal(listenerCount(surface.elements.toggle, 'click'), 0);
  assert.equal(listenerCount(surface.elements.close, 'click'), 0);
  assert.equal(listenerCount(surface.elements.done, 'click'), 0);
  assert.equal(listenerCount(surface.elements.form, 'input'), 0);
  assert.equal(listenerCount(surface.elements.form, 'change'), 0);
  assert.equal(listenerCount(surface.elements.reset, 'click'), 0);
  assert.equal(listenerCount(surface.elements.testCue, 'click'), 0);
  assert.equal(surface.elements.panel.classList.contains('hidden'), true);
  assert.equal(surface.documentTarget.body.classList.contains('audio-settings-open'), false);
  assert.equal(surface.elements.background.inert, false);
  assert.equal(surface.elements.background.getAttribute('aria-hidden'), null);
});
