import { BUILDING_TYPES, TEAM, UNIT_TYPES, UPGRADES, WORLD } from '../config.js';
import { createEconomyHudModel, economyHudSignature } from '../core/economy-hud-model.js';
import { describeResearchQueue } from '../systems/research-queue-system.js';

const RESOURCE_LABELS = Object.freeze({ metal: 'Metal', fuel: 'Fuel', intel: 'Intel' });
const WORKER_TASK_LABELS = Object.freeze({
  idle: 'Idle',
  gathering: 'Gathering',
  returning: 'Returning',
  building: 'Building',
  other: 'Other',
});
const COMPLETION_LIMIT = 8;
const COMPLETION_WINDOW_SECONDS = 1.25;

function productionFacilities(game) {
  return (game.buildings || []).filter((building) =>
    building.team === TEAM.UA &&
    (Array.isArray(BUILDING_TYPES[building.type]?.produces) || (building.queue || []).length),
  );
}

function productionSnapshot(game, building) {
  return {
    buildingId: building.id,
    buildingType: building.type,
    name: BUILDING_TYPES[building.type]?.name || building.type,
    selected: game.selected?.has(building.id) || false,
    paused: building.productionPaused,
    repeat: building.productionRepeat,
    repeatBlockedReason: building.productionRepeatBlocked,
    exitBlockedReason: building.productionExitBlocked,
    queue: (building.queue || []).map((item, index) => ({
      ...item,
      id: item.id ?? `${building.id}:queue:${index}`,
      name: UNIT_TYPES[item.type]?.short || UNIT_TYPES[item.type]?.name || item.type,
      remaining: item.left,
      reservedCapacity: item.pop ?? UNIT_TYPES[item.type]?.pop ?? 0,
    })),
    rally: {
      waypoints: building.rallyWaypoints || [],
      blockedReason: building.productionExitBlocked || '',
    },
  };
}

function researchSnapshots(game) {
  const result = [];
  for (const building of game.buildings || []) {
    if (building.team !== TEAM.UA || !building.researchQueueState) continue;
    result.push({
      ...describeResearchQueue(building.researchQueueState, {
        productionBusy: Boolean(building.queue?.length && !building.productionPaused),
      }),
      name: BUILDING_TYPES[building.type]?.name || building.type,
      buildingId: building.id,
    });
  }
  for (const [facilityId, state] of Object.entries(game.researchQueueStates || {})) {
    if (!state || result.some((entry) => entry.facilityId === facilityId)) continue;
    result.push({ ...describeResearchQueue(state), name: facilityId, buildingId: null });
  }
  return result.sort((left, right) => left.facilityId.localeCompare(right.facilityId));
}

function workerTask(unit, pendingBuild) {
  if (pendingBuild?.workerId === unit.id || ['build', 'construct', 'construction'].includes(unit.order?.kind)) return 'building';
  if (unit.order?.kind === 'gather') return 'gathering';
  if (unit.order?.kind === 'return') return 'returning';
  if (!unit.order && !unit.target) return 'idle';
  return 'other';
}

function workerSnapshots(game) {
  const taskCounts = { idle: 0, gathering: 0, returning: 0, building: 0, other: 0 };
  const resourceCounts = { metal: 0, fuel: 0, intel: 0 };
  const carried = { metal: 0, fuel: 0, intel: 0 };
  const workers = (game.units || []).filter((unit) =>
    unit.team === TEAM.UA && unit.hp > 0 && UNIT_TYPES[unit.type]?.worker,
  );
  for (const worker of workers) {
    taskCounts[workerTask(worker, game.pendingBuild)] += 1;
    const resourceKind = worker.order?.resourceKind ?? worker.gatherKind ?? worker.carryKind;
    if (resourceKind && Object.prototype.hasOwnProperty.call(resourceCounts, resourceKind)) resourceCounts[resourceKind] += 1;
    if (worker.carryKind && Object.prototype.hasOwnProperty.call(carried, worker.carryKind)) carried[worker.carryKind] += Math.max(0, Number(worker.carry) || 0);
  }
  return { total: workers.length, taskCounts, resourceCounts, carried };
}

