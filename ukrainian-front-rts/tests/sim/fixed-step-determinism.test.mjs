import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulationHarness } from '../../src/app/simulation-harness.js';
import {
  createFixedStepClock,
  FIXED_SIMULATION_STEP_SECONDS,
} from '../../src/core/fixed-step-clock.js';
import { TEAM } from '../../src/config.js';

function runScenario(frameDeltas) {
  const harness = createSimulationHarness({ tickSeconds: FIXED_SIMULATION_STEP_SECONDS });
  harness.startScenario({ missionIndex: 0, seed: 'fixed-step-frame-chunking' });
  const infantry = harness.game.units.find(
    (unit) => unit.team === TEAM.UA && unit.type === 'uaInfantry',
  );
  assert.ok(infantry, 'Expected a Ukrainian infantry unit in the scenario fixture.');

  assert.equal(harness.issueCommand({ type: 'select', entityIds: [infantry.id] }).ok, true);
  assert.equal(harness.issueCommand({ type: 'attackMove', x: 1100, y: 900 }).ok, true);
  assert.equal(harness.issueCommand({ type: 'spawnWave' }).ok, true);

  const clock = createFixedStepClock();
  for (const frameDelta of frameDeltas) {
    clock.advance(frameDelta, () => harness.advanceTicks(1));
  }
  assert.equal(clock.snapshot().tick, 30);
  return harness.snapshot();
}

test('whole simulation outcomes are invariant to render-frame chunking', () => {
  const sixtyFps = Array.from({ length: 60 }, () => 1 / 60);
  const tenFps = Array.from({ length: 10 }, () => 0.1);
  const irregular = Array.from({ length: 10 }, () => [0.07, 0.03]).flat();

  assert.deepEqual(runScenario(sixtyFps), runScenario(tenFps));
  assert.deepEqual(runScenario(sixtyFps), runScenario(irregular));
});
