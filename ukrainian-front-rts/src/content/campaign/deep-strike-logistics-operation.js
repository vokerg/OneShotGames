const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const DEEP_STRIKE_OPERATION_VERSION = 1;
export const DEEP_STRIKE_OPERATION_ID = 'operation-silent-ledger';
export const DEEP_STRIKE_OPERATION_MAP_ID = 'operation-silent-ledger.map';

const SCRIPT_REGIONS = [
  { id: 'player-insertion', shape: 'rect', x: 64, y: 320, width: 224, height: 224 },
  { id: 'recon-corridor', shape: 'rect', x: 480, y: 288, width: 256, height: 256 },
  { id: 'air-defense-sector', shape: 'rect', x: 928, y: 128, width: 224, height: 224 },
  { id: 'fuel-depot-sector', shape: 'rect', x: 928, y: 544, width: 224, height: 224 },
  { id: 'artillery-position', shape: 'rect', x: 1120, y: 64, width: 192, height: 192 },
  { id: 'logistics-hub', shape: 'rect', x: 1248, y: 320, width: 224, height: 256 },
  { id: 'drone-support-entry', shape: 'rect', x: 96, y: 96, width: 128, height: 128 },
  { id: 'artillery-support-entry', shape: 'rect', x: 96, y: 544, width: 128, height: 128 },
  { id: 'artillery-support-area', shape: 'rect', x: 96, y: 512, width: 192, height: 192 },
  { id: 'extraction-zone', shape: 'rect', x: 96, y: 672, width: 256, height: 160 },
];

export const DEEP_STRIKE_OPERATION_OBJECTIVES = deepFreeze([
  {
    id: 'recon-logistics-corridor',
    type: 'recon',
    label: 'Reconnoitre the logistics corridor',
    observer: { collection: 'units', team: 0, tag: 'recon-drone' },
    regionId: 'recon-corridor',
  },
  {
    id: 'neutralize-air-defense-node',
    type: 'destroy',
    label: 'Neutralize the air-defense node',
    target: { collection: 'buildings', team: 1, scriptId: 'branch-air-defense-node' },
    count: 1,
    optional: true,
  },
  {
    id: 'destroy-fuel-depot',
    type: 'destroy',
    label: 'Destroy the forward fuel depot',
    target: { collection: 'buildings', team: 1, scriptId: 'branch-fuel-depot' },
    count: 1,
    optional: true,
  },
  {
    id: 'destroy-logistics-hub',
    type: 'destroy',
    label: 'Destroy the forward logistics hub',
    target: { collection: 'buildings', team: 1, tag: 'main-logistics-target' },
    count: 1,
  },
  {
    id: 'extract-strike-package',
    type: 'extract',
    label: 'Extract both strike elements',
    target: { collection: 'units', team: 0, tag: 'strike-package' },
    regionId: 'extraction-zone',
    count: 2,
    timeLimitSeconds: 600,
    failureReason: 'The strike package did not reach extraction before enemy recovery forces closed the corridor.',
  },
  {
    id: 'neutralize-artillery-battery',
    type: 'destroy',
    label: 'Neutralize the enemy artillery battery',
    target: { collection: 'buildings', team: 1, scriptId: 'enemy-artillery-battery' },
    count: 1,
    optional: true,
  },
  {
    id: 'preserve-fire-support',
    type: 'defend',
    label: 'Preserve the supporting artillery section',
    target: { collection: 'units', team: 0, scriptId: 'support-artillery-1' },
    regionId: 'artillery-support-area',
    durationSeconds: 600,
    optional: true,
    failIfTargetLost: true,
  },
]);

const branchDestroyedTrigger = ({ id, scriptId, candidate }) => ({
  id,
  when: {
    kind: 'all',
    conditions: [
      { kind: 'variable', id: 'phase', operator: 'gte', value: 1 },
      { kind: 'entity', selector: { collection: 'buildings', scriptId }, state: 'destroyed' },
    ],
  },
  actions: [
    { kind: 'setVariable', id: 'branchCandidate', value: candidate },
    { kind: 'addVariable', id: 'branchTargetsDestroyed', amount: 1 },
  ],
});

