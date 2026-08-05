import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';
import {
  classifyMinimapAlert,
  createMinimapSnapshot,
  DEFAULT_MINIMAP_FILTERS,
  MinimapAlertQueue,
  MINIMAP_ALERT_KINDS,
  worldToMinimap,
} from './minimap-alerts-model.js';

const TERRAIN_COLORS = Object.freeze({
  0: '#66774f',
  1: '#6b6654',
  2: '#36523c',
});

const MARKER_COLORS = Object.freeze({
  ally: '#62a9d8',
  enemy: '#d86b59',
  neutral: '#d2bf79',
});

const PING_COLORS = Object.freeze({
  attack: '#f06d56',
  objective: '#f0d978',
  production: '#62b394',
  info: '#b9c3b0',
});

function nowFromGame(game, clock) {
  if (typeof clock === 'function') return Number(clock()) || 0;
  if (Number.isFinite(game?.time)) return game.time * 1000;
  return Date.now();
}

function missionIdentity(game) {
  return game?.mission?.id
    ?? game?.mission?.key
    ?? game?.mission?.title
    ?? game?.missionIndex
    ?? null;
}

function focusCamera(game, position, windowTarget) {
  if (!position || !game?.camera) return false;
  const width = Number(windowTarget?.innerWidth) || 0;
  const height = Number(windowTarget?.innerHeight) || 0;
  const zoom = Number(game.camera.z) || 1;
  game.camera.x = width / 2 - position.x * zoom;
  game.camera.y = height / 2 - position.y * zoom;
  return true;
}

function displayName(entity) {
  const type = UNIT_TYPES[entity?.type] || BUILDING_TYPES[entity?.type];
  return type?.short || type?.name || entity?.type || `entity ${entity?.id}`;
}

function cameraCenter(game, windowTarget) {
  const zoom = Number(game?.camera?.z) || 1;
  return {
    x: (-(Number(game?.camera?.x) || 0) + (Number(windowTarget?.innerWidth) || 0) / 2) / zoom,
    y: (-(Number(game?.camera?.y) || 0) + (Number(windowTarget?.innerHeight) || 0) / 2) / zoom,
  };
}

function objectivePosition(game, index, windowTarget) {
  const marker = game?.mission?.objectiveMarkers?.[index]
    || game?.missionScriptState?.objectiveTargets?.[index]
    || game?.objectiveMarkers?.[index];
  if (marker && Number.isFinite(marker.x) && Number.isFinite(marker.y)) return marker;
  if (game?.uaHQ && Number.isFinite(game.uaHQ.x) && Number.isFinite(game.uaHQ.y)) return game.uaHQ;
  return cameraCenter(game, windowTarget);
}

function productionPosition(game, acknowledgement) {
  const unit = (game?.units || []).find((candidate) => candidate.id === acknowledgement?.unitId);
  if (unit) return unit;
  return (game?.buildings || []).find((candidate) => candidate.id === acknowledgement?.buildingId) || null;
}

function latestProductionSequence(game) {
  return Math.max(0, ...(game?.productionAcknowledgements || []).map((entry) => entry.sequence || 0));
}

function rebaselineObserver(game, state, queue, exploredCells, time) {
  queue.clear();
  exploredCells.clear();
  state.hpById.clear();
  for (const entity of [...(game?.units || []), ...(game?.buildings || [])]) {
    if (entity?.id != null) state.hpById.set(entity.id, Number(entity.hp) || 0);
  }
  state.objectives = (game?.player?.objectives || []).map(Boolean);
  state.productionSequence = latestProductionSequence(game);
  state.missionIdentity = missionIdentity(game);
  state.lastTime = time;
}

