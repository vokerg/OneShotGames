import { TEAM } from '../config.js';
import {
  createKeyBindings,
  INPUT_ACTIONS,
  resolveInputAction,
} from './action-map.js';
import { synchronizePrimarySelection } from './selection-subgroups.js';

export const WORKER_TASKS = Object.freeze({
  IDLE: 'idle',
  GATHERING: 'gathering',
  RETURNING: 'returning',
  BUILDING: 'building',
  OTHER: 'other',
});

export const WORKER_RESOURCE_KINDS = Object.freeze(['metal', 'fuel', 'intel']);
export const WORKER_CARRY_CAPACITY = 40;

const TASK_ORDER = Object.freeze(Object.values(WORKER_TASKS));
const TASK_LABELS = Object.freeze({
  [WORKER_TASKS.IDLE]: 'Idle',
  [WORKER_TASKS.GATHERING]: 'Gathering',
  [WORKER_TASKS.RETURNING]: 'Returning',
  [WORKER_TASKS.BUILDING]: 'Building',
  [WORKER_TASKS.OTHER]: 'Other',
});
const RESOURCE_LABELS = Object.freeze({ metal: 'Metal', fuel: 'Fuel', intel: 'Intel' });

function stableId(left, right) {
  if (typeof left.id === 'number' && typeof right.id === 'number') return left.id - right.id;
  return String(left.id).localeCompare(String(right.id));
}

