const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const horizontal = (y, fromX, toX) => Array.from({ length: toX - fromX + 1 }, (_, offset) => ({ x: fromX + offset, y }));
const worldRect = (x, y, width, height, tileSize = 32) => ({
  shape: 'rect', x: x * tileSize, y: y * tileSize, width: width * tileSize, height: height * tileSize,
});

export const DONBAS_CROSSING_OPERATION_ID = 'operation-hold-the-crossing';
export const DONBAS_CROSSING_MAP_ID = 'map-siverskyi-donets-crossing';

const MAP_REGIONS = {
  'support-area': { shape: 'rect', origin: { x: 2, y: 8 }, width: 8, height: 8, metadata: { purpose: 'economy-onboarding' } },
  'west-bridgehead': { shape: 'rect', origin: { x: 10, y: 8 }, width: 6, height: 8, metadata: { purpose: 'crossing-defense' } },
  'east-bridgehead': { shape: 'rect', origin: { x: 17, y: 8 }, width: 6, height: 8, metadata: { purpose: 'enemy-pressure' } },
  'north-shelterbelt': { shape: 'rect', origin: { x: 3, y: 3 }, width: 10, height: 5, metadata: { purpose: 'optional-rescue' } },
  'enemy-staging': { shape: 'rect', origin: { x: 25, y: 7 }, width: 7, height: 10, metadata: { purpose: 'authored-ai-entry' } },
  'fallback-zone': { shape: 'rect', origin: { x: 1, y: 17 }, width: 7, height: 5, metadata: { purpose: 'rescue-extraction' } },
};

const SCRIPT_REGIONS = deepFreeze([
  { id: 'support-area', ...worldRect(2, 8, 8, 8) },
  { id: 'west-bridgehead', ...worldRect(10, 8, 6, 8) },
  { id: 'east-bridgehead', ...worldRect(17, 8, 6, 8) },
  { id: 'north-shelterbelt', ...worldRect(3, 3, 10, 5) },
  { id: 'enemy-staging', ...worldRect(25, 7, 7, 10) },
  { id: 'fallback-zone', ...worldRect(1, 17, 7, 5) },
]);

export const DONBAS_AUTHORED_AI = deepFreeze({
  version: 1,
  doctrine: 'probe-fix-escalate',
  phases: [
    { id: 'probe', afterSeconds: 70, entryRegionId: 'enemy-staging', pressureRegionId: 'east-bridgehead', composition: ['ruInfantry', 'ruInfantry', 'ruIfv'] },
    { id: 'mechanized-push', afterSeconds: 160, entryRegionId: 'enemy-staging', pressureRegionId: 'west-bridgehead', composition: ['ruInfantry', 'ruIfv', 'ruTank'] },
    { id: 'crossing-assault', afterSeconds: 250, entryRegionId: 'enemy-staging', pressureRegionId: 'west-bridgehead', composition: ['ruInfantry', 'ruInfantry', 'ruTank', 'ruArtillery'] },
  ],
  priorities: ['crossing-command-post', 'player-production', 'support-area'],
  retreatPolicy: 'none-before-forward-command-loss',
});