function observeState(game, queue, state, time, windowTarget) {
  const entities = [...(game?.units || []), ...(game?.buildings || [])];
  const currentIds = new Set();
  for (const entity of entities) {
    currentIds.add(entity.id);
    const previousHp = state.hpById.get(entity.id);
    if (
      previousHp != null
      && entity.team === TEAM.UA
      && Number(entity.hp) < previousHp
      && Number(entity.hp) > 0
    ) {
      queue.push({
        kind: MINIMAP_ALERT_KINDS.ATTACK,
        message: `${displayName(entity)} is under attack.`,
        worldPosition: entity,
        source: `damage:${entity.id}`,
        createdAt: time,
      });
    }
    state.hpById.set(entity.id, Number(entity.hp) || 0);
  }
  for (const id of [...state.hpById.keys()]) if (!currentIds.has(id)) state.hpById.delete(id);

  const objectives = game?.player?.objectives || [];
  objectives.forEach((complete, index) => {
    const previous = state.objectives[index];
    if (previous === false && complete === true) {
      queue.push({
        kind: MINIMAP_ALERT_KINDS.OBJECTIVE,
        message: `Objective ${index + 1} complete.`,
        worldPosition: objectivePosition(game, index, windowTarget),
        source: `objective:${index}`,
        createdAt: time,
      });
    }
  });
  state.objectives = objectives.map(Boolean);

  for (const acknowledgement of game?.productionAcknowledgements || []) {
    if ((acknowledgement.sequence || 0) <= state.productionSequence) continue;
    const position = productionPosition(game, acknowledgement);
    queue.push({
      kind: MINIMAP_ALERT_KINDS.PRODUCTION,
      message: `${UNIT_TYPES[acknowledgement.type]?.short || UNIT_TYPES[acknowledgement.type]?.name || acknowledgement.type} deployed.`,
      worldPosition: position,
      source: `production:${acknowledgement.sequence}`,
      createdAt: time,
    });
    state.productionSequence = Math.max(state.productionSequence, acknowledgement.sequence || 0);
  }
  state.lastTime = time;
}