function affordability(game, cost = {}) {
  return Object.entries(cost)
    .filter(([resource, amount]) => (game.player?.[resource] || 0) < amount)
    .map(([resource, amount]) => `Needs ${amount} ${resource}`);
}

function queuedTechIds(game) {
  return new Set(Object.values(game.researchQueueStates || {})
    .flatMap((state) => state?.queue || [])
    .map((item) => item.techId));
}

function prerequisiteSnapshots(game) {
  const rows = [];
  for (const building of productionFacilities(game)) {
    for (const typeId of BUILDING_TYPES[building.type]?.produces || []) {
      const unit = UNIT_TYPES[typeId];
      if (!unit) continue;
      const reasons = [];
      if (building.underConstruction) reasons.push('Facility is under construction');
      if ((building.queue || []).length >= 5) reasons.push('Production queue is full');
      reasons.push(...affordability(game, unit.cost));
      const capacity = game.canReserveCommandCapacity?.(unit.pop || 0);
      if (capacity && !capacity.ok) reasons.push(capacity.reason);
      rows.push({
        id: `${building.id}:${typeId}`,
        kind: 'production',
        label: `${unit.short || unit.name} — ${BUILDING_TYPES[building.type].name}`,
        available: reasons.length === 0,
        reasons,
      });
    }
  }

  const queued = queuedTechIds(game);
  const operationalWorkshop = (game.buildings || []).some((building) =>
    building.team === TEAM.UA && building.type === 'workshop' && building.hp > 0 && !building.underConstruction,
  );
  for (const [upgradeId, upgrade] of Object.entries(UPGRADES)) {
    const reasons = [];
    const done = game.player?.upgrades?.has(upgradeId);
    if (done) reasons.push('Research complete');
    else if (queued.has(upgradeId)) reasons.push('Research queued');
    if (!operationalWorkshop) reasons.push('Requires an operational repair workshop');
    if (upgrade.requires && !game.player?.upgrades?.has(upgrade.requires)) {
      reasons.push(`Requires ${UPGRADES[upgrade.requires]?.name || upgrade.requires}`);
    }
    reasons.push(...affordability(game, upgrade.cost));
    rows.push({
      id: upgradeId,
      kind: 'research',
      label: upgrade.name,
      available: !done && !queued.has(upgradeId) && reasons.length === 0,
      reasons,
    });
  }
  return rows;
}

function capacitySnapshot(game) {
  const current = game.commandCapacitySnapshot?.() || {
    fielded: game.player?.pop || 0,
    reserved: 0,
    used: game.player?.pop || 0,
    capacity: game.player?.cap || 0,
    available: Math.max(0, (game.player?.cap || 0) - (game.player?.pop || 0)),
    overBy: Math.max(0, (game.player?.pop || 0) - (game.player?.cap || 0)),
    state: 'normal',
  };
  const pending = (game.buildings || [])
    .filter((building) => building.team === TEAM.UA && building.underConstruction)
    .reduce((sum, building) => sum + Math.max(0, BUILDING_TYPES[building.type]?.pop || 0), 0);
  return {
    ...current,
    limit: current.capacity,
    forecastLimit: current.capacity + pending,
    forecastAvailable: Math.max(0, current.capacity + pending - current.used),
  };
}

export function createEconomyHudSnapshot(game, { completions = [] } = {}) {
  return createEconomyHudModel({
    resources: game.player || {},
    incomeRates: game.resourceIncomeRates?.() || {},
    workers: workerSnapshots(game),
    production: productionFacilities(game).map((building) => productionSnapshot(game, building)),
    research: researchSnapshots(game),
    researchTree: { screenId: 'techTree', label: 'Open research tree', available: true },
    completions,
    prerequisites: prerequisiteSnapshots(game),
    capacity: capacitySnapshot(game),
  });
}