export const DONBAS_CROSSING_MISSION_SCRIPT = deepFreeze({
  version: 1,
  id: 'operation-hold-the-crossing.script',
  regions: SCRIPT_REGIONS,
  initialVariables: { economyIntroduced: false, escalationLevel: 0, rescueComplete: false },
  triggers: [
    {
      id: 'opening-economy-orders',
      when: { kind: 'timer', clock: 'ticks', operator: 'gte', value: 1 },
      actions: [
        { kind: 'setResource', resource: 'metal', amount: 240 },
        { kind: 'setResource', resource: 'fuel', amount: 110 },
        { kind: 'setResource', resource: 'intel', amount: 25 },
        { kind: 'setVariable', id: 'economyIntroduced', value: true },
        { kind: 'camera', x: 352, y: 384, zoom: 0.95, durationSeconds: 1.5, label: 'Siverskyi Donets crossing' },
        {
          kind: 'dialogue', speaker: 'captain-marta-koval', portrait: null, durationSeconds: 7,
          text: 'Establish the support area, recover materiel, and keep the crossing command post alive. The first enemy probes are already forming east of the river.',
          metadata: { channel: 'command', fictional: true, tutorial: 'economy' },
        },
      ],
    },
    {
      id: 'materiel-threshold',
      when: { kind: 'resource', resource: 'metal', operator: 'gte', value: 500 },
      actions: [
        {
          kind: 'dialogue', speaker: 'quartermaster-olena-marchenko', portrait: null, durationSeconds: 5,
          text: 'Materiel reserve is sufficient. Commit it to infantry and repair facilities before the crossing fight escalates.',
          metadata: { channel: 'logistics', fictional: true, tutorial: 'production' },
        },
      ],
    },
    {
      id: 'probe-wave',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 70 },
      actions: [
        { kind: 'setVariable', id: 'escalationLevel', value: 1 },
        {
          kind: 'reinforcement', team: 1, label: 'Eastern reconnaissance-in-force',
          entities: [
            { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'enemy-staging', spacingX: 18, spacingY: 16, scriptIdPrefix: 'probe-rifles', tag: 'donbas-wave' },
            { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'enemy-staging', spacingX: 0, spacingY: 0, scriptIdPrefix: 'probe-ifv', tag: 'donbas-wave' },
          ],
        },
      ],
    },
    {
      id: 'mechanized-wave',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 160 },
      actions: [
        { kind: 'setVariable', id: 'escalationLevel', value: 2 },
        {
          kind: 'reinforcement', team: 1, label: 'Mechanized crossing pressure',
          entities: [
            { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'enemy-staging', spacingX: 18, spacingY: 18, scriptIdPrefix: 'mech-rifles', tag: 'donbas-wave' },
            { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'enemy-staging', spacingX: 0, spacingY: 0, scriptIdPrefix: 'mech-ifv', tag: 'donbas-wave' },
            { kind: 'unit', type: 'ruTank', count: 1, regionId: 'enemy-staging', spacingX: 0, spacingY: 0, scriptIdPrefix: 'mech-tank', tag: 'donbas-wave' },
          ],
        },
      ],
    },
    {
      id: 'crossing-assault-wave',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 250 },
      actions: [
        { kind: 'setVariable', id: 'escalationLevel', value: 3 },
        {
          kind: 'reinforcement', team: 1, label: 'Crossing assault group',
          entities: [
            { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'enemy-staging', spacingX: 16, spacingY: 18, scriptIdPrefix: 'assault-rifles', tag: 'donbas-wave' },
            { kind: 'unit', type: 'ruTank', count: 1, regionId: 'enemy-staging', spacingX: 0, spacingY: 0, scriptIdPrefix: 'assault-tank', tag: 'donbas-wave' },
            { kind: 'unit', type: 'ruArtillery', count: 1, regionId: 'enemy-staging', spacingX: 0, spacingY: 0, scriptIdPrefix: 'assault-artillery', tag: 'donbas-wave' },
          ],
        },
        {
          kind: 'dialogue', speaker: 'captain-marta-koval', portrait: null, durationSeconds: 5,
          text: 'This is the main crossing assault. Hold the west bridgehead and break the forward command post once the line stabilizes.',
          metadata: { channel: 'command', fictional: true, escalation: 3 },
        },
      ],
    },
    {
      id: 'rescue-team-extracted',
      when: {
        kind: 'region', regionId: 'fallback-zone', selector: { collection: 'units', scriptId: 'isolated-recovery-team' },
        state: 'alive', event: 'enter', operator: 'gte', value: 1,
      },
      actions: [
        { kind: 'setVariable', id: 'rescueComplete', value: true },
        {
          kind: 'dialogue', speaker: 'quartermaster-olena-marchenko', portrait: null, durationSeconds: 4,
          text: 'Recovery team is back inside the support area. Optional personnel recovery complete.',
          metadata: { channel: 'logistics', fictional: true },
        },
      ],
    },
    {
      id: 'forward-command-destroyed',
      when: { kind: 'entity', selector: { collection: 'buildings', scriptId: 'ru-forward-command' }, state: 'destroyed', operator: 'gte', value: 1 },
      actions: [
        {
          kind: 'dialogue', speaker: 'captain-marta-koval', portrait: null, durationSeconds: 5,
          text: 'Enemy forward command is down. Finish the support-area tasks and keep the crossing secure.',
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
  ],
});

