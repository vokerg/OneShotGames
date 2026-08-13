const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const RELEASE_BALANCE_BASELINE_VERSION = 1;
export const RELEASE_BALANCE_BASELINE_ID = '2026-08-rc1';

const combatStats = (hp, speed, range, damage, rate, sight, cost) => ({ hp, speed, range, damage, rate, sight, cost });

/**
 * Reviewed release-candidate values. This is a drift contract, not runtime data:
 * gameplay continues to read the authoritative modules named by each section.
 */
export const RELEASE_BALANCE_BASELINE = deepFreeze({
  version: RELEASE_BALANCE_BASELINE_VERSION,
  id: RELEASE_BALANCE_BASELINE_ID,
  authority: {
    combat: 'src/config.js',
    research: 'src/config.js',
    economy: 'src/content/economy-balance.js',
    ai: 'src/ai/ai-difficulty-profiles.js',
    campaign: 'src/content/campaign/campaign-balance.js',
    battlefield: 'src/game.js + src/config.js',
    skirmish: 'src/skirmish/skirmish-catalog.js',
    simulation: 'src/app/balance-simulation.js',
  },
  pairedCounters: {
    infantry: {
      ukraine: combatStats(112, 60, 155, 13, 0.95, 230, { metal: 85 }),
      russia: combatStats(100, 58, 145, 11, 1.02, 215, { metal: 0 }),
    },
    drone: {
      ukraine: combatStats(58, 116, 240, 27, 1.8, 345, { metal: 75, fuel: 42 }),
      russia: combatStats(62, 103, 255, 30, 2.1, 320, { metal: 0 }),
    },
    ifv: {
      ukraine: combatStats(305, 50, 195, 31, 1.9, 265, { metal: 190, fuel: 100 }),
      russia: combatStats(290, 52, 190, 33, 2, 250, { metal: 0 }),
    },
    tank: {
      ukraine: combatStats(390, 44, 215, 38, 2.15, 255, { metal: 235, fuel: 135 }),
      russia: combatStats(370, 43, 205, 36, 2.2, 245, { metal: 0 }),
    },
    artillery: {
      ukraine: combatStats(180, 39, 365, 58, 3.35, 220, { metal: 225, fuel: 125 }),
      russia: combatStats(190, 37, 350, 55, 3.45, 215, { metal: 0 }),
    },
  },
  structures: {
    depot: { cost: { metal: 100 }, buildTime: 7 },
    barracks: { cost: { metal: 150 }, buildTime: 9 },
    workshop: { cost: { metal: 220, fuel: 80 }, buildTime: 12 },
  },
  research: {
    cageArmor: { tier: 1, applies: ['tank', 'ifv'], cost: { metal: 140, intel: 40 }, mods: { hp: 1.18, droneResistance: 0.25 } },
    thermal: { tier: 1, applies: ['tank', 'ifv'], cost: { metal: 110, intel: 65 }, mods: { sight: 35, range: 1.1 } },
    natoAmmo: { tier: 1, applies: ['artillery'], cost: { metal: 150, fuel: 55, intel: 45 }, mods: { damage: 1.16, range: 1.16 } },
    activeProtection: { tier: 2, requires: 'cageArmor', applies: ['tank'], cost: { metal: 220, fuel: 90, intel: 90 }, mods: { hp: 1.22 } },
    digitalC2: { tier: 2, requires: 'thermal', applies: ['tank', 'ifv', 'artillery'], cost: { metal: 180, intel: 120 }, mods: { rate: 0.84, sight: 25 } },
    mineRoller: { tier: 2, applies: ['tank'], cost: { metal: 130, fuel: 70 }, mods: { speed: 1.12 } },
  },
  economy: {
    schemaVersion: 1,
    profileId: 'gate-b2-baseline-v1',
    startingForce: { engineers: 2, lineSquads: 2, baseCapacity: 14, startingDepotCapacity: 8, startingFieldedCapacity: 6 },
    affordabilitySeconds: { worker: 12, infantry: 15, air: 18, armor: 20, command: 22 },
    missionBenchmarks: { donbas: 60, zaporizhzhia: 65, kherson: 70 },
  },
  ai: {
    recruit: { observationDelayTicks: 45, reactionDelayTicks: 45, planningQuality: 0.45, riskTolerance: 0.3, economyEfficiency: 0.6 },
    regular: { observationDelayTicks: 20, reactionDelayTicks: 24, planningQuality: 0.7, riskTolerance: 0.48, economyEfficiency: 0.8 },
    veteran: { observationDelayTicks: 8, reactionDelayTicks: 12, planningQuality: 0.88, riskTolerance: 0.58, economyEfficiency: 0.93 },
    commander: { observationDelayTicks: 0, reactionDelayTicks: 6, planningQuality: 1, riskTolerance: 0.66, economyEfficiency: 1 },
    fairness: {
      informationPolicy: 'observed-only',
      resourceMultiplier: 1,
      damageMultiplier: 1,
      healthMultiplier: 1,
      fullMapVision: false,
      ignoresFogOfWar: false,
    },
  },
  campaign: {
    version: 1,
    story: { resourceMultiplier: 1.2, pressureDelayMultiplier: 1.16, reinforcementDelayMultiplier: 1.14, objectiveTimerMultiplier: 1.22, checkpointTimeMultiplier: 0.9, recoveryWindowSeconds: 45, combatStatMultiplier: 1 },
    standard: { resourceMultiplier: 1, pressureDelayMultiplier: 1, reinforcementDelayMultiplier: 1, objectiveTimerMultiplier: 1, checkpointTimeMultiplier: 1, recoveryWindowSeconds: 30, combatStatMultiplier: 1 },
    veteran: { resourceMultiplier: 0.86, pressureDelayMultiplier: 0.88, reinforcementDelayMultiplier: 0.9, objectiveTimerMultiplier: 0.9, checkpointTimeMultiplier: 1.08, recoveryWindowSeconds: 18, combatStatMultiplier: 1 },
  },
  batchSimulation: {
    batchIds: ['combat-mission', 'economy-window', 'mission-timing'],
    batchKinds: ['combat', 'economy', 'mission'],
    defaultIterations: 5,
    defaultMissionIndex: 0,
    defaultMaxTicks: 900,
    requireDeterministicSeeds: true,
  },
  mapReview: {
    campaignBattlefield: {
      id: 'shared-campaign-battlefield-v1',
      model: 'authored-asymmetric-pve',
      world: { width: 2560, height: 1664, tile: 32 },
      terrainTileCounts: { neutral: 3067, lowBand: 486, highBand: 607 },
      road: [
        [120, 1400], [540, 1240], [960, 1010], [1330, 780], [1760, 520], [2300, 260],
      ],
      resources: [
        { x: 490, y: 1280, kind: 'metal', amount: 1600, label: 'Salvage Yard' },
        { x: 760, y: 1180, kind: 'fuel', amount: 1100, label: 'Fuel Point' },
        { x: 1120, y: 850, kind: 'intel', amount: 900, label: 'Signals Relay' },
        { x: 1570, y: 600, kind: 'metal', amount: 1800, label: 'Industrial Site' },
        { x: 1900, y: 420, kind: 'fuel', amount: 1200, label: 'Forward Fuel Base' },
      ],
      buildings: [
        { type: 'hq', team: 'ukraine', x: 230, y: 1390 },
        { type: 'depot', team: 'ukraine', x: 350, y: 1330 },
        { type: 'barracks', team: 'ukraine', x: 430, y: 1430 },
        { type: 'hq', team: 'russia', x: 2300, y: 260 },
        { type: 'barracks', team: 'russia', x: 2170, y: 340 },
        { type: 'workshop', team: 'russia', x: 2230, y: 175 },
      ],
      fixedNonHeroUnits: [
        { type: 'uaEngineer', team: 'ukraine', x: 320, y: 1380 },
        { type: 'uaEngineer', team: 'ukraine', x: 355, y: 1410 },
        { type: 'uaInfantry', team: 'ukraine', x: 470, y: 1360 },
        { type: 'uaInfantry', team: 'ukraine', x: 500, y: 1410 },
        { type: 'ruInfantry', team: 'russia', x: 2110, y: 280 },
        { type: 'ruInfantry', team: 'russia', x: 2070, y: 330 },
        { type: 'ruIfv', team: 'russia', x: 2140, y: 300 },
        { type: 'ruTank', team: 'russia', x: 2210, y: 245 },
      ],
      missions: [
        { id: 'donbas', objectives: ['Recover 500 units of materiel', 'Establish infantry and repair facilities', 'Destroy the Russian forward command post'], start: { metal: 240, fuel: 110, intel: 25 }, waves: { firstDelay: 70, interval: 46, maxActive: 7, maxWaves: 7 } },
        { id: 'zaporizhzhia', objectives: ['Accumulate 250 intelligence', 'Field four Ukrainian FPV teams', 'Destroy all Russian artillery batteries'], start: { metal: 320, fuel: 190, intel: 70 }, waves: { firstDelay: 58, interval: 42, maxActive: 9, maxWaves: 7 } },
        { id: 'kherson', objectives: ['Assemble both Ukrainian command heroes', 'Defeat six Russian assault waves', 'Destroy the Russian command bunker'], start: { metal: 430, fuel: 260, intel: 230 }, waves: { firstDelay: 45, interval: 36, maxActive: 12, maxWaves: 6 } },
      ],
    },
    skirmish: {
      model: 'paired-competitive',
      startingResources: { metal: 380, fuel: 210, intel: 70 },
      pairedResourceDistanceTolerance: 1,
      maps: [
        {
          id: 'crossing-ground', region: 'donbas', seed: 11,
          playerStart: { x: 270, y: 1370 }, enemyStart: { x: 2290, y: 294 },
          road: [[115, 1450], [530, 1240], [980, 960], [1370, 760], [1810, 515], [2370, 235]],
          resources: [
            { id: 'resource-1', kind: 'metal', x: 475, y: 1245, amount: 1700 },
            { id: 'resource-2', kind: 'fuel', x: 720, y: 1390, amount: 1250 },
            { id: 'resource-3', kind: 'intel', x: 1125, y: 930, amount: 900 },
            { id: 'resource-4', kind: 'intel', x: 1435, y: 735, amount: 900 },
            { id: 'resource-5', kind: 'fuel', x: 1840, y: 280, amount: 1250 },
            { id: 'resource-6', kind: 'metal', x: 2085, y: 420, amount: 1700 },
          ],
        },
        {
          id: 'shelterbelt-grid', region: 'zaporizhzhia', seed: 29,
          playerStart: { x: 286, y: 302 }, enemyStart: { x: 2274, y: 1362 },
          road: [[150, 260], [610, 470], [1010, 690], [1500, 985], [1940, 1200], [2390, 1450]],
          resources: [
            { id: 'resource-1', kind: 'metal', x: 505, y: 420, amount: 1600 },
            { id: 'resource-2', kind: 'intel', x: 760, y: 265, amount: 950 },
            { id: 'resource-3', kind: 'fuel', x: 1120, y: 735, amount: 1350 },
            { id: 'resource-4', kind: 'fuel', x: 1440, y: 929, amount: 1350 },
            { id: 'resource-5', kind: 'intel', x: 1800, y: 1399, amount: 950 },
            { id: 'resource-6', kind: 'metal', x: 2055, y: 1244, amount: 1600 },
          ],
        },
        {
          id: 'industrial-basin', region: 'kherson', seed: 47,
          playerStart: { x: 300, y: 1320 }, enemyStart: { x: 2260, y: 344 },
          road: [[105, 1325], [595, 1110], [1000, 910], [1510, 745], [1945, 535], [2410, 330]],
          resources: [
            { id: 'resource-1', kind: 'metal', x: 520, y: 1160, amount: 1800 },
            { id: 'resource-2', kind: 'fuel', x: 690, y: 1390, amount: 1300 },
            { id: 'resource-3', kind: 'intel', x: 1050, y: 820, amount: 1000 },
            { id: 'resource-4', kind: 'intel', x: 1510, y: 844, amount: 1000 },
            { id: 'resource-5', kind: 'fuel', x: 1870, y: 274, amount: 1300 },
            { id: 'resource-6', kind: 'metal', x: 2040, y: 504, amount: 1800 },
          ],
        },
      ],
    },
    review: {
      hiddenStartingSideCombatModifiers: false,
      campaignResourceAxis: 'The campaign uses a visible southwest-to-northeast resource progression and is intentionally scenario-asymmetric rather than mirrored PvP.',
      skirmishFairness: 'All three skirmish starts rotate across world center; resource pairs match kind and amount, and paired start-to-resource distances differ by no more than one world unit.',
      chokepointAxis: 'Every campaign/skirmish road is version-locked as the authored operational/chokepoint axis; campaign terrain-class distribution is locked as additional geometry evidence.',
      spawnAxis: 'Campaign bases/fixed forces and every skirmish player/enemy start are version-locked.',
      objectiveAxis: 'Campaign mission objectives/resources/waves and the skirmish equal-wallet/opposing-HQ victory contract are explicit rather than hidden side advantages.',
      exploitAssessment: 'No release P0/P1 placement exploit is accepted; scenario advantage must remain explicit in placement, objectives, resources, wave timing, or documented rules rather than hidden combat-stat bonuses.',
    },
  },
});
