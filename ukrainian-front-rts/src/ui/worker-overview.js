export const WORKER_UI_VERSION = 1;

export const WORKER_TASKS = Object.freeze({
  IDLE: 'idle',
  GATHERING: 'gathering',
  RETURNING: 'returning',
  BUILDING: 'building',
  REPAIRING: 'repairing',
  MOVING: 'moving',
  COMBAT: 'combat',
  OTHER: 'other',
});

export const WORKER_RESOURCE_KINDS = Object.freeze(['metal', 'fuel', 'intel']);

export const WORKER_UI_ACTIONS = Object.freeze({
  CYCLE_IDLE: 'worker.cycleIdle',
  SELECT_TASK: 'worker.selectTask',
  SELECT_RESOURCE: 'worker.selectResource',
});

export const WORKER_UI_DEFAULT_BINDINGS = Object.freeze({
  '.': WORKER_UI_ACTIONS.CYCLE_IDLE,
});

export const WORKER_UI_COMMANDS = Object.freeze({
  idleWorker: Object.freeze({
    id: 'idle-worker',
    action: WORKER_UI_ACTIONS.CYCLE_IDLE,
    region: 'selection',
    label: 'Idle worker',
    tooltip: 'Select and focus the next idle worker.',
    defaultKey: '.',
    hotkeyLabel: '.',
  }),
  taskFilter: Object.freeze({
    id: 'worker-task-filter',
    action: WORKER_UI_ACTIONS.SELECT_TASK,
    region: 'selection',
    label: 'Worker tasks',
    tooltip: 'Select workers by their current task.',
    defaultKey: null,
    hotkeyLabel: null,
  }),
  resourceFilter: Object.freeze({
    id: 'worker-resource-filter',
    action: WORKER_UI_ACTIONS.SELECT_RESOURCE,
    region: 'selection',
    label: 'Worker resources',
    tooltip: 'Select workers assigned to a resource type.',
    defaultKey: null,
    hotkeyLabel: null,
  }),
});

const TASK_VALUES = new Set(Object.values(WORKER_TASKS));
const RESOURCE_VALUES = new Set(WORKER_RESOURCE_KINDS);
const EPSILON = 1e-9;

const freeze = (value) => Object.freeze(value);

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new TypeError(`${label} must be a finite number.`);
  return number;
}

function nonNegative(value, label) {
  const number = finite(value, label);
  if (number < 0) throw new RangeError(`${label} must be non-negative.`);
  return number;
}

function positive(value, label) {
  const number = finite(value, label);
  if (number <= 0) throw new RangeError(`${label} must be positive.`);
  return number;
}

function stableId(worker) {
  if (worker?.id === undefined || worker?.id === null || worker.id === '') {
    throw new TypeError('Worker snapshots require a stable id.');
  }
  return String(worker.id);
}

function normalizeIds(values, label = 'Worker selection') {
  const source = values instanceof Set ? [...values] : values ?? [];
  if (!Array.isArray(source)) throw new TypeError(`${label} must be an array or Set.`);
  return [...new Set(source.map((value) => String(value)))].sort();
}

function isLivingWorker(worker) {
  return Boolean(worker && worker.destroyed !== true && worker.alive !== false && !(Number.isFinite(worker.hp) && worker.hp <= 0));
}

function explicitTask(worker) {
  const task = worker?.workerTask ?? worker?.task;
  return TASK_VALUES.has(task) ? task : null;
}

function normalizedOrderKind(worker) {
  const value = worker?.order?.kind ?? worker?.orderKind ?? null;
  return value === null || value === undefined ? null : String(value);
}

export function classifyWorkerTask(worker) {
  if (!isLivingWorker(worker)) return null;
  const explicit = explicitTask(worker);
  if (explicit) return explicit;

  const orderKind = normalizedOrderKind(worker);
  if (orderKind === 'gather') return WORKER_TASKS.GATHERING;
  if (orderKind === 'return') return WORKER_TASKS.RETURNING;
  if (['build', 'construct', 'construction'].includes(orderKind)) return WORKER_TASKS.BUILDING;
  if (['repair', 'returnForRepair', 'return-for-repair'].includes(orderKind)) return WORKER_TASKS.REPAIRING;
  if (['move', 'patrol', 'guard', 'follow'].includes(orderKind)) return WORKER_TASKS.MOVING;
  if (['attack', 'attackMove', 'attackGround', 'forceFire'].includes(orderKind)) return WORKER_TASKS.COMBAT;
  if (!orderKind && !worker?.target) return WORKER_TASKS.IDLE;
  return WORKER_TASKS.OTHER;
}

export function workerResourceKind(worker) {
  const candidates = [
    worker?.resourceKind,
    worker?.order?.resourceKind,
    worker?.gatherKind,
    worker?.carryKind,
  ];
  return candidates.find((kind) => RESOURCE_VALUES.has(kind)) ?? null;
}