export const DEEP_STRIKE_OPERATION_SCRIPT_SOURCE = deepFreeze({
  version: 1,
  id: 'operation-silent-ledger.script',
  regions: SCRIPT_REGIONS,
  initialVariables: {
    phase: 0,
    branch: 'unselected',
    branchCandidate: 'none',
    branchTargetsDestroyed: 0,
    mainTargetDestroyed: 0,
    artilleryBatteryDestroyed: 0,
    extracted: 0,
  },
  triggers: [
    {
      id: 'recon-corridor-entered',
      when: {
        kind: 'region',
        regionId: 'recon-corridor',
        event: 'enter',
        selector: { collection: 'units', team: 0, tag: 'recon-drone' },
        operator: 'gte',
        value: 1,
      },
      actions: [
        { kind: 'setVariable', id: 'phase', value: 1 },
        { kind: 'addResource', resource: 'intel', amount: 30 },
        {
          kind: 'dialogue',
          speaker: 'recon-lead',
          text: 'Two enabling targets are confirmed: the air-defense node and the fuel depot. Neutralize either one to open a strike route.',
          durationSeconds: 6,
          metadata: { channel: 'tactical', fictional: true },
        },
        { kind: 'camera', x: 1088, y: 448, zoom: 1.05, durationSeconds: 2, label: 'Enemy logistics corridor' },
      ],
    },
    branchDestroyedTrigger({
      id: 'air-defense-node-destroyed',
      scriptId: 'branch-air-defense-node',
      candidate: 'air-defense',
    }),
    branchDestroyedTrigger({
      id: 'fuel-depot-destroyed',
      scriptId: 'branch-fuel-depot',
      candidate: 'fuel-depot',
    }),
    {
      id: 'commit-air-defense-route',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'branch', operator: 'eq', value: 'unselected' },
          { kind: 'variable', id: 'branchCandidate', operator: 'eq', value: 'air-defense' },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'branch', value: 'air-defense' },
        { kind: 'setVariable', id: 'phase', value: 2 },
        {
          kind: 'reinforcement',
          team: 0,
          label: 'drone-strike-support',
          entities: [{
            kind: 'unit',
            type: 'uaDrone',
            count: 1,
            regionId: 'drone-support-entry',
            scriptIdPrefix: 'drone-strike-support',
            tag: 'drone-strike-support',
          }],
        },
        {
          kind: 'dialogue',
          speaker: 'operations',
          text: 'Air-defense command is down. A strike drone is entering through the cleared corridor.',
          durationSeconds: 5,
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
    {
      id: 'commit-fuel-depot-route',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'branch', operator: 'eq', value: 'unselected' },
          { kind: 'variable', id: 'branchCandidate', operator: 'eq', value: 'fuel-depot' },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'branch', value: 'fuel-depot' },
        { kind: 'setVariable', id: 'phase', value: 2 },
        {
          kind: 'reinforcement',
          team: 0,
          label: 'counter-battery-support',
          entities: [{
            kind: 'unit',
            type: 'uaArtillery',
            count: 1,
            regionId: 'artillery-support-entry',
            scriptIdPrefix: 'counter-battery-support',
            tag: 'counter-battery-support',
          }],
        },
        {
          kind: 'dialogue',
          speaker: 'operations',
          text: 'Fuel storage is burning. Enemy guns are displaced and our counter-battery section can support the strike.',
          durationSeconds: 5,
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
    {
      id: 'second-enabling-target-destroyed',
      when: { kind: 'variable', id: 'branchTargetsDestroyed', operator: 'gte', value: 2 },
      actions: [{
        kind: 'dialogue',
        speaker: 'recon-lead',
        text: 'Both enabling targets are neutralized. The logistics hub is isolated.',
        durationSeconds: 4,
        metadata: { channel: 'tactical', fictional: true },
      }],
    },
    {
      id: 'enemy-artillery-battery-destroyed',
      when: {
        kind: 'entity',
        selector: { collection: 'buildings', scriptId: 'enemy-artillery-battery' },
        state: 'destroyed',
      },
      actions: [
        { kind: 'setVariable', id: 'artilleryBatteryDestroyed', value: 1 },
        {
          kind: 'dialogue',
          speaker: 'operations',
          text: 'Enemy artillery is silent. The withdrawal corridor has less fire pressure.',
          durationSeconds: 4,
          metadata: { channel: 'tactical', fictional: true },
        },
      ],
    },
    {
      id: 'main-logistics-hub-destroyed',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'branch', operator: 'neq', value: 'unselected' },
          {
            kind: 'entity',
            selector: { collection: 'buildings', scriptId: 'main-logistics-hub' },
            state: 'destroyed',
          },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'mainTargetDestroyed', value: 1 },
        { kind: 'setVariable', id: 'phase', value: 3 },
        {
          kind: 'dialogue',
          speaker: 'strike-lead',
          text: 'The hub is destroyed. Break contact and move both strike elements to extraction.',
          durationSeconds: 5,
          metadata: { channel: 'tactical', fictional: true },
        },
      ],
    },
    {
      id: 'strike-package-extracted',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'branch', operator: 'neq', value: 'unselected' },
          { kind: 'variable', id: 'mainTargetDestroyed', operator: 'gte', value: 1 },
          {
            kind: 'region',
            regionId: 'extraction-zone',
            event: 'enter',
            selector: { collection: 'units', team: 0, tag: 'strike-package' },
            operator: 'gte',
            value: 2,
          },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'extracted', value: 1 },
        { kind: 'setVariable', id: 'phase', value: 4 },
        { kind: 'finish', result: 'victory', reason: 'The logistics hub was destroyed and the strike package extracted.' },
      ],
    },
    {
      id: 'extraction-warning',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'timer', clock: 'seconds', operator: 'gte', value: 480 },
          { kind: 'variable', id: 'extracted', operator: 'lt', value: 1 },
        ],
      },
      actions: [{
        kind: 'dialogue',
        speaker: 'operations',
        text: 'Enemy recovery forces are closing. Two minutes remain to reach extraction.',
        durationSeconds: 5,
        metadata: { channel: 'warning', fictional: true },
      }],
    },
    {
      id: 'extraction-deadline',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'timer', clock: 'seconds', operator: 'gte', value: 600 },
          { kind: 'variable', id: 'extracted', operator: 'lt', value: 1 },
        ],
      },
      actions: [{ kind: 'finish', result: 'defeat', reason: 'Enemy recovery forces closed the extraction corridor.' }],
    },
  ],
});

