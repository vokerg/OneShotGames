const RESOURCE_IDS = Object.freeze(['metal', 'fuel', 'intel']);
const WORKER_TASK_IDS = Object.freeze(['idle', 'gathering', 'returning', 'building', 'other']);
const COMPLETION_LIMIT = 8;
const clamp01 = (value) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const nonNegative = (value) => Math.max(0, Number.isFinite(value) ? value : 0);
const string = (value, fallback = '') => typeof value === 'string' ? value : fallback;
const array = (value) => Array.isArray(value) ? value : [];

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function resourceRows(resources = {}, incomeRates = {}) {
  return RESOURCE_IDS.map((id) => ({
    id,
    amount: nonNegative(resources[id]),
    incomePerMinute: nonNegative(incomeRates[id]),
  }));
}

function workerRows(workers = {}) {
  const taskCounts = workers.taskCounts || {};
  const resourceCounts = workers.resourceCounts || {};
  const carried = workers.carried || {};
  return {
    total: nonNegative(workers.total),
    tasks: WORKER_TASK_IDS.map((id) => ({ id, count: nonNegative(taskCounts[id]) })),
    resources: RESOURCE_IDS.map((id) => ({
      id,
      count: nonNegative(resourceCounts[id]),
      carried: nonNegative(carried[id]),
    })),
  };
}

function productionItem(item = {}, index, queueLength, buildingId) {
  const duration = Math.max(0, Number(item.duration) || 0);
  const remaining = Math.max(0, Math.min(duration || Infinity, Number(item.remaining ?? item.left) || 0));
  const progress = duration > 0 ? clamp01((duration - remaining) / duration) : 0;
  return {
    id: string(item.id, `${buildingId}:queue:${index}`),
    type: string(item.type),
    name: string(item.name, string(item.type, 'Unknown unit')),
    index,
    duration,
    remaining,
    progress,
    percent: Math.floor(progress * 100 + 1e-9),
    reservedCapacity: nonNegative(item.reservedCapacity ?? item.pop),
    canCancel: item.canCancel !== false,
    canMoveUp: index > 0,
    canMoveDown: index < queueLength - 1,
  };
}

function productionRow(entry = {}) {
  const id = String(entry.buildingId ?? entry.id ?? '');
  const rawQueue = array(entry.queue);
  return {
    buildingId: id,
    buildingType: string(entry.buildingType ?? entry.type),
    name: string(entry.name, 'Production facility'),
    selected: Boolean(entry.selected),
    paused: Boolean(entry.paused),
    repeat: Boolean(entry.repeat),
    repeatBlockedReason: string(entry.repeatBlockedReason),
    exitBlockedReason: string(entry.exitBlockedReason),
    queue: rawQueue.map((item, index) => productionItem(item, index, rawQueue.length, id)),
    rally: {
      waypoints: array(entry.rally?.waypoints).map((point) => ({
        x: Number.isFinite(point?.x) ? point.x : 0,
        y: Number.isFinite(point?.y) ? point.y : 0,
      })),
      blockedReason: string(entry.rally?.blockedReason),
    },
  };
}

function researchItem(item = {}, index) {
  return {
    id: string(item.id, `research:${index}`),
    techId: string(item.techId),
    name: string(item.name, string(item.techId, 'Unknown research')),
    status: string(item.status, index === 0 ? 'active' : 'queued'),
    position: Number.isInteger(item.position) ? item.position : index,
    progress: clamp01(item.progress),
    percent: Number.isFinite(item.percent) ? Math.max(0, Math.min(100, Math.floor(item.percent))) : Math.floor(clamp01(item.progress) * 100),
    remaining: nonNegative(item.remaining),
    cancellable: item.cancellable !== false,
  };
}

function researchRow(entry = {}) {
  const rawItems = array(entry.items);
  return {
    facilityId: String(entry.facilityId ?? ''),
    buildingId: entry.buildingId == null ? null : String(entry.buildingId),
    name: string(entry.name, 'Research facility'),
    paused: Boolean(entry.paused),
    blockedReason: string(entry.blockedReason),
    items: rawItems.map(researchItem),
  };
}

function prerequisiteRow(entry = {}) {
  return {
    id: string(entry.id),
    kind: string(entry.kind, 'content'),
    label: string(entry.label, string(entry.id, 'Unknown content')),
    available: Boolean(entry.available),
    reasons: array(entry.reasons).map((reason) => string(reason)).filter(Boolean),
  };
}