export function createEconomyCompletionTracker({ limit = COMPLETION_LIMIT } = {}) {
  if (!Number.isInteger(limit) || limit < 1) throw new TypeError('Completion tracker limit must be a positive integer.');
  let previous = new Map();
  let completions = [];
  let sequence = 0;
  let missionKey = null;
  let lastTime = 0;
  const ignored = new Set();

  const reset = () => {
    previous = new Map();
    completions = [];
    sequence = 0;
    missionKey = null;
    lastTime = 0;
    ignored.clear();
  };

  const observe = (model, { mission = '', time = 0 } = {}) => {
    const nextMission = String(mission ?? '');
    const nextTime = Number.isFinite(time) ? time : 0;
    const restarted = missionKey !== null && (nextMission !== missionKey || nextTime < lastTime);
    if (restarted) {
      previous = new Map();
      completions = [];
      sequence = 0;
      ignored.clear();
    }
    missionKey = nextMission;
    lastTime = nextTime;

    const current = new Map(model.globalQueue.map((entry) => [entry.id, entry]));
    if (previous.size) {
      for (const [id, entry] of previous) {
        if (current.has(id)) continue;
        if (ignored.delete(id)) continue;
        const naturallyFinished = entry.position === 0 &&
          (entry.percent >= 99 || entry.remaining <= COMPLETION_WINDOW_SECONDS);
        if (!naturallyFinished) continue;
        completions.unshift(Object.freeze({
          id: `completion:${sequence}:${id}`,
          sequence: sequence++,
          kind: entry.kind,
          sourceId: entry.sourceId,
          buildingId: entry.buildingId,
          sourceName: entry.sourceName,
          name: entry.name,
        }));
      }
      completions = completions.slice(0, limit);
    }
    previous = current;
    return Object.freeze([...completions]);
  };

  return Object.freeze({
    observe,
    ignore: (id) => { if (id) ignored.add(String(id)); },
    reset,
    snapshot: () => Object.freeze([...completions]),
  });
}

function node(documentTarget, tag, className = '', text = '') {
  const result = documentTarget.createElement(tag);
  result.className = className;
  result.textContent = text;
  return result;
}

function action(documentTarget, text, name, data = {}, disabled = false) {
  const result = node(documentTarget, 'button', 'economyHudAction', text);
  result.type = 'button';
  result.dataset.action = name;
  Object.entries(data).forEach(([key, value]) => { result.dataset[key] = String(value); });
  result.disabled = disabled;
  return result;
}

function meter(documentTarget, percent) {
  const track = node(documentTarget, 'span', 'economyHudProgress');
  const fill = node(documentTarget, 'span', 'economyHudProgressFill');
  fill.style.width = `${percent}%`;
  track.append(fill);
  return track;
}

function renderResources(documentTarget, model) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  section.append(node(documentTarget, 'h3', '', 'Economy flow'));
  const grid = node(documentTarget, 'div', 'economyHudResourceGrid');
  for (const resource of model.resources) {
    const row = node(documentTarget, 'div', 'economyHudResource');
    row.append(
      node(documentTarget, 'strong', '', RESOURCE_LABELS[resource.id] || resource.id),
      node(documentTarget, 'span', '', String(Math.floor(resource.amount))),
      node(documentTarget, 'small', '', `+${Math.floor(resource.incomePerMinute)}/min delivered`),
    );
    grid.append(row);
  }
  section.append(grid);
  return section;
}

function renderWorkers(documentTarget, workers) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  section.append(
    node(documentTarget, 'h3', '', 'Worker allocation'),
    node(documentTarget, 'p', '', `${workers.total} active worker${workers.total === 1 ? '' : 's'}`),
  );
  const taskGrid = node(documentTarget, 'div', 'economyHudWorkerGrid');
  for (const task of workers.tasks) {
    const row = node(documentTarget, 'div', `economyHudWorkerTask${task.id === 'idle' && task.count ? ' warning' : ''}`);
    row.append(node(documentTarget, 'strong', '', String(task.count)), node(documentTarget, 'small', '', WORKER_TASK_LABELS[task.id] || task.id));
    taskGrid.append(row);
  }
  section.append(taskGrid);
  const resources = node(documentTarget, 'div', 'economyHudWorkerResources');
  for (const resource of workers.resources) {
    resources.append(node(
      documentTarget,
      'small',
      '',
      `${RESOURCE_LABELS[resource.id] || resource.id}: ${resource.count} assigned · ${Math.floor(resource.carried)} carried`,
    ));
  }
  section.append(resources);
  return section;
}