const terrainRows = Array.from({ length: 28 }, (_, y) =>
  Array.from({ length: 48 }, (_, x) => {
    if (y === 14 || x === 22) return '=';
    if ((y === 5 || y === 22) && x >= 5 && x <= 43) return 's';
    if (x >= 28 && x <= 35 && y >= 8 && y <= 19) return 'm';
    if (x >= 38 && x <= 44 && y >= 10 && y <= 18) return 'r';
    return '.';
  }).join(''),
);

const targetProp = ({ id, type, cell, footprint, scriptId, tag, role, mechanic, contract }) => ({
  id,
  type,
  cell,
  footprint,
  blockingLayers: ['ground'],
  metadata: { scriptId, tag, role, mechanic, contract, destructible: true },
});

export const DEEP_STRIKE_OPERATION_MAP_SOURCE = deepFreeze({
  formatVersion: 1,
  id: DEEP_STRIKE_OPERATION_MAP_ID,
  name: 'Silent Ledger logistics corridor',
  width: 1536,
  height: 896,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', '=': 'road', m: 'mud', r: 'rubble', s: 'shelterbelt' },
    rows: terrainRows,
  },
  roads: [
    {
      id: 'east-west-logistics-road',
      cells: Array.from({ length: 48 }, (_, x) => ({ x, y: 14 })),
      metadata: { role: 'primary-logistics-axis' },
    },
    {
      id: 'north-south-feeder-road',
      cells: Array.from({ length: 24 }, (_, index) => ({ x: 22, y: index + 2 })).filter((cell) => cell.y !== 14),
      metadata: { role: 'support-axis' },
    },
  ],
  props: [
    targetProp({
      id: 'air-defense-node-prop',
      type: 'mobile-air-defense-command',
      cell: { x: 31, y: 6 },
      footprint: { width: 2, height: 2 },
      scriptId: 'branch-air-defense-node',
      tag: 'branch-target',
      role: 'air-defense-enabler',
      mechanic: 'air-defense',
      contract: 'UFR-039',
    }),
    targetProp({
      id: 'fuel-depot-prop',
      type: 'forward-fuel-depot',
      cell: { x: 31, y: 20 },
      footprint: { width: 3, height: 2 },
      scriptId: 'branch-fuel-depot',
      tag: 'branch-target',
      role: 'artillery-logistics-enabler',
      mechanic: 'logistics',
      contract: 'UFR-054',
    }),
    targetProp({
      id: 'main-logistics-hub-prop',
      type: 'forward-logistics-hub',
      cell: { x: 40, y: 13 },
      footprint: { width: 3, height: 3 },
      scriptId: 'main-logistics-hub',
      tag: 'main-logistics-target',
      role: 'primary-target',
      mechanic: 'logistics',
      contract: 'UFR-065',
    }),
    targetProp({
      id: 'artillery-battery-prop',
      type: 'prepared-artillery-position',
      cell: { x: 37, y: 3 },
      footprint: { width: 2, height: 2 },
      scriptId: 'enemy-artillery-battery',
      tag: 'artillery-threat',
      role: 'enemy-fire-support',
      mechanic: 'artillery',
      contract: 'UFR-037',
    }),
    {
      id: 'drone-relay-prop',
      type: 'field-drone-relay',
      cell: { x: 27, y: 13 },
      footprint: { width: 1, height: 2 },
      blockingLayers: ['ground'],
      metadata: {
        scriptId: 'enemy-drone-relay',
        tag: 'drone-support',
        role: 'reconnaissance-strike-relay',
        mechanic: 'drone-ew',
        contract: 'UFR-038',
        destructible: true,
      },
    },
  ],
  resources: [{
    id: 'captured-intelligence-cache',
    type: 'intel',
    cell: { x: 25, y: 11 },
    amount: 80,
    metadata: { optional: true, role: 'target-intelligence' },
  }],
  starts: {
    player: [
      { id: 'player-strike', cell: { x: 4, y: 13 }, facing: 90 },
      { id: 'player-recon', cell: { x: 5, y: 9 }, facing: 90 },
      { id: 'player-artillery', cell: { x: 5, y: 18 }, facing: 90 },
      { id: 'player-extraction', cell: { x: 6, y: 23 }, facing: 0 },
    ],
    enemy: [
      { id: 'enemy-air-defense', cell: { x: 32, y: 7 }, facing: 270 },
      { id: 'enemy-fuel-depot', cell: { x: 32, y: 21 }, facing: 270 },
      { id: 'enemy-artillery', cell: { x: 38, y: 4 }, facing: 270 },
      { id: 'enemy-logistics-hub', cell: { x: 41, y: 14 }, facing: 270 },
    ],
  },
  regions: {
    'player-insertion': { shape: 'rect', origin: { x: 2, y: 10 }, width: 7, height: 7, metadata: { role: 'friendly-start' } },
    'recon-corridor': { shape: 'rect', origin: { x: 15, y: 9 }, width: 8, height: 8, metadata: { role: 'recon-objective' } },
    'air-defense-sector': { shape: 'rect', origin: { x: 29, y: 4 }, width: 7, height: 7, metadata: { role: 'branch-target' } },
    'fuel-depot-sector': { shape: 'rect', origin: { x: 29, y: 17 }, width: 7, height: 7, metadata: { role: 'branch-target' } },
    'artillery-position': { shape: 'rect', origin: { x: 35, y: 2 }, width: 6, height: 6, metadata: { role: 'enemy-fire-support' } },
    'logistics-hub': { shape: 'rect', origin: { x: 39, y: 10 }, width: 7, height: 8, metadata: { role: 'primary-target' } },
    'artillery-support-area': { shape: 'rect', origin: { x: 3, y: 16 }, width: 6, height: 6, metadata: { role: 'friendly-fire-support' } },
    'extraction-zone': { shape: 'rect', origin: { x: 3, y: 21 }, width: 8, height: 5, metadata: { role: 'friendly-extraction' } },
  },
  triggers: DEEP_STRIKE_OPERATION_SCRIPT_SOURCE.triggers,
  metadata: {
    operationId: DEEP_STRIKE_OPERATION_ID,
    fictional: true,
    scenario: 'deep-strike-logistics',
    contracts: ['UFR-037', 'UFR-038', 'UFR-039', 'UFR-054', 'UFR-065', 'UFR-086', 'UFR-087', 'UFR-088'],
  },
});

