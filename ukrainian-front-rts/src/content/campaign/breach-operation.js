const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const BREACH_OPERATION_VERSION = 1;
export const BREACH_OPERATION_ID = 'operation-lantern-gate';
export const BREACH_OPERATION_MAP_ID = 'operation-lantern-gate.map';

const SCRIPT_REGIONS = [
  { id: 'recon-overlook', shape: 'rect', x: 384, y: 128, width: 160, height: 128 },
  { id: 'decoy-axis', shape: 'rect', x: 448, y: 96, width: 160, height: 160 },
  { id: 'breach-lane', shape: 'rect', x: 512, y: 320, width: 320, height: 192 },
  { id: 'exploitation-zone', shape: 'rect', x: 928, y: 288, width: 256, height: 256 },
  { id: 'enemy-reserve', shape: 'circle', x: 1104, y: 176, radius: 96 },
];

export const BREACH_OPERATION_OBJECTIVES = deepFreeze([
  {
    id: 'recon-breach-corridor',
    type: 'recon',
    label: 'Reconnoitre the breach corridor',
    observer: { collection: 'units', team: 0, tag: 'recon-team' },
    regionId: 'recon-overlook',
  },
  {
    id: 'commit-breach-engineers',
    type: 'escort',
    label: 'Commit engineers to the obstacle belt',
    target: { collection: 'units', team: 0, tag: 'breach-engineer' },
    regionId: 'breach-lane',
    count: 1,
    failureReason: 'The breach team was lost before reaching the obstacle belt.',
  },
  {
    id: 'clear-breach-lane',
    type: 'destroy',
    label: 'Clear the marked obstacle belt',
    target: { collection: 'entities', team: 1, tag: 'breach-obstacle' },
    count: 3,
  },
  {
    id: 'exploit-before-reserves',
    type: 'escort',
    label: 'Push two assault elements through the gap',
    target: { collection: 'units', team: 0, tag: 'assault-force' },
    regionId: 'exploitation-zone',
    count: 2,
    timeLimitSeconds: 420,
    failureReason: 'Enemy reserves sealed the breach before exploitation forces arrived.',
  },
  {
    id: 'western-deception',
    type: 'recon',
    label: 'Demonstrate against the western lane',
    observer: { collection: 'units', team: 0, tag: 'decoy-force' },
    regionId: 'decoy-axis',
    optional: true,
  },
]);

const obstacleDestroyedTrigger = (id, scriptId) => ({
  id,
  when: {
    kind: 'entity',
    selector: { collection: 'entities', scriptId },
    state: 'destroyed',
  },
  actions: [{ kind: 'addVariable', id: 'obstaclesCleared', amount: 1 }],
});