function renderGlobalQueue(documentTarget, entries) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  section.append(node(documentTarget, 'h3', '', 'Global queues'));
  if (!entries.length) section.append(node(documentTarget, 'p', 'economyHudEmpty', 'No production or research is queued.'));
  for (const entry of entries) {
    const row = node(documentTarget, 'article', `economyHudGlobalQueue ${entry.kind} ${entry.status}`);
    const header = node(documentTarget, 'div', 'economyHudCardHeader');
    header.append(
      node(documentTarget, 'strong', '', entry.name),
      action(documentTarget, 'Go to', 'focus-queue-source', { buildingId: entry.buildingId }, entry.buildingId == null),
    );
    row.append(
      header,
      node(documentTarget, 'small', '', `${entry.sourceName} · ${entry.kind} · ${entry.status}`),
      meter(documentTarget, entry.percent),
      node(documentTarget, 'small', '', `${entry.percent}% · ${Math.ceil(entry.remaining)}s remaining`),
    );
    section.append(row);
  }
  return section;
}

function renderProduction(documentTarget, entries) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  section.append(node(documentTarget, 'h3', '', 'Production controls'));
  if (!entries.length) section.append(node(documentTarget, 'p', 'economyHudEmpty', 'No Ukrainian production facilities.'));
  for (const entry of entries) {
    const card = node(documentTarget, 'article', `economyHudCard${entry.selected ? ' selected' : ''}`);
    const header = node(documentTarget, 'div', 'economyHudCardHeader');
    header.append(
      node(documentTarget, 'strong', '', entry.name),
      action(documentTarget, 'Focus', 'focus-building', { buildingId: entry.buildingId }),
    );
    card.append(header, node(documentTarget, 'small', '', `${entry.paused ? 'PAUSED' : 'RUNNING'} · ${entry.repeat ? 'REPEAT' : 'SINGLE'}`));
    const warning = entry.repeatBlockedReason || entry.exitBlockedReason;
    if (warning) card.append(node(documentTarget, 'p', 'economyHudWarning', warning));
    if (!entry.queue.length) card.append(node(documentTarget, 'p', 'economyHudEmpty', 'Queue empty'));
    for (const item of entry.queue) {
      const row = node(documentTarget, 'div', 'economyHudQueueItem');
      const label = node(documentTarget, 'div', 'economyHudQueueLabel');
      label.append(
        node(documentTarget, 'span', '', `${item.index + 1}. ${item.name}`),
        node(documentTarget, 'small', '', `${item.percent}% · ${Math.ceil(item.remaining)}s`),
      );
      const controls = node(documentTarget, 'div', 'economyHudQueueControls');
      controls.append(
        action(documentTarget, '↑', 'move-production', { buildingId: entry.buildingId, fromIndex: item.index, toIndex: item.index - 1 }, !item.canMoveUp),
        action(documentTarget, '↓', 'move-production', { buildingId: entry.buildingId, fromIndex: item.index, toIndex: item.index + 1 }, !item.canMoveDown),
        action(documentTarget, 'Cancel', 'cancel-production', { buildingId: entry.buildingId, index: item.index, globalQueueId: `production:${entry.buildingId}:${item.id}` }, !item.canCancel),
      );
      row.append(label, meter(documentTarget, item.percent), controls);
      card.append(row);
    }
    if (entry.queue.length) {
      const controls = node(documentTarget, 'div', 'economyHudQueueControls');
      controls.append(
        action(documentTarget, entry.paused ? 'Resume' : 'Pause', 'set-production-paused', { buildingId: entry.buildingId, paused: !entry.paused }),
        action(documentTarget, entry.repeat ? 'Repeat off' : 'Repeat on', 'set-production-repeat', { buildingId: entry.buildingId, repeat: !entry.repeat }),
      );
      card.append(controls);
    }
    const rally = entry.rally.waypoints;
    card.append(node(documentTarget, 'p', 'economyHudRally', rally.length
      ? `Rally: ${rally.map(({ x, y }) => `${Math.round(x)},${Math.round(y)}`).join(' → ')}`
      : 'Rally: facility exit'));
    const rallyControls = node(documentTarget, 'div', 'economyHudQueueControls');
    rallyControls.append(
      action(documentTarget, 'Rally to view', 'set-production-rally-view', { buildingId: entry.buildingId, append: false }),
      action(documentTarget, 'Append view', 'set-production-rally-view', { buildingId: entry.buildingId, append: true }),
      action(documentTarget, 'Focus rally', 'focus-production-rally', { buildingId: entry.buildingId }, !rally.length),
      action(documentTarget, 'Clear rally', 'clear-production-rally', { buildingId: entry.buildingId }, !rally.length),
    );
    card.append(rallyControls);
    section.append(card);
  }
  return section;
}

