import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTER_DOMAINS,
  FACTION_TECH_TREES,
  REQUIRED_ROSTER_SLOTS,
  unlockedFactionNodes,
  validateFactionTechTrees,
} from '../../src/content/faction-tech-trees.js';

test('ships complete valid asymmetric faction contracts', () => {
  assert.deepEqual(validateFactionTechTrees(), []);
  const { ukraine, russia } = FACTION_TECH_TREES.factions;
  assert.notEqual(ukraine.doctrine, russia.doctrine);
  assert.notEqual(ukraine.uniqueMechanic.id, russia.uniqueMechanic.id);
  assert.ok(ukraine.nodes.length >= 29);
  assert.ok(russia.nodes.length >= 29);
});

test('covers every required roster slot for both factions', () => {
  for (const faction of Object.values(FACTION_TECH_TREES.factions)) {
    const covered = new Set(faction.nodes.filter((node) => node.kind === 'roster').map((node) => node.slot));
    assert.deepEqual(REQUIRED_ROSTER_SLOTS.filter((slot) => !covered.has(slot)), []);
  }
});

test('provides at least two valid counter paths for every domain', () => {
  for (const faction of Object.values(FACTION_TECH_TREES.factions)) {
    const ids = new Set(faction.nodes.map((node) => node.id));
    for (const domain of COUNTER_DOMAINS) {
      assert.ok(faction.counterMatrix[domain].length >= 2);
      assert.ok(faction.counterMatrix[domain].every((id) => ids.has(id)));
    }
  }
});

test('roots unlock deterministically and prerequisites gate later nodes', () => {
  assert.deepEqual(unlockedFactionNodes('ukraine'), ['ua.command-post']);
  assert.deepEqual(unlockedFactionNodes('russia'), ['ru.regimental-command']);
  assert.ok(unlockedFactionNodes('ukraine', ['ua.command-post']).includes('ua.logistics-hub'));
  assert.ok(!unlockedFactionNodes('ukraine', ['ua.command-post']).includes('ua.shared-target-network'));
});

test('validator reports broken producers, counters, slots, and prerequisites', () => {
  const invalid = structuredClone(FACTION_TECH_TREES);
  const ua = invalid.factions.ukraine;
  ua.nodes.find((node) => node.id === 'ua.line-infantry').producer = 'ua.missing';
  ua.nodes.find((node) => node.id === 'ua.tank').requires.push('ua.missing-tech');
  ua.nodes = ua.nodes.filter((node) => node.slot !== 'medical');
  ua.counterMatrix.armor = ['ua.missing'];
  const errors = validateFactionTechTrees(invalid);
  assert.ok(errors.some((error) => error.includes('invalid producer')));
  assert.ok(errors.some((error) => error.includes('missing prerequisite')));
  assert.ok(errors.some((error) => error.includes('roster slot medical')));
  assert.ok(errors.some((error) => error.includes('counter domain armor')));
});

test('validator detects cycles and faction mirroring', () => {
  const invalid = structuredClone(FACTION_TECH_TREES);
  invalid.factions.ukraine.nodes.find((node) => node.id === 'ua.command-post').requires.push('ua.distributed-c2');
  invalid.factions.russia.doctrine = invalid.factions.ukraine.doctrine;
  invalid.factions.russia.uniqueMechanic.id = invalid.factions.ukraine.uniqueMechanic.id;
  const errors = validateFactionTechTrees(invalid);
  assert.ok(errors.some((error) => error.includes('cyclic prerequisites')));
  assert.ok(errors.includes('factions must have distinct doctrines'));
  assert.ok(errors.includes('factions must have distinct unique mechanics'));
});