function finiteNonNegative(value) {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function isLivingFriendlyWorker(game, unit) {
  if (!unit || unit.team !== TEAM.UA || !(unit.hp > 0)) return false;
  const stats = typeof game.unitStats === 'function' ? game.unitStats(unit.type) : null;
  return Boolean(stats?.worker);
}

function unchangedSelection(game) {
  return Object.freeze({
    changed: false,
    count: 0,
    primaryId: game?.primarySelectedId ?? null,
    workerIds: Object.freeze([]),
  });
}

export function workerTask(unit, pendingBuild = null) {
  if (pendingBuild?.workerId === unit?.id || ['build', 'construct', 'construction'].includes(unit?.order?.kind)) {
    return WORKER_TASKS.BUILDING;
  }
  if (unit?.order?.kind === 'gather') return WORKER_TASKS.GATHERING;
  if (unit?.order?.kind === 'return') return WORKER_TASKS.RETURNING;
  if (!unit?.order && !unit?.target) return WORKER_TASKS.IDLE;
  return WORKER_TASKS.OTHER;
}

export function workerResourceKind(unit) {
  const kind = unit?.order?.resourceKind ?? unit?.gatherKind ?? unit?.carryKind ?? null;
  return WORKER_RESOURCE_KINDS.includes(kind) ? kind : null;
}

export function workerOverviewSnapshot(game) {
  if (!game || !Array.isArray(game.units)) throw new TypeError('Worker overview requires game.units.');
  const workers = game.units
    .filter((unit) => isLivingFriendlyWorker(game, unit))
    .sort(stableId)
    .map((unit) => Object.freeze({
      id: unit.id,
      task: workerTask(unit, game.pendingBuild),
      resourceKind: workerResourceKind(unit),
      carryKind: WORKER_RESOURCE_KINDS.includes(unit.carryKind) ? unit.carryKind : null,
      carry: finiteNonNegative(unit.carry),
    }));

  const taskCounts = Object.fromEntries(TASK_ORDER.map((task) => [task, 0]));
  const resourceCounts = Object.fromEntries(WORKER_RESOURCE_KINDS.map((kind) => [kind, 0]));
  const carried = Object.fromEntries(WORKER_RESOURCE_KINDS.map((kind) => [kind, 0]));
  for (const worker of workers) {
    taskCounts[worker.task] += 1;
    if (worker.resourceKind) resourceCounts[worker.resourceKind] += 1;
    if (worker.carryKind) carried[worker.carryKind] += worker.carry;
  }

  return Object.freeze({
    total: workers.length,
    workers: Object.freeze(workers),
    taskCounts: Object.freeze(taskCounts),
    resourceCounts: Object.freeze(resourceCounts),
    carried: Object.freeze(carried),
  });
}

function matchingWorkers(game, { task = null, resourceKind = null } = {}) {
  const snapshot = workerOverviewSnapshot(game);
  const ids = snapshot.workers
    .filter((worker) => (!task || worker.task === task) && (!resourceKind || worker.resourceKind === resourceKind))
    .map((worker) => worker.id);
  return game.units.filter((unit) => ids.includes(unit.id)).sort(stableId);
}

function replaceSelection(game, workers, preferredId = workers[0]?.id ?? null) {
  if (typeof game.select !== 'function' || !(game.selected instanceof Set)) {
    throw new TypeError('Worker selection requires game.select() and game.selected.');
  }
  if (!workers.length) return unchangedSelection(game);
  game.select(null);
  for (const worker of workers) {
    game.selected.add(worker.id);
    worker.selected = true;
  }
  synchronizePrimarySelection(game, preferredId);
  return Object.freeze({
    changed: true,
    count: workers.length,
    primaryId: game.primarySelectedId ?? null,
    workerIds: Object.freeze(workers.map((worker) => worker.id)),
  });
}

export function selectWorkersByTask(game, task) {
  if (!TASK_ORDER.includes(task)) throw new TypeError(`Unknown worker task: ${task}`);
  return replaceSelection(game, matchingWorkers(game, { task }));
}

export function selectWorkersByResource(game, resourceKind) {
  if (!WORKER_RESOURCE_KINDS.includes(resourceKind)) throw new TypeError(`Unknown worker resource: ${resourceKind}`);
  return replaceSelection(game, matchingWorkers(game, { resourceKind }));
}

export function selectNextIdleWorker(game) {
  const workers = matchingWorkers(game, { task: WORKER_TASKS.IDLE });
  if (!workers.length) return unchangedSelection(game);
  const currentId = game.primarySelectedId ?? game.selectedEntities?.()[0]?.id ?? null;
  const currentIndex = workers.findIndex((worker) => worker.id === currentId);
  const next = workers[(currentIndex + 1 + workers.length) % workers.length];
  return replaceSelection(game, [next], next.id);
}

function createButton(documentTarget, { label, title, onClick }) {
  const button = documentTarget.createElement('button');
  button.type = 'button';
  button.className = 'workerOverviewButton';
  button.title = title;
  button.setAttribute('aria-label', title);
  if (button.style) {
    Object.assign(button.style, {
      minWidth: '0',
      padding: '2px 4px',
      fontSize: '10px',
      lineHeight: '1.05',
    });
  }
  button.addEventListener('click', onClick);
  button.innerHTML = `<strong style="display:block;font-size:10px">${label}</strong><small style="display:block;font-size:9px">0</small>`;
  return button;
}

export function installWorkerOverview({
  game,
  ui,
  windowTarget = globalThis.window,
  documentTarget = globalThis.document,
  keyBindings: keyBindingOverrides = {},
} = {}) {
  if (!game || !ui || !documentTarget?.createElement) throw new TypeError('Worker overview requires game, ui, and document.');
  const topbar = documentTarget.querySelector?.('#topbar');
  if (!topbar) throw new Error('Worker overview requires #topbar.');
  const keyBindings = createKeyBindings(keyBindingOverrides);
  const root = documentTarget.createElement('div');
  root.id = 'workerOverview';
  root.className = 'workerOverview';
  root.setAttribute('aria-label', 'Worker task overview');
  if (root.style) {
    Object.assign(root.style, {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, minmax(54px, 1fr))',
      gap: '2px',
      minWidth: '250px',
      maxWidth: '340px',
    });
  }

  const buttons = new Map();
  const selectAndReport = (result, message, emptyMessage = 'No matching workers are available.') => {
    if (result.changed) {
      ui.toast?.(message(result));
      ui.refresh?.();
    } else {
      ui.toast?.(emptyMessage);
    }
  };

  const idleButton = createButton(documentTarget, {
    label: 'Idle',
    title: 'Select next idle worker (I)',
    onClick: (event) => {
      const result = event?.shiftKey
        ? selectWorkersByTask(game, WORKER_TASKS.IDLE)
        : selectNextIdleWorker(game);
      selectAndReport(
        result,
        ({ count }) => event?.shiftKey ? `${count} idle worker${count === 1 ? '' : 's'} selected.` : 'Idle worker selected.',
        'No idle workers are available.',
      );
    },
  });
  buttons.set('task:idle', idleButton);
  root.appendChild(idleButton);

  for (const task of [WORKER_TASKS.GATHERING, WORKER_TASKS.RETURNING, WORKER_TASKS.BUILDING, WORKER_TASKS.OTHER]) {
    const button = createButton(documentTarget, {
      label: TASK_LABELS[task],
      title: `Select ${TASK_LABELS[task].toLowerCase()} workers`,
      onClick: () => {
        const result = selectWorkersByTask(game, task);
        selectAndReport(result, ({ count }) => `${count} ${TASK_LABELS[task].toLowerCase()} worker${count === 1 ? '' : 's'} selected.`);
      },
    });
    buttons.set(`task:${task}`, button);
    root.appendChild(button);
  }

  for (const resourceKind of WORKER_RESOURCE_KINDS) {
    const button = createButton(documentTarget, {
      label: RESOURCE_LABELS[resourceKind],
      title: `Select workers assigned to ${resourceKind}`,
      onClick: () => {
        const result = selectWorkersByResource(game, resourceKind);
        selectAndReport(result, ({ count }) => `${count} ${resourceKind} worker${count === 1 ? '' : 's'} selected.`);
      },
    });
    buttons.set(`resource:${resourceKind}`, button);
    root.appendChild(button);
  }

  const objectivesButton = documentTarget.querySelector?.('#objectivesBtn');
  topbar.insertBefore?.(root, objectivesButton || null) ?? topbar.appendChild(root);

  const originalRefresh = ui.refresh.bind(ui);
  const render = () => {
    const snapshot = workerOverviewSnapshot(game);
    for (const task of TASK_ORDER) {
      const button = buttons.get(`task:${task}`);
      if (!button) continue;
      button.querySelector('small').textContent = String(snapshot.taskCounts[task]);
      button.disabled = snapshot.taskCounts[task] === 0;
    }
    for (const resourceKind of WORKER_RESOURCE_KINDS) {
      const button = buttons.get(`resource:${resourceKind}`);
      const carried = Math.floor(snapshot.carried[resourceKind]);
      button.querySelector('small').textContent = `${snapshot.resourceCounts[resourceKind]} · ${carried}`;
      button.disabled = snapshot.resourceCounts[resourceKind] === 0;
    }

    const selectedWorkers = matchingWorkers(game).filter((worker) => game.selected.has(worker.id));
    if (selectedWorkers.length === 1) {
      const worker = selectedWorkers[0];
      const task = workerTask(worker, game.pendingBuild);
      const carry = finiteNonNegative(worker.carry);
      const carryText = carry > 0 && WORKER_RESOURCE_KINDS.includes(worker.carryKind)
        ? `${Math.floor(carry)}/${WORKER_CARRY_CAPACITY} ${worker.carryKind}`
        : `0/${WORKER_CARRY_CAPACITY}`;
      const stats = documentTarget.querySelector?.('#selectionStats');
      if (stats) stats.textContent = `${stats.textContent} · ${TASK_LABELS[task]} · Carry ${carryText}`;
    }
    return snapshot;
  };
  const installedRefresh = (...args) => {
    const result = originalRefresh(...args);
    render();
    return result;
  };
  ui.refresh = installedRefresh;

  const onKeyDown = (event) => {
    if (event.repeat || resolveInputAction(keyBindings, event.key) !== INPUT_ACTIONS.SELECT_IDLE_WORKER) return;
    event.preventDefault?.();
    if (game.gameOver) return;
    const result = event.shiftKey
      ? selectWorkersByTask(game, WORKER_TASKS.IDLE)
      : selectNextIdleWorker(game);
    selectAndReport(
      result,
      ({ count }) => event.shiftKey ? `${count} idle worker${count === 1 ? '' : 's'} selected.` : 'Idle worker selected.',
      'No idle workers are available.',
    );
  };
  windowTarget?.addEventListener?.('keydown', onKeyDown);
  render();

  return () => {
    windowTarget?.removeEventListener?.('keydown', onKeyDown);
    if (ui.refresh === installedRefresh) ui.refresh = originalRefresh;
    root.remove?.();
  };
}
