import { BUILDING_TYPES, FACTIONS, MISSIONS, UPGRADES } from '../src/config.js';
import { assertValidTechGraph } from './verify-tech-graph.mjs';

assertValidTechGraph({ buildings: BUILDING_TYPES, upgrades: UPGRADES, factions: FACTIONS, missions: MISSIONS });
console.log(`Technology graph verification passed for ${Object.keys(BUILDING_TYPES).length + Object.keys(UPGRADES).length} nodes.`);
