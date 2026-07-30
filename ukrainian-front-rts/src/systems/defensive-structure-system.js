const EPSILON = 1e-9;

export const DEFENSIVE_STRUCTURE_VERSION = 1;
export const DEFENSE_CATEGORIES = Object.freeze({ FORTIFICATION: 'fortification', CHECKPOINT: 'checkpoint', OBSTACLE: 'obstacle', MINEFIELD: 'minefield', OBSERVATION: 'observation', ACTIVE: 'active' });
export const DEFENSE_STATUSES = Object.freeze({ BUILDING: 'building', OPERATIONAL: 'operational', DESTROYED: 'destroyed', CLEARED: 'cleared' });
export const DEFENSE_EVENT_TYPES = Object.freeze({ CONSTRUCTION_STARTED: 'constructionStarted', CONSTRUCTION_COMPLETED: 'constructionCompleted', ENABLED_CHANGED: 'enabledChanged', ENGAGEMENT: 'engagement', DAMAGED: 'damaged', DESTROYED: 'destroyed', CLEARED: 'cleared' });
export const DEFENSE_KINDS = Object.freeze({ TRENCH: 'trench', SANDBAGS: 'sandbags', CHECKPOINT: 'checkpoint', ANTI_VEHICLE_OBSTACLE: 'antiVehicleObstacle', MINEFIELD: 'minefield', OBSERVATION_POST: 'observationPost', SENTRY_GUN: 'sentryGun' });

function freeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); Object.values(value).forEach(freeze); return value; }
function clone(value) { if (Array.isArray(value)) return value.map(clone); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clone(child)])); return value; }
function sorted(value = {}) { return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, clone(child)])); }
function number(value, name, positive = false) { if (!Number.isFinite(value) || (positive ? value <= 0 : value < 0)) throw new RangeError(`${name} must be a finite number ${positive ? 'greater than 0' : 'at least 0'}.`); return value; }
function string(value, name) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`); return value.trim(); }
function rotation(value, allowed) { if (!Number.isInteger(value)) throw new TypeError('Defense rotation must be an integer.'); const normalized = ((value % 360) + 360) % 360; if (!allowed.includes(normalized)) throw new RangeError(`Defense rotation ${normalized} is not supported.`); return normalized; }
function define(id, name, category, footprint, cost, buildWork, maxHp, placement, extras = {}) { return freeze({ version: 1, id, name, category, footprint: { width: footprint[0], height: footprint[1] }, rotations: extras.rotations ?? [0, 90, 180, 270], cost: sorted(cost), buildWork, maxHp, placement: clone(placement), cover: { cover: 0, concealment: 0, damageReduction: 0, occupancy: 0, ...(extras.cover ?? {}) }, observation: { sightBonus: 0, detectionRadius: 0, ...(extras.observation ?? {}) }, minefield: extras.minefield ? clone(extras.minefield) : null, weapon: extras.weapon ? clone(extras.weapon) : null }); }
const place = (allowedTerrain, flattenableTerrain, blocksInfantry, blocksVehicles, blocksSight, allowPathSever) => ({ allowedTerrain, flattenableTerrain, blocksInfantry, blocksVehicles, blocksSight, requiresAccess: true, allowPathSever });

export const DEFENSE_CATALOG = freeze({
  trench: define('trench', 'Field Trench', DEFENSE_CATEGORIES.FORTIFICATION, [2, 1], { metal: 35 }, 8, 260, place(['open', 'mud', 'rubble'], ['mud', 'rubble'], false, false, false, true), { cover: { cover: 0.45, concealment: 0.2, damageReduction: 0.22, occupancy: 6 } }),
  sandbags: define('sandbags', 'Sandbag Wall', DEFENSE_CATEGORIES.FORTIFICATION, [2, 1], { metal: 25 }, 5, 180, place(['open', 'road', 'mud', 'rubble'], ['mud', 'rubble'], false, true, false, false), { cover: { cover: 0.32, concealment: 0.08, damageReduction: 0.14, occupancy: 4 } }),
  checkpoint: define('checkpoint', 'Checkpoint', DEFENSE_CATEGORIES.CHECKPOINT, [2, 2], { metal: 90, fuel: 10 }, 18, 520, place(['open', 'road', 'rubble'], ['rubble'], true, true, true, false), { cover: { cover: 0.42, concealment: 0.1, damageReduction: 0.18, occupancy: 5 }, observation: { sightBonus: 2, detectionRadius: 3 } }),
  antiVehicleObstacle: define('antiVehicleObstacle', 'Anti-Vehicle Obstacles', DEFENSE_CATEGORIES.OBSTACLE, [2, 1], { metal: 45 }, 7, 320, place(['open', 'road', 'mud', 'rubble'], ['mud', 'rubble'], false, true, false, false)),
  minefield: define('minefield', 'Defensive Minefield', DEFENSE_CATEGORIES.MINEFIELD, [2, 2], { metal: 55 }, 10, 1, place(['open', 'road', 'mud', 'rubble'], [], false, false, false, true), { rotations: [0], minefield: { mechanic: 'engineerMinefield', mineCount: 6, armingSeconds: 3, triggerDomains: ['ground'] } }),
  observationPost: define('observationPost', 'Observation Post', DEFENSE_CATEGORIES.OBSERVATION, [1, 1], { metal: 65, intel: 5 }, 12, 170, place(['open', 'road', 'mud', 'rubble'], ['mud', 'rubble'], true, true, false, false), { observation: { sightBonus: 8, detectionRadius: 10 } }),
  sentryGun: define('sentryGun', 'Remote Sentry Gun', DEFENSE_CATEGORIES.ACTIVE, [1, 1], { metal: 110, fuel: 15 }, 20, 280, place(['open', 'road', 'rubble'], ['rubble'], true, true, false, false), { observation: { sightBonus: 4, detectionRadius: 5 }, weapon: { id: 'sentryMachineGun', range: 7, reloadSeconds: 1.5, damage: 18, targetDomains: ['ground'], targetTags: ['infantry', 'worker', 'vehicle'], maxShotsPerTick: 32 } }),
});

export function getDefenseDefinition(id) { if (!DEFENSE_CATALOG[id]) throw new RangeError(`Unknown defense definition: ${id}`); return DEFENSE_CATALOG[id]; }
function footprint(definition, angle) { const swap = angle === 90 || angle === 270; return { width: swap ? definition.footprint.height : definition.footprint.width, height: swap ? definition.footprint.width : definition.footprint.height }; }

export function createDefensePlacementRequest({ orderId, structureId, defenseId, team, tileX, tileY, rotation: angle = 0, requestedBy = null }) {
  const definition = getDefenseDefinition(defenseId); const normalized = rotation(angle, definition.rotations);
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)) throw new TypeError('Defense tile coordinates must be integers.');
  return freeze({ version: 1, orderId: string(orderId, 'Defense order ID'), structureId: string(structureId, 'Defense structure ID'), defenseId, team: string(team, 'Defense team'), requestedBy: requestedBy == null ? null : string(requestedBy, 'Defense requester ID'), tile: { x: tileX, y: tileY }, rotation: normalized, footprint: footprint(definition, normalized), placement: clone(definition.placement), cost: clone(definition.cost), buildWork: definition.buildWork });
}

const failures = [['withinBounds', 'Defense footprint is outside the battlefield.'], ['terrainAllowed', 'Defense cannot be built on this terrain.'], ['overlapFree', 'Defense footprint overlaps an occupied cell.'], ['accessClear', 'Defense has no valid construction access cell.']];
export function evaluateDefensePlacement(request, evaluation) {
  if (!request || request.version !== 1) throw new TypeError('A valid defense placement request is required.');
  if (!evaluation || typeof evaluation !== 'object') return freeze({ ok: false, reason: 'Placement evaluation is unavailable.' });
  for (const [field, reason] of failures) if (evaluation[field] !== true) return freeze({ ok: false, reason, field });
  if (evaluation.pathSevered === true && request.placement.allowPathSever !== true) return freeze({ ok: false, reason: 'Defense would sever required navigation access.', field: 'pathSevered' });
  const terrain = typeof evaluation.terrain === 'string' ? evaluation.terrain : null;
  if (terrain && !request.placement.allowedTerrain.includes(terrain)) return freeze({ ok: false, reason: 'Defense cannot be built on this terrain.', field: 'terrain' });
  return freeze({ ok: true, request: clone(request), terrain, flattenedTerrain: request.placement.flattenableTerrain.includes(terrain) ? terrain : null, blockerRevisionRequired: Boolean(request.placement.blocksInfantry || request.placement.blocksVehicles || request.placement.blocksSight) });
}

export function createDefenseState(request, placementResult) {
  if (!placementResult?.ok) throw new Error('Defense construction requires a successful placement result.'); const definition = getDefenseDefinition(request.defenseId);
  return freeze({ version: 1, id: request.structureId, orderId: request.orderId, defenseId: request.defenseId, team: request.team, tile: clone(request.tile), rotation: request.rotation, footprint: clone(request.footprint), status: DEFENSE_STATUSES.BUILDING, workDone: 0, workRequired: definition.buildWork, progress: 0, hp: definition.maxHp, maxHp: definition.maxHp, enabled: true, cooldownRemaining: 0, eventSequence: 1 });
}
function event(state, type, details = {}) { return { version: 1, sequence: state.eventSequence, type, structureId: state.id, defenseId: state.defenseId, team: state.team, ...clone(details) }; }
function output(ok, state, events = [], extra = {}) { return freeze({ ok, state: clone(state), events: clone(events), ...clone(extra) }); }

export function applyDefenseConstructionWork(state, work) {
  number(work, 'Defense construction work', true); if (state.status !== DEFENSE_STATUSES.BUILDING) return output(false, state, [], { reason: 'Defense is not under construction.' });
  const workDone = Math.min(state.workRequired, state.workDone + work); const completed = workDone >= state.workRequired - EPSILON; const events = []; let sequence = state.eventSequence;
  if (state.workDone <= EPSILON) events.push(event({ ...state, eventSequence: sequence++ }, DEFENSE_EVENT_TYPES.CONSTRUCTION_STARTED));
  if (completed) events.push(event({ ...state, eventSequence: sequence++ }, DEFENSE_EVENT_TYPES.CONSTRUCTION_COMPLETED));
  return output(true, { ...state, status: completed ? DEFENSE_STATUSES.OPERATIONAL : state.status, workDone, progress: Math.min(1, workDone / state.workRequired), eventSequence: sequence }, events, { completed });
}

export function setDefenseEnabled(state, enabled) {
  if (state.status !== DEFENSE_STATUSES.OPERATIONAL) return output(false, state, [], { reason: 'Only an operational defense can change enabled state.' }); const value = Boolean(enabled);
  if (value === state.enabled) return output(true, state, [], { changed: false }); return output(true, { ...state, enabled: value, eventSequence: state.eventSequence + 1 }, [event(state, DEFENSE_EVENT_TYPES.ENABLED_CHANGED, { enabled: value })], { changed: true });
}

export function getDefenseEffectSnapshot(state) {
  const definition = getDefenseDefinition(state.defenseId); const operational = state.status === DEFENSE_STATUSES.OPERATIONAL; const cleared = state.status === DEFENSE_STATUSES.CLEARED;
  return freeze({ version: 1, structureId: state.id, defenseId: state.defenseId, status: state.status, progress: state.progress, hp: state.hp, maxHp: state.maxHp, enabled: operational && state.enabled, cover: operational ? clone(definition.cover) : { cover: 0, concealment: 0, damageReduction: 0, occupancy: 0 }, observation: operational ? clone(definition.observation) : { sightBonus: 0, detectionRadius: 0 }, blocking: { infantry: !cleared && definition.placement.blocksInfantry, vehicles: !cleared && definition.placement.blocksVehicles, sight: !cleared && definition.placement.blocksSight }, activeDefense: operational && state.enabled && Boolean(definition.weapon) });
}

function cells(state) { const result = []; for (let y = 0; y < state.footprint.height; y += 1) for (let x = 0; x < state.footprint.width; x += 1) result.push({ x: state.tile.x + x, y: state.tile.y + y }); return result; }
export function createMinefieldDeploymentDescriptor(state) {
  const definition = getDefenseDefinition(state.defenseId); if (!definition.minefield) return freeze({ ok: false, reason: 'Defense is not a minefield.' }); if (state.status !== DEFENSE_STATUSES.OPERATIONAL) return freeze({ ok: false, reason: 'Minefield construction is incomplete.' });
  return freeze({ ok: true, deployment: { version: 1, sourceStructureId: state.id, defenseId: state.defenseId, team: state.team, mechanic: definition.minefield.mechanic, mineCount: definition.minefield.mineCount, armingSeconds: definition.minefield.armingSeconds, triggerDomains: [...definition.minefield.triggerDomains], cells: cells(state) } });
}

function distance(state, candidate) { return Math.hypot(number(candidate.x, 'Target x') - state.tile.x, number(candidate.y, 'Target y') - state.tile.y); }
export function selectActiveDefenseTarget(state, candidates = []) {
  const definition = getDefenseDefinition(state.defenseId); if (state.status !== DEFENSE_STATUSES.OPERATIONAL || !state.enabled || !definition.weapon) return null; const eligible = [];
  for (const candidate of candidates) { if (!candidate || candidate.alive === false || candidate.detected === false || typeof candidate.team !== 'string' || candidate.team === state.team || !definition.weapon.targetDomains.includes(candidate.domain)) continue; const range = distance(state, candidate); if (range > definition.weapon.range + EPSILON) continue; const tag = definition.weapon.targetTags.indexOf(candidate.tag); eligible.push({ id: string(candidate.id, 'Target ID'), distance: range, priority: tag < 0 ? definition.weapon.targetTags.length : tag, threat: Number.isFinite(candidate.threat) ? candidate.threat : 0, domain: candidate.domain, tag: candidate.tag ?? null }); }
  eligible.sort((a, b) => a.priority - b.priority || b.threat - a.threat || a.distance - b.distance || a.id.localeCompare(b.id)); return eligible.length ? freeze(eligible[0]) : null;
}

export function tickActiveDefense(state, elapsedSeconds, candidates = []) {
  number(elapsedSeconds, 'Defense elapsed time', true); const definition = getDefenseDefinition(state.defenseId); if (state.status !== DEFENSE_STATUSES.OPERATIONAL || !state.enabled || !definition.weapon) return output(true, state, [], { shots: 0 });
  let remaining = elapsedSeconds; let cooldown = Math.max(0, state.cooldownRemaining); let sequence = state.eventSequence; const events = []; let shots = 0;
  while (remaining > EPSILON && shots < definition.weapon.maxShotsPerTick) { if (cooldown > EPSILON) { const used = Math.min(remaining, cooldown); cooldown -= used; remaining -= used; if (cooldown > EPSILON || remaining <= EPSILON) break; } const target = selectActiveDefenseTarget(state, candidates); if (!target) { cooldown = 0; break; } events.push(event({ ...state, eventSequence: sequence++ }, DEFENSE_EVENT_TYPES.ENGAGEMENT, { weaponId: definition.weapon.id, targetId: target.id, targetDomain: target.domain, damage: definition.weapon.damage, distance: target.distance })); shots += 1; cooldown = definition.weapon.reloadSeconds; }
  return output(true, { ...state, cooldownRemaining: Math.max(0, cooldown), eventSequence: sequence }, events, { shots });
}

export function applyDefenseDamage(state, damage) {
  number(damage, 'Defense damage', true); if (![DEFENSE_STATUSES.BUILDING, DEFENSE_STATUSES.OPERATIONAL].includes(state.status)) return output(false, state, [], { reason: 'Defense cannot take damage in its current state.' });
  const hp = Math.max(0, state.hp - damage); const destroyed = hp <= EPSILON; let sequence = state.eventSequence; const events = [event({ ...state, eventSequence: sequence++ }, DEFENSE_EVENT_TYPES.DAMAGED, { damage, hp })]; if (destroyed) events.push(event({ ...state, eventSequence: sequence++ }, DEFENSE_EVENT_TYPES.DESTROYED));
  return output(true, { ...state, hp, status: destroyed ? DEFENSE_STATUSES.DESTROYED : state.status, enabled: destroyed ? false : state.enabled, cooldownRemaining: destroyed ? 0 : state.cooldownRemaining, eventSequence: sequence }, events, { destroyed, destructionRequest: destroyed ? { version: 1, sourceStructureId: state.id, sourceDefenseId: state.defenseId, team: state.team, position: clone(state.tile), footprint: clone(state.footprint), requestedLifecycle: 'wreckOrRubble' } : null });
}

export function clearDestroyedDefense(state) { if (state.status !== DEFENSE_STATUSES.DESTROYED) return output(false, state, [], { reason: 'Only a destroyed defense can be cleared.' }); return output(true, { ...state, status: DEFENSE_STATUSES.CLEARED, eventSequence: state.eventSequence + 1 }, [event(state, DEFENSE_EVENT_TYPES.CLEARED)]); }
export function getDefenseCatalogSnapshot() { return freeze(Object.values(DEFENSE_CATALOG).map(clone)); }
