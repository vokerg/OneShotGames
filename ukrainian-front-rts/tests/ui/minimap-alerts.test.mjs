import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM, WORLD } from '../../src/config.js';
import {
  cameraViewportRect,
  classifyMinimapAlert,
  createMinimapSnapshot,
  MinimapAlertQueue,
  MINIMAP_ALERT_KINDS,
  minimapToWorld,
  worldToMinimap,
} from '../../src/ui/minimap-alerts-model.js';
import {
  installMinimapAlerts,
  renderMinimapSnapshot,
} from '../../src/ui/minimap-alerts.js';

function fakeContext(width = 220, height = 138) {
  const calls = [];
  return {
    canvas: { width, height },
    calls,
    clearRect: (...args) => calls.push(['clearRect', ...args]),
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    strokeRect: (...args) => calls.push(['strokeRect', ...args]),
    beginPath: () => calls.push(['beginPath']),
    moveTo: (...args) => calls.push(['moveTo', ...args]),
    lineTo: (...args) => calls.push(['lineTo', ...args]),
    closePath: () => calls.push(['closePath']),
    stroke: () => calls.push(['stroke']),
    fill: () => calls.push(['fill']),
    arc: (...args) => calls.push(['arc', ...args]),
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
  };
}

function fakeEventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener(type, listener) {
      const entries = listeners.get(type) || new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatch(type, event = {}) {
      for (const listener of listeners.get(type) || []) {
        listener({
          target: this,
          preventDefault() {},
          stopImmediatePropagation() {},
          ...event,
        });
      }
    },
  };
}

function sampleGame() {
  return {
    missionIndex: 0,
    camera: { x: -160, y: -80, z: 1 },
    terrain: Array.from({ length: (WORLD.w / 32) * (WORLD.h / 32) }, (_, index) => index % 3),
    road: [[0, 0], [WORLD.w / 2, WORLD.h / 2], [WORLD.w, WORLD.h]],
    units: [
      { id: 1, type: 'uaInfantry', team: TEAM.UA, x: 220, y: 300, hp: 100, maxHp: 100, selected: true },
      { id: 2, type: 'ruInfantry', team: TEAM.RU, x: 1200, y: 800, hp: 100, maxHp: 100 },
      { id: 3, type: 'observer', team: 'neutral', relationship: 'neutral', x: 700, y: 600, hp: 1, maxHp: 1 },
    ],
    buildings: [
      { id: 4, type: 'hq', team: TEAM.UA, x: 180, y: 1200, hp: 1000, maxHp: 1000 },
    ],
    nodes: [{ x: 500, y: 900, kind: 'metal', amount: 100 }],
    selected: new Set([1]),
    player: { objectives: [false, false, false] },
    productionAcknowledgements: [],
    time: 0,
    unitStats() { return { sight: 240 }; },
    canPlayerSee(point) { return point.x < 900; },
  };
}

test('world/minimap transforms and viewport clipping are reversible', () => {
  const size = { width: 220, height: 138 };
  const world = { x: 1280, y: 832 };
  const mini = worldToMinimap(world, size);
  assert.deepEqual(minimapToWorld(mini, size), world);
  assert.deepEqual(worldToMinimap({ x: -50, y: WORLD.h + 90 }, size), { x: 0, y: 138 });

  const viewport = cameraViewportRect({ camera: { x: -100, y: -50, z: 1 } }, { width: 800, height: 600 });
  assert.deepEqual(viewport, { x: 100, y: 50, width: 800, height: 600 });
});

test('snapshot preserves terrain/fog fidelity and applies relationship filters', () => {
  const game = sampleGame();
  const explored = new Set(['70,20']);
  const snapshot = createMinimapSnapshot(game, {
    exploredCells: explored,
    viewport: { width: 800, height: 600 },
  });

  assert.equal(snapshot.terrain.length, 80 * 52);
  assert.equal(snapshot.road.length, 3);
  assert.equal(snapshot.markers.some((marker) => marker.id === '1' && marker.relationship === 'ally'), true);
  assert.equal(snapshot.markers.some((marker) => marker.id === '2'), false, 'hidden enemy markers must not leak through fog');
  assert.equal(snapshot.markers.some((marker) => marker.relationship === 'neutral'), true);
  assert.ok(snapshot.terrain.some((cell) => cell.visibility === 'visible'));
  assert.ok(snapshot.terrain.some((cell) => cell.visibility === 'hidden'));
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.markers));

  const filtered = createMinimapSnapshot(game, {
    filters: { units: false, resources: false, neutrals: false },
    exploredCells: explored,
  });
  assert.equal(filtered.markers.every((marker) => marker.kind === 'building'), true);
});

