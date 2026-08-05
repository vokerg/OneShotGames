import assert from 'node:assert/strict';
import test from 'node:test';

import { WORLD } from '../../src/config.js';
import { installMinimapAlerts } from '../../src/ui/minimap-alerts.js';

function eventTarget(extra = {}) {
  return {
    ...extra,
    addEventListener() {},
    removeEventListener() {},
  };
}

test('minimap alert disposal restores the pre-install queue DOM state', () => {
  const initialMarkup = '<li data-existing="true">Existing queue content</li>';
  const initialClassName = 'minimapAlertQueue seeded';
  const queueRoot = eventTarget({
    innerHTML: initialMarkup,
    className: initialClassName,
    replaceChildren() {
      this.innerHTML = '';
      this.className = 'minimapAlertQueue';
    },
  });
  const documentTarget = {
    querySelector(selector) {
      return selector === '#minimapAlertQueue' ? queueRoot : null;
    },
  };
  const game = {
    missionIndex: 0,
    time: 0,
    camera: { x: 0, y: 0, z: 1 },
    terrain: Array.from({ length: (WORLD.w / 32) * (WORLD.h / 32) }, () => 0),
    road: [],
    units: [],
    buildings: [],
    nodes: [],
    selected: new Set(),
    player: { objectives: [] },
    productionAcknowledgements: [],
    canPlayerSee() { return false; },
  };
  const renderer = { mini() {}, mx: null };
  const minimap = eventTarget({
    width: 220,
    height: 138,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 220, height: 138 }),
  });
  const ui = { toast(message) { return message; } };

  const dispose = installMinimapAlerts({
    game,
    ui,
    renderer,
    minimap,
    documentTarget,
    windowTarget: { innerWidth: 800, innerHeight: 600 },
    clock: () => 0,
  });

  queueRoot.innerHTML = '<li>Runtime alert</li>';
  queueRoot.className = 'minimapAlertQueue';
  dispose();

  assert.equal(queueRoot.innerHTML, initialMarkup);
  assert.equal(queueRoot.className, initialClassName);
});