export const DONBAS_CROSSING_OBJECTIVES = deepFreeze([
  {
    id: 'recover-materiel', type: 'gather', label: 'Recover 500 materiel', resource: 'metal', amount: 500,
    failureReason: 'The support area did not recover enough materiel to sustain the crossing defense.',
  },
  {
    id: 'establish-infantry-area', type: 'build', label: 'Establish an infantry assembly area',
    target: { collection: 'buildings', type: 'barracks', team: 0 }, count: 1,
    failureReason: 'The crossing defense never established its infantry production node.',
  },
  {
    id: 'establish-repair-point', type: 'build', label: 'Establish a repair and recovery point',
    target: { collection: 'buildings', type: 'workshop', team: 0 }, count: 1,
    failureReason: 'The crossing defense never established its repair point.',
  },
  {
    id: 'hold-crossing', type: 'defend', label: 'Hold the west bridgehead through the escalation',
    target: { collection: 'buildings', scriptId: 'crossing-command-post' }, regionId: 'west-bridgehead', durationSeconds: 360,
    failureReason: 'The crossing command post was destroyed.',
  },
  {
    id: 'destroy-forward-command', type: 'destroy', label: 'Destroy the Russian forward command post',
    target: { collection: 'buildings', scriptId: 'ru-forward-command' }, count: 1,
    failureReason: 'The Russian forward command post remained operational.',
  },
  {
    id: 'recover-isolated-team', type: 'rescue', label: 'Recover the isolated repair team', optional: true,
    target: { collection: 'units', scriptId: 'isolated-recovery-team' }, regionId: 'fallback-zone',
    failureReason: 'The isolated repair team was lost before extraction.',
  },
]);

