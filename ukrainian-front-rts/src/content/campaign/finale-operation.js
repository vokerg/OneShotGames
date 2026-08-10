import { CAMPAIGN_DIFFICULTIES, CAMPAIGN_MISSION_OUTCOMES, validateCampaignProfile } from '../../core/campaign-profile.js';

export const CAMPAIGN_FINALE_OPERATION_ID = 'operation-last-light';
export const CAMPAIGN_FINALE_VERSION = 1;

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export const CAMPAIGN_FINALE_ROSTER = deepFreeze({
  ua: ['uaEngineer', 'uaInfantry', 'uaDrone', 'uaMedic', 'uaIfv', 'uaTank', 'uaArtillery', 'uaCommandVarta'],
  ru: ['ruEngineer', 'ruInfantry', 'ruDrone', 'ruMedic', 'ruIfv', 'ruTank', 'ruArtillery', 'ruCommandBastion'],
});

export const CAMPAIGN_FINALE_OBJECTIVES = deepFreeze([
  { id: 'restore-battlefield-picture', phase: 1, type: 'recon', label: 'Restore the battlefield picture', requiredRoster: ['uaDrone', 'uaCommandVarta'] },
  { id: 'silence-long-range-fires', phase: 2, type: 'destroy', label: 'Silence long-range fires and air defense', requiredRoster: ['uaArtillery', 'uaDrone'] },
  { id: 'open-final-corridor', phase: 3, type: 'breach', label: 'Open the final corridor', requiredRoster: ['uaEngineer', 'uaInfantry', 'uaIfv', 'uaTank'] },
  { id: 'hold-against-counterattack', phase: 4, type: 'defend', label: 'Hold against the adaptive counterattack', requiredRoster: ['uaMedic', 'uaInfantry', 'uaIfv', 'uaTank', 'uaArtillery'] },
  { id: 'break-command-network', phase: 5, type: 'destroy', label: 'Break the opposing command network', requiredRoster: ['uaCommandVarta'] },
]);

const difficultyPressure = Object.freeze({
  [CAMPAIGN_DIFFICULTIES.STORY]: 0.82,
  [CAMPAIGN_DIFFICULTIES.STANDARD]: 1,
  [CAMPAIGN_DIFFICULTIES.VETERAN]: 1.18,
});

function campaignChoiceText(profile) {
  return Object.entries(profile.choices)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
    .join('|')
    .toLowerCase();
}

function averageScore(profile) {
  const results = Object.values(profile.missionResults);
  if (!results.length) return 0;
  return results.reduce((sum, result) => sum + result.score, 0) / results.length;
}

export function resolveFinaleCampaignCallbacks(profileValue) {
  const profile = validateCampaignProfile(profileValue);
  const choices = campaignChoiceText(profile);
  const score = averageScore(profile);
  const completed = profile.completedOperationIds.length;
  const recoveredLogistics = /recover|salvage/.test(choices) && !/scuttle|abandon/.test(choices);
  const northernBias = /north/.test(choices) && !/south/.test(choices);
  const southernBias = /south/.test(choices) && !/north/.test(choices);
  const preservedMomentum = score >= 80 || profile.medalIds.length >= 4;
  const modernizationDepth = profile.unlockedUpgradeIds.length;
  const pressure = clamp(
    difficultyPressure[profile.difficulty] + Math.max(0, score - 60) / 250 + Math.max(0, completed - 6) * 0.025 - (recoveredLogistics ? 0.05 : 0),
    0.72,
    1.45,
  );

  return deepFreeze({
    profileRevision: profile.revision,
    completedOperations: completed,
    averagePriorScore: Math.round(score),
    reserveAxis: northernBias ? 'north' : southernBias ? 'south' : 'center',
    logisticsState: recoveredLogistics ? 'reinforced' : 'standard',
    alliedState: preservedMomentum ? 'preserved' : 'reconstituted',
    modernizationDepth,
    startingResourceBonus: recoveredLogistics ? { metal: 80, fuel: 60, intel: 20 } : { metal: 0, fuel: 0, intel: 0 },
    pressureMultiplier: Number(pressure.toFixed(3)),
    supportCallbacks: [
      recoveredLogistics ? 'callback-logistics-recovered' : 'callback-logistics-standard',
      preservedMomentum ? 'callback-allied-force-preserved' : 'callback-allied-force-reconstituted',
      modernizationDepth >= 3 ? 'callback-modernization-deep' : 'callback-modernization-limited',
    ],
  });
}

function deployment(roster, team, prefix, x) {
  return roster.map((type, index) => deepFreeze({
    id: `${prefix}-${index + 1}`,
    type,
    team,
    position: { x: x + (index % 4) * 44, y: 1040 + Math.floor(index / 4) * 52 },
    role: index === roster.length - 1 ? 'command' : 'line-of-operation',
  }));
}

