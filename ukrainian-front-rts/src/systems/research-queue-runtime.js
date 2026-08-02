import { TEAM, UPGRADES } from '../config.js';
import {
  RESEARCH_CONTENTION_POLICIES,
  cancelResearch as cancelResearchItem,
  createResearchDefinition,
  createResearchQueueState,
  queueResearch,
  setResearchPaused as setQueuePaused,
  totalResearchRefund,
  updateResearchQueue,
} from './research-queue-system.js';

const MAX_RESEARCH_EVENTS = 64;

export function researchDurationSeconds(upgrade) {
  const explicit = Number(upgrade?.researchTime);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const tier = Math.max(1, Number.isInteger(upgrade?.tier) ? upgrade.tier : 1);
  return 12 + tier * 8;
}

function isResearchFacility(building) {
  return Boolean(building && building.team === TEAM.UA && building.type === 'workshop');
}

function researchFacilityId(building) {
  return `building:${building.id}`;
}

function researchFacilities(game) {
  return (game.buildings || [])
    .filter(isResearchFacility)
    .sort((left, right) => String(left.id).localeCompare(String(right.id), undefined, { numeric: true }));
}

function createFacilityState(game, building) {
  return createResearchQueueState({
    facilityId: researchFacilityId(building),
    contentionPolicy: RESEARCH_CONTENTION_POLICIES.RESEARCH_PAUSES,
    completedTechIds: [...(game.player?.upgrades || [])],
  });
}

function synchronizeCompletedTechIds(game, state) {
  const completedTechIds = [...new Set([
    ...(state.completedTechIds || []),
    ...(game.player?.upgrades || []),
  ])].sort();
  if (
    completedTechIds.length === state.completedTechIds.length &&
    completedTechIds.every((techId, index) => techId === state.completedTechIds[index])
  ) return state;
  return Object.freeze({ ...state, completedTechIds: Object.freeze(completedTechIds) });
}

function installFacilityState(game, building, state = createFacilityState(game, building)) {
  game.researchQueueStates ??= {};
  const synchronized = synchronizeCompletedTechIds(game, state);
  game.researchQueueStates[synchronized.facilityId] = synchronized;
  building.researchQueueState = synchronized;
  return synchronized;
}

function ensureFacilityState(game, building) {
  if (!isResearchFacility(building)) return null;
  const id = researchFacilityId(building);
  const state = building.researchQueueState || game.researchQueueStates?.[id];
  return installFacilityState(game, building, state || createFacilityState(game, building));
}

function facilityById(game, facilityId) {
  return researchFacilities(game).find((building) =>
    building.hp > 0 && researchFacilityId(building) === facilityId,
  ) || null;
}

function addResources(player, resources = {}) {
  for (const [resource, amount] of Object.entries(resources)) {
    player[resource] = Math.max(0, Number(player[resource] || 0) + amount);
  }
}

function chargeResources(player, resources = {}) {
  for (const [resource, amount] of Object.entries(resources)) player[resource] -= amount;
}

function record(game, entry) {
  game.researchQueueEvents ??= [];
  game.researchQueueEvents.push(Object.freeze({
    time: Number(game.time) || 0,
    ...entry,
  }));
  if (game.researchQueueEvents.length > MAX_RESEARCH_EVENTS) {
    game.researchQueueEvents.splice(0, game.researchQueueEvents.length - MAX_RESEARCH_EVENTS);
  }
}

function applyCompletedUpgrade(game, techId) {
  if (game.player.upgrades.has(techId)) return;
  game.player.upgrades.add(techId);
  for (const unit of (game.units || []).filter((candidate) => candidate.team === TEAM.UA)) {
    const previousMaxHp = unit.maxHp;
    const nextMaxHp = game.unitStats(unit.type).hp;
    if (nextMaxHp !== previousMaxHp) {
      unit.maxHp = nextMaxHp;
      unit.hp = Math.min(nextMaxHp, unit.hp + (nextMaxHp - previousMaxHp));
    }
  }
}

function selectedResearchFacility(game) {
  return game.selectedEntities().find(isResearchFacility) || null;
}

function productionBusyForResearch(game, building) {
  const snapshot = game.researchProductionBusyBuildingIds;
  if (snapshot instanceof Set) return snapshot.has(building.id);
  return Boolean(building.queue?.length && !building.productionPaused);
}

function availableResearchResources(player, cost) {
  return Object.fromEntries(
    Object.keys(cost).map((resource) => [resource, player?.[resource] ?? 0]),
  );
}

