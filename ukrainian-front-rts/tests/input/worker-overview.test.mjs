import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKER_TASKS,
  installWorkerOverview,
  selectNextIdleWorker,
  selectWorkersByResource,
  selectWorkersByTask,
  workerOverviewSnapshot,
  workerResourceKind,
  workerTask,
} from '../../src/input/worker-overview.js';

function makeUnit(id, overrides = {}) {
  return {
    id,
    type: overrides.type ?? 'uaEngineer',
    team: overrides.team ?? 'ua',
    hp: overrides.hp ?? 100,
    selected: false,
    order: overrides.order ?? null,
    target: overrides.target ?? null,
    gatherKind: overrides.gatherKind ?? null,
    carryKind: overrides.carryKind ?? null,
    carry: overrides.carry ?? 0,
  };
}

function makeGame(units, pendingBuild = null) {
  return {
    units,
    pendingBuild,
    selected: new Set(),
    primarySelectedId: null,
    gameOver: false,
    unitStats(type) {
      return { worker: type === 'uaEngineer' };
    },
    select(entity, add = false) {
      if (!add) {
        this.selected.clear();
        this.units.forEach((unit) => { unit.selected = false; });
      }
      if (!entity) return;
      this.selected.add(entity.id);
      entity.selected = true;
    },
    selectedEntities() {
      return this.units.filter((unit) => this.selected.has(unit.id));
    },
  };
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.disabled = false;
    this.textContent = '';
    this.parent = null;
    this.style = {};
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = value;
    const strongMatch = value.match(/<strong[^>]*>(.*?)<\/strong>/);
    const smallMatch = value.match(/<small[^>]*>(.*?)<\/small>/);
    this.children = [];
    if (strongMatch) {
      const strong = new FakeElement('strong');
      strong.textContent = strongMatch[1];
      this.appendChild(strong);
    }
    if (smallMatch) {
      const small = new FakeElement('small');
      small.textContent = smallMatch[1];
      this.appendChild(small);
    }
  }

  get innerHTML() { return this._innerHTML; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  insertBefore(child, before) {
    child.parent = this;
    const index = this.children.indexOf(before);
    if (index < 0) this.children.push(child);
    else this.children.splice(index, 0, child);
    return child;
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  click(event = {}) { this.listeners.get('click')?.({ type: 'click', ...event }); }
  querySelector(selector) {
    if (selector === 'small') return this.children.find((child) => child.tagName === 'small') || null;
    return null;
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

class FakeWindow {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  keydown(key, extra = {}) {
    let prevented = false;
    this.listeners.get('keydown')?.({
      key,
      repeat: false,
      shiftKey: false,
      preventDefault() { prevented = true; },
      ...extra,
    });
    return prevented;
  }
}

function makeDocument() {
  const topbar = new FakeElement('div');
  const objectives = new FakeElement('button');
  topbar.appendChild(objectives);
  const stats = new FakeElement('p');
  return {
    topbar,
    objectives,
    stats,
    createElement(tagName) { return new FakeElement(tagName); },
    querySelector(selector) {
      if (selector === '#topbar') return topbar;
      if (selector === '#objectivesBtn') return objectives;
      if (selector === '#selectionStats') return stats;
      return null;
    },
  };
}

test('classifies worker tasks and resource assignments', () => {
  assert.equal(workerTask(makeUnit(1)), WORKER_TASKS.IDLE);
  assert.equal(workerTask(makeUnit(2, { order: { kind: 'gather', resourceKind: 'metal' } })), WORKER_TASKS.GATHERING);
  assert.equal(workerTask(makeUnit(3, { order: { kind: 'return', resourceKind: 'fuel' } })), WORKER_TASKS.RETURNING);
  assert.equal(workerTask(makeUnit(4), { workerId: 4 }), WORKER_TASKS.BUILDING);
  assert.equal(workerTask(makeUnit(5, { order: { kind: 'move' } })), WORKER_TASKS.OTHER);
  assert.equal(workerResourceKind(makeUnit(6, { gatherKind: 'intel' })), 'intel');
  assert.equal(workerResourceKind(makeUnit(7, { carryKind: 'unknown' })), null);
});

test('builds deterministic task, resource, and carried-resource summaries', () => {
  const game = makeGame([
    makeUnit(9, { order: { kind: 'return', resourceKind: 'fuel' }, carryKind: 'fuel', carry: 17.9 }),
    makeUnit(3),
    makeUnit(7, { order: { kind: 'gather', resourceKind: 'metal' }, carryKind: 'metal', carry: 8 }),
    makeUnit(2, { type: 'uaInfantry' }),
    makeUnit(4, { team: 'ru' }),
  ]);
  const snapshot = workerOverviewSnapshot(game);
  assert.deepEqual(snapshot.workers.map((worker) => worker.id), [3, 7, 9]);
  assert.equal(snapshot.taskCounts.idle, 1);
  assert.equal(snapshot.taskCounts.gathering, 1);
  assert.equal(snapshot.taskCounts.returning, 1);
  assert.equal(snapshot.resourceCounts.metal, 1);
  assert.equal(snapshot.resourceCounts.fuel, 1);
  assert.equal(snapshot.carried.metal, 8);
  assert.equal(snapshot.carried.fuel, 17.9);
});

test('selects workers by task and resource with stable primary selection', () => {
  const units = [
    makeUnit(8, { order: { kind: 'gather', resourceKind: 'metal' } }),
    makeUnit(2, { order: { kind: 'gather', resourceKind: 'metal' } }),
    makeUnit(5, { order: { kind: 'return', resourceKind: 'fuel' } }),
  ];
  const game = makeGame(units);
  let result = selectWorkersByTask(game, WORKER_TASKS.GATHERING);
  assert.deepEqual(result.workerIds, [2, 8]);
  assert.equal(result.primaryId, 2);
  result = selectWorkersByResource(game, 'fuel');
  assert.deepEqual(result.workerIds, [5]);
  assert.deepEqual([...game.selected], [5]);
});

test('cycles idle workers deterministically and wraps', () => {
  const game = makeGame([makeUnit(9), makeUnit(2), makeUnit(5, { order: { kind: 'move' } })]);
  assert.equal(selectNextIdleWorker(game).primaryId, 2);
  assert.equal(selectNextIdleWorker(game).primaryId, 9);
  assert.equal(selectNextIdleWorker(game).primaryId, 2);
});

test('returns a safe no-op when no idle worker exists', () => {
  const game = makeGame([makeUnit(1, { order: { kind: 'gather', resourceKind: 'metal' } })]);
  assert.deepEqual(selectNextIdleWorker(game), {
    changed: false,
    count: 0,
    primaryId: null,
    workerIds: [],
  });
});

test('empty task and resource filters preserve the current selection', () => {
  const units = [makeUnit(4), makeUnit(1, { order: { kind: 'gather', resourceKind: 'metal' } })];
  const game = makeGame(units);
  game.select(units[0]);
  game.primarySelectedId = 4;

  assert.equal(selectWorkersByTask(game, WORKER_TASKS.RETURNING).changed, false);
  assert.deepEqual([...game.selected], [4]);
  assert.equal(selectWorkersByResource(game, 'intel').changed, false);
  assert.deepEqual([...game.selected], [4]);
  assert.equal(game.primarySelectedId, 4);
});

test('installs HUD buttons, carry display, and named idle-worker hotkey', () => {
  const units = [
    makeUnit(4),
    makeUnit(1, { order: { kind: 'gather', resourceKind: 'metal' }, carryKind: 'metal', carry: 12 }),
  ];
  const game = makeGame(units);
  const documentTarget = makeDocument();
  const windowTarget = new FakeWindow();
  const messages = [];
  const ui = {
    refresh() { documentTarget.stats.textContent = 'Base worker stats'; },
    toast(message) { messages.push(message); },
  };

  const dispose = installWorkerOverview({ game, ui, documentTarget, windowTarget });
  const root = documentTarget.topbar.children[0];
  assert.equal(root.id, 'workerOverview');
  assert.equal(root.children.length, 8);
  assert.equal(root.children[0].querySelector('small').textContent, '1');
  assert.equal(root.children[5].querySelector('small').textContent, '1 · 12');
  assert.equal(root.style.display, 'grid');

  assert.equal(windowTarget.keydown('i'), true);
  assert.deepEqual([...game.selected], [4]);
  assert.equal(messages.at(-1), 'Idle worker selected.');

  game.select(units[1]);
  ui.refresh();
  assert.match(documentTarget.stats.textContent, /Gathering · Carry 12\/40 metal/);

  root.children[5].click();
  assert.deepEqual([...game.selected], [1]);
  assert.match(messages.at(-1), /metal worker selected/);

  dispose();
  assert.equal(documentTarget.topbar.children.includes(root), false);
});
