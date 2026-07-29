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
    BUILDING_TYPES: { barracks: { cost: { metal: 20 }, produces: ['soldier'] } },
    UPGRADES: { first: { cost: { intel: 5 } }, second: { requires: 'first', cost: { metal: 5 } } },
    MISSIONS: [{ region: 'donbas', start: { metal: 50 }, heroes: ['hero'], trainableHeroes: [], enemyHeroes: [], objectives: ['Recover 10 units of materiel'], waves: { maxWaves: 6 } }],
  };
}

const cases = [
  ['valid content', (fixture) => assert.deepEqual(validateContent(fixture), [])],
  ['missing references', (fixture) => { fixture.BUILDING_TYPES.barracks.produces = ['ghost']; assert.match(validateContent(fixture).join('\n'), /missing unit reference ghost/); }],
  ['invalid costs', (fixture) => { fixture.UNIT_TYPES.soldier.cost.metal = -1; assert.match(validateContent(fixture).join('\n'), /finite non-negative/); }],
  ['circular prerequisites', (fixture) => { fixture.UPGRADES.first.requires = 'second'; assert.match(validateContent(fixture).join('\n'), /circular prerequisite/); }],
  ['impossible objectives', (fixture) => { fixture.MISSIONS[0].objectives = ['Defeat six Russian assault waves']; fixture.MISSIONS[0].waves.maxWaves = 5; assert.match(validateContent(fixture).join('\n'), /supplies fewer than six/); }],
  ['duplicate contextual hotkeys', (fixture) => { fixture.ABILITIES.bravo.key = 'A'; fixture.UNIT_TYPES.soldier.abilities.push('bravo'); assert.match(validateContent(fixture).join('\n'), /duplicate hotkey A/); }],
  ['same hotkey on separate command cards', (fixture) => { fixture.ABILITIES.bravo.key = 'A'; assert.deepEqual(validateContent(fixture), []); }],
];

for (const [name, run] of cases) {
  const fixture = validFixture();
  try { run(fixture); }
  catch (error) { error.message = `${name}: ${error.message}`; throw error; }
}
console.log(`Content validator tests passed (${cases.length} cases).`);
