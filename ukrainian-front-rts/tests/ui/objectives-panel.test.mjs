import assert from 'node:assert/strict';
import test from 'node:test';

import { installObjectivesPanel } from '../../src/ui/objectives-panel.js';

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  values() { return new Set(this.owner.className.split(/\s+/).filter(Boolean)); }
  contains(name) { return this.values().has(name); }
  toggle(name, force) {
    const values = this.values();
    const enabled = force === undefined ? !values.has(name) : force;
    if (enabled) values.add(name); else values.delete(name);
    this.owner.className = [...values].join(' ');
    return enabled;
  }
}

class FakeElement extends EventTarget {
  constructor({ id = '', className = '' } = {}) {
    super();
    this.id = id;
    this.className = className;
    this.classList = new FakeClassList(this);
    this.attributes = new Map();
    this.focusCount = 0;
  }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.focusCount += 1; }
}

class FakeKeyEvent extends Event {
  constructor(key) {
    super('keydown', { cancelable: true });
    this.key = key;
    this.propagationStopped = false;
  }
  stopPropagation() {
    this.propagationStopped = true;
    super.stopPropagation();
  }
}

test('objectives panel is non-modal, Escape-closeable, and restores toggle focus', () => {
  const documentTarget = new EventTarget();
  const button = new FakeElement({ id: 'objectivesBtn' });
  const panel = new FakeElement({ id: 'objectives', className: 'hidden' });
  const runtime = installObjectivesPanel({ button, panel, documentTarget });

  assert.equal(runtime.isOpen(), false);
  assert.equal(button.getAttribute('aria-controls'), 'objectives');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.getAttribute('aria-hidden'), 'true');

  button.dispatchEvent(new Event('click'));
  assert.equal(runtime.isOpen(), true);
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.getAttribute('aria-hidden'), 'false');

  const escape = new FakeKeyEvent('Escape');
  documentTarget.dispatchEvent(escape);
  assert.equal(runtime.isOpen(), false);
  assert.equal(escape.defaultPrevented, true);
  assert.equal(escape.propagationStopped, true);
  assert.equal(button.focusCount, 1);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.getAttribute('aria-hidden'), 'true');

  assert.equal(runtime.dispose(), true);
  assert.equal(runtime.dispose(), false);
});

test('objectives panel teardown restores exact initial visibility and ARIA attributes', () => {
  const documentTarget = new EventTarget();
  const button = new FakeElement({ id: 'objectivesBtn' });
  const panel = new FakeElement({ id: 'objectives' });
  button.setAttribute('aria-controls', 'legacy-panel');
  button.setAttribute('aria-expanded', 'legacy');
  panel.setAttribute('aria-hidden', 'legacy-hidden');

  const runtime = installObjectivesPanel({ button, panel, documentTarget });
  runtime.close();
  assert.equal(panel.classList.contains('hidden'), true);

  runtime.dispose();
  assert.equal(panel.classList.contains('hidden'), false);
  assert.equal(button.getAttribute('aria-controls'), 'legacy-panel');
  assert.equal(button.getAttribute('aria-expanded'), 'legacy');
  assert.equal(panel.getAttribute('aria-hidden'), 'legacy-hidden');

  button.dispatchEvent(new Event('click'));
  assert.equal(panel.classList.contains('hidden'), false, 'disposed toggle listener must stay removed');
});