export const DONBAS_CROSSING_MAP = deepFreeze({
  formatVersion: 1,
  id: DONBAS_CROSSING_MAP_ID,
  name: 'Siverskyi Donets Crossing',
  width: 1024,
  height: 768,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', s: 'shelterbelt', r: 'rubble', m: 'mud', w: 'water', b: 'bridge' },
    rows: [
      '...............ww...............',
      '...............ww...............',
      '...............ww...............',
      '...............ww...............',
      '....ssssssss...ww...............',
      '....ssssssss...ww...............',
      '....ssssssss...ww...............',
      '...............ww....ssssss.....',
      '...............ww....ssssss.....',
      '............rrrww....ssssss.....',
      '............rrrww....ssssss.....',
      '...............bb...............',
      '...............bb...............',
      '............rrrww...............',
      '............rrrww..mmmm.........',
      '...............ww..mmmm.........',
      '...............ww..mmmm.........',
      '....ssssssss...ww..mmmm.........',
      '....ssssssss...ww...............',
      '...............ww...............',
      '...............ww...............',
      '...............ww...............',
      '...............ww...............',
      '...............ww...............',
    ],
  },
  roads: [
    { id: 'crossing-road', cells: horizontal(11, 1, 30), metadata: { purpose: 'primary-crossing', defended: true } },
  ],
  resources: [
    { id: 'west-materiel-cache', type: 'metal', cell: { x: 5, y: 15 }, amount: 260, metadata: { onboarding: true } },
    { id: 'shelterbelt-materiel-cache', type: 'metal', cell: { x: 10, y: 5 }, amount: 260, metadata: { onboarding: true, contested: true } },
  ],
  props: [
    { id: 'crossing-revetment-west', type: 'field-fortification', cell: { x: 13, y: 9 }, footprint: { width: 2, height: 2 }, blockingLayers: ['ground'], metadata: { cover: 'heavy' } },
    { id: 'crossing-revetment-east', type: 'field-fortification', cell: { x: 18, y: 13 }, footprint: { width: 2, height: 2 }, blockingLayers: ['ground'], metadata: { cover: 'heavy' } },
  ],
  starts: {
    player: [
      { id: 'ua-crossing-command', cell: { x: 12, y: 12 }, facing: 0, metadata: { kind: 'building', type: 'depot', team: 0, scriptId: 'crossing-command-post', tag: 'defense-anchor' } },
      { id: 'ua-engineer-start', cell: { x: 5, y: 11 }, facing: 0, metadata: { kind: 'unit', type: 'uaEngineer', team: 0, scriptId: 'support-engineers', tag: 'economy-onboarding' } },
      { id: 'ua-rifle-start', cell: { x: 11, y: 10 }, facing: 90, metadata: { kind: 'unit', type: 'uaInfantry', team: 0, scriptId: 'crossing-rifles', tag: 'crossing-defense' } },
      { id: 'ua-hq-start', cell: { x: 4, y: 13 }, facing: 0, metadata: { kind: 'building', type: 'hq', team: 0, scriptId: 'support-hq', tag: 'economy-onboarding' } },
    ],
    rescue: [
      { id: 'isolated-team-start', cell: { x: 10, y: 5 }, facing: 180, metadata: { kind: 'unit', type: 'uaEngineer', team: 0, scriptId: 'isolated-recovery-team', tag: 'optional-rescue' } },
    ],
    enemy: [
      { id: 'ru-forward-command-start', cell: { x: 27, y: 12 }, facing: 180, metadata: { kind: 'building', type: 'hq', team: 1, scriptId: 'ru-forward-command', tag: 'mission-target' } },
      { id: 'ru-screen-start', cell: { x: 23, y: 10 }, facing: 270, metadata: { kind: 'unit', type: 'ruInfantry', team: 1, scriptId: 'ru-crossing-screen', tag: 'crossing-screen' } },
      { id: 'ru-ifv-start', cell: { x: 25, y: 14 }, facing: 270, metadata: { kind: 'unit', type: 'ruIfv', team: 1, scriptId: 'ru-crossing-ifv', tag: 'crossing-screen' } },
    ],
  },
  regions: MAP_REGIONS,
  triggers: DONBAS_CROSSING_MISSION_SCRIPT.triggers,
  metadata: {
    operationId: DONBAS_CROSSING_OPERATION_ID,
    legacyMissionId: 'donbas',
    regionId: 'donbas',
    authoredAi: DONBAS_AUTHORED_AI,
    economyOnboarding: { startingResources: { metal: 240, fuel: 110, intel: 25 }, targetMateriel: 500, requiredFacilities: ['barracks', 'workshop'] },
    fictionalFraming: true,
  },
});

