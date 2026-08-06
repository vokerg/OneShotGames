import { createSimulationHarness } from './simulation-harness.js';
import { TEAM } from '../config.js';
import {
  createBalanceSnapshot,
  runBalanceBatch,
} from '../core/balance-snapshot.js';

const RESOURCE_KEYS = Object.freeze(['metal', 'fuel', 'intel', 'supply', 'munitions', 'materials']);

function countByTeam(entities, team) {
  return (entities || []).filter((entity) => entity.team === team && entity.hp > 0).length;
}

function killCount(units, team) {
  return (units || [])
    .filter((unit) => unit.team === team)
    .reduce((total, unit) => total + (Number.isFinite(unit.kills) ? unit.kills : 0), 0);
}

function resourceTotal(player) {
  return RESOURCE_KEYS.reduce((total, key) => total + (Number.isFinite(player?.[key]) ? player[key] : 0), 0);
}

function centroid(entities) {
  const active = (entities || []).filter((entity) => Number.isFinite(entity.x) && Number.isFinite(entity.y));
  if (!active.length) return null;
  return {
    x: active.reduce((sum, entity) => sum + entity.x, 0) / active.length,
    y: active.reduce((sum, entity) => sum + entity.y, 0) / active.length,
  };
}

function mapGameOutcome(snapshot) {
  const outcome = String(snapshot.outcome || snapshot.endReason || '').toLowerCase();
  if (/victory|win|success/.test(outcome)) return 'win';
  if (/defeat|loss|failed/.test(outcome)) return 'loss';
  return snapshot.gameOver ? 'complete' : null;
}

function armCombatTrial(harness, snapshot) {
  harness.issueCommand({ type: 'spawnWave' });
  const current = harness.snapshot();
  const friendlyIds = current.units
    .filter((unit) => unit.team === TEAM.UA && unit.hp > 0)
    .map((unit) => unit.id);
  const target = centroid([
    ...current.units.filter((unit) => unit.team === TEAM.RU && unit.hp > 0),
    ...current.buildings.filter((building) => building.team === TEAM.RU && building.hp > 0),
  ]);
  if (!friendlyIds.length || !target) return false;
  harness.issueCommand({ type: 'select', entityIds: friendlyIds });
  return harness.issueCommand({ type: 'attackMove', x: target.x, y: target.y }).ok;
}

function armEconomyTrial(harness) {
  const barracks = harness.snapshot().buildings.find(
    (building) => building.team === TEAM.UA && building.type === 'barracks' && !building.underConstruction,
  );
  if (!barracks) return false;
  return harness.issueCommand({
    type: 'queue',
    buildingId: barracks.id,
    unitType: 'uaInfantry',
  }).ok;
}

export function runHeadlessBalanceTrial({
  kind,
  seed,
  missionIndex = 0,
  maxTicks = 900,
  tickChunk = 30,
  harnessFactory = () => createSimulationHarness(),
} = {}) {
  if (!['combat', 'economy', 'mission'].includes(kind)) throw new RangeError(`Unknown headless balance trial kind: ${kind}`);
  if (!Number.isInteger(missionIndex) || missionIndex < 0) throw new RangeError('missionIndex must be a non-negative integer.');
  if (!Number.isInteger(maxTicks) || maxTicks <= 0) throw new RangeError('maxTicks must be a positive integer.');
  if (!Number.isInteger(tickChunk) || tickChunk <= 0) throw new RangeError('tickChunk must be a positive integer.');
  if (typeof harnessFactory !== 'function') throw new TypeError('harnessFactory must be a function.');

  const harness = harnessFactory();
  const start = harness.startScenario({ missionIndex, seed });
  const startResources = resourceTotal(start.player);
  const startUaUnits = countByTeam(start.units, TEAM.UA);
  const startRuUnits = countByTeam(start.units, TEAM.RU);
  let commandAccepted = false;

  if (kind === 'combat') commandAccepted = armCombatTrial(harness, start);
  if (kind === 'economy') commandAccepted = armEconomyTrial(harness);

  let final = harness.snapshot();
  while (final.tick < maxTicks && !final.gameOver) {
    const remaining = maxTicks - final.tick;
    final = harness.advanceTicks(Math.min(tickChunk, remaining));
  }

  const uaUnits = countByTeam(final.units, TEAM.UA);
  const ruUnits = countByTeam(final.units, TEAM.RU);
  const uaBuildings = countByTeam(final.buildings, TEAM.UA);
  const ruBuildings = countByTeam(final.buildings, TEAM.RU);
  let outcome = mapGameOutcome(final);
  if (!outcome && kind === 'combat') {
    if (ruUnits + ruBuildings === 0 && uaUnits + uaBuildings > 0) outcome = 'win';
    else if (uaUnits + uaBuildings === 0 && ruUnits + ruBuildings > 0) outcome = 'loss';
    else outcome = 'timeout';
  }
  if (!outcome) outcome = kind === 'economy' ? 'complete' : 'timeout';

  const finalResources = resourceTotal(final.player);
  return Object.freeze({
    outcome,
    durationSeconds: final.time,
    metrics: Object.freeze({
      commandAccepted: commandAccepted ? 1 : 0,
      finalTick: final.tick,
      playerResourcesStart: startResources,
      playerResourcesEnd: finalResources,
      playerResourceDelta: finalResources - startResources,
      uaUnitsStart: startUaUnits,
      uaUnitsEnd: uaUnits,
      ruUnitsStart: startRuUnits,
      ruUnitsEnd: ruUnits,
      uaBuildingsEnd: uaBuildings,
      ruBuildingsEnd: ruBuildings,
      uaKills: killCount(final.units, TEAM.UA),
      ruKills: killCount(final.units, TEAM.RU),
      uaUnitsProduced: Math.max(0, uaUnits - startUaUnits),
      objectiveCount: Array.isArray(final.player?.objectives) ? final.player.objectives.length : 0,
    }),
  });
}

export function runHeadlessBalanceBatch({
  id,
  kind,
  iterations = 5,
  baseSeed = 'headless-balance-v1',
  missionIndex = 0,
  maxTicks = 900,
  tickChunk = 30,
  harnessFactory,
} = {}) {
  return runBalanceBatch({
    id,
    kind,
    iterations,
    baseSeed,
    context: { missionIndex, maxTicks, tickChunk },
    runTrial: ({ seed }) => runHeadlessBalanceTrial({
      kind,
      seed,
      missionIndex,
      maxTicks,
      tickChunk,
      ...(harnessFactory ? { harnessFactory } : {}),
    }),
  });
}

export function runDefaultBalanceSuite({
  iterations = 5,
  baseSeed = 'default-balance-suite-v1',
  missionIndex = 0,
  maxTicks = 900,
  sourceRevision = 'working-tree',
  harnessFactory,
} = {}) {
  const shared = { iterations, baseSeed, missionIndex, maxTicks, ...(harnessFactory ? { harnessFactory } : {}) };
  return createBalanceSnapshot({
    sourceRevision,
    notes: [
      'Deterministic headless measurements only; no personal data is collected.',
      'Balance conclusions require repeated runs and player-facing playtest evidence.',
    ],
    batches: [
      runHeadlessBalanceBatch({ id: 'combat-mission', kind: 'combat', ...shared }),
      runHeadlessBalanceBatch({ id: 'economy-window', kind: 'economy', ...shared }),
      runHeadlessBalanceBatch({ id: 'mission-timing', kind: 'mission', ...shared }),
    ],
  });
}
