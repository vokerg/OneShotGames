const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const horizontal = (y, fromX, toX) => Array.from({ length: toX - fromX + 1 }, (_, offset) => ({ x: fromX + offset, y }));
const vertical = (x, fromY, toY) => Array.from({ length: toY - fromY + 1 }, (_, offset) => ({ x, y: fromY + offset }));
const uniqueCells = (entries) => [...new Map(entries.map((cell) => [`${cell.x},${cell.y}`, cell])).values()];
const worldRect = (x, y, width, height, tileSize = 32) => ({
  shape: 'rect',
  x: x * tileSize,
  y: y * tileSize,
  width: width * tileSize,
  height: height * tileSize,
});

export const URBAN_DEFENSE_OPERATION_ID = 'operation-safe-passage';
export const URBAN_DEFENSE_MAP_ID = 'map-safe-passage';

const MAP_REGIONS = {
  'western-exit': { shape: 'rect', origin: { x: 0, y: 9 }, width: 3, height: 6, metadata: { purpose: 'evacuation-exit' } },
  'evacuation-hub': { shape: 'rect', origin: { x: 4, y: 9 }, width: 4, height: 4, metadata: { purpose: 'defense-anchor' } },
  'route-corridor': { shape: 'rect', origin: { x: 2, y: 10 }, width: 25, height: 5, metadata: { purpose: 'evacuation-route' } },
  'urban-district': { shape: 'rect', origin: { x: 6, y: 4 }, width: 20, height: 15, metadata: { purpose: 'protected-district' } },
  'north-aid': { shape: 'rect', origin: { x: 24, y: 2 }, width: 5, height: 4, metadata: { purpose: 'optional-rescue' } },
  'east-approach': { shape: 'rect', origin: { x: 28, y: 7 }, width: 4, height: 10, metadata: { purpose: 'hostile-entry' } },
};

const SCRIPT_REGIONS = Object.freeze([
  { id: 'western-exit', ...worldRect(0, 9, 3, 6) },
  { id: 'evacuation-hub', ...worldRect(4, 9, 4, 4) },
  { id: 'route-corridor', ...worldRect(2, 10, 25, 5) },
  { id: 'urban-district', ...worldRect(6, 4, 20, 15) },
  { id: 'north-aid', ...worldRect(24, 2, 5, 4) },
  { id: 'east-approach', ...worldRect(28, 7, 4, 10) },
]);