export const BREACH_OPERATION_SCRIPT_SOURCE = deepFreeze({
  version: 1,
  id: 'operation-lantern-gate.script',
  regions: SCRIPT_REGIONS,
  initialVariables: {
    phase: 0,
    reconComplete: 0,
    decoyCommitted: 0,
    obstaclesCleared: 0,
  },
  triggers: [
    {
      id: 'recon-overlook-entered',
      when: {
        kind: 'region',
        regionId: 'recon-overlook',
        event: 'enter',
        selector: { collection: 'units', team: 0, tag: 'recon-team' },
        operator: 'gte',
        value: 1,
      },
      actions: [
        { kind: 'setVariable', id: 'reconComplete', value: 1 },
        { kind: 'addResource', resource: 'intel', amount: 35 },
        {
          kind: 'dialogue',
          speaker: 'commander-varta',
          text: 'Recon confirms two obstacle lanes. Mark the central seam for the breach team.',
          durationSeconds: 5,
          metadata: { channel: 'command', fictional: true },
        },
        {
          kind: 'camera',
          x: 672,
          y: 416,
          zoom: 1.1,
          durationSeconds: 2,
          label: 'Marked breach lane',
        },
      ],
    },
    {
      id: 'decoy-axis-entered',
      when: {
        kind: 'region',
        regionId: 'decoy-axis',
        event: 'enter',
        selector: { collection: 'units', team: 0, tag: 'decoy-force' },
        operator: 'gte',
        value: 1,
      },
      actions: [
        { kind: 'setVariable', id: 'decoyCommitted', value: 1 },
        {
          kind: 'dialogue',
          speaker: 'recon-lead',
          text: 'The western demonstration is drawing their mobile reserve away from the main lane.',
          durationSeconds: 4,
          metadata: { channel: 'tactical', fictional: true },
        },
        {
          kind: 'reinforcement',
          team: 1,
          label: 'diverted-western-reserve',
          entities: [
            {
              kind: 'unit',
              type: 'ruInfantry',
              count: 2,
              regionId: 'decoy-axis',
              spacingX: 22,
              scriptIdPrefix: 'diverted-reserve',
              tag: 'diverted-reserve',
            },
          ],
        },
      ],
    },
    obstacleDestroyedTrigger('wire-obstacle-destroyed', 'breach-obstacle-wire'),
    obstacleDestroyedTrigger('tank-traps-destroyed', 'breach-obstacle-traps'),
    obstacleDestroyedTrigger('minefield-cleared', 'breach-obstacle-mines'),
    {
      id: 'breach-opened',
      when: {
        kind: 'variable',
        id: 'obstaclesCleared',
        operator: 'gte',
        value: 3,
      },
      actions: [
        { kind: 'setVariable', id: 'phase', value: 2 },
        {
          kind: 'dialogue',
          speaker: 'breach-lead',
          text: 'Lane is open. Assault elements, pass the belt before the reserve returns.',
          durationSeconds: 5,
          metadata: { channel: 'tactical', fictional: true },
        },
      ],
    },
    {
      id: 'exploitation-force-entered',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'phase', operator: 'gte', value: 2 },
          {
            kind: 'region',
            regionId: 'exploitation-zone',
            event: 'enter',
            selector: { collection: 'units', team: 0, tag: 'assault-force' },
            operator: 'gte',
            value: 2,
          },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'phase', value: 3 },
        {
          kind: 'dialogue',
          speaker: 'commander-varta',
          text: 'The breach is exploited. Consolidate beyond the obstacle belt.',
          durationSeconds: 5,
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
    {
      id: 'exploitation-warning',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'timer', clock: 'seconds', operator: 'gte', value: 300 },
          { kind: 'variable', id: 'phase', operator: 'lt', value: 3 },
        ],
      },
      actions: [
        {
          kind: 'dialogue',
          speaker: 'operations',
          text: 'Enemy reserves are regrouping. Five minutes have elapsed; exploitation must accelerate.',
          durationSeconds: 5,
          metadata: { channel: 'warning', fictional: true },
        },
      ],
    },
    {
      id: 'exploitation-deadline',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'timer', clock: 'seconds', operator: 'gte', value: 420 },
          { kind: 'variable', id: 'phase', operator: 'lt', value: 3 },
        ],
      },
      actions: [
        {
          kind: 'finish',
          result: 'defeat',
          reason: 'Enemy reserves sealed the obstacle belt before the assault force exploited the gap.',
        },
      ],
    },
  ],
});

const terrainRows = [
  '........................................',
  '........................................',
  '........=.........r##r..................',
  '........=.........r##r..................',
  '..ssssss=sssssssssr##rssssssssssssssss..',
  '..ssssss=sssssssssr##rssssssssssssssss..',
  '........=.....................r..r..r...',
  '........=.......................r..r....',
  '........=.........r##r.........r..r.....',
  '........=....mmmmmr##rmmmmm...r..r..r...',
  '........=....mmmmmr##rmmmmm.....r..r....',
  '........=....mmmmmr##rmmmmm.............',
  '========================================',
  '........=....mmmmmmmmmmmmmm.............',
  '........=....mmmmmr##rmmmmm.............',
  '........=....mmmmmr##rmmmmm.............',
  '........=.........r##r..................',
  '........=.........r##r..................',
  '..ssssss=sssssssssssssssssssssssssssss..',
  '..ssssss=sssssssssssssssssssssssssssss..',
  '........=.........r##r..................',
  '........=.........r##r..................',
  '........................................',
  '........................................',
];