export function queueUpgradeResearch(game, techId) {
  game.lastError = '';
  if (game.gameOver) return false;
  const upgrade = UPGRADES[techId];
  if (!upgrade) return game.fail('Unknown modernization project.');
  const building = selectedResearchFacility(game);
  if (!building) return game.fail('Select a Ukrainian repair workshop to begin research.');
  if (building.underConstruction || building.hp <= 0) return game.fail('Finish constructing the repair workshop first.');

  const state = ensureFacilityState(game, building);
  const definition = createResearchDefinition({
    id: techId,
    name: upgrade.name,
    researchTime: researchDurationSeconds(upgrade),
    cost: upgrade.cost,
    requires: upgrade.requires ? [upgrade.requires] : [],
  });
  const result = queueResearch(state, definition, {
    availableResources: availableResearchResources(game.player, definition.cost),
  });
  if (!result.ok) {
    const missing = result.missing?.map((id) => UPGRADES[id]?.name || id).join(', ');
    return game.fail(missing ? `${result.reason} Missing: ${missing}.` : result.reason);
  }

  chargeResources(game.player, result.charged);
  installFacilityState(game, building, result.state);
  record(game, result.event);
  return true;
}

export function cancelQueuedResearch(game, facilityId, itemId) {
  game.lastError = '';
  const building = facilityById(game, facilityId);
  if (!building) return game.fail('Research facility is no longer available.');
  const result = cancelResearchItem(ensureFacilityState(game, building), itemId);
  if (!result.ok) return game.fail(result.reason);
  addResources(game.player, result.refunded);
  installFacilityState(game, building, result.state);
  record(game, result.event);
  return true;
}

export function setQueuedResearchPaused(game, facilityId, paused) {
  game.lastError = '';
  const building = facilityById(game, facilityId);
  if (!building) return game.fail('Research facility is no longer available.');
  const result = setQueuePaused(ensureFacilityState(game, building), paused);
  if (!result.ok) return game.fail(result.reason);
  installFacilityState(game, building, result.state);
  record(game, result.event);
  return true;
}

function refundMissingFacilities(game) {
  const liveIds = new Set(researchFacilities(game)
    .filter((building) => building.hp > 0)
    .map(researchFacilityId));
  for (const [facilityId, state] of Object.entries(game.researchQueueStates || {})) {
    if (liveIds.has(facilityId)) continue;
    const refunded = totalResearchRefund(state);
    addResources(game.player, refunded);
    delete game.researchQueueStates[facilityId];
    record(game, { type: 'researchFacilityLost', facilityId, refunded });
  }
}

export function updateResearchQueues(game, stepSeconds) {
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new RangeError('Research step duration must be a positive finite number.');
  }
  refundMissingFacilities(game);
  for (const building of researchFacilities(game)) {
    if (building.hp <= 0 || building.underConstruction) continue;
    const result = updateResearchQueue(ensureFacilityState(game, building), stepSeconds, {
      productionBusy: productionBusyForResearch(game, building),
    });
    installFacilityState(game, building, result.state);
    result.events.forEach((event) => record(game, event));
    result.completedTechIds.forEach((techId) => applyCompletedUpgrade(game, techId));
  }
}

export function createResearchQueueRuntime(game) {
  for (const method of ['start', 'addBuilding', 'selectedEntities', 'unitStats', 'fail']) {
    if (typeof game?.[method] !== 'function') throw new TypeError(`Research runtime requires game.${method}().`);
  }
  const originalStart = game.start.bind(game);
  const originalAddBuilding = game.addBuilding.bind(game);
  const originalResearch = game.research?.bind(game);
  const previousCancelResearch = game.cancelResearch;
  const previousSetResearchPaused = game.setResearchPaused;
  const previousUpdateResearch = game.updateResearch;
  const previousStates = game.researchQueueStates;
  const previousEvents = game.researchQueueEvents;

  game.start = (...args) => {
    game.researchQueueStates = {};
    game.researchQueueEvents = [];
    const result = originalStart(...args);
    researchFacilities(game).forEach((building) => ensureFacilityState(game, building));
    return result;
  };
  game.addBuilding = (...args) => {
    const building = originalAddBuilding(...args);
    if (isResearchFacility(building)) ensureFacilityState(game, building);
    return building;
  };
  game.research = (techId) => queueUpgradeResearch(game, techId);
  game.cancelResearch = (facilityId, itemId) => cancelQueuedResearch(game, facilityId, itemId);
  game.setResearchPaused = (facilityId, paused) => setQueuedResearchPaused(game, facilityId, paused);
  game.updateResearch = (stepSeconds) => updateResearchQueues(game, stepSeconds);

  if (game.player) {
    game.researchQueueStates = {};
    game.researchQueueEvents = [];
    researchFacilities(game).forEach((building) => ensureFacilityState(game, building));
  }

  return () => {
    game.start = originalStart;
    game.addBuilding = originalAddBuilding;
    if (originalResearch) game.research = originalResearch;
    else delete game.research;
    if (previousCancelResearch === undefined) delete game.cancelResearch;
    else game.cancelResearch = previousCancelResearch;
    if (previousSetResearchPaused === undefined) delete game.setResearchPaused;
    else game.setResearchPaused = previousSetResearchPaused;
    if (previousUpdateResearch === undefined) delete game.updateResearch;
    else game.updateResearch = previousUpdateResearch;
    for (const building of game.buildings || []) delete building.researchQueueState;
    if (previousStates === undefined) delete game.researchQueueStates;
    else game.researchQueueStates = previousStates;
    if (previousEvents === undefined) delete game.researchQueueEvents;
    else game.researchQueueEvents = previousEvents;
  };
}