export const URBAN_DEFENSE_MISSION_SCRIPT = deepFreeze({
  version: 1,
  id: 'operation-safe-passage.script',
  regions: SCRIPT_REGIONS,
  initialVariables: {
    collateralIncidents: 0,
    evacuationReleased: false,
  },
  triggers: [
    {
      id: 'opening-orders',
      when: { kind: 'timer', clock: 'ticks', operator: 'gte', value: 1 },
      actions: [
        {
          kind: 'dialogue',
          speaker: 'captain-marta-koval',
          text: 'Hold the evacuation hub and keep the western route open. Civilian movement is represented by protected transport manifests, not targetable people.',
          portrait: null,
          durationSeconds: 7,
          metadata: { channel: 'command', fictional: true },
        },
        { kind: 'camera', x: 192, y: 352, zoom: 1, durationSeconds: 1.5, label: 'Evacuation hub' },
        { kind: 'weather', weatherId: 'urban-haze', intensity: 0.35, transitionSeconds: 3, durationSeconds: null },
      ],
    },
    {
      id: 'release-evacuation-column',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 45 },
      actions: [
        { kind: 'setVariable', id: 'evacuationReleased', value: true },
        {
          kind: 'dialogue',
          speaker: 'dispatcher-oleh-sydor',
          text: 'The protected transport column is moving. Escort it west along the marked corridor.',
          portrait: null,
          durationSeconds: 6,
          metadata: { channel: 'operations', fictional: true },
        },
      ],
    },
    {
      id: 'first-east-assault',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 80 },
      actions: [
        {
          kind: 'reinforcement',
          team: 1,
          label: 'Eastern probing force',
          entities: [
            { kind: 'unit', type: 'ruInfantry', count: 3, regionId: 'east-approach', spacingX: 20, spacingY: 18, scriptIdPrefix: 'east-rifles', tag: 'assault-wave' },
            { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'east-approach', spacingX: 0, spacingY: 0, scriptIdPrefix: 'east-ifv', tag: 'assault-wave' },
          ],
        },
      ],
    },
    {
      id: 'second-east-assault',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 190 },
      actions: [
        {
          kind: 'reinforcement',
          team: 1,
          label: 'Armored pressure group',
          entities: [
            { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'east-approach', spacingX: 18, spacingY: 20, scriptIdPrefix: 'late-rifles', tag: 'assault-wave' },
            { kind: 'unit', type: 'ruTank', count: 1, regionId: 'east-approach', spacingX: 0, spacingY: 0, scriptIdPrefix: 'late-tank', tag: 'assault-wave' },
          ],
        },
      ],
    },
    {
      id: 'clinic-lost',
      when: { kind: 'entity', selector: { collection: 'buildings', scriptId: 'protected-clinic' }, state: 'destroyed', operator: 'gte', value: 1 },
      actions: [
        { kind: 'addVariable', id: 'collateralIncidents', amount: 1 },
        {
          kind: 'dialogue',
          speaker: 'captain-marta-koval',
          text: 'The field clinic is lost. One more protected-site loss will end the operation.',
          portrait: null,
          durationSeconds: 5,
          metadata: { channel: 'warning', fictional: true },
        },
      ],
    },
    {
      id: 'waterworks-lost',
      when: { kind: 'entity', selector: { collection: 'buildings', scriptId: 'protected-waterworks' }, state: 'destroyed', operator: 'gte', value: 1 },
      actions: [
        { kind: 'addVariable', id: 'collateralIncidents', amount: 1 },
        {
          kind: 'dialogue',
          speaker: 'dispatcher-oleh-sydor',
          text: 'The waterworks site is lost. Preserve the remaining protected infrastructure.',
          portrait: null,
          durationSeconds: 5,
          metadata: { channel: 'warning', fictional: true },
        },
      ],
    },
    {
      id: 'collateral-limit-reached',
      once: true,
      when: {
        kind: 'all',
        conditions: [
          { kind: 'entity', selector: { collection: 'buildings', scriptId: 'protected-clinic' }, state: 'destroyed', operator: 'gte', value: 1 },
          { kind: 'entity', selector: { collection: 'buildings', scriptId: 'protected-waterworks' }, state: 'destroyed', operator: 'gte', value: 1 },
        ],
      },
      actions: [
        {
          kind: 'finish',
          result: 'defeat',
          reason: 'The protected-site loss limit was exceeded; the evacuation corridor is no longer viable.',
        },
      ],
    },
    {
      id: 'aid-team-extracted',
      when: {
        kind: 'region',
        regionId: 'western-exit',
        selector: { collection: 'units', scriptId: 'isolated-aid-team' },
        state: 'alive',
        event: 'enter',
        operator: 'gte',
        value: 1,
      },
      actions: [
        {
          kind: 'dialogue',
          speaker: 'dispatcher-oleh-sydor',
          text: 'The isolated aid team has reached the safe route.',
          portrait: null,
          durationSeconds: 4,
          metadata: { channel: 'operations', fictional: true },
        },
      ],
    },
    {
      id: 'evacuation-column-extracted',
      when: {
        kind: 'region',
        regionId: 'western-exit',
        selector: { collection: 'units', scriptId: 'evacuation-column' },
        state: 'alive',
        event: 'enter',
        operator: 'gte',
        value: 1,
      },
      actions: [
        {
          kind: 'dialogue',
          speaker: 'captain-marta-koval',
          text: 'The evacuation manifest is clear of the district. Maintain the hub until relief arrives.',
          portrait: null,
          durationSeconds: 5,
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
  ],
});

