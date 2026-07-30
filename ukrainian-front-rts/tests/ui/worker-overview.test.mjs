import assert from 'node:assert/strict';
import test from 'node:test';

import {
  WORKER_TASKS,
  WORKER_UI_ACTIONS,
  WORKER_UI_COMMANDS,
  WorkerOverviewController,
  classifyWorkerTask,
  createWorkerOverviewSnapshot,
  createWorkerUiBindings,
  resolveWorkerUiAction,
  workerIdsForResource,
  workerIdsForTask,
} from '../../src/ui/worker-overview.js';

const worker = (id, overrides = {}) => ({
  id,
  x: Number(id) * 10 || 0,
  y: 20,
  hp: 100,
  carry: 0,
  carryKind: null,
  ...overrides,
});

test('creates stable immutable task, resource, selection, and carried-resource summaries', () => {
  const snapshot = createWorkerOverviewSnapshot([
    worker('3', { order: { kind: 'return', resourceKind: 'fuel' }, carry: 20, carryKind: 'fuel' }),
    worker('1'),
    worker('2', { order: { kind: 'gather', resourceKind: 'metal' }, gatherKind: 'metal', carry: 10, carryKind: 'metal' }),
  ], { selectedIds: new Set(['2']) });

  assert.deepEqual(snapshot.workers.map((entry) => entry.id), ['1', '2', '3']);
  assert.equal(snapshot.workerCount, 3);
  assert.equal(snapshot.idleWorkerCount, 1);
  assert.equal(snapshot.selectedWorkerCount, 1);
  assert.equal(snapshot.taskCounts.gathering, 1);
  assert.equal(snapshot.taskCounts.returning, 1);
  assert.equal(snapshot.resourceCounts.metal, 1);
  assert.equal(snapshot.resourceCounts.fuel, 1);
  assert.equal(snapshot.resourceCounts.unassigned, 1);
  assert.equal(snapshot.carriedTotals.metal, 10);
  assert.equal(snapshot.carriedTotals.fuel, 20);
  assert.equal(snapshot.workers[1].carried.fillRatio, 0.25);
  assert.equal(snapshot.workers[1].selected, true);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.workers));
});

test('classifies current worker orders and excludes destroyed workers from snapshots', () => {
  assert.equal(classifyWorkerTask(worker('a', { order: { kind: 'build' } })), WORKER_TASKS.BUILDING);
  assert.equal(classifyWorkerTask(worker('a', { order: { kind: 'repair' } })), WORKER_TASKS.REPAIRING);
  assert.equal(classifyWorkerTask(worker('a', { order: { kind: 'patrol' } })), WORKER_TASKS.MOVING);
  assert.equal(classifyWorkerTask(worker('a', { order: { kind: 'attack' } })), WORKER_TASKS.COMBAT);
  assert.equal(classifyWorkerTask(worker('a', { target: { id: 'x' } })), WORKER_TASKS.OTHER);
  assert.equal(classifyWorkerTask(worker('a')), WORKER_TASKS.IDLE);
  assert.equal(classifyWorkerTask(worker('a', { hp: 0 })), null);
  assert.equal(createWorkerOverviewSnapshot([worker('a'), worker('b', { destroyed: true })]).workerCount, 1);
});

test('supports deterministic selection by task and resource type', () => {
  const snapshot = createWorkerOverviewSnapshot([
    worker('c', { gatherKind: 'metal' }),
    worker('a', { order: { kind: 'gather', resourceKind: 'fuel' } }),
    worker('b', { order: { kind: 'gather', resourceKind: 'metal' } }),
  ]);
  assert.deepEqual(workerIdsForTask(snapshot, WORKER_TASKS.GATHERING), ['a', 'b']);
  assert.deepEqual(workerIdsForTask(snapshot, WORKER_TASKS.GATHERING, { resourceKind: 'metal' }), ['b']);
  assert.deepEqual(workerIdsForResource(snapshot, 'metal'), ['b', 'c']);
});