function renderResearch(documentTarget, model) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  const header = node(documentTarget, 'div', 'economyHudCardHeader');
  header.append(
    node(documentTarget, 'h3', '', 'Research controls'),
    action(documentTarget, model.researchTree.label, 'open-research-tree', { screenId: model.researchTree.screenId }, !model.researchTree.available),
  );
  section.append(header);
  if (model.researchTree.reason) section.append(node(documentTarget, 'p', 'economyHudWarning', model.researchTree.reason));
  if (!model.research.length) section.append(node(documentTarget, 'p', 'economyHudEmpty', 'Construct a repair workshop to host modernization research.'));
  for (const facility of model.research) {
    const card = node(documentTarget, 'article', 'economyHudCard');
    const cardHeader = node(documentTarget, 'div', 'economyHudCardHeader');
    cardHeader.append(
      node(documentTarget, 'strong', '', facility.name),
      facility.buildingId == null ? node(documentTarget, 'span') : action(documentTarget, 'Focus', 'focus-building', { buildingId: facility.buildingId }),
    );
    card.append(cardHeader);
    if (facility.blockedReason) card.append(node(documentTarget, 'p', 'economyHudWarning', facility.blockedReason));
    if (!facility.items.length) card.append(node(documentTarget, 'p', 'economyHudEmpty', 'Research queue empty'));
    for (const item of facility.items) {
      const row = node(documentTarget, 'div', 'economyHudQueueItem');
      row.append(
        node(documentTarget, 'span', '', `${item.name} · ${item.status}`),
        meter(documentTarget, item.percent),
        action(documentTarget, 'Cancel', 'cancel-research', {
          facilityId: facility.facilityId,
          itemId: item.id,
          globalQueueId: `research:${facility.facilityId}:${item.id}`,
        }, !item.cancellable),
      );
      card.append(row);
    }
    if (facility.items.length) {
      card.append(action(
        documentTarget,
        facility.paused ? 'Resume research' : 'Pause research',
        'set-research-paused',
        { facilityId: facility.facilityId, paused: !facility.paused },
      ));
    }
    section.append(card);
  }
  return section;
}

function renderCompletions(documentTarget, completions) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  section.append(node(documentTarget, 'h3', '', 'Recent completions'));
  if (!completions.length) section.append(node(documentTarget, 'p', 'economyHudEmpty', 'Completed production and research will appear here.'));
  for (const completion of completions) {
    const row = node(documentTarget, 'div', 'economyHudCompletion');
    row.append(
      node(documentTarget, 'span', '', `${completion.name} · ${completion.sourceName}`),
      action(documentTarget, 'Go to', 'focus-completion-source', { buildingId: completion.buildingId }, completion.buildingId == null),
    );
    section.append(row);
  }
  return section;
}

