const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const horizontal = (y, fromX, toX) => Array.from({ length: toX - fromX + 1 }, (_, offset) => ({ x: fromX + offset, y }));
const worldRect = (x, y, width, height, tileSize = 32) => ({
  shape: 'rect', x: x * tileSize, y: y * tileSize, width: width * tileSize, height: height * tileSize,
});

export const ZAPORIZHZHIA_RECON_STRIKE_OPERATION_ID = 'operation-eyes-above';
export const ZAPORIZHZHIA_RECON_STRIKE_MAP_ID = 'map-orikhiv-recon-strike';

const MAP_REGIONS = {
  'recon-launch': { shape: 'rect', origin: { x: 2, y: 9 }, width: 7, height: 7, metadata: { purpose: 'player-start' } },
  'north-approach': { shape: 'rect', origin: { x: 9, y: 3 }, width: 10, height: 7, metadata: { purpose: 'approach-option-north' } },
  'south-approach': { shape: 'rect', origin: { x: 9, y: 15 }, width: 10, height: 7, metadata: { purpose: 'approach-option-south' } },
  'artillery-belt': { shape: 'rect', origin: { x: 21, y: 5 }, width: 10, height: 11, metadata: { purpose: 'recon-and-fires-target' } },
  'ew-site': { shape: 'rect', origin: { x: 22, y: 9 }, width: 5, height: 5, metadata: { purpose: 'ew-counterplay' } },
  'target-intel-pocket': { shape: 'rect', origin: { x: 27, y: 16 }, width: 4, height: 5, metadata: { purpose: 'optional-target-intelligence' } },
  'north-response': { shape: 'rect', origin: { x: 19, y: 2 }, width: 5, height: 5, metadata: { purpose: 'authored-response' } },
  'south-response': { shape: 'rect', origin: { x: 19, y: 18 }, width: 5, height: 5, metadata: { purpose: 'authored-response' } },
};

const SCRIPT_REGIONS = deepFreeze([
  { id: 'recon-launch', ...worldRect(2, 9, 7, 7) },
  { id: 'north-approach', ...worldRect(9, 3, 10, 7) },
  { id: 'south-approach', ...worldRect(9, 15, 10, 7) },
  { id: 'artillery-belt', ...worldRect(21, 5, 10, 11) },
  { id: 'ew-site', ...worldRect(22, 9, 5, 5) },
  { id: 'target-intel-pocket', ...worldRect(27, 16, 4, 5) },
  { id: 'north-response', ...worldRect(19, 2, 5, 5) },
  { id: 'south-response', ...worldRect(19, 18, 5, 5) },
]);

export const ZAPORIZHZHIA_STRIKE_CHAIN = deepFreeze({
  version: 1,
  stages: [
    { id: 'find', contract: 'recon', targetRegionId: 'artillery-belt' },
    { id: 'blind', contract: 'disable', targetScriptId: 'enemy-ew-node' },
    { id: 'suppress', contract: 'destroy', targetTag: 'enemy-artillery' },
    { id: 'exploit', contract: 'approach', options: ['north-approach', 'south-approach'] },
  ],
  approachResponses: {
    'north-approach': { reinforcementRegionId: 'north-response', composition: ['ruInfantry', 'ruInfantry'] },
    'south-approach': { reinforcementRegionId: 'south-response', composition: ['ruInfantry', 'ruIfv'] },
  },
});