const startingForces = [
  { id: 'recon-drone-1', type: 'uaDrone', team: 0, startId: 'player-recon', tag: 'recon-drone', mechanic: 'drone-ew', contract: 'UFR-038' },
  { id: 'strike-package-1', type: 'uaInfantry', team: 0, startId: 'player-strike', tag: 'strike-package' },
  { id: 'strike-package-2', type: 'uaIfv', team: 0, startId: 'player-strike', tag: 'strike-package' },
  { id: 'support-artillery-1', type: 'uaArtillery', team: 0, startId: 'player-artillery', tag: 'support-artillery', mechanic: 'artillery', contract: 'UFR-037' },
];

const enemyTargets = [
  { propId: 'air-defense-node-prop', scriptId: 'branch-air-defense-node', tag: 'branch-target', team: 1, mechanic: 'air-defense', contract: 'UFR-039' },
  { propId: 'fuel-depot-prop', scriptId: 'branch-fuel-depot', tag: 'branch-target', team: 1, mechanic: 'logistics', contract: 'UFR-054' },
  { propId: 'main-logistics-hub-prop', scriptId: 'main-logistics-hub', tag: 'main-logistics-target', team: 1, mechanic: 'logistics', contract: 'UFR-065' },
  { propId: 'artillery-battery-prop', scriptId: 'enemy-artillery-battery', tag: 'artillery-threat', team: 1, mechanic: 'artillery', contract: 'UFR-037' },
];

