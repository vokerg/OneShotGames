import test from 'node:test';
import assert from 'node:assert/strict';

import { createAiDoctrineProfile } from '../../src/ai/ai-contracts.js';
import {
  planEconomyForDifficulty,
  planTacticalAiForDifficulty,
} from '../../src/ai/ai-difficulty-profiles.js';

const doctrine = createAiDoctrineProfile({
  id: 'ua-balanced',
  factionId: 'ukraine',
  strategy: 'combined-arms',
  decisionIntervalTicks: 12,
  decisionOffsetTicks: 3,
  contactStaleAfterTicks: 120,
  contactForgetAfterTicks: 360,
  riskTolerance: 0.5,
  retreatThreshold: 0.35,
});

function economySnapshot() {
  return {
    tick: 100,
    factionId: 'ukraine',
    resources: { supplies: 1000 },
    workers: [],
    bases: [{ id: 'base', operational: true }],
    productionBuildings: [{ id: 'factory', operational: true }],
    resourceSites: [],
    damagedStructures: Array.from({ length: 8 }, (_, index) => ({
      id: `damaged-${index}`,
      repairCost: { supplies: 1 },
      priority: 8 - index,
    })),
    buildOptions: [],
    unitOptions: [{ id: 'rifle', kind: 'train-unit', cost: { supplies: 10 }, priority: 1 }],
    researchOptions: [{ id: 'optics', kind: 'research', cost: { supplies: 10 }, priority: 1 }],
    capacity: { used: 1, maximum: 10 },
    targets: { desiredBases: 1, desiredProductionBuildings: 1, desiredCapacityBuffer: 2 },
  };
}

test('economy integration constrains plan concurrency while preserving real prices and resources', () => {
  const recruit = planEconomyForDifficulty({ snapshot: economySnapshot(), doctrine, difficulty: 'recruit' });
  const commander = planEconomyForDifficulty({ snapshot: economySnapshot(), doctrine, difficulty: 'commander' });

  assert.equal(recruit.difficulty.profileId, 'recruit');
  assert.equal(commander.difficulty.profileId, 'commander');
  assert.equal(recruit.actions.length, recruit.difficulty.maximumConcurrentPlans);
  assert.equal(commander.actions.length, commander.difficulty.maximumConcurrentPlans);
  assert.ok(recruit.actions.length < commander.actions.length);
  assert.deepEqual(recruit.actions[0].cost, { supplies: 1 });
  assert.equal(recruit.budgetPlan.resources.supplies, 1000);
  assert.equal(commander.budgetPlan.resources.supplies, 1000);
});

test('tactical integration delays only observed contacts and feeds adjusted doctrine into the real planner', () => {
  const input = {
    tick: 100,
    decisionIndex: 4,
    doctrine,
    goals: [{ kind: 'attack' }],
    knowledge: [
      { id: 'recent', kind: 'unit', state: 'confirmed', lastSeenTick: 95, strength: 20, position: { x: 400, y: 400 } },
      { id: 'older', kind: 'unit', state: 'confirmed', lastSeenTick: 40, strength: 5, position: { x: 300, y: 300 } },
    ],
    ownUnits: [
      { id: 'u1', x: 100, y: 100, hp: 100, maxHp: 100, strength: 20, combat: true },
      { id: 'u2', x: 110, y: 100, hp: 100, maxHp: 100, strength: 20, combat: true },
      { id: 'u3', x: 120, y: 100, hp: 100, maxHp: 100, strength: 20, combat: true },
    ],
    ownStructures: [{ id: 'hq', kind: 'hq', x: 100, y: 100, strength: 30 }],
  };

  const recruit = planTacticalAiForDifficulty({ ...input, difficulty: 'recruit' });
  const commander = planTacticalAiForDifficulty({ ...input, difficulty: 'commander' });

  assert.equal(recruit.difficulty.profileId, 'recruit');
  assert.equal(commander.difficulty.profileId, 'commander');
  assert.equal(recruit.target.id, 'older');
  assert.equal(commander.target.id, 'recent');
  assert.ok(recruit.commands.length <= 6);
  assert.ok(commander.commands.length <= 12);
  assert.equal(recruit.difficulty.observationDelayTicks, 45);
  assert.equal(commander.difficulty.observationDelayTicks, 0);
});
