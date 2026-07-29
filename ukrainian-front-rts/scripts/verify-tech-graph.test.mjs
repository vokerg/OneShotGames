import assert from 'node:assert/strict';
import { validateTechGraph } from './verify-tech-graph.mjs';

function fixture() {
  return {
    factions: { 0: { id: 'ukraine' }, 1: { id: 'russia' } },
    buildings: {
      hq: { techRoot: true, factions: ['ukraine', 'russia'] },
      barracks: { requires: 'hq', factions: ['ukraine'] },
      workshop: { requires: ['hq'], factions: ['ukraine'] },
      ruBarracks: { requires: ['hq'], factions: ['russia'] },
    },
    upgrades: {
      armor: { requires: 'workshop', factions: ['ukraine'], exclusiveGroup: 'vehicle-choice' },
      mobility: { requires: ['workshop'], factions: ['ukraine'], exclusiveGroup: 'vehicle-choice' },
      ruArmor: { requires: ['ruBarracks'], factions: ['russia'] },
    },
    missions: [{ id: 'donbas', playerFaction: 'ukraine', availableTech: ['hq', 'workshop', 'armor'], lockedTech: [] }],
  };
}

const cases = [
  ['valid graph with legacy scalar prerequisites', (value) => assert.deepEqual(validateTechGraph(value), [])],
  ['duplicate building and upgrade ID', (value) => { value.upgrades.hq = {}; assert.match(validateTechGraph(value).join('\n'), /duplicate technology id hq/); }],
  ['malformed prerequisite list', (value) => { value.upgrades.armor.requires = 7; assert.match(validateTechGraph(value).join('\n'), /string or an array of strings/); }],
  ['missing prerequisite', (value) => { value.upgrades.armor.requires = ['ghost']; assert.match(validateTechGraph(value).join('\n'), /missing tech node ghost/); }],
  ['duplicate prerequisite', (value) => { value.upgrades.armor.requires = ['workshop', 'workshop']; assert.match(validateTechGraph(value).join('\n'), /duplicate tech node reference workshop/); }],
  ['self prerequisite', (value) => { value.upgrades.armor.requires = ['armor']; assert.match(validateTechGraph(value).join('\n'), /cannot require itself/); }],
  ['cross-family cycle', (value) => { value.buildings.hq.techRoot = false; value.buildings.hq.requires = ['armor']; assert.match(validateTechGraph(value).join('\n'), /circular technology path/); }],
  ['missing faction', (value) => { value.buildings.workshop.factions = ['ghost']; assert.match(validateTechGraph(value).join('\n'), /missing faction ghost/); }],
  ['missing mission lock', (value) => { value.upgrades.armor.missionLocks = ['ghost']; assert.match(validateTechGraph(value).join('\n'), /missing mission ghost/); }],
  ['root with prerequisites', (value) => { value.buildings.workshop.techRoot = true; assert.match(validateTechGraph(value).join('\n'), /root cannot also declare prerequisites/); }],
  ['singleton exclusive group', (value) => { value.upgrades.mobility.exclusiveGroup = null; assert.match(validateTechGraph(value).join('\n'), /at least two technology choices/); }],
  ['choice requires its own exclusive group', (value) => { value.upgrades.armor.requires = ['mobility']; assert.match(validateTechGraph(value).join('\n'), /own mutually exclusive group/); }],
  ['transitive mutually exclusive prerequisites', (value) => {
    value.upgrades.armorBranch = { requires: ['armor'], factions: ['ukraine'] };
    value.upgrades.mobilityBranch = { requires: ['mobility'], factions: ['ukraine'] };
    value.upgrades.hybrid = { requires: ['armorBranch', 'mobilityBranch'], factions: ['ukraine'] };
    assert.match(validateTechGraph(value).join('\n'), /requires mutually exclusive choices/);
  }],
  ['faction-incompatible prerequisite', (value) => { value.upgrades.armor.factions = []; assert.match(validateTechGraph(value).join('\n'), /unreachable for faction russia/); }],
  ['missing mission technology', (value) => { value.missions[0].availableTech.push('ghost'); assert.match(validateTechGraph(value).join('\n'), /missing tech node ghost/); }],
  ['mission availability conflict', (value) => { value.missions[0].lockedTech.push('workshop'); assert.match(validateTechGraph(value).join('\n'), /cannot be both available and locked/); }],
  ['mission faction restriction', (value) => { value.missions[0].playerFaction = 'russia'; assert.match(validateTechGraph(value).join('\n'), /not available to faction russia/); }],
  ['node mission lock blocks descendant', (value) => { value.buildings.workshop.missionLocks = ['donbas']; assert.match(validateTechGraph(value).join('\n'), /unreachable after faction and mission locks/); }],
];

for (const [name, run] of cases) {
  const value = fixture();
  try { run(value); }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
console.log(`Technology graph validator tests passed (${cases.length} cases).`);