const objectiveDescription = (objective) => {
  if (objective.id === 'neutralize-air-defense-node') return 'Optionally destroy the air-defense node; choosing it first opens the drone-support route.';
  if (objective.id === 'destroy-fuel-depot') return 'Optionally destroy the fuel depot; choosing it first opens the counter-battery route.';
  if (objective.id === 'destroy-logistics-hub') return 'Destroy the forward hub after committing to one enabling-target route.';
  if (objective.id === 'extract-strike-package') return 'Move both strike elements to the western extraction zone within ten minutes.';
  if (objective.id === 'recon-logistics-corridor') return 'Use the tagged reconnaissance drone to confirm the target corridor.';
  if (objective.id === 'neutralize-artillery-battery') return 'Optionally silence the enemy artillery battery before withdrawal.';
  return 'Keep the original supporting artillery section operational through extraction.';
};

export const DEEP_STRIKE_OPERATION_BRIEFING_SOURCE = deepFreeze({
  operationId: DEEP_STRIKE_OPERATION_ID,
  title: 'Operation Silent Ledger',
  summary: 'Penetrate a fictional forward logistics corridor, choose whether to suppress air defense or fuel first, destroy the main hub, and extract before recovery forces close the route.',
  mapPreview: {
    mapId: DEEP_STRIKE_OPERATION_MAP_ID,
    caption: 'Layered logistics corridor with northern air-defense route, southern fuel route, artillery position, central hub, and western extraction.',
    aspectRatio: 12 / 7,
    markers: [
      { id: 'insertion', kind: 'friendly-start', label: 'Strike insertion', x: 0.1, y: 0.5 },
      { id: 'air-defense', kind: 'branch', label: 'Air-defense node', x: 0.66, y: 0.25 },
      { id: 'fuel-depot', kind: 'branch', label: 'Fuel depot', x: 0.66, y: 0.75 },
      { id: 'artillery', kind: 'threat', label: 'Artillery battery', x: 0.8, y: 0.17 },
      { id: 'logistics-hub', kind: 'primary', label: 'Main logistics hub', x: 0.86, y: 0.5 },
      { id: 'extraction', kind: 'objective', label: 'Extraction zone', x: 0.14, y: 0.82 },
    ],
  },
  forces: [
    { id: 'strike-package', label: 'Mechanized strike package', category: 'combined-arms', count: 2, note: 'Both tagged strike elements must survive and reach extraction.' },
    { id: 'recon-drone', label: 'Reconnaissance drone team', category: 'drone', count: 1, note: 'Reveals the corridor and enables spotted artillery fire.' },
    { id: 'support-artillery', label: 'Supporting artillery section', category: 'artillery', count: 1, note: 'Requires setup and spotting under the UFR-037 contract.' },
  ],
  intelligence: [
    {
      id: 'air-defense-intel',
      title: 'Air-defense node',
      detail: 'Neutralizing the node opens the safer drone-strike route, but leaves the fuel-supported artillery network intact.',
      confidence: 'confirmed',
      source: 'fictional reconnaissance estimate',
    },
    {
      id: 'fuel-intel',
      title: 'Fuel depot',
      detail: 'Destroying the depot disrupts enemy fire support and enables friendly counter-battery reinforcement, but the air-defense envelope remains.',
      confidence: 'likely',
      source: 'fictional logistics intercept',
    },
  ],
  objectives: DEEP_STRIKE_OPERATION_OBJECTIVES.map((objective) => ({
    id: objective.id,
    title: objective.label,
    description: objectiveDescription(objective),
    optional: Boolean(objective.optional),
    hidden: Boolean(objective.hidden),
    timed: objective.timeLimitSeconds == null ? null : { seconds: objective.timeLimitSeconds },
    failure: objective.failureReason ?? null,
  })),
  difficulty: 'standard',
  difficultyNotes: {
    label: 'Standard',
    summary: 'Ten-minute extraction window with one support package determined by the chosen enabling target.',
    modifiers: [
      'The first enabling target committed determines support.',
      'No hidden stat bonuses or enemy information cheats are authored.',
    ],
  },
  loadingHints: [
    'Reconnaissance is required before committing deep fires.',
    'Artillery requires setup and spotted targets.',
    'Air-defense envelopes can deny exposed drone routes.',
    'The extraction clock continues after the main hub is destroyed.',
  ],
  metadata: {
    fictional: true,
    contentNote: 'Military combatants and fictional military infrastructure only.',
    evidenceTarget: 'CONTRACT_COMPLETE',
  },
});

