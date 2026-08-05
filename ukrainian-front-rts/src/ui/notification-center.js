import { BUILDING_TYPES, TEAM, UNIT_TYPES, UPGRADES } from '../config.js';

export const NOTIFICATION_CENTER_SCHEMA = 'fields-of-resolve.notification-center';
export const NOTIFICATION_CENTER_VERSION = 1;
export const NOTIFICATION_CENTER_STYLESHEET = 'notification-center.css';
export const NOTIFICATION_HISTORY_LIMIT = 100;
export const NOTIFICATION_FEED_LIMIT = 5;

export const NOTIFICATION_KINDS = Object.freeze({
  OBJECTIVE: 'objective',
  ATTACK: 'attack',
  PRODUCTION: 'production',
  RESEARCH: 'research',
  SAVE: 'save',
  SYSTEM: 'system',
});

const KIND_VALUES = new Set(Object.values(NOTIFICATION_KINDS));
const PRIORITY_BY_KIND = Object.freeze({
  objective: 'success',
  attack: 'warning',
  production: 'success',
  research: 'success',
  save: 'info',
  system: 'info',
});
const DEFAULT_COOLDOWN_SECONDS = Object.freeze({
  objective: 0,
  attack: 8,
  production: 0,
  research: 0,
  save: 1,
  system: 2,
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function positiveInteger(value, fallback, label) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer.`);
  return value;
}

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function text(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeNavigation(navigation) {
  if (!navigation || typeof navigation !== 'object' || Array.isArray(navigation)) return null;
  const entityId = navigation.entityId == null ? null : String(navigation.entityId);
  const x = Number(navigation.x);
  const y = Number(navigation.y);
  if (entityId == null && (!Number.isFinite(x) || !Number.isFinite(y))) return null;
  return deepFreeze({
    entityId,
    x: Number.isFinite(x) ? x : null,
    y: Number.isFinite(y) ? y : null,
  });
}

function normalizeNotification(input, id) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Notification input must be an object.');
  }
  const kind = text(input.kind, NOTIFICATION_KINDS.SYSTEM);
  if (!KIND_VALUES.has(kind)) throw new TypeError(`Unknown notification kind: ${kind}`);
  const title = text(input.title);
  const message = text(input.message);
  if (!title || !message) throw new TypeError('Notification title and message are required.');
  const time = finiteNonNegative(input.time);
  const tick = Number.isInteger(input.tick) && input.tick >= 0 ? input.tick : null;
  const targetKey = input.navigation?.entityId ?? input.targetId ?? '';
  const key = text(input.key, `${kind}:${title}:${targetKey}`);
  return {
    schema: NOTIFICATION_CENTER_SCHEMA,
    version: NOTIFICATION_CENTER_VERSION,
    id: `notice:${id}`,
    key,
    kind,
    priority: text(input.priority, PRIORITY_BY_KIND[kind]),
    title,
    message,
    time,
    tick,
    count: 1,
    navigation: normalizeNavigation(input.navigation),
  };
}

export function createNotificationStore({
  historyLimit = NOTIFICATION_HISTORY_LIMIT,
  feedLimit = NOTIFICATION_FEED_LIMIT,
  cooldownSeconds = {},
} = {}) {
  const maxHistory = positiveInteger(historyLimit, NOTIFICATION_HISTORY_LIMIT, 'Notification historyLimit');
  const maxFeed = positiveInteger(feedLimit, NOTIFICATION_FEED_LIMIT, 'Notification feedLimit');
  if (!cooldownSeconds || typeof cooldownSeconds !== 'object' || Array.isArray(cooldownSeconds)) {
    throw new TypeError('Notification cooldownSeconds must be an object.');
  }
  const cooldowns = { ...DEFAULT_COOLDOWN_SECONDS };
  for (const [kind, seconds] of Object.entries(cooldownSeconds)) {
    if (!KIND_VALUES.has(kind)) throw new TypeError(`Unknown notification cooldown kind: ${kind}`);
    const normalized = Number(seconds);
    if (!Number.isFinite(normalized) || normalized < 0) {
      throw new TypeError(`Notification cooldown for ${kind} must be non-negative.`);
    }
    cooldowns[kind] = normalized;
  }

  let nextId = 1;
  let history = [];
  let historyOpen = false;
  let unread = 0;

  function publish(input) {
    const candidate = normalizeNotification(input, nextId);
    const existingIndex = history.findIndex((entry) => entry.key === candidate.key);
    const existing = existingIndex >= 0 ? history[existingIndex] : null;
    const collapsible = existing && candidate.time >= existing.time &&
      candidate.time - existing.time <= cooldowns[candidate.kind];
    let record;
    if (collapsible) {
      record = deepFreeze({
        ...existing,
        priority: candidate.priority,
        title: candidate.title,
        message: candidate.message,
        time: candidate.time,
        tick: candidate.tick,
        count: existing.count + 1,
        navigation: candidate.navigation ?? existing.navigation,
      });
      history.splice(existingIndex, 1);
    } else {
      record = deepFreeze(candidate);
      nextId += 1;
    }
    history.unshift(record);
    if (history.length > maxHistory) history.length = maxHistory;
    unread = historyOpen ? 0 : Math.min(maxHistory, unread + 1);
    return record;
  }

  function setHistoryOpen(open) {
    historyOpen = Boolean(open);
    if (historyOpen) unread = 0;
    return snapshot();
  }

  function clear() {
    history = [];
    unread = 0;
    return snapshot();
  }

  function reset() {
    history = [];
    historyOpen = false;
    unread = 0;
    nextId = 1;
    return snapshot();
  }

  function snapshot() {
    return deepFreeze({
      schema: NOTIFICATION_CENTER_SCHEMA,
      version: NOTIFICATION_CENTER_VERSION,
      historyOpen,
      unread,
      feed: history.slice(0, maxFeed),
      history: history.slice(),
    });
  }

  return Object.freeze({ publish, setHistoryOpen, clear, reset, snapshot });
}

function typeName(typeId, fallback = 'Unit') {
  return UNIT_TYPES[typeId]?.short || UNIT_TYPES[typeId]?.name || BUILDING_TYPES[typeId]?.name || fallback;
}

function entitySnapshot(entity) {
  return {
    id: String(entity.id),
    type: String(entity.type || ''),
    name: typeName(entity.type, 'Ukrainian asset'),
    hp: finiteNonNegative(entity.hp),
    maxHp: Math.max(1, finiteNonNegative(entity.maxHp, 1)),
    x: Number.isFinite(entity.x) ? entity.x : null,
    y: Number.isFinite(entity.y) ? entity.y : null,
  };
}

function researchEventKey(event) {
  return [event.time, event.type, event.facilityId, event.itemId, event.techId].join(':');
}

export function createNotificationObservation(game) {
  const mission = game?.mission;
  const uaUnits = (game?.units || []).filter((unit) => unit.team === TEAM.UA);
  const uaBuildings = (game?.buildings || []).filter((building) => building.team === TEAM.UA);
  const objectives = (game?.player?.objectives || []).map((complete, index) => ({
    index,
    complete: Boolean(complete),
    label: text(mission?.objectives?.[index], `Objective ${index + 1}`),
  }));
  const queues = uaBuildings.map((building) => ({
    buildingId: String(building.id),
    buildingName: typeName(building.type, 'Production facility'),
    x: Number.isFinite(building.x) ? building.x : null,
    y: Number.isFinite(building.y) ? building.y : null,
    items: (building.queue || []).map((item, index) => ({
      id: String(item.id ?? `${building.id}:queue:${index}`),
      type: String(item.type || ''),
      name: typeName(item.type),
    })),
  }));
  const researchEvents = (game?.researchQueueEvents || []).map((event) => ({
    key: researchEventKey(event),
    time: finiteNonNegative(event.time, finiteNonNegative(game?.time)),
    type: String(event.type || ''),
    facilityId: String(event.facilityId || ''),
    itemId: String(event.itemId || ''),
    techId: String(event.techId || ''),
  }));
  return deepFreeze({
    missionKey: mission ? String(mission.id ?? mission.title ?? 'mission') : null,
    time: finiteNonNegative(game?.time),
    tick: Number.isInteger(game?.tick) && game.tick >= 0 ? game.tick : null,
    objectives,
    entities: [...uaUnits, ...uaBuildings].map(entitySnapshot),
    units: uaUnits.map(entitySnapshot),
    queues,
    researchEvents,
  });
}

function navigationFrom(item) {
  return {
    entityId: item.id ?? item.buildingId ?? null,
    x: item.x,
    y: item.y,
  };
}

export function deriveNotificationInputs(previous, current) {
  if (!previous || !current || previous.missionKey !== current.missionKey || !current.missionKey) return Object.freeze([]);
  const inputs = [];
  const previousObjectives = new Map(previous.objectives.map((objective) => [objective.index, objective]));
  for (const objective of current.objectives) {
    if (!previousObjectives.get(objective.index)?.complete && objective.complete) {
      inputs.push({
        key: `objective:${current.missionKey}:${objective.index}`,
        kind: NOTIFICATION_KINDS.OBJECTIVE,
        title: 'Objective complete',
        message: objective.label,
        time: current.time,
        tick: current.tick,
      });
    }
  }

  const previousEntities = new Map(previous.entities.map((entity) => [entity.id, entity]));
  for (const entity of current.entities) {
    const before = previousEntities.get(entity.id);
    if (!before || entity.hp >= before.hp - 0.5) continue;
    const damage = Math.max(1, Math.ceil(before.hp - entity.hp));
    const healthRatio = entity.hp / entity.maxHp;
    inputs.push({
      key: `attack:${entity.id}`,
      kind: NOTIFICATION_KINDS.ATTACK,
      priority: healthRatio <= 0.3 ? 'critical' : 'warning',
      title: `Under attack: ${entity.name}`,
      message: `${damage} damage taken · ${Math.ceil(entity.hp)}/${Math.ceil(entity.maxHp)} strength remaining`,
      time: current.time,
      tick: current.tick,
      navigation: navigationFrom(entity),
    });
  }

  const currentQueueIds = new Set(current.queues.flatMap((queue) => queue.items.map((item) => item.id)));
  const removedItems = previous.queues.flatMap((queue) => queue.items
    .filter((item) => !currentQueueIds.has(item.id))
    .map((item) => ({ ...item, facility: queue })));
  const previousUnitIds = new Set(previous.units.map((unit) => unit.id));
  const newUnits = current.units.filter((unit) => !previousUnitIds.has(unit.id));
  const availableUnits = [...newUnits];
  for (const removed of removedItems) {
    const unitIndex = availableUnits.findIndex((unit) => unit.type === removed.type);
    if (unitIndex < 0) continue;
    const [unit] = availableUnits.splice(unitIndex, 1);
    inputs.push({
      key: `production:${removed.id}`,
      kind: NOTIFICATION_KINDS.PRODUCTION,
      title: 'Production complete',
      message: `${removed.name} deployed from ${removed.facility.buildingName}.`,
      time: current.time,
      tick: current.tick,
      navigation: navigationFrom(unit),
    });
  }

  const previousResearchKeys = new Set(previous.researchEvents.map((event) => event.key));
  const currentEntities = new Map(current.entities.map((entity) => [entity.id, entity]));
  for (const event of current.researchEvents) {
    if (previousResearchKeys.has(event.key) || event.type !== 'researchCompleted') continue;
    const buildingId = event.facilityId.startsWith('building:') ? event.facilityId.slice('building:'.length) : null;
    const facility = buildingId == null ? null : currentEntities.get(buildingId);
    inputs.push({
      key: `research:${event.itemId || event.techId}`,
      kind: NOTIFICATION_KINDS.RESEARCH,
      title: 'Research complete',
      message: `${UPGRADES[event.techId]?.name || event.techId || 'Modernization'} is now available.`,
      time: event.time,
      tick: current.tick,
      navigation: facility ? navigationFrom(facility) : null,
    });
  }

  return deepFreeze(inputs);
}

function node(documentTarget, tagName, className = '', value = '') {
  const element = documentTarget.createElement(tagName);
  element.className = className;
  element.textContent = value;
  return element;
}

function installStylesheet(documentTarget) {
  if (!documentTarget?.head || typeof documentTarget.createElement !== 'function') return () => {};
  const existing = documentTarget.querySelector?.('link[data-notification-center-styles="true"]');
  if (existing) return () => {};
  const link = documentTarget.createElement('link');
  link.rel = 'stylesheet';
  link.href = NOTIFICATION_CENTER_STYLESHEET;
  link.dataset.notificationCenterStyles = 'true';
  documentTarget.head.append(link);
  return () => link.remove?.();
}

function findEntity(game, id) {
  return [...(game.units || []), ...(game.buildings || [])]
    .find((entity) => String(entity.id) === String(id)) || null;
}

export function navigateToNotification(game, navigation, { windowTarget = globalThis } = {}) {
  if (!navigation) return false;
  const entity = navigation.entityId == null ? null : findEntity(game, navigation.entityId);
  if (entity && typeof game.select === 'function') game.select(entity);
  const x = entity?.x ?? navigation.x;
  const y = entity?.y ?? navigation.y;
  if (!game.camera || !Number.isFinite(x) || !Number.isFinite(y)) return Boolean(entity);
  const zoom = Number.isFinite(game.camera.z) && game.camera.z > 0 ? game.camera.z : 1;
  const width = Number(windowTarget?.innerWidth) || 0;
  const height = Number(windowTarget?.innerHeight) || 0;
  game.camera.x = width / 2 - x * zoom;
  game.camera.y = height / 2 - y * zoom;
  return true;
}

export function createNotificationCenterView({ documentTarget, onNavigate } = {}) {
  if (!documentTarget?.body || typeof documentTarget.createElement !== 'function') return null;
  const root = node(documentTarget, 'aside', 'notificationCenter');
  root.dataset.notificationCenterRoot = 'true';
  root.setAttribute('aria-label', 'Battlefield notifications');
  const feed = node(documentTarget, 'section', 'notificationFeed');
  feed.setAttribute('role', 'status');
  feed.setAttribute('aria-live', 'polite');
  feed.setAttribute('aria-atomic', 'false');
  const toggle = node(documentTarget, 'button', 'notificationHistoryToggle', 'Messages');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  const panel = node(documentTarget, 'section', 'notificationHistory hidden');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Message history');
  const header = node(documentTarget, 'header', 'notificationHistoryHeader');
  const title = node(documentTarget, 'h2', '', 'Message history');
  const close = node(documentTarget, 'button', '', 'Close');
  close.type = 'button';
  header.append(title, close);
  const list = node(documentTarget, 'ol', 'notificationHistoryList');
  const clear = node(documentTarget, 'button', 'notificationHistoryClear', 'Clear history');
  clear.type = 'button';
  panel.append(header, list, clear);
  root.append(feed, toggle, panel);
  documentTarget.body.append(root);

  const renderRecord = (record, history = false) => {
    const item = node(documentTarget, history ? 'li' : 'article', `notificationItem kind-${record.kind} priority-${record.priority}`);
    const heading = node(documentTarget, 'strong', 'notificationTitle', record.title);
    const message = node(documentTarget, 'span', 'notificationMessage', record.message);
    item.append(heading, message);
    if (record.count > 1) item.append(node(documentTarget, 'span', 'notificationCount', `×${record.count}`));
    if (record.navigation) {
      const focus = node(documentTarget, 'button', 'notificationNavigate', 'View');
      focus.type = 'button';
      focus.addEventListener('click', () => onNavigate?.(record.navigation));
      item.append(focus);
    }
    return item;
  };

  const render = (model) => {
    feed.replaceChildren(...model.feed.map((record) => renderRecord(record)));
    list.replaceChildren(...model.history.map((record) => renderRecord(record, true)));
    toggle.textContent = model.unread ? `Messages (${model.unread})` : 'Messages';
    toggle.setAttribute('aria-expanded', String(model.historyOpen));
    panel.classList.toggle('hidden', !model.historyOpen);
    clear.disabled = model.history.length === 0;
  };

  return Object.freeze({ root, feed, toggle, panel, close, clear, render, dispose: () => root.remove?.() });
}

function saveNotification(message, time, tick) {
  const normalized = text(message);
  if (!/\b(save|saved|saving|autosave|checkpoint)\b/i.test(normalized)) return null;
  const failed = /\b(fail|failed|error|unavailable|unable)\b/i.test(normalized);
  return {
    key: failed ? 'save:error' : 'save:success',
    kind: NOTIFICATION_KINDS.SAVE,
    priority: failed ? 'warning' : 'success',
    title: failed ? 'Save not completed' : 'Game saved',
    message: normalized,
    time,
    tick,
  };
}

export function installNotificationCenter({
  game,
  ui,
  documentTarget = globalThis.document,
  windowTarget = globalThis,
  store = createNotificationStore(),
} = {}) {
  if (!game || !ui || !documentTarget?.body || typeof documentTarget.createElement !== 'function') return () => {};
  for (const method of ['refresh', 'toast', 'setMission', 'showMissionSelect']) {
    if (typeof ui[method] !== 'function') return () => {};
  }
  const disposeStylesheet = installStylesheet(documentTarget);
  const view = createNotificationCenterView({
    documentTarget,
    onNavigate: (navigation) => navigateToNotification(game, navigation, { windowTarget }),
  });
  if (!view) return () => {};

  const originalRefresh = ui.refresh;
  const originalToast = ui.toast;
  const originalSetMission = ui.setMission;
  const originalShowMissionSelect = ui.showMissionSelect;
  const previousNotify = ui.notify;
  const previousNotificationCenter = ui.notificationCenter;
  let observation = null;

  const render = () => view.render(store.snapshot());
  const publish = (input) => {
    const record = store.publish({
      time: finiteNonNegative(game.time),
      tick: Number.isInteger(game.tick) ? game.tick : null,
      ...input,
    });
    render();
    return record;
  };
  const setHistoryOpen = (open) => {
    store.setHistoryOpen(open);
    render();
  };
  const reset = () => {
    store.reset();
    observation = game.mission ? createNotificationObservation(game) : null;
    render();
  };

  const openHistory = () => setHistoryOpen(true);
  const closeHistory = () => setHistoryOpen(false);
  const clearHistory = () => { store.clear(); render(); };
  view.toggle.addEventListener('click', openHistory);
  view.close.addEventListener('click', closeHistory);
  view.clear.addEventListener('click', clearHistory);

  ui.refresh = function refreshWithNotifications(...args) {
    const result = originalRefresh.apply(this, args);
    if (!game.mission) return result;
    const current = createNotificationObservation(game);
    for (const input of deriveNotificationInputs(observation, current)) publish(input);
    observation = current;
    return result;
  };
  ui.toast = function toastWithNotifications(message, ...args) {
    const result = originalToast.call(this, message, ...args);
    const input = saveNotification(message, finiteNonNegative(game.time), Number.isInteger(game.tick) ? game.tick : null);
    if (input) publish(input);
    return result;
  };
  ui.setMission = function setMissionWithNotifications(...args) {
    const result = originalSetMission.apply(this, args);
    reset();
    return result;
  };
  ui.showMissionSelect = function showMissionSelectWithNotifications(...args) {
    const result = originalShowMissionSelect.apply(this, args);
    reset();
    return result;
  };
  ui.notify = publish;
  ui.notificationCenter = Object.freeze({
    publish,
    snapshot: store.snapshot,
    openHistory: () => setHistoryOpen(true),
    closeHistory: () => setHistoryOpen(false),
    clear: clearHistory,
  });

  render();
  return () => {
    ui.refresh = originalRefresh;
    ui.toast = originalToast;
    ui.setMission = originalSetMission;
    ui.showMissionSelect = originalShowMissionSelect;
    if (previousNotify === undefined) delete ui.notify;
    else ui.notify = previousNotify;
    if (previousNotificationCenter === undefined) delete ui.notificationCenter;
    else ui.notificationCenter = previousNotificationCenter;
    view.toggle.removeEventListener?.('click', openHistory);
    view.close.removeEventListener?.('click', closeHistory);
    view.clear.removeEventListener?.('click', clearHistory);
    view.dispose();
    disposeStylesheet();
  };
}