function capacityRow(capacity = {}) {
  const fielded = nonNegative(capacity.fielded);
  const reserved = nonNegative(capacity.reserved);
  const used = nonNegative(capacity.used ?? fielded + reserved);
  const limit = nonNegative(capacity.limit ?? capacity.capacity);
  const forecastLimit = Math.max(limit, nonNegative(capacity.forecastLimit ?? limit));
  return {
    fielded,
    reserved,
    used,
    limit,
    available: nonNegative(capacity.available ?? limit - used),
    overBy: nonNegative(capacity.overBy ?? used - limit),
    state: string(capacity.state, used > limit ? 'over' : used === limit ? 'full' : 'normal'),
    forecastLimit,
    forecastAvailable: nonNegative(capacity.forecastAvailable ?? forecastLimit - used),
  };
}

function globalQueueRows(production, research) {
  const rows = [];
  for (const facility of production) {
    for (const item of facility.queue) {
      rows.push({
        id: `production:${facility.buildingId}:${item.id}`,
        queueItemId: item.id,
        kind: 'production',
        sourceId: facility.buildingId,
        buildingId: facility.buildingId,
        sourceName: facility.name,
        name: item.name,
        status: facility.paused ? 'paused' : item.index === 0 ? 'active' : 'queued',
        position: item.index,
        remaining: item.remaining,
        percent: item.percent,
        paused: facility.paused,
      });
    }
  }
  for (const facility of research) {
    for (const item of facility.items) {
      rows.push({
        id: `research:${facility.facilityId}:${item.id}`,
        queueItemId: item.id,
        kind: 'research',
        sourceId: facility.facilityId,
        buildingId: facility.buildingId,
        sourceName: facility.name,
        name: item.name,
        status: facility.paused ? 'paused' : item.status,
        position: item.position,
        remaining: item.remaining,
        percent: item.percent,
        paused: facility.paused,
      });
    }
  }
  const statusRank = new Map([['active', 0], ['paused', 1], ['queued', 2]]);
  return rows.sort((left, right) =>
    (statusRank.get(left.status) ?? 3) - (statusRank.get(right.status) ?? 3) ||
    left.sourceName.localeCompare(right.sourceName) ||
    String(left.sourceId).localeCompare(String(right.sourceId), undefined, { numeric: true }) ||
    left.position - right.position ||
    left.id.localeCompare(right.id),
  );
}

function researchTreeRow(value = {}) {
  return {
    screenId: string(value.screenId, 'techTree'),
    label: string(value.label, 'Open research tree'),
    available: value.available !== false,
    reason: string(value.reason),
  };
}

function completionRows(entries = []) {
  return array(entries).slice(0, COMPLETION_LIMIT).map((entry, index) => ({
    id: string(entry.id, `completion:${index}`),
    kind: string(entry.kind, 'production'),
    sourceId: string(entry.sourceId),
    buildingId: entry.buildingId == null ? null : String(entry.buildingId),
    sourceName: string(entry.sourceName, 'Facility'),
    name: string(entry.name, 'Completed item'),
    sequence: Number.isInteger(entry.sequence) ? entry.sequence : index,
  }));
}

export function createEconomyHudModel(snapshot = {}) {
  const production = array(snapshot.production).map(productionRow);
  const research = array(snapshot.research).map(researchRow);
  const model = {
    resources: resourceRows(snapshot.resources, snapshot.incomeRates),
    workers: workerRows(snapshot.workers),
    capacity: capacityRow(snapshot.capacity),
    globalQueue: globalQueueRows(production, research),
    production,
    research,
    researchTree: researchTreeRow(snapshot.researchTree),
    completions: completionRows(snapshot.completions),
    prerequisites: array(snapshot.prerequisites).map(prerequisiteRow),
  };
  return deepFreeze(model);
}

export function economyHudSignature(model) {
  return JSON.stringify(model);
}

export function productionQueueCommands(entry) {
  const commands = [];
  for (const item of entry.queue) {
    if (item.canCancel) commands.push({ action: 'cancel-production', buildingId: entry.buildingId, index: item.index });
    if (item.canMoveUp) commands.push({ action: 'move-production', buildingId: entry.buildingId, fromIndex: item.index, toIndex: item.index - 1 });
    if (item.canMoveDown) commands.push({ action: 'move-production', buildingId: entry.buildingId, fromIndex: item.index, toIndex: item.index + 1 });
  }
  if (entry.queue.length) {
    commands.push({ action: 'set-production-paused', buildingId: entry.buildingId, paused: !entry.paused });
    commands.push({ action: 'set-production-repeat', buildingId: entry.buildingId, repeat: !entry.repeat });
  }
  commands.push({ action: 'set-production-rally-view', buildingId: entry.buildingId, append: false });
  commands.push({ action: 'set-production-rally-view', buildingId: entry.buildingId, append: true });
  if (entry.rally.waypoints.length) {
    commands.push({ action: 'focus-production-rally', buildingId: entry.buildingId });
    commands.push({ action: 'clear-production-rally', buildingId: entry.buildingId });
  }
  return deepFreeze(commands);
}