const engineerProp = ({ id, type, cell, footprint, mechanic, publicOperation, scriptId, obstacleType, mineCount }) => ({
  id,
  type,
  cell,
  footprint,
  blockingLayers: mechanic === 'obstacle' ? ['ground'] : [],
  metadata: {
    engineerContract: 'UFR-048',
    mechanic,
    ...(obstacleType ? { obstacleType } : {}),
    ...(mineCount ? { mineCount } : {}),
    publicOperation,
    scriptId,
    tag: 'breach-obstacle',
  },
});

export const BREACH_OPERATION_MAP_SOURCE = deepFreeze({
  formatVersion: 1,
  id: BREACH_OPERATION_MAP_ID,
  name: 'Lantern Gate breach sector',
  width: 1280,
  height: 768,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: {
      '.': 'open',
      '=': 'road',
      m: 'mud',
      r: 'rubble',
      s: 'shelterbelt',
      '#': 'blocked',
    },
    rows: terrainRows,
  },
  roads: [
    {
      id: 'east-west-supply-road',
      cells: Array.from({ length: 40 }, (_, x) => ({ x, y: 12 })),
      metadata: { role: 'primary-axis' },
    },
    {
      id: 'western-feeder-road',
      cells: Array.from({ length: 20 }, (_, index) => ({ x: 8, y: index + 2 }))
        .filter((cell) => cell.y !== 12),
      metadata: { role: 'assembly-route' },
    },
  ],
  props: [
    engineerProp({
      id: 'wire-main',
      type: 'field-wire',
      cell: { x: 18, y: 9 },
      footprint: { width: 4, height: 2 },
      mechanic: 'obstacle',
      obstacleType: 'wire',
      publicOperation: 'breachObstacle',
      scriptId: 'breach-obstacle-wire',
    }),
    engineerProp({
      id: 'tank-traps-main',
      type: 'tank-trap-belt',
      cell: { x: 18, y: 14 },
      footprint: { width: 4, height: 2 },
      mechanic: 'obstacle',
      obstacleType: 'tank-trap',
      publicOperation: 'breachObstacle',
      scriptId: 'breach-obstacle-traps',
    }),
    engineerProp({
      id: 'minefield-main',
      type: 'marked-minefield',
      cell: { x: 18, y: 11 },
      footprint: { width: 4, height: 3 },
      mechanic: 'minefield',
      mineCount: 6,
      publicOperation: 'clearMine',
      scriptId: 'breach-obstacle-mines',
    }),
    {
      id: 'enemy-command-dugout',
      type: 'field-command-post',
      cell: { x: 33, y: 10 },
      footprint: { width: 2, height: 2 },
      blockingLayers: ['ground'],
      metadata: { destructible: true, role: 'enemy-command' },
    },
  ],
  resources: [
    {
      id: 'forward-supply-cache',
      type: 'intel',
      cell: { x: 12, y: 7 },
      amount: 90,
      metadata: { optional: true, role: 'recon-reward' },
    },
  ],
  starts: {
    player: [
      { id: 'player-command', cell: { x: 4, y: 12 }, facing: 90 },
      { id: 'player-engineers', cell: { x: 6, y: 13 }, facing: 90 },
      { id: 'player-recon', cell: { x: 6, y: 6 }, facing: 90 },
      { id: 'player-decoy', cell: { x: 6, y: 4 }, facing: 90 },
    ],
    enemy: [
      { id: 'enemy-line', cell: { x: 25, y: 12 }, facing: 270 },
      { id: 'enemy-command', cell: { x: 34, y: 12 }, facing: 270 },
      { id: 'enemy-reserve', cell: { x: 34, y: 5 }, facing: 270 },
    ],
  },
  regions: {
    'player-assembly': {
      shape: 'rect',
      origin: { x: 2, y: 9 },
      width: 8,
      height: 7,
      metadata: { role: 'friendly-start' },
    },
    'recon-overlook': {
      shape: 'rect',
      origin: { x: 12, y: 4 },
      width: 5,
      height: 4,
      metadata: { role: 'recon' },
    },
    'decoy-axis': {
      shape: 'rect',
      origin: { x: 14, y: 3 },
      width: 5,
      height: 5,
      metadata: { role: 'deception' },
    },
    'breach-lane': {
      shape: 'rect',
      origin: { x: 16, y: 10 },
      width: 10,
      height: 6,
      metadata: { role: 'engineer-breach' },
    },
    'exploitation-zone': {
      shape: 'rect',
      origin: { x: 29, y: 9 },
      width: 8,
      height: 8,
      metadata: { role: 'timed-exploitation' },
    },
    'enemy-reserve': {
      shape: 'circle',
      center: { x: 34, y: 5 },
      radius: 3,
      metadata: { role: 'enemy-reinforcement' },
    },
  },
  triggers: BREACH_OPERATION_SCRIPT_SOURCE.triggers,
  metadata: {
    operationId: BREACH_OPERATION_ID,
    biome: 'industrial-steppe',
    missionKind: 'breach',
    fictionalized: true,
    publicFigures: false,
    requiredContracts: [
      'UFR-048 engineer mechanics',
      'UFR-086 mission scripting',
      'UFR-087 objective library',
      'UFR-090 checkpoints',
    ],
  },
});

