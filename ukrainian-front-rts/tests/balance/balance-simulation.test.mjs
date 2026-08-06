import assert from 'node:assert/strict';
import test from 'node:test';

import { TEAM } from '../../src/config.js';
import {
  assertPrivacySafeBalanceData,
  createBalanceSnapshot,
  runBalanceBatch,
  serializeBalanceSnapshot,
} from '../../src/core/balance-snapshot.js';
import {
  runDefaultBalanceSuite,
  runHeadlessBalanceTrial,
} from '../../src/app/balance-simulation.js';

function fakeHarnessFactory() {
  return () => {
    let selected = [];
    let state = null;
    const clone = () => structuredClone(state);
    return {
      startScenario({ missionIndex, seed }) {
        state = {
          tick: 0,
          tickSeconds: 1 / 30,
          simulationSeed: seed,
          missionIndex,
          missionId: 'fake-mission',
          time: 0,
          gameOver: false,
          outcome: null,
          endReason: null,
          player: { metal: 100, intel: 20, fuel: 10, objectives: ['hold'] },
          units: [
            { id: 1, team: TEAM.UA, type: 'uaInfantry', x: 10, y: 10, hp: 100, kills: 0 },
            { id: 2, team: TEAM.RU, type: 'ruInfantry', x: 100, y: 100, hp: 100, kills: 0 },
          ],
          buildings: [
            { id: 10, team: TEAM.UA, type: 'barracks', x: 0, y: 0, hp: 500, underConstruction: false, queue: [] },
            { id: 11, team: TEAM.RU, type: 'hq', x: 120, y: 120, hp: 500, underConstruction: false, queue: [] },
          ],
        };
        return clone();
      },
      snapshot() { return clone(); },
      issueCommand(command) {
        if (command.type === 'select') selected = [...command.entityIds];
        if (command.type === 'queue') state.buildings[0].queue.push({ type: command.unitType });
        return { ok: command.type !== 'attackMove' || selected.length > 0, value: true, error: '' };
      },
      advanceTicks(count) {
        state.tick += count;
        state.time = state.tick / 30;
        state.player.metal += 25;
        state.units[0].kills = 1;
        state.units = state.units.filter((unit) => unit.team !== TEAM.RU);
        state.buildings = state.buildings.filter((building) => building.team !== TEAM.RU);
        state.gameOver = true;
        state.outcome = 'victory';
        return clone();
      },
    };
  };
}

test('balance batches are deterministic and aggregate outcomes, timing, and metrics', () => {
  const options = {
    id: 'deterministic-matchup',
    kind: 'combat',
    iterations: 4,
    baseSeed: 'repeatable',
    context: { leftFaction: 'ua', rightFaction: 'ru' },
    runTrial: ({ index, seed }) => ({
      outcome: index < 2 ? 'win' : index === 2 ? 'loss' : 'draw',
      durationSeconds: 10 + index,
      metrics: { damage: seed % 100, survivingUnits: 4 - index },
    }),
  };

  const first = runBalanceBatch(options);
  const second = runBalanceBatch(options);
  assert.deepEqual(first, second);
  assert.equal(first.outcomes.win, 2);
  assert.equal(first.rates.win, 0.5);
  assert.equal(first.durationSeconds.p95, 13);
  assert.equal(first.metrics.survivingUnits.mean, 2.5);
  assert.equal(first.trials.length, 4);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.metrics.survivingUnits), true);
});

test('privacy-safe snapshots reject personal identifiers anywhere in exported data', () => {
  assert.throws(
    () => runBalanceBatch({
      id: 'unsafe-context',
      kind: 'economy',
      iterations: 1,
      context: { user_email: 'operator@example.test' },
      runTrial: () => ({ outcome: 'complete', durationSeconds: 1, metrics: {} }),
    }),
    /not allowed in privacy-safe balance output/,
  );
  assert.throws(
    () => assertPrivacySafeBalanceData({ session_token: 'secret' }),
    /not allowed/,
  );
});

test('balance snapshots serialize canonically and remain source-revision scoped', () => {
  const batch = runBalanceBatch({
    id: 'economy-window',
    kind: 'economy',
    iterations: 1,
    runTrial: () => ({
      outcome: 'complete',
      durationSeconds: 30,
      metrics: { income: 120, unitsProduced: 2 },
    }),
  });
  const snapshot = createBalanceSnapshot({
    sourceRevision: 'abc123',
    notes: ['No personal data collected.'],
    batches: [batch],
  });
  const output = serializeBalanceSnapshot(snapshot);
  assert.equal(output.endsWith('\n'), true);
  assert.deepEqual(JSON.parse(output), snapshot);
  assert.match(output, /"sourceRevision": "abc123"/);
  assert.doesNotMatch(output, /generatedAt|timestamp/);
});

test('headless balance trial drives commands and captures combat and economy metrics', () => {
  const combat = runHeadlessBalanceTrial({
    kind: 'combat',
    seed: 123,
    maxTicks: 30,
    tickChunk: 30,
    harnessFactory: fakeHarnessFactory(),
  });
  assert.equal(combat.outcome, 'win');
  assert.equal(combat.durationSeconds, 1);
  assert.equal(combat.metrics.commandAccepted, 1);
  assert.equal(combat.metrics.ruUnitsEnd, 0);
  assert.equal(combat.metrics.uaKills, 1);
  assert.equal(combat.metrics.playerResourcesStart, 130);
  assert.equal(combat.metrics.playerResourcesEnd, 155);
  assert.equal(combat.metrics.playerResourceDelta, 25);

  const economy = runHeadlessBalanceTrial({
    kind: 'economy',
    seed: 456,
    maxTicks: 30,
    tickChunk: 30,
    harnessFactory: fakeHarnessFactory(),
  });
  assert.equal(economy.outcome, 'win');
  assert.equal(economy.metrics.commandAccepted, 1);
  assert.equal(economy.metrics.playerResourcesStart, 130);
  assert.equal(economy.metrics.playerResourcesEnd, 155);
});

test('default suite exports combat, economy, and mission timing batches', () => {
  const snapshot = runDefaultBalanceSuite({
    iterations: 2,
    maxTicks: 30,
    sourceRevision: 'test-revision',
    harnessFactory: fakeHarnessFactory(),
  });
  assert.deepEqual(snapshot.batches.map((batch) => batch.kind), ['combat', 'economy', 'mission']);
  assert.equal(snapshot.batches.every((batch) => batch.iterations === 2), true);
  assert.equal(snapshot.sourceRevision, 'test-revision');
  assert.doesNotThrow(() => assertPrivacySafeBalanceData(snapshot));
});
