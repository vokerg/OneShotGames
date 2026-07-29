import assert from 'node:assert/strict';
import { validateContent } from './content-validator.mjs';

function validFixture() {
  return {
    FACTIONS: { 0: { id: 'ukraine' }, 1: { id: 'russia' } },
    REGIONS: { donbas: {} },
    ABILITIES: { alpha: { key: 'A' }, bravo: { key: 'B' } },
    UNIT_TYPES: {
      soldier: { faction: 'ukraine', cost: { metal: 10 }, abilities: ['alpha'] },
      hero: { faction: 'ukraine', hero: true, cost: {}, abilities: ['bravo'] },
    },
    BUILDING_TYPES: {
      hq: { cost: {}, produces: [], techRoot: true, factions: ['ukraine', 'russia'] },
      barracks: { cost: { metal: 20 }, produces: ['soldier'], requires: 'hq', factions: ['ukraine'] },
    },
    UPGRADES: {
      first: { techRoot: true, factions: ['ukraine'], cost: { intel: 5 } },
      second: { requires: 'first', factions: ['ukraine'], cost: { metal: 5 } },
      doctrineA: { techRoot: true, factions: ['ukraine'], exclusiveGroup: 'doctrine', cost: {} },
      doctrineB: { techRoot: true, factions: ['ukraine'], exclusiveGroup: 'doctrine', cost: {} },
    },
    MISSIONS: [{ id: 'donbas', region: 'donbas', playerFaction: 'ukraine', start: { metal: 50 }, heroes: ['hero'], trainableHeroes: [], enemyHeroes: [], availableTech: ['second'], lockedTech: [], objectives: ['Recover 10 units of materiel'], waves: { maxWaves: 6 } }],
  };
}

const cases = [
  ['valid content including legacy scalar prerequisite', (fixture) => assert.deepEqual(validateContent(fixture), [])],
  ['missing references', (fixture) => { fixture.BUILDING_TYPES.barracks.produces = ['ghost']; assert.match(validateContent(fixture).join('\n'), /missing unit reference ghost/); }],
  ['invalid costs', (fixture) => { fixture.UNIT_TYPES.soldier.cost.metal = -1; assert.match(validateContent(fixture).join('\n'), /finite non-negative/); }],
  ['circular prerequisites across tech families', (fixture) => { fixture.UPGRADES.first.techRoot = false; fixture.UPGRADES.first.requires = ['barracks']; fixture.BUILDING_TYPES.barracks.requires = ['first']; assert.match(validateContent(fixture).join('\n'), /circular prerequisite/); }],
  ['impossible objectives', (fixture) => { fixture.MISSIONS[0].objectives = ['Defeat six Russian assault waves']; fixture.MISSIONS[0].waves.maxWaves = 5; assert.match(validateContent(fixture).join('\n'), /supplies fewer than six/); }],
  ['duplicate contextual hotkeys', (fixture) => { fixture.ABILITIES.bravo.key = 'A'; fixture.UNIT_TYPES.soldier.abilities.push('bravo'); assert.match(validateContent(fixture).join('\n'), /duplicate hotkey A/); }],
  ['same hotkey on separate command cards', (fixture) => { fixture.ABILITIES.bravo.key = 'A'; assert.deepEqual(validateContent(fixture), []); }],
  ['missing tech-node prerequisite', (fixture) => { fixture.UPGRADES.second.requires = ['ghost']; assert.match(validateContent(fixture).join('\n'), /missing tech-node reference ghost/); }],
  ['duplicate building and upgrade tech IDs', (fixture) => { fixture.UPGRADES.hq = { cost: {} }; assert.match(validateContent(fixture).join('\n'), /duplicate tech-node id hq/); }],
  ['unknown faction restriction', (fixture) => { fixture.UPGRADES.first.factions = ['unknown']; assert.match(validateContent(fixture).join('\n'), /missing faction reference unknown/); }],
  ['unknown mission lock', (fixture) => { fixture.UPGRADES.first.missionLocks = ['missing']; assert.match(validateContent(fixture).join('\n'), /missing mission reference missing/); }],
  ['single-member exclusivity group', (fixture) => { delete fixture.UPGRADES.doctrineB; assert.match(validateContent(fixture).join('\n'), /must contain at least two choices/); }],
  ['requires mutually exclusive choices', (fixture) => { fixture.UPGRADES.second.requires = ['doctrineA', 'doctrineB']; assert.match(validateContent(fixture).join('\n'), /cannot require mutually exclusive choices/); }],
  ['faction-incompatible prerequisite is unreachable', (fixture) => { fixture.UPGRADES.second.factions = []; fixture.UPGRADES.first.factions = ['ukraine']; assert.match(validateContent(fixture).join('\n'), /not reachable for faction russia/); }],
  ['available tech cannot also be locked', (fixture) => { fixture.MISSIONS[0].lockedTech = ['second']; assert.match(validateContent(fixture).join('\n'), /both available and locked/); }],
  ['mission lock can make declared available tech unreachable', (fixture) => { fixture.UPGRADES.first.missionLocks = ['donbas']; assert.match(validateContent(fixture).join('\n'), /not reachable after mission locks/); }],
];

for (const [name, run] of cases) {
  const fixture = validFixture();
  try { run(fixture); }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
console.log(`Content validator tests passed (${cases.length} cases).`);