export const BREACH_OPERATION_BRIEFING_SOURCE = deepFreeze({
  operationId: BREACH_OPERATION_ID,
  title: 'Operation Lantern Gate',
  summary:
    'A prepared obstacle belt blocks the eastern approach. Reconnoitre the seam, draw reserves toward a false axis, open one marked lane with engineers, and exploit before the defense can recover.',
  mapPreview: {
    mapId: BREACH_OPERATION_MAP_ID,
    caption: 'Industrial-steppe obstacle belt with western deception axis and central breach lane.',
    aspectRatio: 5 / 3,
    markers: [
      { id: 'assembly', kind: 'friendly-start', label: 'Assembly area', x: 0.12, y: 0.52 },
      { id: 'decoy', kind: 'optional', label: 'Western demonstration', x: 0.4, y: 0.2 },
      { id: 'breach', kind: 'primary', label: 'Marked breach lane', x: 0.52, y: 0.54 },
      { id: 'exploit', kind: 'objective', label: 'Exploitation zone', x: 0.82, y: 0.54 },
    ],
  },
  forces: [
    {
      id: 'breach-team',
      label: 'Combat engineer breach team',
      category: 'engineers',
      count: 1,
      note: 'Clears mines and obstacles through the UFR-048 engineer contract.',
    },
    {
      id: 'recon-team',
      label: 'Reconnaissance element',
      category: 'reconnaissance',
      count: 1,
      note: 'Confirms the selected lane and reveals the obstacle layout.',
    },
    {
      id: 'assault-force',
      label: 'Mechanized assault elements',
      category: 'assault',
      count: 2,
      note: 'Must pass through the cleared lane before the reserve returns.',
    },
    {
      id: 'decoy-force',
      label: 'Western demonstration group',
      category: 'deception',
      count: 1,
      availability: 'optional',
      note: 'Draws the mobile reserve away from the main effort.',
    },
  ],
  intelligence: [
    {
      id: 'obstacle-belt',
      title: 'Layered obstacle belt',
      detail: 'Wire, tank traps, and a marked minefield protect the central approach.',
      confidence: 'confirmed',
      source: 'reconnaissance imagery',
    },
    {
      id: 'mobile-reserve',
      title: 'Mobile reserve',
      detail: 'A motor-rifle reserve can return to the central lane after seven minutes.',
      confidence: 'likely',
      source: 'signals assessment',
    },
  ],
  objectives: [
    {
      id: 'recon-breach-corridor',
      title: 'Reconnoitre the breach corridor',
      description: 'Move the reconnaissance element into the overlook before committing engineers.',
    },
    {
      id: 'commit-breach-engineers',
      title: 'Commit the breach team',
      description: 'Escort at least one engineer element into the marked obstacle belt.',
      failure: 'Loss of the breach team prevents lane clearance.',
    },
    {
      id: 'clear-breach-lane',
      title: 'Open one lane',
      description: 'Clear the wire, tank traps, and minefield through existing engineer mechanics.',
    },
    {
      id: 'exploit-before-reserves',
      title: 'Exploit before the reserve returns',
      description: 'Move two assault elements into the eastern zone within seven minutes.',
      timed: { seconds: 420 },
      failure: 'The defense seals the breach after seven minutes.',
    },
    {
      id: 'western-deception',
      title: 'Demonstrate on the western axis',
      description: 'Commit the decoy group to draw the enemy reserve away from the main effort.',
      optional: true,
    },
  ],
  difficultyNotes: {
    label: 'Standard',
    summary: 'The authored contract keeps the seven-minute exploitation deadline fixed.',
    modifiers: [
      'Higher difficulties may alter force composition, not objective IDs or trigger order.',
      'Mine and obstacle outcomes remain owned by deterministic engineer mechanics.',
    ],
  },
  loadingHints: [
    'Reconnaissance confirms the lane; it does not clear mines.',
    'Keep the breach team protected until all three obstacle objects are neutralized.',
    'The optional western demonstration diverts, rather than deletes, the enemy reserve.',
  ],
  metadata: {
    fictionalized: true,
    publicFigures: false,
    sensitiveContent: 'Military obstacles and combatants only; no civilian targets.',
  },
});

