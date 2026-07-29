import assert from 'node:assert/strict';
import { validateTechGraph } from './verify-tech-graph.mjs';

function fixture() {
  return {
    factions: { 0: { id: 'ukraine' }, 1: { id: 'russia' } },
    buildings: { hq: { techRoot: true }, workshop: { requires: ['hq'], factions: ['ukraine'] } },
    upgrades: {
      armor: { requires: ['workshop'], exclusiveGroup: 'vehicle-choice' },
      mobility: { requires: ['workshop'], exclusiveGroup: 'vehicle-choice' },
    },
    missions: [{ id: 'donbas', availableTech: ['hq', 'workshop'], lockedTech: ['armor'] }],
  };
}

const cases = [
  ['valid graph', (value) => assert.deepEqual(validateTechGraph(value), [])],
  ['missing prerequisite', (value) => { value.upgrades.armor.requires = ['ghost']; assert.match(validateTechGraph(value).join('\n'), /missing tech node ghost/); }],
  ['cycle', (value) => { value.buildings.hq.requires = ['armor']; assert.match(validateTechGraph(value).join('\n'), /circular technology path/); }],
  ['missing faction', (value) => { value.buildings.workshop.factions = ['ghost']; assert.match(validateTechGraph(value).join('\n'), /missing faction ghost/); }],
  ['missing mission lock', (value) => { value.upgrades.armor.missionLocks = ['ghost']; assert.match(validateTechGraph(value).join('\n'), /missing mission ghost/); }],
  ['singleton exclusive group', (value) => { value.upgrades.mobility.exclusiveGroup = null; assert.match(validateTechGraph(value).join('\n'), /at least two technology choices/); }],
  ['mission availability conflict', (value) => { value.missions[0].lockedTech.push('workshop'); assert.match(validateTechGraph(value).join('\n'), /cannot be both available and locked/); }],
];

for (const [name, run] of cases) {
  const value = fixture();
  try { run(value); } catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
console.log(`Technology graph validator tests passed (${cases.length} cases).`);