export const DONBAS_CROSSING_BRIEFING = deepFreeze({
  operationId: DONBAS_CROSSING_OPERATION_ID,
  title: 'Hold the Crossing',
  summary: 'Build a support area west of the Siverskyi Donets, absorb an escalating mechanized attack, and dismantle the opposing forward command.',
  mapPreview: {
    mapId: DONBAS_CROSSING_MAP_ID,
    imageId: 'preview-siverskyi-donets-crossing',
    caption: 'Support area, bridgehead, river crossing, shelterbelt rescue pocket, and eastern staging area',
    markers: [
      { id: 'support', kind: 'friendly-start', label: 'Support area', x: 0.17, y: 0.52 },
      { id: 'crossing', kind: 'objective', label: 'Crossing command post', x: 0.42, y: 0.5 },
      { id: 'rescue', kind: 'objective', label: 'Isolated repair team', x: 0.31, y: 0.22 },
      { id: 'enemy-command', kind: 'enemy', label: 'Forward command post', x: 0.86, y: 0.5 },
    ],
  },
  forces: [
    { id: 'engineers', label: 'Combat engineer section', category: 'support', count: 1 },
    { id: 'crossing-rifles', label: 'Mechanized infantry squad', category: 'infantry', count: 1 },
    { id: 'isolated-team', label: 'Isolated repair team', category: 'support', count: 1, note: 'Optional recovery' },
  ],
  intelligence: [
    { id: 'escalation', title: 'Escalating crossing pressure', detail: 'Expect a probe, a mechanized push, then a combined crossing assault.', confidence: 'confirmed' },
    { id: 'forward-command', title: 'Forward command post', detail: 'The eastern command node coordinates the final pressure phase.', confidence: 'confirmed' },
  ],
  objectives: DONBAS_CROSSING_OBJECTIVES.map((objective) => ({
    id: objective.id, title: objective.label, description: objective.failureReason, optional: Boolean(objective.optional),
  })),
  difficulty: 'standard',
  difficultyNotes: {
    label: 'Standard',
    summary: 'Economy onboarding under progressively heavier crossing pressure.',
    modifiers: ['Legacy 240/110/25 starting economy', 'Three authored escalation phases', 'Optional repair-team recovery'],
  },
  loadingHints: [
    'Use the two materiel caches to reach the 500-materiel threshold without abandoning the bridgehead.',
    'Production is part of the mission contract: establish both infantry and repair facilities.',
    'The optional recovery team sits north of the crossing; extract it before the late assault makes the shelterbelt costly to reach.',
  ],
  metadata: { fictional: true, legacyMissionId: 'donbas' },
});

export const DONBAS_CROSSING_OPERATION = deepFreeze({
  id: DONBAS_CROSSING_OPERATION_ID,
  title: 'Hold the Crossing',
  gate: 'campaign-alpha',
  map: DONBAS_CROSSING_MAP,
  mission: {
    id: DONBAS_CROSSING_OPERATION_ID,
    legacyMissionId: 'donbas',
    mapId: DONBAS_CROSSING_MAP_ID,
    objectiveMode: 'library',
    objectiveIds: DONBAS_CROSSING_OBJECTIVES.map((objective) => objective.id),
    objectiveDefinitions: DONBAS_CROSSING_OBJECTIVES,
    regions: SCRIPT_REGIONS,
    script: DONBAS_CROSSING_MISSION_SCRIPT,
    authoredAi: DONBAS_AUTHORED_AI,
    checkpointPolicy: 'enabled',
    checkpointLabels: [
      { id: 'support-area-established', label: 'Support area established', authoredEvent: 'production-objectives-complete' },
      { id: 'mechanized-push', label: 'Mechanized pressure begins', afterSeconds: 160 },
      { id: 'main-assault', label: 'Main crossing assault', afterSeconds: 250 },
    ],
  },
  briefing: DONBAS_CROSSING_BRIEFING,
  debrief: {
    victoryTitle: 'Crossing Held',
    defeatTitle: 'Bridgehead Lost',
    medalRules: [
      { id: 'medal-recovery-team', title: 'Recovery Under Fire', condition: { objectiveId: 'recover-isolated-team', complete: true } },
      { id: 'medal-forward-command', title: 'Broken Coordination', condition: { objectiveId: 'destroy-forward-command', complete: true } },
    ],
  },
  contentNotes: [
    'This is a stylized fictional operation using the legacy Donbas mission identity and public campaign contracts.',
    'Authored enemy behavior is represented as deterministic scripted pressure phases for downstream runtime composition.',
    'No browser campaign mounting is owned by UFR-094.',
  ],
});
