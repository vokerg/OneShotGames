import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createViewportMetrics, viewportWorldCenter } from '../../src/core/viewport-model.js';
import {
  installRendererViewportPatch,
  resizeRendererViewport,
} from '../../src/render/viewport-runtime.js';
import { installViewportRuntime } from '../../src/ui/viewport-runtime.js';

function styleDeclaration() {
  const values = new Map();
  return {
    width: '',
    height: '',
    getPropertyValue(name) {
      return values.get(name) ?? '';
    },
    setProperty(name, value) {
      values.set(name, String(value));
    },
    removeProperty(name) {
      values.delete(name);
    },
  };
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }
  toggle(name, force) {
    const values = new Set(this.owner.className.split(/\s+/).filter(Boolean));
    const enabled = force === undefined ? !values.has(name) : force;
    if (enabled) values.add(name);
    else values.delete(name);
    this.owner.className = [...values].join(' ');
    return enabled;
  }
}

class FakeElement extends EventTarget {
  constructor(tagName, documentTarget) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = documentTarget;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = styleDeclaration();
    this.attributes = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.textContent = '';
    this.innerHTML = '';
    this.width = 0;
    this.height = 0;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'id') this.id = String(value);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  append(...elements) {
    for (const element of elements) {
      element.parentNode = this;
      this.children.push(element);
    }
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }
  async requestFullscreen() {
    this.ownerDocument.fullscreenElement = this;
    this.ownerDocument.dispatchEvent(new Event('fullscreenchange'));
  }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.documentElement = new FakeElement('html', this);
    this.head = new FakeElement('head', this);
    this.shell = new FakeElement('div', this);
    this.topbar = new FakeElement('div', this);
    this.fullscreenElement = null;
  }
  createElement(tagName) {
    return new FakeElement(tagName, this);
  }
  querySelector(selector) {
    if (selector === '#shell') return this.shell;
    if (selector === '#topbar') return this.topbar;
    return null;
  }
  async exitFullscreen() {
    this.fullscreenElement = null;
    this.dispatchEvent(new Event('fullscreenchange'));
  }
}

class FakeWindow extends EventTarget {
  constructor(documentTarget) {
    super();
    this.document = documentTarget;
    this.innerWidth = 1440;
    this.innerHeight = 900;
    this.devicePixelRatio = 1.5;
    this.frames = new Map();
    this.nextFrame = 1;
    this.visualViewport = new EventTarget();
    this.CustomEvent = class CustomEvent extends Event {
      constructor(type, options = {}) {
        super(type);
        this.detail = options.detail;
      }
    };
  }
  requestAnimationFrame(callback) {
    const id = this.nextFrame++;
    this.frames.set(id, callback);
    return id;
  }
  cancelAnimationFrame(id) {
    this.frames.delete(id);
  }
  flushFrames() {
    const frames = [...this.frames.values()];
    this.frames.clear();
    for (const callback of frames) callback();
  }
}

function context2d() {
  return {
    imageSmoothingEnabled: true,
    transforms: [],
    setTransform(...values) {
      this.transforms.push(values);
    },
  };
}

test('renderer viewport resize scales backing pixels and preserves world center', () => {
  const canvas = new FakeElement('canvas', null);
  const context = context2d();
  const renderer = {
    c: canvas,
    x: context,
    fogCanvas: new FakeElement('canvas', null),
    g: { camera: { x: -260, y: -140, z: 1.25 } },
  };
  const before = createViewportMetrics({ width: 1280, height: 720, pixelRatio: 1 });
  const after = createViewportMetrics({ width: 1920, height: 1080, pixelRatio: 2 });

  resizeRendererViewport(renderer, before);
  const center = viewportWorldCenter(renderer.g.camera, before);
  resizeRendererViewport(renderer, after);

  assert.deepEqual(viewportWorldCenter(renderer.g.camera, after), center);
  assert.equal(canvas.width, 3840);
  assert.equal(canvas.height, 2160);
  assert.equal(canvas.style.width, '1920px');
  assert.equal(renderer.fogCanvas.width, 1920);
  assert.deepEqual(context.transforms.at(-1), [2, 0, 0, 2, 0, 0]);
});

test('renderer patch uses browser metrics and restores the exact prior method', () => {
  class FakeRenderer {}
  const original = function originalResize() {};
  FakeRenderer.prototype.resize = original;
  const documentTarget = new FakeDocument();
  const windowTarget = new FakeWindow(documentTarget);
  const patch = installRendererViewportPatch({ RendererClass: FakeRenderer, windowTarget, documentTarget });
  const instance = Object.assign(new FakeRenderer(), {
    c: new FakeElement('canvas', documentTarget),
    x: context2d(),
    fogCanvas: new FakeElement('canvas', documentTarget),
    g: { camera: { x: 0, y: 0, z: 1 } },
  });

  instance.resize();
  assert.equal(instance.viewportMetrics.cssWidth, 1440);
  assert.equal(instance.c.width, 2160);
  patch.dispose();
  assert.equal(FakeRenderer.prototype.resize, original);
});

test('viewport runtime owns responsive DOM, fullscreen state, and exact teardown', async () => {
  const documentTarget = new FakeDocument();
  const windowTarget = new FakeWindow(documentTarget);
  documentTarget.documentElement.dataset.viewportMode = 'legacy';
  const runtime = installViewportRuntime({ windowTarget, documentTarget });

  assert.equal(runtime.snapshot().layoutMode, 'standard');
  assert.equal(documentTarget.topbar.children[0].id, 'viewportFullscreenToggle');
  assert.equal(documentTarget.shell.children[0].id, 'minimumViewportNotice');
  assert.equal(documentTarget.head.children.length, 1);

  windowTarget.innerWidth = 800;
  windowTarget.innerHeight = 500;
  windowTarget.dispatchEvent(new Event('resize'));
  windowTarget.flushFrames();
  assert.equal(runtime.snapshot().layoutMode, 'minimum');
  assert.equal(documentTarget.documentElement.dataset.viewportMode, 'minimum');
  assert.equal(documentTarget.shell.children[0].className.includes('hidden'), false);

  documentTarget.topbar.children[0].dispatchEvent(new Event('click'));
  await Promise.resolve();
  windowTarget.flushFrames();
  assert.equal(documentTarget.fullscreenElement, documentTarget.documentElement);
  assert.equal(runtime.snapshot().fullscreen, true);

  runtime.dispose();
  assert.equal(documentTarget.topbar.children.length, 0);
  assert.equal(documentTarget.shell.children.length, 0);
  assert.equal(documentTarget.head.children.length, 0);
  assert.equal(documentTarget.documentElement.dataset.viewportMode, 'legacy');
  assert.equal(windowTarget.__fieldsOfResolveViewport, undefined);
});

test('viewport bootstraps execute before main runtime construction', async () => {
  const index = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const rendererBootstrap = index.indexOf('src/render/viewport-runtime-bootstrap.js');
  const uiBootstrap = index.indexOf('src/ui/viewport-runtime-bootstrap.js');
  const main = index.indexOf('src/main.js');
  assert.ok(rendererBootstrap >= 0, 'renderer viewport bootstrap script must be present');
  assert.ok(uiBootstrap > rendererBootstrap, 'UI viewport bootstrap must follow renderer patching');
  assert.ok(main > uiBootstrap, 'both viewport bootstraps must execute before main.js');
});