test('cycles idle workers deterministically, wraps, and focuses the chosen worker', () => {
  let selected = [];
  const selections = [];
  const focused = [];
  const workers = [worker('b'), worker('a'), worker('c', { order: { kind: 'gather', resourceKind: 'metal' } })];
  const controller = new WorkerOverviewController({
    workers: () => workers,
    selectedIds: () => selected,
    applySelection: (ids, metadata) => { selected = [...ids]; selections.push({ ids, metadata }); },
    focusWorker: (entry) => focused.push(entry.id),
  });

  assert.equal(controller.cycleIdle().focusedWorkerId, 'a');
  assert.equal(controller.cycleIdle().focusedWorkerId, 'b');
  assert.equal(controller.cycleIdle().focusedWorkerId, 'a');
  assert.deepEqual(selected, ['a']);
  assert.deepEqual(focused, ['a', 'b', 'a']);
  assert.equal(selections[0].metadata.reason, 'cycle-idle-worker');
});

test('idle cycling recovers when the previous worker disappears', () => {
  let roster = [worker('a'), worker('b')];
  let selected = [];
  const controller = new WorkerOverviewController({
    workers: () => roster,
    selectedIds: () => selected,
    applySelection: (ids) => { selected = [...ids]; },
  });
  assert.deepEqual(controller.cycleIdle().selectedIds, ['a']);
  roster = [worker('b')];
  assert.deepEqual(controller.cycleIdle().selectedIds, ['b']);
});

test('returns explicit no-idle and no-match outcomes without changing selection', () => {
  let selected = ['existing'];
  const controller = new WorkerOverviewController({
    workers: () => [worker('a', { order: { kind: 'gather', resourceKind: 'metal' } })],
    selectedIds: () => selected,
    applySelection: (ids) => { selected = [...ids]; },
  });
  assert.equal(controller.cycleIdle().reason, 'no-idle-workers');
  assert.equal(controller.selectResource('fuel').reason, 'no-workers');
  assert.deepEqual(selected, ['existing']);
});

test('filtered selection supports append semantics and full replacement', () => {
  let selected = ['z'];
  const controller = new WorkerOverviewController({
    workers: () => [
      worker('a', { order: { kind: 'gather', resourceKind: 'metal' } }),
      worker('b', { order: { kind: 'gather', resourceKind: 'metal' } }),
      worker('z'),
    ],
    selectedIds: () => selected,
    applySelection: (ids) => { selected = [...ids]; },
  });
  assert.deepEqual(controller.selectResource('metal', { append: true }).selectedIds, ['a', 'b', 'z']);
  assert.deepEqual(controller.selectTask(WORKER_TASKS.IDLE).selectedIds, ['z']);
});

test('exposes a period-key idle-worker command and configurable named bindings', () => {
  assert.equal(WORKER_UI_COMMANDS.idleWorker.defaultKey, '.');
  assert.equal(WORKER_UI_COMMANDS.idleWorker.action, WORKER_UI_ACTIONS.CYCLE_IDLE);
  const bindings = createWorkerUiBindings({ '.': null, i: WORKER_UI_ACTIONS.CYCLE_IDLE });
  assert.equal(resolveWorkerUiAction(bindings, '.'), null);
  assert.equal(resolveWorkerUiAction(bindings, 'I'), WORKER_UI_ACTIONS.CYCLE_IDLE);
});

test('dispatches button and hotkey actions through one controller path', () => {
  let selected = [];
  const controller = new WorkerOverviewController({
    workers: () => [worker('a'), worker('b', { gatherKind: 'fuel' })],
    selectedIds: () => selected,
    applySelection: (ids) => { selected = [...ids]; },
  });
  assert.equal(controller.handleAction(WORKER_UI_ACTIONS.CYCLE_IDLE).ok, true);
  assert.deepEqual(selected, ['a']);
  assert.equal(controller.handleAction(WORKER_UI_ACTIONS.SELECT_RESOURCE, { resourceKind: 'fuel' }).ok, true);
  assert.deepEqual(selected, ['b']);
  assert.equal(controller.handleAction('unknown').reason, 'unknown-action');
});

test('validates malformed snapshots, resource filters, bindings, and carry values', () => {
  assert.throws(() => createWorkerOverviewSnapshot(null), /array/);
  assert.throws(() => createWorkerOverviewSnapshot([{}]), /stable id/);
  assert.throws(() => createWorkerOverviewSnapshot([worker('a', { carry: -1 })]), /non-negative/);
  const snapshot = createWorkerOverviewSnapshot([worker('a')]);
  assert.throws(() => workerIdsForTask(snapshot, 'bogus'), /Unknown worker task/);
  assert.throws(() => workerIdsForResource(snapshot, 'bogus'), /Unknown worker resource/);
  assert.throws(() => createWorkerUiBindings({ i: 'bogus' }), /Unknown worker UI action/);
});