test('alert queue is prioritized, bounded, deduplicated, and expires deterministically', () => {
  const queue = new MinimapAlertQueue({ maxAlerts: 3, durationMs: 1000, dedupeMs: 200 });
  const production = queue.push({ kind: 'production', message: 'Unit deployed.', source: 'p1', createdAt: 10 });
  const duplicate = queue.push({ kind: 'production', message: 'Unit deployed.', source: 'p1', createdAt: 100 });
  assert.equal(duplicate.id, production.id);

  queue.push({ kind: 'objective', message: 'Objective complete.', createdAt: 20 });
  queue.push({ kind: 'info', message: 'Scout report.', createdAt: 30 });
  queue.push({ kind: 'attack', message: 'HQ under attack.', worldPosition: { x: -5, y: 9999 }, createdAt: 40 });
  const active = queue.snapshot(50);
  assert.equal(active.length, 3);
  assert.equal(active[0].kind, 'attack');
  assert.deepEqual(active[0].worldPosition, { x: 0, y: WORLD.h });
  assert.equal(queue.prune(1041).length, 0);
  assert.equal(classifyMinimapAlert('Armor deployed from workshop.'), MINIMAP_ALERT_KINDS.PRODUCTION);
  assert.equal(classifyMinimapAlert('Eastern objective secured.'), MINIMAP_ALERT_KINDS.OBJECTIVE);
});

test('runtime emits explicit pings, resets with missions, focuses camera, and restores on dispose', () => {
  const game = sampleGame();
  let time = 0;
  const context = fakeContext();
  const originalMini = () => 'legacy';
  const renderer = { mx: context, mini: originalMini };
  const minimap = fakeEventTarget({
    width: 220,
    height: 138,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 220, height: 138 }),
  });
  const ui = { toast(message) { return message; } };
  const originalToast = ui.toast;
  const documentTarget = { querySelector: () => null };
  const windowTarget = { innerWidth: 800, innerHeight: 600 };

  const dispose = installMinimapAlerts({
    game,
    ui,
    renderer,
    minimap,
    documentTarget,
    windowTarget,
    clock: () => time,
    refreshIntervalMs: 0,
  });

  assert.notEqual(renderer.mini, originalMini);
  const snapshot = renderer.mini();
  assert.equal(snapshot.schema, 'fields-of-resolve.minimap-snapshot');
  assert.ok(context.calls.some(([name]) => name === 'strokeRect'));

  game.units[0].hp = 75;
  time = 500;
  renderer.mini();
  assert.equal(game.minimapAlerts.snapshot().some((alert) => alert.kind === 'attack' && alert.worldPosition.x === 220), true);

  ui.toast('Armor deployed from workshop.');
  assert.equal(game.minimapAlerts.snapshot().filter((alert) => alert.kind === 'production').length, 0, 'ordinary toasts must not create duplicate alerts');
  ui.toast('Reinforcements arrived.', {
    kind: 'production',
    worldPosition: { x: 700, y: 500 },
    source: 'test-explicit-toast',
  });
  assert.equal(game.minimapAlerts.snapshot().some((alert) => alert.kind === 'production'), true);

  game.minimapAlerts.push({ kind: 'objective', message: 'Bridge secured.', worldPosition: { x: 900, y: 700 } });
  assert.equal(game.minimapAlerts.focus({ x: 900, y: 700 }), true);
  assert.equal(game.camera.x, 400 - 900 * game.camera.z);
  assert.equal(game.camera.y, 300 - 700 * game.camera.z);

  game.missionIndex = 1;
  game.units[0].hp = 60;
  time = 0;
  renderer.mini();
  assert.equal(game.minimapAlerts.snapshot().length, 0, 'mission reset must clear stale alerts and rebaseline HP');

  const rendered = renderMinimapSnapshot(fakeContext(), snapshot, { now: time });
  assert.equal(rendered, snapshot);

  dispose();
  assert.equal(renderer.mini, originalMini);
  assert.equal(ui.toast, originalToast);
  assert.equal(game.minimapAlerts, undefined);
});