export function createFinaleMission(profileValue) {
  const profile = validateCampaignProfile(profileValue);
  const callbacks = resolveFinaleCampaignCallbacks(profile);
  const ua = deployment(CAMPAIGN_FINALE_ROSTER.ua, 0, 'ua-finale', 260);
  const ru = deployment(CAMPAIGN_FINALE_ROSTER.ru, 1, 'ru-finale', 1720);
  const baseResources = { metal: 520, fuel: 340, intel: 260 };
  const start = Object.fromEntries(Object.keys(baseResources).map((resource) => [
    resource,
    baseResources[resource] + callbacks.startingResourceBonus[resource],
  ]));

  return deepFreeze({
    id: CAMPAIGN_FINALE_OPERATION_ID,
    title: 'Last Light',
    objectiveMode: 'scripted-phases',
    objectiveDefinitions: CAMPAIGN_FINALE_OBJECTIVES,
    objectiveIds: CAMPAIGN_FINALE_OBJECTIVES.map((objective) => objective.id),
    start,
    composition: { player: ua, enemy: ru, fullRosterRequired: true },
    callbacks,
    authoredAi: {
      doctrine: 'observe-adapt-counterpunch',
      pressureMultiplier: callbacks.pressureMultiplier,
      phases: [
        { id: 'screen', afterSeconds: 50, emphasis: 'recon-and-ew', roster: ['ruDrone', 'ruInfantry', 'ruEngineer'] },
        { id: 'fires', afterSeconds: 125, emphasis: 'counter-recon-fires', roster: ['ruArtillery', 'ruDrone', 'ruIfv'] },
        { id: 'mobile-counterattack', afterSeconds: 230, emphasis: callbacks.reserveAxis === 'center' ? 'split-axis' : `opposite-${callbacks.reserveAxis}`, roster: ['ruTank', 'ruIfv', 'ruMedic'] },
        { id: 'command-defense', afterSeconds: 360, emphasis: 'command-survival', roster: ['ruCommandBastion', 'ruTank', 'ruArtillery', 'ruInfantry'] },
      ],
    },
    checkpointPolicy: {
      enabled: true,
      stablePoints: CAMPAIGN_FINALE_OBJECTIVES.slice(0, -1).map((objective) => ({ id: `${objective.id}-complete`, afterObjectiveId: objective.id })),
    },
    metadata: {
      fictional: true,
      campaignFinale: true,
      sourceOperationsRequired: 8,
      profileRevision: profile.revision,
    },
  });
}

export function createFinaleDebrief({ profile: profileValue, outcome, score = 0, completedTick = null, losses = { totalLost: 0, totalDeployed: CAMPAIGN_FINALE_ROSTER.ua.length } } = {}) {
  const profile = validateCampaignProfile(profileValue);
  if (!Object.values(CAMPAIGN_MISSION_OUTCOMES).includes(outcome)) throw new RangeError(`Unknown finale outcome: ${outcome}`);
  const victory = outcome === CAMPAIGN_MISSION_OUTCOMES.VICTORY;
  const callbacks = resolveFinaleCampaignCallbacks(profile);
  return deepFreeze({
    operationId: CAMPAIGN_FINALE_OPERATION_ID,
    title: victory ? 'Campaign Complete — Last Light' : 'Last Light Unresolved',
    outcome,
    score,
    completedTick,
    summary: victory
      ? 'The final command network is broken. Prior campaign choices remain visible in the force state carried into the closing report.'
      : 'The final operation remains available for replay from the last stable campaign state.',
    losses,
    campaignConsequences: { callbacks, campaignComplete: victory },
    nextOperations: [],
    creditsTransition: victory ? { action: 'show-credits', stage: 'credits', available: true } : { action: null, stage: 'debrief', available: false },
  });
}

export const CAMPAIGN_FINALE_OPERATION = deepFreeze({
  version: CAMPAIGN_FINALE_VERSION,
  id: CAMPAIGN_FINALE_OPERATION_ID,
  title: 'Last Light',
  gate: 'campaign-finale',
  briefing: {
    operationId: CAMPAIGN_FINALE_OPERATION_ID,
    title: 'Last Light',
    summary: 'Commit the full roster in a five-stage closing operation whose support and enemy pressure reflect the campaign state you carried into the finale.',
    forces: CAMPAIGN_FINALE_ROSTER.ua.map((type) => ({ id: type, label: type, category: 'full-roster', count: 1 })),
    objectives: CAMPAIGN_FINALE_OBJECTIVES.map((objective) => ({ id: objective.id, title: objective.label, description: `Phase ${objective.phase}: ${objective.label}.` })),
    metadata: { dynamicMissionFactory: 'createFinaleMission', fictional: true },
  },
  missionFactory: createFinaleMission,
  debriefFactory: createFinaleDebrief,
  credits: {
    title: 'Fields of Resolve',
    subtitle: 'Campaign complete',
    sections: [
      { id: 'campaign', heading: 'Campaign', entries: ['Nine-operation authored campaign sequence', 'Choices and results carried into the finale'] },
      { id: 'production', heading: 'Production', entries: ['Original code, art direction, audio systems, and scenario design', 'See release provenance for source and license records'] },
    ],
  },
});