export const URBAN_DEFENSE_OBJECTIVES = deepFreeze([
  {
    id: 'hold-evacuation-hub',
    type: 'defend',
    label: 'Hold the evacuation hub',
    target: { collection: 'buildings', scriptId: 'evacuation-hub' },
    regionId: 'evacuation-hub',
    durationSeconds: 420,
    failureReason: 'The evacuation hub was overrun.',
  },
  {
    id: 'evacuate-column',
    type: 'escort',
    label: 'Escort the protected transport column west',
    target: { collection: 'units', scriptId: 'evacuation-column' },
    regionId: 'western-exit',
    failureReason: 'The protected transport column was destroyed.',
  },
  {
    id: 'rescue-aid-team',
    type: 'rescue',
    label: 'Recover the isolated aid team',
    optional: true,
    target: { collection: 'units', scriptId: 'isolated-aid-team' },
    regionId: 'western-exit',
    failureReason: 'The isolated aid team was lost.',
  },
  {
    id: 'protect-clinic',
    type: 'defend',
    label: 'Preserve the field clinic',
    optional: true,
    target: { collection: 'buildings', scriptId: 'protected-clinic' },
    regionId: 'urban-district',
    durationSeconds: 420,
    failureReason: 'The field clinic was destroyed.',
  },
  {
    id: 'protect-waterworks',
    type: 'defend',
    label: 'Preserve the waterworks site',
    optional: true,
    target: { collection: 'buildings', scriptId: 'protected-waterworks' },
    regionId: 'urban-district',
    durationSeconds: 420,
    failureReason: 'The waterworks site was destroyed.',
  },
]);

const routeCells = uniqueCells([
  ...horizontal(12, 1, 29),
  ...vertical(24, 5, 11),
  ...horizontal(5, 24, 28),
]);

