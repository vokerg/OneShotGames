const RESOURCE_IDS = Object.freeze(['metal', 'fuel', 'intel']);
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

export function createEconomyHudModel(snapshot = {}) {
  const model = {
    resources: resourceRows(snapshot.resources, snapshot.incomeRates),
    production: array(snapshot.production).map(productionRow),
    research: array(snapshot.research).map(researchRow),
    prerequisites: array(snapshot.prerequisites).map(prerequisiteRow),
    capacity: capacityRow(snapshot.capacity),
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
  if (entry.rally.waypoints.length) commands.push({ action: 'clear-production-rally', buildingId: entry.buildingId });
  return deepFreeze(commands);
}
