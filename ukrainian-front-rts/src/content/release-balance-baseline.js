const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const RELEASE_BALANCE_BASELINE_VERSION = 1;
export const RELEASE_BALANCE_BASELINE_ID = '2026-08-rc1';

const combatStats = (hp, speed, range, damage, rate, sight, cost) => ({
  hp,
  speed,
  range,
  damage,
  rate,
  sight,
  cost,
});

/**
 * Reviewed release-candidate values. This is a drift contract, not runtime data:
 * gameplay continues to read the authoritative modules named by each section.
 */
export const RELEASE_BALANCE_BASELINE = deepFreeze({
  version: RELEASE_BALANCE_BASELINE_VERSION,
  id: RELEASE_BALANCE_BASELINE_ID,
  authority: {
    combat: 'src/config.js',
    economy: 'src/content/economy-balance.js',
    ai: 'src/ai/ai-difficulty-profiles.js',
    campaign: 'src/content/campaign/campaign-balance.js',
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
  economy: {
    schemaVersion: 1,
    profileId: 'gate-b2-baseline-v1',
    startingForce: {
      engineers: 2,
      lineSquads: 2,
      baseCapacity: 14,
      startingDepotCapacity: 8,
      startingFieldedCapacity: 6,
    },
    affordabilitySeconds: {
      worker: 12,
      infantry: 15,
      air: 18,
      armor: 20,
      command: 22,
    },
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
    principle: 'Release maps do not grant hidden starting-side combat-stat modifiers; authored asymmetry must come from placement, objectives, resources, timing, or explicit scenario rules.',
    deterministicScenarioIndex: 0,
    evidence: 'The default combat, economy, and mission batches all execute the same deterministic authored scenario through the headless harness.',
  },
});