const startingForces = [
  { scriptId: 'breach-engineer-1', type: 'uaEngineer', team: 0, startId: 'player-engineers', tag: 'breach-engineer' },
  { scriptId: 'recon-team-1', type: 'uaDrone', team: 0, startId: 'player-recon', tag: 'recon-team' },
  { scriptId: 'assault-force-1', type: 'uaInfantry', team: 0, startId: 'player-command', tag: 'assault-force' },
  { scriptId: 'assault-force-2', type: 'uaIfv', team: 0, startId: 'player-command', tag: 'assault-force' },
  { scriptId: 'decoy-force-1', type: 'uaInfantry', team: 0, startId: 'player-decoy', tag: 'decoy-force' },
];

const engineerObjects = [
  {
    scriptId: 'breach-obstacle-wire',
    propId: 'wire-main',
    team: 1,
    tag: 'breach-obstacle',
    mechanic: 'obstacle',
    publicOperation: 'breachObstacle',
  },
  {
    scriptId: 'breach-obstacle-traps',
    propId: 'tank-traps-main',
    team: 1,
    tag: 'breach-obstacle',
    mechanic: 'obstacle',
    publicOperation: 'breachObstacle',
  },
  {
    scriptId: 'breach-obstacle-mines',
    propId: 'minefield-main',
    team: 1,
    tag: 'breach-obstacle',
    mechanic: 'minefield',
    publicOperation: 'clearMine',
  },
];

export const BREACH_OPERATION_MISSION = deepFreeze({
  id: BREACH_OPERATION_ID,
  title: 'Operation Lantern Gate',
  mapId: BREACH_OPERATION_MAP_ID,
  regions: SCRIPT_REGIONS,
  objectiveDefinitions: BREACH_OPERATION_OBJECTIVES,
  script: BREACH_OPERATION_SCRIPT_SOURCE,
  start: { metal: 360, fuel: 180, intel: 40 },
  briefing: BREACH_OPERATION_BRIEFING_SOURCE,
  composition: { startingForces, engineerObjects },
});

export const BREACH_OPERATION = deepFreeze({
  version: BREACH_OPERATION_VERSION,
  id: BREACH_OPERATION_ID,
  map: BREACH_OPERATION_MAP_SOURCE,
  mission: BREACH_OPERATION_MISSION,
  briefing: BREACH_OPERATION_BRIEFING_SOURCE,
});