export const ZAPORIZHZHIA_RECON_STRIKE_MISSION_SCRIPT = deepFreeze({
  version: 1,
  id: 'operation-eyes-above.script',
  regions: SCRIPT_REGIONS,
  initialVariables: {
    northApproachUsed: false,
    southApproachUsed: false,
    ewSuppressed: false,
    artillerySuppressed: false,
    optionalTargetIntel: false,
  },
  triggers: [
    {
      id: 'opening-recon-orders',
      when: { kind: 'timer', clock: 'ticks', operator: 'gte', value: 1 },
      actions: [
        { kind: 'setResource', resource: 'metal', amount: 320 },
        { kind: 'setResource', resource: 'fuel', amount: 190 },
        { kind: 'setResource', resource: 'intel', amount: 70 },
        { kind: 'camera', x: 208, y: 400, zoom: 0.9, durationSeconds: 1.5, label: 'Recon launch area' },
        {
          kind: 'dialogue', speaker: 'colonel-ihor-melnyk', portrait: null, durationSeconds: 7,
          text: 'Build the intelligence picture before striking. Find the artillery belt, break the EW node, then suppress the guns from whichever approach you can support.',
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
    {
      id: 'north-approach-entered',
      when: { kind: 'region', regionId: 'north-approach', selector: { collection: 'units', team: 0 }, state: 'alive', event: 'enter', operator: 'gte', value: 1 },
      actions: [
        { kind: 'setVariable', id: 'northApproachUsed', value: true },
        {
          kind: 'reinforcement', team: 1, label: 'Northern shelterbelt screen',
          entities: [
            { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'north-response', spacingX: 18, spacingY: 16, scriptIdPrefix: 'north-screen', tag: 'approach-response' },
          ],
        },
        {
          kind: 'dialogue', speaker: 'colonel-ihor-melnyk', portrait: null, durationSeconds: 4,
          text: 'Northern shelterbelt route is active. Expect a dismounted screen before the artillery line.',
          metadata: { channel: 'operations', fictional: true, approach: 'north' },
        },
      ],
    },
    {
      id: 'south-approach-entered',
      when: { kind: 'region', regionId: 'south-approach', selector: { collection: 'units', team: 0 }, state: 'alive', event: 'enter', operator: 'gte', value: 1 },
      actions: [
        { kind: 'setVariable', id: 'southApproachUsed', value: true },
        {
          kind: 'reinforcement', team: 1, label: 'Southern mobile screen',
          entities: [
            { kind: 'unit', type: 'ruInfantry', count: 1, regionId: 'south-response', spacingX: 18, spacingY: 16, scriptIdPrefix: 'south-rifles', tag: 'approach-response' },
            { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'south-response', spacingX: 0, spacingY: 0, scriptIdPrefix: 'south-ifv', tag: 'approach-response' },
          ],
        },
        {
          kind: 'dialogue', speaker: 'colonel-ihor-melnyk', portrait: null, durationSeconds: 4,
          text: 'Southern farm-track route is active. A mobile screen is repositioning to meet it.',
          metadata: { channel: 'operations', fictional: true, approach: 'south' },
        },
      ],
    },
    {
      id: 'artillery-belt-observed',
      when: { kind: 'region', regionId: 'artillery-belt', selector: { collection: 'units', type: 'uaDrone', team: 0 }, state: 'alive', event: 'enter', operator: 'gte', value: 1 },
      actions: [
        {
          kind: 'dialogue', speaker: 'uas-lead-nadia-hrytsenko', portrait: null, durationSeconds: 5,
          text: 'Artillery belt fixed. The EW node is masking the cleanest target handoff; suppress it before the strike package commits.',
          metadata: { channel: 'recon', fictional: true },
        },
      ],
    },
    {
      id: 'ew-node-suppressed',
      when: { kind: 'objective', id: 'disable-ew-node', state: 'complete' },
      actions: [
        { kind: 'setVariable', id: 'ewSuppressed', value: true },
        {
          kind: 'dialogue', speaker: 'uas-lead-nadia-hrytsenko', portrait: null, durationSeconds: 4,
          text: 'EW emitter is off the air. Recon tracks are stable enough for the suppression mission.',
          metadata: { channel: 'recon', fictional: true },
        },
      ],
    },
    {
      id: 'artillery-batteries-destroyed',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'entity', selector: { collection: 'units', scriptId: 'enemy-artillery-1' }, state: 'destroyed', operator: 'gte', value: 1 },
          { kind: 'entity', selector: { collection: 'units', scriptId: 'enemy-artillery-2' }, state: 'destroyed', operator: 'gte', value: 1 },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'artillerySuppressed', value: true },
        {
          kind: 'dialogue', speaker: 'colonel-ihor-melnyk', portrait: null, durationSeconds: 5,
          text: 'Both firing sections are silent. Exploit the route you opened and finish collecting target intelligence if the relay pocket is still reachable.',
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
    {
      id: 'target-intel-pocket-observed',
      when: { kind: 'region', regionId: 'target-intel-pocket', selector: { collection: 'units', type: 'uaDrone', team: 0 }, state: 'alive', event: 'enter', operator: 'gte', value: 1 },
      actions: [
        { kind: 'setVariable', id: 'optionalTargetIntel', value: true },
        { kind: 'addResource', resource: 'intel', amount: 80 },
        {
          kind: 'dialogue', speaker: 'uas-lead-nadia-hrytsenko', portrait: null, durationSeconds: 4,
          text: 'Optional relay pocket mapped. Target package is richer and the additional intelligence has been logged.',
          metadata: { channel: 'recon', fictional: true, optional: true },
        },
      ],
    },
  ],
});

export const ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES = deepFreeze([
  {
    id: 'accumulate-intelligence', type: 'gather', label: 'Accumulate 250 intelligence', resource: 'intel', amount: 250,
    failureReason: 'The reconnaissance-strike cell never assembled enough intelligence for the operation.',
  },
  {
    id: 'recon-artillery-belt', type: 'recon', label: 'Establish reconnaissance over the artillery belt',
    observer: { collection: 'units', type: 'uaDrone', team: 0 }, regionId: 'artillery-belt', count: 1,
    failureReason: 'The artillery belt was not positively located.',
  },
  {
    id: 'disable-ew-node', type: 'disable', label: 'Suppress the Russian EW node',
    target: { collection: 'buildings', scriptId: 'enemy-ew-node' }, count: 1, disableThreshold: 0.35,
    failureReason: 'The EW node remained effective and denied a clean strike handoff.',
  },
  {
    id: 'suppress-artillery', type: 'destroy', label: 'Destroy both Russian artillery sections',
    target: { collection: 'units', tag: 'enemy-artillery' }, count: 2,
    failureReason: 'Russian artillery remained capable of covering the approach.',
  },
  {
    id: 'identify-target-relay', type: 'recon', label: 'Map the optional target-intelligence relay pocket', optional: true,
    observer: { collection: 'units', type: 'uaDrone', team: 0 }, regionId: 'target-intel-pocket', count: 1,
    failureReason: 'The optional target-intelligence relay pocket was not mapped.',
  },
]);

export const ZAPORIZHZHIA_RECON_STRIKE_MAP = deepFreeze({
  formatVersion: 1,
  id: ZAPORIZHZHIA_RECON_STRIKE_MAP_ID,
  name: 'Orikhiv Recon-Strike Corridor',
  width: 1024,
  height: 768,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', s: 'shelterbelt', r: 'rubble', m: 'mud' },
    rows: [
      '................................',
      '................................',
      '................................',
      '..s.ss.ss.ss.ss.ss.ss.ss.ss.ss..',
      '...ss.ss.ss.ss.ss.ss.ss.ss.ss...',
      '................................',
      '......................rrrrrrr...',
      '......................rrrrrrr...',
      '......................rrrrrrr...',
      '..s.ss.ss.ss.ss.ss.ss.ss.ss.ss..',
      '...ss.ss.ss.ss.ss.ss.ss.ss.ss...',
      '................................',
      '........................rrrrrr..',
      '........................rrrrrr..',
      '........................rrrrrr..',
      '..s.ss.ss.ss.ss.ss.ss.ss.ss.ss..',
      '...ss.ss.ss.ss.ss.ss.ss.ss.ss...',
      '................................',
      '.......................mmmm.....',
      '.......................mmmm.....',
      '..ss.ss.ss.ss.ss.ss.ss.mmmms.s..',
      '................................',
      '................................',
      '................................',
    ],
  },
  roads: [
    { id: 'north-shelterbelt-route', cells: horizontal(6, 1, 20), metadata: { approach: 'north', concealment: 'shelterbelt' } },
    { id: 'south-farm-track', cells: horizontal(18, 1, 20), metadata: { approach: 'south', concealment: 'limited' } },
  ],
  props: [
    { id: 'north-observation-berm', type: 'observation-position', cell: { x: 18, y: 5 }, footprint: { width: 2, height: 2 }, blockingLayers: [], metadata: { approach: 'north' } },
    { id: 'south-drainage-cut', type: 'drainage-cut', cell: { x: 17, y: 18 }, footprint: { width: 2, height: 2 }, blockingLayers: ['ground'], metadata: { approach: 'south' } },
  ],
  starts: {
    player: [
      { id: 'ua-recon-hq', cell: { x: 4, y: 12 }, facing: 0, metadata: { kind: 'building', type: 'hq', team: 0, scriptId: 'recon-hq', tag: 'command' } },
      { id: 'ua-drone-start', cell: { x: 6, y: 11 }, facing: 0, metadata: { kind: 'unit', type: 'uaDrone', team: 0, scriptId: 'primary-recon-drone', tag: 'recon-element' } },
      { id: 'ua-infantry-start', cell: { x: 6, y: 14 }, facing: 90, metadata: { kind: 'unit', type: 'uaInfantry', team: 0, scriptId: 'recon-security', tag: 'security' } },
      { id: 'ua-artillery-start', cell: { x: 8, y: 13 }, facing: 90, metadata: { kind: 'unit', type: 'uaArtillery', team: 0, scriptId: 'counterbattery-section', tag: 'fires' } },
    ],
    enemy: [
      { id: 'ru-ew-node-start', cell: { x: 24, y: 11 }, facing: 180, metadata: { kind: 'building', type: 'workshop', team: 1, scriptId: 'enemy-ew-node', tag: 'ew-target' } },
      { id: 'ru-artillery-1-start', cell: { x: 26, y: 7 }, facing: 180, metadata: { kind: 'unit', type: 'ruArtillery', team: 1, scriptId: 'enemy-artillery-1', tag: 'enemy-artillery' } },
      { id: 'ru-artillery-2-start', cell: { x: 27, y: 14 }, facing: 180, metadata: { kind: 'unit', type: 'ruArtillery', team: 1, scriptId: 'enemy-artillery-2', tag: 'enemy-artillery' } },
      { id: 'ru-north-screen-start', cell: { x: 21, y: 6 }, facing: 270, metadata: { kind: 'unit', type: 'ruInfantry', team: 1, scriptId: 'north-security-screen', tag: 'screen' } },
      { id: 'ru-south-screen-start', cell: { x: 21, y: 18 }, facing: 270, metadata: { kind: 'unit', type: 'ruIfv', team: 1, scriptId: 'south-security-screen', tag: 'screen' } },
      { id: 'ru-relay-start', cell: { x: 29, y: 18 }, facing: 180, metadata: { kind: 'building', type: 'depot', team: 1, scriptId: 'target-intel-relay', tag: 'optional-intel' } },
    ],
  },
  regions: MAP_REGIONS,
  triggers: ZAPORIZHZHIA_RECON_STRIKE_MISSION_SCRIPT.triggers,
  metadata: {
    operationId: ZAPORIZHZHIA_RECON_STRIKE_OPERATION_ID,
    legacyMissionId: 'zaporizhzhia',
    regionId: 'zaporizhzhia',
    strikeChain: ZAPORIZHZHIA_STRIKE_CHAIN,
    multipleApproaches: ['north-approach', 'south-approach'],
    startingResources: { metal: 320, fuel: 190, intel: 70 },
    fictionalFraming: true,
  },
});

export const ZAPORIZHZHIA_RECON_STRIKE_BRIEFING = deepFreeze({
  operationId: ZAPORIZHZHIA_RECON_STRIKE_OPERATION_ID,
  title: 'Eyes Above',
  summary: 'Build a reconnaissance-strike picture on the Orikhiv axis, counter the EW screen, suppress hostile artillery, and choose how to approach the firing belt.',
  mapPreview: {
    mapId: ZAPORIZHZHIA_RECON_STRIKE_MAP_ID,
    imageId: 'preview-orikhiv-recon-strike',
    caption: 'Recon launch area, northern shelterbelt route, southern farm track, EW site, artillery belt, and optional relay pocket',
    markers: [
      { id: 'launch', kind: 'friendly-start', label: 'Recon launch area', x: 0.18, y: 0.52 },
      { id: 'north', kind: 'objective', label: 'Northern route', x: 0.45, y: 0.26 },
      { id: 'south', kind: 'objective', label: 'Southern route', x: 0.45, y: 0.76 },
      { id: 'ew', kind: 'enemy', label: 'EW node', x: 0.76, y: 0.5 },
      { id: 'artillery', kind: 'enemy', label: 'Artillery belt', x: 0.86, y: 0.42 },
    ],
  },
  forces: [
    { id: 'uas', label: 'FPV reconnaissance-strike team', category: 'recon', count: 1 },
    { id: 'security', label: 'Mechanized security squad', category: 'infantry', count: 1 },
    { id: 'fires', label: 'Counter-battery artillery section', category: 'artillery', count: 1 },
  ],
  intelligence: [
    { id: 'ew', title: 'Electronic-warfare screen', detail: 'A forward EW node interferes with target handoff around the firing belt.', confidence: 'confirmed' },
    { id: 'routes', title: 'Two viable approaches', detail: 'The northern shelterbelt favors concealment; the southern track is faster but draws a mobile response.', confidence: 'confirmed' },
  ],
  objectives: ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES.map((objective) => ({
    id: objective.id, title: objective.label, description: objective.failureReason, optional: Boolean(objective.optional),
  })),
  difficulty: 'standard',
  difficultyNotes: {
    label: 'Standard',
    summary: 'Information advantage matters more than frontal force.',
    modifiers: ['250-intelligence legacy target', 'EW suppression before clean strike handoff', 'Independent north and south approach responses'],
  },
  loadingHints: [
    'Use the drone to establish contact with the artillery belt before committing the strike package.',
    'The EW objective completes when the node is disabled to 35% health or worse; destruction also satisfies it.',
    'The optional relay pocket grants additional intelligence but pulls reconnaissance beyond the primary firing belt.',
  ],
  metadata: { fictional: true, legacyMissionId: 'zaporizhzhia' },
});

export const ZAPORIZHZHIA_RECON_STRIKE_OPERATION = deepFreeze({
  id: ZAPORIZHZHIA_RECON_STRIKE_OPERATION_ID,
  title: 'Eyes Above',
  gate: 'campaign-alpha',
  map: ZAPORIZHZHIA_RECON_STRIKE_MAP,
  mission: {
    id: ZAPORIZHZHIA_RECON_STRIKE_OPERATION_ID,
    legacyMissionId: 'zaporizhzhia',
    mapId: ZAPORIZHZHIA_RECON_STRIKE_MAP_ID,
    objectiveMode: 'library',
    objectiveIds: ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES.map((objective) => objective.id),
    objectiveDefinitions: ZAPORIZHZHIA_RECON_STRIKE_OBJECTIVES,
    regions: SCRIPT_REGIONS,
    script: ZAPORIZHZHIA_RECON_STRIKE_MISSION_SCRIPT,
    strikeChain: ZAPORIZHZHIA_STRIKE_CHAIN,
    checkpointPolicy: 'enabled',
    checkpointLabels: [
      { id: 'artillery-fixed', label: 'Artillery belt located', authoredEvent: 'recon-artillery-belt-complete' },
      { id: 'ew-suppressed', label: 'EW node suppressed', authoredEvent: 'disable-ew-node-complete' },
      { id: 'artillery-suppressed', label: 'Artillery belt suppressed', authoredEvent: 'suppress-artillery-complete' },
    ],
  },
  briefing: ZAPORIZHZHIA_RECON_STRIKE_BRIEFING,
  debrief: {
    victoryTitle: 'Firing Belt Suppressed',
    defeatTitle: 'Recon-Strike Chain Broken',
    medalRules: [
      { id: 'medal-target-intel', title: 'Complete Target Picture', condition: { objectiveId: 'identify-target-relay', complete: true } },
      { id: 'medal-dual-approach', title: 'Flexible Scheme', condition: { variables: ['northApproachUsed', 'southApproachUsed'], all: true } },
    ],
  },
  contentNotes: [
    'This is a stylized fictional operation using the legacy Zaporizhzhia mission identity.',
    'EW, reconnaissance, and artillery effects reuse existing public contracts; this module owns only declarative mission composition.',
    'No browser campaign mounting is owned by UFR-095.',
  ],
});