function carriedSnapshot(worker, defaultCarryCapacity) {
  const amount = nonNegative(worker?.carry ?? worker?.carriedAmount ?? 0, 'Worker carried amount');
  const capacity = positive(worker?.carryCapacity ?? defaultCarryCapacity, 'Worker carry capacity');
  const kind = amount > EPSILON && RESOURCE_VALUES.has(worker?.carryKind) ? worker.carryKind : null;
  const fillRatio = Math.max(0, Math.min(1, amount / capacity));
  return freeze({
    kind,
    amount,
    capacity,
    fillRatio,
    full: amount >= capacity - EPSILON,
    label: kind ? `${amount}/${capacity} ${kind}` : `${amount}/${capacity}`,
  });
}

function workerSnapshot(worker, selectedIds, defaultCarryCapacity) {
  const id = stableId(worker);
  const task = classifyWorkerTask(worker);
  const resourceKind = workerResourceKind(worker);
  const x = Number.isFinite(worker?.x) ? worker.x : null;
  const y = Number.isFinite(worker?.y) ? worker.y : null;
  return freeze({
    id,
    type: worker?.type == null ? null : String(worker.type),
    task,
    resourceKind,
    selected: selectedIds.has(id),
    idle: task === WORKER_TASKS.IDLE,
    position: x === null || y === null ? null : freeze({ x, y }),
    carried: carriedSnapshot(worker, defaultCarryCapacity),
  });
}

function zeroTaskCounts() {
  return Object.fromEntries(Object.values(WORKER_TASKS).map((task) => [task, 0]));
}

function zeroResourceCounts() {
  return Object.fromEntries([...WORKER_RESOURCE_KINDS, 'unassigned'].map((kind) => [kind, 0]));
}

function zeroCarriedTotals() {
  return Object.fromEntries(WORKER_RESOURCE_KINDS.map((kind) => [kind, 0]));
}

export function createWorkerOverviewSnapshot(workers, {
  selectedIds = [],
  defaultCarryCapacity = 40,
} = {}) {
  if (!Array.isArray(workers)) throw new TypeError('Worker overview requires an array of workers.');
  positive(defaultCarryCapacity, 'Default worker carry capacity');
  const selected = new Set(normalizeIds(selectedIds));
  const normalizedWorkers = workers
    .filter(isLivingWorker)
    .map((worker) => workerSnapshot(worker, selected, defaultCarryCapacity))
    .sort((left, right) => left.id.localeCompare(right.id));

  const taskCounts = zeroTaskCounts();
  const resourceCounts = zeroResourceCounts();
  const carriedTotals = zeroCarriedTotals();
  for (const worker of normalizedWorkers) {
    taskCounts[worker.task] += 1;
    resourceCounts[worker.resourceKind ?? 'unassigned'] += 1;
    if (worker.carried.kind) carriedTotals[worker.carried.kind] += worker.carried.amount;
  }

  return freeze({
    schemaVersion: WORKER_UI_VERSION,
    region: 'selection',
    workerCount: normalizedWorkers.length,
    idleWorkerCount: taskCounts[WORKER_TASKS.IDLE],
    selectedWorkerCount: normalizedWorkers.filter((worker) => worker.selected).length,
    workers: freeze(normalizedWorkers),
    taskCounts: freeze(taskCounts),
    resourceCounts: freeze(resourceCounts),
    carriedTotals: freeze(carriedTotals),
    commands: WORKER_UI_COMMANDS,
  });
}

function assertSnapshot(snapshot) {
  if (!snapshot || snapshot.schemaVersion !== WORKER_UI_VERSION || !Array.isArray(snapshot.workers)) {
    throw new TypeError('Worker overview selection requires a worker overview snapshot.');
  }
}

export function workerIdsForTask(snapshot, task, { resourceKind = null } = {}) {
  assertSnapshot(snapshot);
  if (!TASK_VALUES.has(task)) throw new RangeError(`Unknown worker task: ${String(task)}`);
  if (resourceKind !== null && !RESOURCE_VALUES.has(resourceKind)) {
    throw new RangeError(`Unknown worker resource kind: ${String(resourceKind)}`);
  }
  return freeze(snapshot.workers
    .filter((worker) => worker.task === task && (resourceKind === null || worker.resourceKind === resourceKind))
    .map((worker) => worker.id));
}

export function workerIdsForResource(snapshot, resourceKind) {
  assertSnapshot(snapshot);
  if (!RESOURCE_VALUES.has(resourceKind)) throw new RangeError(`Unknown worker resource kind: ${String(resourceKind)}`);
  return freeze(snapshot.workers.filter((worker) => worker.resourceKind === resourceKind).map((worker) => worker.id));
}