export const URBAN_DEFENSE_MAP = deepFreeze({
  formatVersion: 1,
  id: URBAN_DEFENSE_MAP_ID,
  name: 'Safe Passage District',
  width: 1024,
  height: 768,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', s: 'shelterbelt', r: 'rubble', m: 'mud', '#': 'blocked' },
    rows: [
      '................................',
      '................................',
      '......................ssss......',
      '......................s..s......',
      '......rrr.............s..s......',
      '......r.r.......................',
      '......rrr.....rrr...............',
      '..............r.r...............',
      '..........rr..rrr......rr.......',
      '..........r.............r.......',
      '..........rrr...........rr......',
      '................................',
      '................................',
      '................................',
      '................................',
      '.........rrr........rrr.........',
      '.........r.r........r.r.........',
      '.........rrr........rrr.........',
      '................................',
      '....ssss........................',
      '....s..s........................',
      '....ssss........................',
      '................................',
      '................................',
    ],
  },
  roads: [
    { id: 'marked-evacuation-route', cells: routeCells, metadata: { priority: 'evacuation', marked: true } },
  ],
  props: [
    { id: 'urban-block-a', type: 'urban-block', cell: { x: 9, y: 6 }, footprint: { width: 3, height: 3 }, blockingLayers: ['ground', 'amphibious'], metadata: { garrisonable: true, garrisonSlots: 4 } },
    { id: 'urban-block-b', type: 'urban-block', cell: { x: 18, y: 7 }, footprint: { width: 3, height: 3 }, blockingLayers: ['ground', 'amphibious'], metadata: { garrisonable: true, garrisonSlots: 4 } },
    { id: 'urban-block-c', type: 'urban-block', cell: { x: 11, y: 15 }, footprint: { width: 3, height: 3 }, blockingLayers: ['ground', 'amphibious'], metadata: { garrisonable: true, garrisonSlots: 3 } },
    { id: 'urban-block-d', type: 'urban-block', cell: { x: 21, y: 15 }, footprint: { width: 3, height: 3 }, blockingLayers: ['ground', 'amphibious'], metadata: { garrisonable: true, garrisonSlots: 3 } },
    { id: 'abstracted-residential-zone', type: 'civilian-district', cell: { x: 15, y: 10 }, footprint: { width: 4, height: 4 }, blockingLayers: [], metadata: { populationRepresentation: 'abstracted', targetable: false, noIndividualCivilianEntities: true } },
  ],
  starts: {
    player: [
      { id: 'ua-command-start', cell: { x: 5, y: 10 }, facing: 0, metadata: { kind: 'building', type: 'hq', team: 0, scriptId: 'evacuation-hub', tag: 'defense-anchor' } },
      { id: 'ua-garrison-west', cell: { x: 10, y: 9 }, facing: 90, metadata: { kind: 'unit', type: 'uaInfantry', team: 0, scriptId: 'garrison-west', tag: 'garrison-defense' } },
      { id: 'ua-garrison-east', cell: { x: 21, y: 10 }, facing: 90, metadata: { kind: 'unit', type: 'uaInfantry', team: 0, scriptId: 'garrison-east', tag: 'garrison-defense' } },
      { id: 'ua-mobile-reserve', cell: { x: 7, y: 15 }, facing: 0, metadata: { kind: 'unit', type: 'uaIfv', team: 0, scriptId: 'mobile-reserve', tag: 'reserve' } },
    ],
    evacuation: [
      { id: 'protected-column-start', cell: { x: 24, y: 12 }, facing: 180, metadata: { kind: 'unit', type: 'uaIfv', team: 0, scriptId: 'evacuation-column', tag: 'evacuation-column', abstractedManifest: true, noncombatantRepresentation: 'manifest-only' } },
      { id: 'isolated-aid-start', cell: { x: 26, y: 4 }, facing: 180, metadata: { kind: 'unit', type: 'uaMedic', team: 0, scriptId: 'isolated-aid-team', tag: 'aid-team' } },
    ],
    protected: [
      { id: 'clinic-start', cell: { x: 13, y: 8 }, facing: 0, metadata: { kind: 'building', type: 'depot', team: 0, scriptId: 'protected-clinic', tag: 'protected-site', civicFunction: 'field-clinic' } },
      { id: 'waterworks-start', cell: { x: 20, y: 16 }, facing: 0, metadata: { kind: 'building', type: 'depot', team: 0, scriptId: 'protected-waterworks', tag: 'protected-site', civicFunction: 'waterworks' } },
    ],
    enemy: [
      { id: 'ru-east-rifles', cell: { x: 29, y: 9 }, facing: 270, metadata: { kind: 'unit', type: 'ruInfantry', team: 1, scriptId: 'enemy-east-rifles', tag: 'assault-wave' } },
      { id: 'ru-east-ifv', cell: { x: 30, y: 13 }, facing: 270, metadata: { kind: 'unit', type: 'ruIfv', team: 1, scriptId: 'enemy-east-ifv', tag: 'assault-wave' } },
    ],
  },
  regions: MAP_REGIONS,
  triggers: URBAN_DEFENSE_MISSION_SCRIPT.triggers,
  metadata: {
    operationId: URBAN_DEFENSE_OPERATION_ID,
    biome: 'urban-fringe',
    startHour: 6,
    civilianRepresentation: 'abstracted-manifests-and-protected-sites',
    collateralPolicy: { permittedProtectedSiteLosses: 1, defeatAtLosses: 2 },
    fictionalFraming: true,
  },
});

