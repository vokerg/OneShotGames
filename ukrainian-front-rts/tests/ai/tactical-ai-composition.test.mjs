import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const mainSource = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
const systemSource = readFileSync(
  new URL('../../src/systems/tactical-ai-system.js', import.meta.url),
  'utf8',
);

test('installs tactical AI through the declared tactical-prepare simulation phase', () => {
  assert.match(mainSource, /createTacticalAiController/);
  assert.match(mainSource, /name:\s*'tactical-ai-controller'/);
  assert.match(mainSource, /phase:\s*SIMULATION_DELEGATE_PHASES\.TACTICAL_PREPARE/);
  assert.match(mainSource, /order:\s*-100/);
  assert.match(mainSource, /run:\s*\(\)\s*=>\s*updateTacticalAi\(game\)/);
});

test('does not create a hidden authoritative update wrapper', () => {
  assert.doesNotMatch(systemSource, /\bgame\s*\.\s*update\s*=/);
  assert.doesNotMatch(systemSource, /\bGame\s*\.\s*prototype\s*\.\s*update\s*=/);
});