function renderAvailability(documentTarget, prerequisites) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  section.append(node(documentTarget, 'h3', '', 'Availability and prerequisites'));
  const available = prerequisites.filter((entry) => entry.available);
  if (available.length) {
    section.append(node(documentTarget, 'p', 'economyHudAvailable', `Available now: ${available.map((entry) => entry.label).join(', ')}`));
  }
  for (const entry of prerequisites.filter((candidate) => !candidate.available)) {
    section.append(node(documentTarget, 'p', 'economyHudPrerequisite', `${entry.label}: ${entry.reasons.join(' · ') || 'Unavailable'}`));
  }
  return section;
}

export function renderEconomyHud(root, model, { documentTarget = document } = {}) {
  const capacity = node(documentTarget, 'section', `economyHudSection capacity-${model.capacity.state}`);
  capacity.append(
    node(documentTarget, 'h3', '', 'Command capacity'),
    node(documentTarget, 'p', '', `${model.capacity.used}/${model.capacity.limit} used · ${model.capacity.fielded} fielded · ${model.capacity.reserved} reserved`),
    node(documentTarget, 'small', '', `Forecast: ${model.capacity.forecastLimit} limit · ${model.capacity.forecastAvailable} available`),
  );
  root.replaceChildren(
    renderResources(documentTarget, model),
    renderWorkers(documentTarget, model.workers),
    capacity,
    renderGlobalQueue(documentTarget, model.globalQueue),
    renderProduction(documentTarget, model.production),
    renderResearch(documentTarget, model),
    renderCompletions(documentTarget, model.completions),
    renderAvailability(documentTarget, model.prerequisites),
  );
}

function buildingById(game, id) {
  return (game.buildings || []).find((building) => String(building.id) === String(id)) || null;
}

function viewport(documentTarget) {
  const windowTarget = documentTarget?.defaultView || globalThis;
  return {
    width: Math.max(0, Number(windowTarget?.innerWidth) || 0),
    height: Math.max(0, Number(windowTarget?.innerHeight) || 0),
  };
}

function focusPoint(game, point, documentTarget) {
  if (!game.camera || !Number.isFinite(point?.x) || !Number.isFinite(point?.y) || !(game.camera.z > 0)) return false;
  const { width, height } = viewport(documentTarget);
  game.camera.x = width / 2 - point.x * game.camera.z;
  game.camera.y = height / 2 - point.y * game.camera.z;
  return true;
}

function currentViewCenter(game, documentTarget) {
  if (!game.camera || !(game.camera.z > 0)) return null;
  const { width, height } = viewport(documentTarget);
  return {
    x: Math.max(0, Math.min(WORLD.w, (width / 2 - game.camera.x) / game.camera.z)),
    y: Math.max(0, Math.min(WORLD.h, (height / 2 - game.camera.y) / game.camera.z)),
  };
}

function selectFacility(game, building, documentTarget) {
  if (!building) return false;
  game.select(building);
  focusPoint(game, building, documentTarget);
  return true;
}

function openResearchTree(ui, documentTarget, screenId) {
  if (typeof ui.openScreen === 'function') return ui.openScreen(screenId) !== false;
  if (typeof ui.requestScreen === 'function') return ui.requestScreen(screenId) !== false;
  const toggle = documentTarget.querySelector?.('#techTreeToggle');
  if (toggle?.click) {
    toggle.click();
    return true;
  }
  const EventConstructor = documentTarget.defaultView?.CustomEvent || globalThis.CustomEvent;
  if (typeof EventConstructor !== 'function' || typeof documentTarget.dispatchEvent !== 'function') return false;
  documentTarget.dispatchEvent(new EventConstructor('ufr:open-tech-tree', {
    detail: Object.freeze({ screenId }),
    bubbles: false,
    cancelable: true,
  }));
  return true;
}

