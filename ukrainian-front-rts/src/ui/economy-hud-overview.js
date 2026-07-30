import { BUILDING_TYPES, TEAM, UNIT_TYPES, UPGRADES } from '../config.js';
import { createEconomyHudModel, economyHudSignature } from '../core/economy-hud-model.js';
import { describeResearchQueue } from '../systems/research-queue-system.js';

const LABELS = Object.freeze({ metal: 'Metal', fuel: 'Fuel', intel: 'Intel' });

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
    rally: { waypoints: building.rallyWaypoints || [], blockedReason: building.productionExitBlocked || '' },
  };
}

function researchSnapshots(game) {
  const result = [];
  for (const building of game.buildings || []) {
    if (building.team !== TEAM.UA || !building.researchQueueState) continue;
    result.push({
      ...describeResearchQueue(building.researchQueueState, { productionBusy: Boolean(building.queue?.length) }),
      name: BUILDING_TYPES[building.type]?.name || building.type,
    });
  }
  for (const [facilityId, state] of Object.entries(game.researchQueueStates || {})) {
    if (!state || result.some((entry) => entry.facilityId === facilityId)) continue;
    result.push({ ...describeResearchQueue(state), name: facilityId });
  }
  return result;
}

function affordability(game, cost = {}) {
  return Object.entries(cost)
    .filter(([resource, amount]) => (game.player?.[resource] || 0) < amount)
    .map(([resource, amount]) => `Needs ${amount} ${resource}`);
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
  for (const [upgradeId, upgrade] of Object.entries(UPGRADES)) {
    const reasons = [];
    const done = game.player?.upgrades?.has(upgradeId);
    if (done) reasons.push('Research complete');
    if (upgrade.requires && !game.player?.upgrades?.has(upgrade.requires)) {
      reasons.push(`Requires ${UPGRADES[upgrade.requires]?.name || upgrade.requires}`);
    }
    reasons.push(...affordability(game, upgrade.cost));
    rows.push({ id: upgradeId, kind: 'research', label: upgrade.name, available: !done && !reasons.length, reasons });
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

export function createEconomyHudSnapshot(game) {
  return createEconomyHudModel({
    resources: game.player || {},
    incomeRates: game.resourceIncomeRates?.() || {},
    production: productionFacilities(game).map((building) => productionSnapshot(game, building)),
    research: researchSnapshots(game),
    prerequisites: prerequisiteSnapshots(game),
    capacity: capacitySnapshot(game),
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
      node(documentTarget, 'strong', '', LABELS[resource.id] || resource.id),
      node(documentTarget, 'span', '', String(Math.floor(resource.amount))),
      node(documentTarget, 'small', '', `+${Math.floor(resource.incomePerMinute)}/min delivered`),
    );
    grid.append(row);
  }
  section.append(grid);
  return section;
}

function renderProduction(documentTarget, entries) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  section.append(node(documentTarget, 'h3', '', 'Production overview'));
  if (!entries.length) section.append(node(documentTarget, 'p', 'economyHudEmpty', 'No Ukrainian production facilities.'));
  for (const entry of entries) {
    const card = node(documentTarget, 'article', `economyHudCard${entry.selected ? ' selected' : ''}`);
    const header = node(documentTarget, 'div', 'economyHudCardHeader');
    header.append(node(documentTarget, 'strong', '', entry.name), action(documentTarget, 'Focus', 'focus-building', { buildingId: entry.buildingId }));
    card.append(header, node(documentTarget, 'small', '', `${entry.paused ? 'PAUSED' : 'RUNNING'} · ${entry.repeat ? 'REPEAT' : 'SINGLE'}`));
    const warning = entry.repeatBlockedReason || entry.exitBlockedReason;
    if (warning) card.append(node(documentTarget, 'p', 'economyHudWarning', warning));
    if (!entry.queue.length) card.append(node(documentTarget, 'p', 'economyHudEmpty', 'Queue empty'));
    for (const item of entry.queue) {
      const row = node(documentTarget, 'div', 'economyHudQueueItem');
      const label = node(documentTarget, 'div', 'economyHudQueueLabel');
      label.append(node(documentTarget, 'span', '', `${item.index + 1}. ${item.name}`), node(documentTarget, 'small', '', `${item.percent}% · ${Math.ceil(item.remaining)}s`));
      const controls = node(documentTarget, 'div', 'economyHudQueueControls');
      controls.append(
        action(documentTarget, '↑', 'move-production', { buildingId: entry.buildingId, fromIndex: item.index, toIndex: item.index - 1 }, !item.canMoveUp),
        action(documentTarget, '↓', 'move-production', { buildingId: entry.buildingId, fromIndex: item.index, toIndex: item.index + 1 }, !item.canMoveDown),
        action(documentTarget, 'Cancel', 'cancel-production', { buildingId: entry.buildingId, index: item.index }, !item.canCancel),
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
    if (rally.length) card.append(action(documentTarget, 'Clear rally', 'clear-production-rally', { buildingId: entry.buildingId }));
    section.append(card);
  }
  return section;
}

function renderResearch(documentTarget, model) {
  const section = node(documentTarget, 'section', 'economyHudSection');
  section.append(node(documentTarget, 'h3', '', 'Research overview'));
  if (!model.research.length) section.append(node(documentTarget, 'p', 'economyHudEmpty', 'No timed research queued.'));
  for (const facility of model.research) {
    const card = node(documentTarget, 'article', 'economyHudCard');
    card.append(node(documentTarget, 'strong', '', facility.name));
    if (facility.blockedReason) card.append(node(documentTarget, 'p', 'economyHudWarning', facility.blockedReason));
    for (const item of facility.items) {
      const row = node(documentTarget, 'div', 'economyHudQueueItem');
      row.append(node(documentTarget, 'span', '', `${item.name} · ${item.status}`), meter(documentTarget, item.percent));
      if (item.cancellable) row.append(action(documentTarget, 'Cancel', 'cancel-research', { facilityId: facility.facilityId, itemId: item.id }));
      card.append(row);
    }
    section.append(card);
  }
  const available = model.prerequisites.filter((entry) => entry.kind === 'research' && entry.available);
  if (available.length) section.append(node(documentTarget, 'p', 'economyHudAvailable', `Available: ${available.map((entry) => entry.label).join(', ')}`));
  for (const entry of model.prerequisites.filter((candidate) => candidate.kind === 'research' && !candidate.available)) {
    section.append(node(documentTarget, 'p', 'economyHudPrerequisite', `${entry.label}: ${entry.reasons.join(' · ')}`));
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
  root.replaceChildren(renderResources(documentTarget, model), capacity, renderProduction(documentTarget, model.production), renderResearch(documentTarget, model));
}

function buildingById(game, id) {
  return (game.buildings || []).find((building) => String(building.id) === String(id)) || null;
}

function selectFacility(game, building) {
  if (!building) return false;
  game.select(building);
  if (game.camera && Number.isFinite(building.x) && Number.isFinite(building.y)) {
    game.camera.x = innerWidth / 2 - building.x * game.camera.z;
    game.camera.y = innerHeight / 2 - building.y * game.camera.z;
  }
  return true;
}

export function installEconomyHudOverview({ game, ui, documentTarget = document } = {}) {
  if (!game || !ui || typeof ui.refresh !== 'function') throw new TypeError('Economy HUD requires game and UI instances.');
  const panel = documentTarget.querySelector('#economyHud');
  const content = documentTarget.querySelector('#economyHudContent');
  const toggle = documentTarget.querySelector('#economyHudToggle');
  const close = documentTarget.querySelector('#economyHudClose');
  if (!panel || !content || !toggle || !close) throw new Error('Economy HUD markup is incomplete.');

  const originalRefresh = ui.refresh.bind(ui);
  let signature = '';
  const refreshOverview = () => {
    if (!game.mission) return;
    const model = createEconomyHudSnapshot(game);
    const next = economyHudSignature(model);
    if (next !== signature) {
      signature = next;
      renderEconomyHud(content, model, { documentTarget });
    }
  };
  ui.refresh = (...args) => {
    const result = originalRefresh(...args);
    refreshOverview();
    return result;
  };

  const setOpen = (open) => {
    panel.classList.toggle('hidden', !open);
    toggle.setAttribute('aria-expanded', String(open));
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
    if (name === 'focus-building') ok = selectFacility(game, building);
    else if (name === 'cancel-production') ok = selectFacility(game, building) && game.cancelProduction(Number(target.dataset.index));
    else if (name === 'move-production') ok = selectFacility(game, building) && game.moveProduction(Number(target.dataset.fromIndex), Number(target.dataset.toIndex));
    else if (name === 'set-production-paused') ok = selectFacility(game, building) && game.setProductionPaused(target.dataset.paused === 'true');
    else if (name === 'set-production-repeat') ok = selectFacility(game, building) && game.setProductionRepeat(target.dataset.repeat === 'true');
    else if (name === 'clear-production-rally') ok = game.clearProductionRally?.(building) ?? false;
    else if (name === 'cancel-research') ok = game.cancelResearch?.(target.dataset.facilityId, target.dataset.itemId) ?? false;
    if (!ok && game.lastError) ui.toast(game.lastError);
    signature = '';
    ui.refresh();
  };
  content.addEventListener('click', activate);

  return () => {
    ui.refresh = originalRefresh;
    toggle.removeEventListener('click', togglePanel);
    close.removeEventListener('click', closePanel);
    content.removeEventListener('click', activate);
  };
}