export function createWorkerUiBindings(overrides = {}) {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new TypeError('Worker UI key-binding overrides must be an object.');
  }
  const bindings = { ...WORKER_UI_DEFAULT_BINDINGS };
  for (const [key, action] of Object.entries(overrides)) {
    const normalized = String(key).trim().toLowerCase();
    if (!normalized) continue;
    if (action === null) delete bindings[normalized];
    else if (!Object.values(WORKER_UI_ACTIONS).includes(action)) throw new RangeError(`Unknown worker UI action: ${String(action)}`);
    else bindings[normalized] = action;
  }
  return freeze(bindings);
}

export function resolveWorkerUiAction(bindings, key) {
  if (!bindings || typeof bindings !== 'object') throw new TypeError('Worker UI key bindings must be an object.');
  return bindings[String(key ?? '').trim().toLowerCase()] ?? null;
}

function nextSelection(current, requested, append) {
  return append
    ? normalizeIds([...current, ...requested])
    : normalizeIds(requested);
}

export class WorkerOverviewController {
  constructor({
    workers,
    selectedIds = () => [],
    applySelection,
    focusWorker = null,
    defaultCarryCapacity = 40,
  } = {}) {
    if (typeof workers !== 'function') throw new TypeError('Worker overview controller requires workers().');
    if (typeof selectedIds !== 'function') throw new TypeError('Worker overview controller selectedIds must be a function.');
    if (typeof applySelection !== 'function') throw new TypeError('Worker overview controller requires applySelection().');
    if (focusWorker !== null && typeof focusWorker !== 'function') throw new TypeError('Worker overview controller focusWorker must be null or a function.');
    positive(defaultCarryCapacity, 'Default worker carry capacity');
    this.readWorkers = workers;
    this.readSelectedIds = selectedIds;
    this.applySelection = applySelection;
    this.focusWorker = focusWorker;
    this.defaultCarryCapacity = defaultCarryCapacity;
    this.lastIdleWorkerId = null;
  }

  snapshot() {
    return createWorkerOverviewSnapshot(this.readWorkers(), {
      selectedIds: this.readSelectedIds(),
      defaultCarryCapacity: this.defaultCarryCapacity,
    });
  }

  commitSelection(ids, { append = false, focus = false, reason } = {}) {
    const snapshot = this.snapshot();
    const liveIds = new Set(snapshot.workers.map((worker) => worker.id));
    const requested = normalizeIds(ids).filter((id) => liveIds.has(id));
    if (!requested.length) return freeze({ ok: false, reason: 'no-workers', snapshot });
    const nextIds = nextSelection(normalizeIds(this.readSelectedIds()), requested, append);
    this.applySelection(freeze(nextIds), freeze({ append: Boolean(append), reason }));
    const focused = snapshot.workers.find((worker) => worker.id === requested[0]) ?? null;
    if (focus && focused && this.focusWorker) this.focusWorker(focused);
    return freeze({
      ok: true,
      reason: null,
      selectedIds: freeze(nextIds),
      focusedWorkerId: focus && focused ? focused.id : null,
      snapshot,
    });
  }

  cycleIdle({ append = false, focus = true } = {}) {
    const snapshot = this.snapshot();
    const idle = workerIdsForTask(snapshot, WORKER_TASKS.IDLE);
    if (!idle.length) {
      this.lastIdleWorkerId = null;
      return freeze({ ok: false, reason: 'no-idle-workers', snapshot });
    }
    const currentIndex = this.lastIdleWorkerId === null ? -1 : idle.indexOf(this.lastIdleWorkerId);
    const nextId = idle[(currentIndex + 1) % idle.length];
    this.lastIdleWorkerId = nextId;
    return this.commitSelection([nextId], { append, focus, reason: 'cycle-idle-worker' });
  }

  selectTask(task, { resourceKind = null, append = false, focus = false } = {}) {
    const snapshot = this.snapshot();
    const ids = workerIdsForTask(snapshot, task, { resourceKind });
    return this.commitSelection(ids, { append, focus, reason: `select-task:${task}` });
  }

  selectResource(resourceKind, { append = false, focus = false } = {}) {
    const snapshot = this.snapshot();
    const ids = workerIdsForResource(snapshot, resourceKind);
    return this.commitSelection(ids, { append, focus, reason: `select-resource:${resourceKind}` });
  }

  handleAction(action, payload = {}) {
    if (action === WORKER_UI_ACTIONS.CYCLE_IDLE) return this.cycleIdle(payload);
    if (action === WORKER_UI_ACTIONS.SELECT_TASK) return this.selectTask(payload.task, payload);
    if (action === WORKER_UI_ACTIONS.SELECT_RESOURCE) return this.selectResource(payload.resourceKind, payload);
    return freeze({ ok: false, reason: 'unknown-action', action });
  }
}