export function installEconomyHudOverview({ game, ui, documentTarget = document } = {}) {
  if (!game || !ui || typeof ui.refresh !== 'function') throw new TypeError('Economy HUD requires game and UI instances.');
  const panel = documentTarget.querySelector('#economyHud');
  const content = documentTarget.querySelector('#economyHudContent');
  const toggle = documentTarget.querySelector('#economyHudToggle');
  const close = documentTarget.querySelector('#economyHudClose');
  if (!panel || !content || !toggle || !close) throw new Error('Economy HUD markup is incomplete.');

  const completionTracker = createEconomyCompletionTracker();
  const previousRefresh = ui.refresh;
  let signature = '';
  let currentModel = null;
  const refreshOverview = () => {
    if (!game.mission) {
      completionTracker.reset();
      signature = '';
      currentModel = null;
      return;
    }
    const baseModel = createEconomyHudSnapshot(game);
    const completions = completionTracker.observe(baseModel, {
      mission: game.mission?.id ?? game.missionIndex ?? '',
      time: game.time,
    });
    const model = createEconomyHudSnapshot(game, { completions });
    const next = economyHudSignature(model);
    currentModel = model;
    if (next !== signature) {
      signature = next;
      renderEconomyHud(content, model, { documentTarget });
    }
  };
  const installedRefresh = (...args) => {
    const result = previousRefresh.apply(ui, args);
    refreshOverview();
    return result;
  };
  ui.refresh = installedRefresh;

  const setOpen = (open) => {
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) refreshOverview();
  };
  const togglePanel = () => setOpen(panel.classList.contains('hidden'));
  const closePanel = () => setOpen(false);
  toggle.addEventListener('click', togglePanel);
  close.addEventListener('click', closePanel);

  const activate = (event) => {
    const target = event.target.closest?.('[data-action]');
    if (!target || target.disabled) return;
    const building = buildingById(game, target.dataset.buildingId);
    const name = target.dataset.action;
    let ok = false;
    if (name === 'focus-building' || name === 'focus-queue-source' || name === 'focus-completion-source') {
      ok = selectFacility(game, building, documentTarget);
    } else if (name === 'cancel-production') {
      ok = selectFacility(game, building, documentTarget) && game.cancelProduction(Number(target.dataset.index));
      if (ok) completionTracker.ignore(target.dataset.globalQueueId);
    } else if (name === 'move-production') {
      ok = selectFacility(game, building, documentTarget) && game.moveProduction(Number(target.dataset.fromIndex), Number(target.dataset.toIndex));
    } else if (name === 'set-production-paused') {
      ok = selectFacility(game, building, documentTarget) && game.setProductionPaused(target.dataset.paused === 'true');
    } else if (name === 'set-production-repeat') {
      ok = selectFacility(game, building, documentTarget) && game.setProductionRepeat(target.dataset.repeat === 'true');
    } else if (name === 'set-production-rally-view') {
      const point = currentViewCenter(game, documentTarget);
      ok = Boolean(point && building && game.setProductionRally?.(point.x, point.y, {
        append: target.dataset.append === 'true',
        building,
      }));
    } else if (name === 'focus-production-rally') {
      const point = building?.rallyWaypoints?.at(-1);
      ok = Boolean(point && focusPoint(game, point, documentTarget));
    } else if (name === 'clear-production-rally') {
      ok = game.clearProductionRally?.(building) ?? false;
    } else if (name === 'cancel-research') {
      ok = game.cancelResearch?.(target.dataset.facilityId, target.dataset.itemId) ?? false;
      if (ok) completionTracker.ignore(target.dataset.globalQueueId);
    } else if (name === 'set-research-paused') {
      ok = game.setResearchPaused?.(target.dataset.facilityId, target.dataset.paused === 'true') ?? false;
    } else if (name === 'open-research-tree') {
      ok = openResearchTree(ui, documentTarget, target.dataset.screenId || currentModel?.researchTree.screenId || 'techTree');
    }
    if (!ok && game.lastError) ui.toast?.(game.lastError);
    else if (!ok && name === 'open-research-tree') ui.toast?.('The research tree screen is not installed yet.');
    signature = '';
    ui.refresh();
  };
  content.addEventListener('click', activate);
  refreshOverview();

  return () => {
    if (ui.refresh === installedRefresh) ui.refresh = previousRefresh;
    toggle.removeEventListener('click', togglePanel);
    close.removeEventListener('click', closePanel);
    content.removeEventListener('click', activate);
    completionTracker.reset();
  };
}
