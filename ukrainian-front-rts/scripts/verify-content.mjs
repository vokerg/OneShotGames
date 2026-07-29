import { ABILITIES, BUILDING_TYPES, FACTIONS, MISSIONS, REGIONS, UNIT_TYPES, UPGRADES } from '../src/config.js';
import { assertValidContent } from './content-validator.mjs';

assertValidContent({ ABILITIES, BUILDING_TYPES, FACTIONS, MISSIONS, REGIONS, UNIT_TYPES, UPGRADES });
console.log(`Content verification passed for ${UNIT_TYPES ? Object.keys(UNIT_TYPES).length : 0} units, ${Object.keys(BUILDING_TYPES).length} buildings, ${Object.keys(UPGRADES).length} upgrades, and ${MISSIONS.length} missions.`);