function drawTerrain(context, snapshot, width, height) {
  const cellWidth = width / snapshot.grid.columns;
  const cellHeight = height / snapshot.grid.rows;
  for (const cell of snapshot.terrain) {
    context.fillStyle = TERRAIN_COLORS[cell.terrain] || TERRAIN_COLORS[0];
    context.fillRect(cell.column * cellWidth, cell.row * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
    if (cell.visibility === 'hidden') {
      context.fillStyle = 'rgba(3, 7, 5, .82)';
      context.fillRect(cell.column * cellWidth, cell.row * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
    } else if (cell.visibility === 'explored') {
      context.fillStyle = 'rgba(4, 8, 6, .48)';
      context.fillRect(cell.column * cellWidth, cell.row * cellHeight, Math.ceil(cellWidth), Math.ceil(cellHeight));
    }
  }
}

function drawRoad(context, snapshot, size) {
  if (snapshot.road.length < 2) return;
  context.save();
  context.strokeStyle = '#9b895e';
  context.lineWidth = 4;
  context.lineCap = 'round';
  context.beginPath();
  snapshot.road.forEach((point, index) => {
    const mini = worldToMinimap(point, size);
    if (index) context.lineTo(mini.x, mini.y);
    else context.moveTo(mini.x, mini.y);
  });
  context.stroke();
  context.restore();
}

function drawMarker(context, marker, size) {
  const point = worldToMinimap(marker, size);
  context.fillStyle = MARKER_COLORS[marker.relationship] || MARKER_COLORS.neutral;
  if (marker.kind === 'building') {
    context.fillRect(point.x - 3, point.y - 3, 7, 7);
  } else if (marker.kind === 'resource') {
    context.beginPath();
    context.moveTo(point.x, point.y - 3);
    context.lineTo(point.x + 3, point.y);
    context.lineTo(point.x, point.y + 3);
    context.lineTo(point.x - 3, point.y);
    context.closePath();
    context.fill();
  } else {
    context.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
  }
  if (marker.selected) {
    context.strokeStyle = '#fff0a0';
    context.lineWidth = 1;
    context.strokeRect(point.x - 4, point.y - 4, 8, 8);
  }
}

function drawPings(context, snapshot, size, now) {
  for (const ping of snapshot.pings) {
    const point = worldToMinimap(ping.worldPosition, size);
    const duration = Math.max(1, ping.expiresAt - ping.createdAt);
    const progress = Math.max(0, Math.min(1, (now - ping.createdAt) / duration));
    const radius = 4 + progress * 9;
    context.save();
    context.strokeStyle = PING_COLORS[ping.kind] || PING_COLORS.info;
    context.globalAlpha = 1 - progress * 0.72;
    context.lineWidth = ping.priority >= 3 ? 2.5 : 1.5;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PING_COLORS[ping.kind] || PING_COLORS.info;
    context.globalAlpha = 1;
    context.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
    context.restore();
  }
}

function drawViewport(context, snapshot, size) {
  const topLeft = worldToMinimap(snapshot.viewport, size);
  const bottomRight = worldToMinimap({
    x: snapshot.viewport.x + snapshot.viewport.width,
    y: snapshot.viewport.y + snapshot.viewport.height,
  }, size);
  context.strokeStyle = '#fff0a0';
  context.lineWidth = 1.5;
  context.strokeRect(
    topLeft.x + 0.5,
    topLeft.y + 0.5,
    Math.max(1, bottomRight.x - topLeft.x - 1),
    Math.max(1, bottomRight.y - topLeft.y - 1),
  );
}

export function renderMinimapSnapshot(context, snapshot, {
  width = context?.canvas?.width || 220,
  height = context?.canvas?.height || 138,
  now = 0,
} = {}) {
  if (!context || !snapshot) throw new TypeError('Minimap rendering requires a canvas context and snapshot.');
  const size = { width, height };
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#111512';
  context.fillRect(0, 0, width, height);
  drawTerrain(context, snapshot, width, height);
  drawRoad(context, snapshot, size);
  snapshot.markers.forEach((marker) => drawMarker(context, marker, size));
  drawPings(context, snapshot, size, now);
  drawViewport(context, snapshot, size);
  return snapshot;
}

function renderAlerts(root, alerts, documentTarget) {
  if (!root) return;
  const fragment = documentTarget.createDocumentFragment();
  for (const alert of alerts) {
    const item = documentTarget.createElement('li');
    item.className = `minimapAlert kind-${alert.kind}`;
    const button = documentTarget.createElement('button');
    button.type = 'button';
    button.dataset.alertId = alert.id;
    button.disabled = !alert.worldPosition;
    button.setAttribute('aria-label', alert.worldPosition ? `${alert.message} Focus map location.` : alert.message);
    const kind = documentTarget.createElement('span');
    kind.className = 'minimapAlertKind';
    kind.textContent = alert.kind.toUpperCase();
    const text = documentTarget.createElement('span');
    text.className = 'minimapAlertText';
    text.textContent = alert.message;
    button.append(kind, text);
    item.append(button);
    fragment.append(item);
  }
  root.replaceChildren(fragment);
  root.classList.toggle('empty', alerts.length === 0);
}

function readFilters(root, defaults = DEFAULT_MINIMAP_FILTERS) {
  const result = { ...defaults };
  root?.querySelectorAll?.('[data-minimap-filter]').forEach((input) => {
    result[input.dataset.minimapFilter] = Boolean(input.checked);
  });
  return result;
}

function alertSignature(alerts) {
  return alerts.map((alert) => [
    alert.id,
    alert.kind,
    alert.message,
    alert.worldPosition?.x ?? '',
    alert.worldPosition?.y ?? '',
  ].join(':')).join('|');
}

function alertNearPoint(alerts, point, size, threshold = 10) {
  let selected = null;
  let distance = threshold;
  for (const alert of alerts) {
    if (!alert.worldPosition) continue;
    const ping = worldToMinimap(alert.worldPosition, size);
    const next = Math.hypot(ping.x - point.x, ping.y - point.y);
    if (next <= distance) {
      selected = alert;
      distance = next;
    }
  }
  return selected;
}

export function installMinimapAlerts({
  game,
  ui,
  renderer,
  minimap,
  documentTarget = document,
  windowTarget = window,
  clock,
  refreshIntervalMs = 200,
} = {}) {
  if (!game || !renderer || typeof renderer.mini !== 'function' || !minimap) {
    throw new TypeError('Minimap alerts require game, renderer, and minimap instances.');
  }
  const queueRoot = documentTarget.querySelector('#minimapAlertQueue');
  const filterRoot = documentTarget.querySelector('#minimapFilters');
  const previousQueueMarkup = queueRoot?.innerHTML;
  const previousQueueClassName = queueRoot?.className;
  const queue = new MinimapAlertQueue();
  const exploredCells = new Set();
  const observer = {
    hpById: new Map(),
    objectives: [],
    productionSequence: 0,
    missionIdentity: missionIdentity(game),
    lastTime: Number.NEGATIVE_INFINITY,
  };
  const disposers = [];
  const listen = (target, type, handler) => {
    target?.addEventListener?.(type, handler);
    disposers.push(() => target?.removeEventListener?.(type, handler));
  };
  let filters = readFilters(filterRoot);
  let latestAlerts = Object.freeze([]);
  let latestSnapshot = null;
  let lastRefresh = Number.NEGATIVE_INFINITY;
  let renderedAlertSignature = '';

  rebaselineObserver(game, observer, queue, exploredCells, nowFromGame(game, clock));

  const refresh = (force = false) => {
    const time = nowFromGame(game, clock);
    const identity = missionIdentity(game);
    if (identity !== observer.missionIdentity || time < observer.lastTime) {
      rebaselineObserver(game, observer, queue, exploredCells, time);
      latestAlerts = Object.freeze([]);
      renderedAlertSignature = '';
      force = true;
    }
    if (!force && time - lastRefresh < refreshIntervalMs && latestSnapshot) return latestSnapshot;
    observeState(game, queue, observer, time, windowTarget);
    latestAlerts = queue.prune(time);
    latestSnapshot = createMinimapSnapshot(game, {
      filters,
      alerts: latestAlerts,
      exploredCells,
      viewport: {
        width: Number(windowTarget.innerWidth) || 0,
        height: Number(windowTarget.innerHeight) || 0,
      },
    });
    const signature = alertSignature(latestAlerts);
    if (signature !== renderedAlertSignature) {
      renderAlerts(queueRoot, latestAlerts, documentTarget);
      renderedAlertSignature = signature;
    }
    lastRefresh = time;
    return latestSnapshot;
  };

  const originalMini = renderer.mini;
  renderer.mini = function minimapAlertsRender() {
    const time = nowFromGame(game, clock);
    const snapshot = refresh();
    return renderMinimapSnapshot(renderer.mx, snapshot, {
      width: minimap.width,
      height: minimap.height,
      now: time,
    });
  };

  const previousToast = ui?.toast;
  if (ui && typeof previousToast === 'function') {
    ui.toast = function minimapAlertToast(message, options = undefined) {
      const result = previousToast.call(ui, message);
      const explicit = options && (options.kind || options.worldPosition);
      if (explicit) {
        const kind = options.kind || classifyMinimapAlert(message);
        queue.push({
          kind,
          message: String(message),
          worldPosition: options.worldPosition || null,
          source: options.source || `toast:${kind}`,
          createdAt: nowFromGame(game, clock),
        });
        refresh(true);
      }
      return result;
    };
  }

  const push = (alert) => {
    const created = queue.push({ ...alert, createdAt: alert?.createdAt ?? nowFromGame(game, clock) });
    refresh(true);
    return created;
  };
  const previousApi = game.minimapAlerts;
  game.minimapAlerts = Object.freeze({
    push,
    remove(id) {
      const changed = queue.remove(id);
      if (changed) refresh(true);
      return changed;
    },
    snapshot() {
      return latestAlerts;
    },
    focus(position) {
      return focusCamera(game, position, windowTarget);
    },
  });

  const onFilterChange = () => {
    filters = readFilters(filterRoot, filters);
    refresh(true);
  };
  listen(filterRoot, 'change', onFilterChange);

  const onAlertClick = (event) => {
    const button = event.target?.closest?.('[data-alert-id]');
    if (!button) return;
    const alert = latestAlerts.find((candidate) => candidate.id === button.dataset.alertId);
    if (alert?.worldPosition) focusCamera(game, alert.worldPosition, windowTarget);
  };
  listen(queueRoot, 'click', onAlertClick);

  const onMinimapPing = (event) => {
    const bounds = minimap.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const point = {
      x: ((event.clientX - bounds.left) / bounds.width) * minimap.width,
      y: ((event.clientY - bounds.top) / bounds.height) * minimap.height,
    };
    const alert = alertNearPoint(latestAlerts, point, { width: minimap.width, height: minimap.height });
    if (!alert) return;
    focusCamera(game, alert.worldPosition, windowTarget);
    event.preventDefault?.();
    event.stopImmediatePropagation?.();
  };
  listen(minimap, 'mousedown', onMinimapPing);

  refresh(true);

  return () => {
    disposers.splice(0).reverse().forEach((dispose) => dispose());
    renderer.mini = originalMini;
    if (ui && previousToast) ui.toast = previousToast;
    if (previousApi === undefined) delete game.minimapAlerts;
    else game.minimapAlerts = previousApi;
    queue.clear();
    if (queueRoot) {
      queueRoot.innerHTML = previousQueueMarkup ?? '';
      queueRoot.className = previousQueueClassName ?? '';
    }
  };
}
