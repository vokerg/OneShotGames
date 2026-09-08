import assert from 'node:assert/strict';
import test from 'node:test';

import {
  installLiveRuntimeLocalizationBridge,
  translateLiveRuntimeText,
} from '../../src/localization/live-runtime-bridge-v2.js';

class FakeText {
  constructor(value) {
    this.nodeType = 3;
    this.nodeValue = value;
    this.parentElement = null;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.nodeType = 1;
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.attributes = new Map();
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.childNodes.push(node);
    }
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  querySelectorAll(selector) {
    if (selector !== '*') return [];
    const found = [];
    const visit = (node) => {
      for (const child of node.childNodes || []) {
        if (child.nodeType === 1) {
          found.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return found;
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html');
    this.documentElement.lang = 'en';
    this.body = new FakeElement('body');
    this.listeners = new Map();
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter((entry) => entry !== listener));
  }
  dispatch(type) {
    for (const listener of this.listeners.get(type) || []) listener({ type });
  }
}

test('translates dynamic legacy runtime copy into Ukrainian without partial-word corruption', () => {
  assert.equal(
    translateLiveRuntimeText('Mission deployed. First enemy assault in 70 seconds.', 'uk'),
    'Місію розгорнуто. Перший ворожий штурм через 70 с.',
  );
  assert.equal(translateLiveRuntimeText('Messages (3)', 'uk'), 'Повідомлення (3)');
  assert.equal(translateLiveRuntimeText('Objectives', 'uk'), 'Завдання');
  assert.equal(translateLiveRuntimeText('OBJECTIVE', 'uk'), 'ЗАВДАННЯ');
  assert.equal(translateLiveRuntimeText('National Rally', 'uk'), 'Національне згуртування');
  assert.match(translateLiveRuntimeText('Mechanized Squad is under attack.', 'uk'), /під атакою/u);
  assert.match(translateLiveRuntimeText('Skirmish — Custom Match', 'uk'), /Сутичка/u);
  assert.equal(translateLiveRuntimeText('Pause', 'en'), 'Pause');
});

test('bridge switches legacy text and attributes uk then restores exact English source', () => {
  const documentTarget = new FakeDocument();
  const button = new FakeElement('button');
  const text = new FakeText('Pause');
  button.append(text);
  button.setAttribute('aria-label', 'Resume operation and close menu');
  documentTarget.body.append(button);

  const dispose = installLiveRuntimeLocalizationBridge({ documentTarget, windowTarget: {} });
  assert.equal(text.nodeValue, 'Pause');
  assert.equal(button.getAttribute('aria-label'), 'Resume operation and close menu');

  documentTarget.documentElement.lang = 'uk';
  documentTarget.dispatch('fields-of-resolve:localechange');
  assert.equal(text.nodeValue, 'Пауза');
  assert.equal(button.getAttribute('aria-label'), 'Продовжити операцію та закрити меню');

  documentTarget.documentElement.lang = 'en';
  documentTarget.dispatch('fields-of-resolve:localechange');
  assert.equal(text.nodeValue, 'Pause');
  assert.equal(button.getAttribute('aria-label'), 'Resume operation and close menu');

  documentTarget.documentElement.lang = 'uk';
  documentTarget.dispatch('fields-of-resolve:localechange');
  assert.equal(text.nodeValue, 'Пауза');
  assert.equal(dispose(), true);
  assert.equal(text.nodeValue, 'Pause');
  assert.equal(button.getAttribute('aria-label'), 'Resume operation and close menu');
});
