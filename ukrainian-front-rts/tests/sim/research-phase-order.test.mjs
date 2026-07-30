import test from 'node:test';
import assert from 'node:assert/strict';
import { SIMULATION_PHASES } from '../../src/systems/simulation-phases.js';

test('research advances in the authoritative fixed-step order', () => {
  const production = SIMULATION_PHASES.indexOf('production');
  const research = SIMULATION_PHASES.indexOf('research');
  const waves = SIMULATION_PHASES.indexOf('waves');
  assert.ok(production >= 0, 'production phase must exist');
  assert.equal(research, production + 1, 'research must advance immediately after production');
  assert.equal(waves, research + 1, 'waves must advance after research');
});