export const DEEP_STRIKE_OPERATION_MISSION = deepFreeze({
  id: DEEP_STRIKE_OPERATION_ID,
  title: 'Operation Silent Ledger',
  mapId: DEEP_STRIKE_OPERATION_MAP_ID,
  regions: SCRIPT_REGIONS,
  objectiveDefinitions: DEEP_STRIKE_OPERATION_OBJECTIVES,
  objectiveMode: 'scripted',
  objectiveIds: DEEP_STRIKE_OPERATION_OBJECTIVES.map((objective) => objective.id),
  script: DEEP_STRIKE_OPERATION_SCRIPT_SOURCE,
  start: { metal: 300, fuel: 160, intel: 25 },
  briefing: DEEP_STRIKE_OPERATION_BRIEFING_SOURCE,
  composition: {
    startingForces,
    enemyTargets,
    branchSupport: {
      'air-defense': { reinforcementLabel: 'drone-strike-support', type: 'uaDrone', mechanic: 'drone-ew', contract: 'UFR-038' },
      'fuel-depot': { reinforcementLabel: 'counter-battery-support', type: 'uaArtillery', mechanic: 'artillery', contract: 'UFR-037' },
    },
  },
  checkpointPolicy: {
    enabled: true,
    contract: 'UFR-090',
    stablePoints: [
      { id: 'corridor-reconnoitred', afterPhase: 1 },
      { id: 'strike-route-committed', afterPhase: 2 },
      { id: 'logistics-hub-destroyed', afterPhase: 3 },
    ],
    excludeAfterSeconds: 600,
  },
});

export const DEEP_STRIKE_OPERATION = deepFreeze({
  version: DEEP_STRIKE_OPERATION_VERSION,
  id: DEEP_STRIKE_OPERATION_ID,
  map: DEEP_STRIKE_OPERATION_MAP_SOURCE,
  mission: DEEP_STRIKE_OPERATION_MISSION,
  briefing: DEEP_STRIKE_OPERATION_BRIEFING_SOURCE,
});
