import { AI_DIFFICULTY_IDS, DEFAULT_AI_DIFFICULTY_ID } from '../ai/ai-difficulty-profiles.js';
import { TEAM } from '../config.js';

const FACTION_IDS = Object.freeze(['ukraine', 'russia']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export const SKIRMISH_FACTIONS = deepFreeze({
  ukraine: {
    id: 'ukraine',
    label: 'Ukraine — Networked Maneuver',
    opponent: 'russia',
    workerType: 'uaEngineer',
    startingUnits: ['uaEngineer', 'uaEngineer', 'uaInfantry', 'uaInfantry', 'uaIfv'],
    production: {
      hq: ['uaEngineer'],
      barracks: ['uaInfantry', 'uaMedic'],
      workshop: ['uaDrone', 'uaIfv', 'uaTank', 'uaArtillery'],
    },
    costs: {
      uaEngineer: { metal: 65 },
      uaInfantry: { metal: 85 },
      uaMedic: { metal: 75, intel: 15 },
      uaDrone: { metal: 75, fuel: 42 },
      uaIfv: { metal: 190, fuel: 100 },
      uaTank: { metal: 235, fuel: 135 },
      uaArtillery: { metal: 225, fuel: 125 },
    },
  },
  russia: {
    id: 'russia',
    label: 'Russia — Echeloned Pressure',
    opponent: 'ukraine',
    workerType: 'ruEngineer',
    startingUnits: ['ruEngineer', 'ruEngineer', 'ruInfantry', 'ruInfantry', 'ruIfv'],
    production: {
      hq: ['ruEngineer'],
      barracks: ['ruInfantry', 'ruMedic'],
      workshop: ['ruDrone', 'ruIfv', 'ruTank', 'ruArtillery'],
    },
    costs: {
      ruEngineer: { metal: 62 },
      ruInfantry: { metal: 82 },
      ruMedic: { metal: 72, intel: 14 },
      ruDrone: { metal: 76, fuel: 42 },
      ruIfv: { metal: 185, fuel: 98 },
      ruTank: { metal: 230, fuel: 132 },
      ruArtillery: { metal: 220, fuel: 120 },
    },
  },
});

const mirroredResources = (points) => points.map((point, index) => Object.freeze({
  id: `resource-${index + 1}`,
  kind: point.kind,
  x: point.x,
  y: point.y,
  amount: point.amount ?? 1500,
}));

export const SKIRMISH_MAPS = deepFreeze([
  {
    id: 'crossing-ground',
    title: 'Crossing Ground',
    description: 'A diagonal river-road approach with exposed central salvage and protected flank fuel.',
    region: 'donbas',
    seed: 11,
    playerStart: { x: 270, y: 1370 },
    enemyStart: { x: 2290, y: 294 },
    road: [[115, 1450], [530, 1240], [980, 960], [1370, 760], [1810, 515], [2370, 235]],
    resources: mirroredResources([
      { kind: 'metal', x: 475, y: 1245, amount: 1700 },
      { kind: 'fuel', x: 720, y: 1390, amount: 1250 },
      { kind: 'intel', x: 1125, y: 930, amount: 900 },
      { kind: 'intel', x: 1435, y: 735, amount: 900 },
      { kind: 'fuel', x: 1840, y: 280, amount: 1250 },
      { kind: 'metal', x: 2085, y: 420, amount: 1700 },
    ]),
  },
  {
    id: 'shelterbelt-grid',
    title: 'Shelterbelt Grid',
    description: 'Open steppe lanes reward scouting, flanking, and deliberate control of the central fuel pair.',
    region: 'zaporizhzhia',
    seed: 29,
    playerStart: { x: 286, y: 302 },
    enemyStart: { x: 2274, y: 1362 },
    road: [[150, 260], [610, 470], [1010, 690], [1500, 985], [1940, 1200], [2390, 1450]],
    resources: mirroredResources([
      { kind: 'metal', x: 505, y: 420, amount: 1600 },
      { kind: 'intel', x: 760, y: 265, amount: 950 },
      { kind: 'fuel', x: 1120, y: 735, amount: 1350 },
      { kind: 'fuel', x: 1440, y: 929, amount: 1350 },
      { kind: 'intel', x: 1800, y: 1399, amount: 950 },
      { kind: 'metal', x: 2055, y: 1244, amount: 1600 },
    ]),
  },
  {
    id: 'industrial-basin',
    title: 'Industrial Basin',
    description: 'Dense resource pockets and a broad central works complex create a shorter, pressure-heavy macro game.',
    region: 'kherson',
    seed: 47,
    playerStart: { x: 300, y: 1320 },
    enemyStart: { x: 2260, y: 344 },
    road: [[105, 1325], [595, 1110], [1000, 910], [1510, 745], [1945, 535], [2410, 330]],
    resources: mirroredResources([
      { kind: 'metal', x: 520, y: 1160, amount: 1800 },
      { kind: 'fuel', x: 690, y: 1390, amount: 1300 },
      { kind: 'intel', x: 1050, y: 820, amount: 1000 },
      { kind: 'intel', x: 1510, y: 844, amount: 1000 },
      { kind: 'fuel', x: 1870, y: 274, amount: 1300 },
      { kind: 'metal', x: 2040, y: 504, amount: 1800 },
    ]),
  },
]);

export const SKIRMISH_MAP_IDS = Object.freeze(SKIRMISH_MAPS.map((map) => map.id));
export const SKIRMISH_FACTION_IDS = FACTION_IDS;
export const SKIRMISH_DIFFICULTY_IDS = AI_DIFFICULTY_IDS;
export const DEFAULT_SKIRMISH_SETUP = deepFreeze({
  mapId: SKIRMISH_MAP_IDS[0],
  playerFactionId: 'ukraine',
  opponentFactionId: 'russia',
  difficultyId: DEFAULT_AI_DIFFICULTY_ID,
  startingResources: { metal: 380, fuel: 210, intel: 70 },
});

export function getSkirmishMap(mapId) {
  const map = SKIRMISH_MAPS.find((candidate) => candidate.id === mapId);
  if (!map) throw new RangeError(`Unknown skirmish map: ${mapId}`);
  return map;
}

export function normalizeSkirmishSetup(value = {}) {
  const mapId = value.mapId ?? DEFAULT_SKIRMISH_SETUP.mapId;
  const playerFactionId = value.playerFactionId ?? DEFAULT_SKIRMISH_SETUP.playerFactionId;
  const opponentFactionId = value.opponentFactionId ?? SKIRMISH_FACTIONS[playerFactionId]?.opponent;
  const difficultyId = value.difficultyId ?? DEFAULT_SKIRMISH_SETUP.difficultyId;
  if (!FACTION_IDS.includes(playerFactionId)) throw new RangeError(`Unknown player faction: ${playerFactionId}`);
  if (!FACTION_IDS.includes(opponentFactionId)) throw new RangeError(`Unknown opponent faction: ${opponentFactionId}`);
  if (playerFactionId === opponentFactionId) throw new RangeError('Skirmish factions must be different.');
  if (!AI_DIFFICULTY_IDS.includes(difficultyId)) throw new RangeError(`Unknown AI difficulty: ${difficultyId}`);
  const resources = value.startingResources ?? DEFAULT_SKIRMISH_SETUP.startingResources;
  const startingResources = {};
  for (const id of ['metal', 'fuel', 'intel']) {
    const amount = Number(resources[id] ?? 0);
    if (!Number.isFinite(amount) || amount < 0) throw new RangeError(`startingResources.${id} must be finite and non-negative.`);
    startingResources[id] = Math.floor(amount);
  }
  getSkirmishMap(mapId);
  return deepFreeze({ mapId, playerFactionId, opponentFactionId, difficultyId, startingResources });
}

export function skirmishMissionForSetup(value = {}) {
  const setup = normalizeSkirmishSetup(value);
  const map = getSkirmishMap(setup.mapId);
  const playerFaction = SKIRMISH_FACTIONS[setup.playerFactionId];
  const opponentFaction = SKIRMISH_FACTIONS[setup.opponentFactionId];
  return deepFreeze({
    id: `skirmish:${map.id}`,
    mode: 'skirmish',
    region: map.region,
    title: `Skirmish — ${map.title}`,
    story: `${playerFaction.label} versus ${opponentFaction.label}. Destroy the opposing command post while preserving your own force economy.`,
    objectives: ['Destroy the opposing command post'],
    objectiveDefinitions: [{
      id: 'skirmish-destroy-enemy-hq',
      type: 'destroy',
      label: 'Destroy the opposing command post',
      count: 1,
      target: { collection: 'buildings', type: 'hq', team: TEAM.RU },
    }],
    start: setup.startingResources,
    heroes: [],
    trainableHeroes: [],
    enemyHeroes: [],
    waves: { firstDelay: 999999, interval: 999999, maxActive: 0, maxWaves: 0 },
    skirmish: setup,
  });
}