export const URBAN_DEFENSE_BRIEFING = deepFreeze({
  operationId: URBAN_DEFENSE_OPERATION_ID,
  title: 'Safe Passage',
  summary: 'Hold a fictional urban evacuation hub, escort a protected transport manifest to the western exit, and preserve critical civic sites where possible.',
  mapPreview: {
    mapId: URBAN_DEFENSE_MAP_ID,
    imageId: 'preview-safe-passage',
    caption: 'Urban district, marked westbound route, protected sites, and eastern approaches',
    markers: [
      { id: 'hub', kind: 'friendly-start', label: 'Evacuation hub', x: 0.18, y: 0.48 },
      { id: 'column', kind: 'objective', label: 'Protected column', x: 0.75, y: 0.52 },
      { id: 'exit', kind: 'extraction', label: 'Western exit', x: 0.05, y: 0.52 },
      { id: 'pressure', kind: 'enemy', label: 'Eastern pressure', x: 0.94, y: 0.48 },
    ],
  },
  forces: [
    { id: 'garrison', label: 'Mechanized garrison squads', category: 'infantry', count: 2 },
    { id: 'reserve', label: 'Mobile reserve IFV', category: 'armor', count: 1 },
    { id: 'aid', label: 'Isolated aid team', category: 'support', count: 1, note: 'Optional recovery' },
  ],
  intelligence: [
    { id: 'east-attack', title: 'Eastern assault route', detail: 'Hostile probes are expected to develop into armored pressure.', confidence: 'confirmed' },
    { id: 'protected-sites', title: 'Protected civic sites', detail: 'One site loss is tolerable; losing both ends the operation.', confidence: 'confirmed' },
  ],
  objectives: URBAN_DEFENSE_OBJECTIVES.map((objective) => ({
    id: objective.id,
    title: objective.label,
    description: objective.failureReason,
    optional: Boolean(objective.optional),
  })),
  difficulty: 'standard',
  difficultyNotes: {
    label: 'Standard',
    summary: 'Deliberate assault pacing with one protected-site loss permitted.',
    modifiers: ['Two timed eastern assault groups', 'Seven-minute hub-defense window', 'Optional aid-team recovery'],
  },
  loadingHints: [
    'Use garrisonable urban blocks to delay the eastern approach.',
    'Keep the mobile reserve near the marked route rather than chasing retreating units.',
    'The transport manifest represents evacuated civilians abstractly; no individual civilian units appear.',
  ],
  metadata: { fictional: true, contentNote: 'Stylized fictional operation; civilians are abstracted and never controllable combat units.' },
});

export const URBAN_DEFENSE_OPERATION = deepFreeze({
  id: URBAN_DEFENSE_OPERATION_ID,
  title: 'Safe Passage',
  gate: 'campaign-alpha',
  map: URBAN_DEFENSE_MAP,
  mission: {
    id: URBAN_DEFENSE_OPERATION_ID,
    mapId: URBAN_DEFENSE_MAP_ID,
    objectiveMode: 'library',
    objectiveIds: URBAN_DEFENSE_OBJECTIVES.map((objective) => objective.id),
    objectiveDefinitions: URBAN_DEFENSE_OBJECTIVES,
    regions: SCRIPT_REGIONS,
    script: URBAN_DEFENSE_MISSION_SCRIPT,
    checkpointPolicy: 'enabled',
    checkpointLabels: [
      { id: 'column-released', label: 'Transport column released', afterSeconds: 45 },
      { id: 'first-assault-repelled', label: 'First eastern assault repelled', authoredEvent: 'first-east-assault-cleared' },
    ],
  },
  briefing: URBAN_DEFENSE_BRIEFING,
  debrief: {
    victoryTitle: 'Safe Passage Secured',
    defeatTitle: 'Evacuation Corridor Lost',
    medalRules: [
      { id: 'medal-no-collateral', title: 'Protected Corridor', condition: { variable: 'collateralIncidents', operator: 'eq', value: 0 } },
      { id: 'medal-aid-team', title: 'No One Left Behind', condition: { objectiveId: 'rescue-aid-team', complete: true } },
    ],
  },
  contentNotes: [
    'All named speakers are fictional.',
    'Civilian movement is represented by manifests, protected sites, and transport objectives rather than targetable civilian entities.',
    'The operation is stylized fiction and makes no documentary claim about a real engagement.',
  ],
});