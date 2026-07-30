import test from 'node:test';
import assert from 'node:assert/strict';
import { FACTION_TECH_TREES, validateFactionTechTrees } from '../../src/content/faction-tech-trees.js';

test('ships complete asymmetric faction contracts', () => {
  assert.deepEqual(validateFactionTechTrees(), []);
  const { ua, ru } = FACTION_TECH_TREES.factions;
  assert.notEqual(ua.doctrine, ru.doctrine);
  assert.notEqual(ua.uniqueMechanic, ru.uniqueMechanic);
  assert.equal(ua.rosterSlots.length, 7);
  assert.ok(ua.nodes.every((node) => node.counters.length));
});

test('reports broken references and incomplete contracts', () => {
  const invalid = { schemaVersion: 1, factions: { ua: { uniqueMechanic: 'x', rosterSlots: ['infantry'], nodes: [{ id: 'x', requires: ['missing'], counters: [] }] } } };
  assert.ok(validateFactionTechTrees(invalid).length >= 3);
});
