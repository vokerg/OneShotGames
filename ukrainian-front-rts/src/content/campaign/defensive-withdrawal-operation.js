const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const DEFENSIVE_WITHDRAWAL_OPERATION_VERSION = 1;
export const DEFENSIVE_WITHDRAWAL_OPERATION_ID = 'operation-ember-line';
export const DEFENSIVE_WITHDRAWAL_OPERATION_MAP_ID = 'operation-ember-line.map';

export const DEFENSIVE_WITHDRAWAL_FORCE_IDS = deepFreeze([
  'command-ifv-1',
  'mechanized-infantry-1',
  'mechanized-infantry-2',
  'support-artillery-1',
  'rear-guard-1',
]);

const REAR_GUARD_ID = 'rear-guard-1';
const SALVAGE_ASSET_ID = 'disabled-recovery-vehicle';

const SCRIPT_REGIONS = [
  { id: 'forward-delay-line', shape: 'rect', x: 1088, y: 224, width: 288, height: 320 },
  { id: 'second-delay-line', shape: 'rect', x: 704, y: 224, width: 288, height: 320 },
  { id: 'salvage-site', shape: 'rect', x: 896, y: 544, width: 224, height: 192 },
  { id: 'withdrawal-checkpoint', shape: 'rect', x: 448, y: 192, width: 192, height: 416 },
  { id: 'rear-guard-release', shape: 'rect', x: 288, y: 224, width: 160, height: 320 },
  { id: 'final-extraction', shape: 'rect', x: 64, y: 256, width: 224, height: 352 },
  { id: 'enemy-pursuit-axis', shape: 'rect', x: 1248, y: 192, width: 256, height: 416 },
];

export const DEFENSIVE_WITHDRAWAL_OBJECTIVES = deepFreeze([
  {
    id: 'hold-forward-delay-line',
    type: 'survive',
    label: 'Delay the pursuit at the forward line',
    durationSeconds: 120,
  },
  {
    id: 'hold-second-delay-line',
    type: 'survive',
    label: 'Delay the pursuit at the second line',
    durationSeconds: 240,
  },
  {
    id: 'extract-withdrawal-force',
    type: 'extract',
    label: 'Extract at least four core-force elements',
    target: { collection: 'units', team: 0, tag: 'withdrawal-force' },
    regionId: 'final-extraction',
    count: 4,
    timeLimitSeconds: 600,
    failureReason: 'The withdrawal force did not clear the final extraction area before the pursuit closed.',
  },
  {
    id: 'preserve-command-element',
    type: 'extract',
    label: 'Preserve the command vehicle',
    target: { collection: 'units', team: 0, scriptId: 'command-ifv-1' },
    regionId: 'final-extraction',
    count: 1,
    optional: true,
    failIfTargetLost: true,
  },
  {
    id: 'extract-rear-guard',
    type: 'extract',
    label: 'Extract the rear guard',
    target: { collection: 'units', team: 0, scriptId: REAR_GUARD_ID },
    regionId: 'final-extraction',
    count: 1,
    optional: true,
    failIfTargetLost: true,
  },
  {
    id: 'recover-disabled-vehicle-salvage',
    type: 'gather',
    label: 'Recover the disabled vehicle salvage',
    resource: 'metal',
    amount: 180,
    optional: true,
  },
  {
    id: 'disable-pursuit-command',
    type: 'disable',
    label: 'Disable the pursuit command vehicle',
    target: { collection: 'units', team: 1, scriptId: 'enemy-pursuit-command' },
    optional: true,
    disableThreshold: 0.35,
  },
]);

const salvageCandidateTrigger = ({ id, when, candidate }) => ({
  id,
  when: {
    kind: 'all',
    conditions: [
      { kind: 'variable', id: 'phase', operator: 'gte', value: 1 },
      { kind: 'variable', id: 'salvageDecision', operator: 'eq', value: 'unselected' },
      when,
    ],
  },
  actions: [{ kind: 'setVariable', id: 'salvageCandidate', value: candidate }],
});

export const DEFENSIVE_WITHDRAWAL_SCRIPT_SOURCE = deepFreeze({
  version: 1,
  id: 'operation-ember-line.script',
  regions: SCRIPT_REGIONS,
  initialVariables: {
    phase: 0,
    firstLineHeld: 0,
    secondLineHeld: 0,
    checkpointCrossed: 0,
    salvageDecision: 'unselected',
    salvageCandidate: 'none',
    rearGuardExtracted: 0,
    extracted: 0,
  },
  triggers: [
    {
      id: 'forward-delay-complete',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'phase', operator: 'eq', value: 0 },
          { kind: 'timer', clock: 'seconds', operator: 'gte', value: 120 },
          {
            kind: 'region',
            regionId: 'forward-delay-line',
            event: 'present',
            selector: { collection: 'units', team: 0, tag: 'rear-guard' },
            operator: 'gte',
            value: 1,
          },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'firstLineHeld', value: 1 },
        { kind: 'setVariable', id: 'phase', value: 1 },
        {
          kind: 'dialogue',
          speaker: 'operations',
          text: 'The forward delay is complete. Fall back by bounds and decide whether to recover or scuttle the disabled vehicle.',
          durationSeconds: 6,
          metadata: { channel: 'command', fictional: true },
        },
        { kind: 'camera', x: 1008, y: 640, zoom: 1.05, durationSeconds: 2, label: 'Disabled recovery vehicle' },
      ],
    },
    salvageCandidateTrigger({
      id: 'salvage-recovered-candidate',
      candidate: 'recovered',
      when: { kind: 'resource', resource: 'metal', operator: 'gte', value: 180 },
    }),
    salvageCandidateTrigger({
      id: 'salvage-scuttled-candidate',
      candidate: 'scuttled',
      when: {
        kind: 'entity',
        selector: { collection: 'units', scriptId: SALVAGE_ASSET_ID },
        state: 'destroyed',
      },
    }),
    {
      id: 'commit-salvage-recovery',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'salvageDecision', operator: 'eq', value: 'unselected' },
          { kind: 'variable', id: 'salvageCandidate', operator: 'eq', value: 'recovered' },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'salvageDecision', value: 'recovered' },
        { kind: 'addResource', resource: 'intel', amount: 20 },
        {
          kind: 'dialogue',
          speaker: 'recovery-lead',
          text: 'Salvage is secured. The recovery team is leaving the site now.',
          durationSeconds: 5,
          metadata: { channel: 'tactical', fictional: true },
        },
      ],
    },
    {
      id: 'commit-salvage-scuttle',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'salvageDecision', operator: 'eq', value: 'unselected' },
          { kind: 'variable', id: 'salvageCandidate', operator: 'eq', value: 'scuttled' },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'salvageDecision', value: 'scuttled' },
        {
          kind: 'dialogue',
          speaker: 'rear-guard',
          text: 'The disabled vehicle is scuttled. No recoverable equipment remains for the pursuit.',
          durationSeconds: 5,
          metadata: { channel: 'tactical', fictional: true },
        },
      ],
    },
    {
      id: 'second-delay-complete',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'phase', operator: 'gte', value: 1 },
          { kind: 'variable', id: 'phase', operator: 'lt', value: 2 },
          { kind: 'timer', clock: 'seconds', operator: 'gte', value: 240 },
          {
            kind: 'region',
            regionId: 'second-delay-line',
            event: 'present',
            selector: { collection: 'units', team: 0, tag: 'rear-guard' },
            operator: 'gte',
            value: 1,
          },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'secondLineHeld', value: 1 },
        { kind: 'setVariable', id: 'phase', value: 2 },
        {
          kind: 'dialogue',
          speaker: 'operations',
          text: 'Second delay complete. Main body cross the checkpoint; rear guard displace on command.',
          durationSeconds: 5,
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
    {
      id: 'withdrawal-checkpoint-crossed',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'phase', operator: 'gte', value: 2 },
          { kind: 'variable', id: 'phase', operator: 'lt', value: 3 },
          {
            kind: 'region',
            regionId: 'withdrawal-checkpoint',
            event: 'enter',
            selector: { collection: 'units', team: 0, tag: 'withdrawal-force' },
            operator: 'gte',
            value: 3,
          },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'checkpointCrossed', value: 1 },
        { kind: 'setVariable', id: 'phase', value: 3 },
        {
          kind: 'dialogue',
          speaker: 'operations',
          text: 'Main body is through the checkpoint. Rear guard is released to the final extraction route.',
          durationSeconds: 5,
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
    {
      id: 'rear-guard-released',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'phase', operator: 'gte', value: 3 },
          {
            kind: 'region',
            regionId: 'rear-guard-release',
            event: 'enter',
            selector: { collection: 'units', team: 0, tag: 'rear-guard' },
            operator: 'gte',
            value: 1,
          },
        ],
      },
      actions: [{
        kind: 'dialogue',
        speaker: 'rear-guard',
        text: 'Rear guard clear of the release line and moving to extraction.',
        durationSeconds: 4,
        metadata: { channel: 'tactical', fictional: true },
      }],
    },
    {
      id: 'rear-guard-extracted',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'phase', operator: 'gte', value: 3 },
          {
            kind: 'region',
            regionId: 'final-extraction',
            event: 'enter',
            selector: { collection: 'units', team: 0, tag: 'rear-guard' },
            operator: 'gte',
            value: 1,
          },
        ],
      },
      actions: [{ kind: 'setVariable', id: 'rearGuardExtracted', value: 1 }],
    },
    {
      id: 'withdrawal-force-extracted',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'phase', operator: 'gte', value: 3 },
          {
            kind: 'region',
            regionId: 'final-extraction',
            event: 'present',
            selector: { collection: 'units', team: 0, tag: 'withdrawal-force' },
            operator: 'gte',
            value: 4,
          },
          {
            kind: 'region',
            regionId: 'final-extraction',
            event: 'present',
            selector: { collection: 'units', team: 0, scriptId: 'command-ifv-1' },
            operator: 'gte',
            value: 1,
          },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'extracted', value: 1 },
        { kind: 'setVariable', id: 'phase', value: 4 },
        {
          kind: 'finish',
          result: 'victory',
          reason: 'The delaying positions held and the command element withdrew with the surviving force.',
        },
      ],
    },
    {
      id: 'withdrawal-warning',
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
        text: 'Two minutes remain before the pursuit closes the extraction route.',
        durationSeconds: 5,
        metadata: { channel: 'warning', fictional: true },
      }],
    },
    {
      id: 'withdrawal-deadline',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'timer', clock: 'seconds', operator: 'gte', value: 600 },
          { kind: 'variable', id: 'extracted', operator: 'lt', value: 1 },
        ],
      },
      actions: [{
        kind: 'finish',
        result: 'defeat',
        reason: 'The pursuit closed the extraction route before the command element cleared it.',
      }],
    },
  ],
});

const terrainRows = Array.from({ length: 30 }, (_, y) =>
  Array.from({ length: 48 }, (_, x) => {
    if (y === 14 || y === 15) return '=';
    if (x === 17 && y >= 5 && y <= 25) return '=';
    if ((x >= 8 && x <= 14) && (y <= 8 || y >= 21)) return 's';
    if ((x >= 24 && x <= 31) && y >= 18 && y <= 25) return 'm';
    if ((x >= 34 && x <= 41) && y >= 5 && y <= 11) return 'r';
    return '.';
  }).join(''),
);

const militaryProp = ({ id, type, cell, footprint, scriptId, tag, role, mechanic, contract }) => ({
  id,
  type,
  cell,
  footprint,
  blockingLayers: ['ground'],
  metadata: { scriptId, tag, role, mechanic, contract, destructible: true },
});

export const DEFENSIVE_WITHDRAWAL_MAP_SOURCE = deepFreeze({
  formatVersion: 1,
  id: DEFENSIVE_WITHDRAWAL_OPERATION_MAP_ID,
  name: 'Ember Line withdrawal corridor',
  width: 1536,
  height: 960,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', '=': 'road', m: 'mud', r: 'rubble', s: 'shelterbelt' },
    rows: terrainRows,
  },
  roads: [
    {
      id: 'main-withdrawal-road',
      cells: Array.from({ length: 48 }, (_, x) => ({ x, y: 14 })),
      metadata: { role: 'withdrawal-axis' },
    },
    {
      id: 'parallel-withdrawal-road',
      cells: Array.from({ length: 48 }, (_, x) => ({ x, y: 15 })),
      metadata: { role: 'withdrawal-axis' },
    },
    {
      id: 'checkpoint-feeder-road',
      cells: Array.from({ length: 20 }, (_, index) => ({ x: 17, y: index + 5 }))
        .filter((cell) => cell.y !== 14 && cell.y !== 15),
      metadata: { role: 'checkpoint-feeder' },
    },
  ],
  props: [
    militaryProp({
      id: 'forward-fighting-position-prop',
      type: 'prepared-fighting-position',
      cell: { x: 36, y: 9 },
      footprint: { width: 3, height: 3 },
      scriptId: 'forward-delay-position',
      tag: 'delay-position',
      role: 'first-delay-line',
      mechanic: 'cover',
      contract: 'UFR-034',
    }),
    militaryProp({
      id: 'second-fighting-position-prop',
      type: 'prepared-fighting-position',
      cell: { x: 24, y: 9 },
      footprint: { width: 3, height: 3 },
      scriptId: 'second-delay-position',
      tag: 'delay-position',
      role: 'second-delay-line',
      mechanic: 'cover',
      contract: 'UFR-034',
    }),
    militaryProp({
      id: 'disabled-recovery-vehicle-prop',
      type: 'disabled-recovery-vehicle',
      cell: { x: 31, y: 20 },
      footprint: { width: 2, height: 2 },
      scriptId: SALVAGE_ASSET_ID,
      tag: 'salvage-choice',
      role: 'recover-or-scuttle',
      mechanic: 'destruction-salvage',
      contract: 'UFR-044',
    }),
    militaryProp({
      id: 'checkpoint-command-post-prop',
      type: 'field-command-post',
      cell: { x: 16, y: 13 },
      footprint: { width: 2, height: 3 },
      scriptId: 'withdrawal-checkpoint-post',
      tag: 'checkpoint',
      role: 'checkpoint-boundary',
      mechanic: 'mission-checkpoint',
      contract: 'UFR-090',
    }),
  ],
  resources: [{
    id: 'disabled-vehicle-salvage',
    type: 'metal',
    cell: { x: 32, y: 21 },
    amount: 100,
    metadata: {
      scriptId: 'disabled-vehicle-salvage',
      role: 'optional-salvage',
      mechanic: 'resource-salvage',
      contract: 'UFR-054',
    },
  }],
  starts: {
    player: [
      { id: 'player-command', cell: { x: 37, y: 14 }, facing: 270 },
      { id: 'player-main-body', cell: { x: 35, y: 15 }, facing: 270 },
      { id: 'player-artillery', cell: { x: 34, y: 12 }, facing: 270 },
      { id: 'player-rear-guard', cell: { x: 38, y: 10 }, facing: 90 },
      { id: 'player-salvage-asset', cell: { x: 31, y: 20 }, facing: 270 },
    ],
    enemy: [
      { id: 'enemy-pursuit-command', cell: { x: 44, y: 14 }, facing: 270 },
      { id: 'enemy-pursuit-main', cell: { x: 46, y: 15 }, facing: 270 },
    ],
  },
  regions: {
    'forward-delay-line': { shape: 'rect', origin: { x: 34, y: 7 }, width: 9, height: 10, metadata: { role: 'first-delay-line' } },
    'second-delay-line': { shape: 'rect', origin: { x: 22, y: 7 }, width: 9, height: 10, metadata: { role: 'second-delay-line' } },
    'salvage-site': { shape: 'rect', origin: { x: 28, y: 17 }, width: 7, height: 6, metadata: { role: 'salvage-choice' } },
    'withdrawal-checkpoint': { shape: 'rect', origin: { x: 14, y: 6 }, width: 6, height: 13, metadata: { role: 'checkpoint' } },
    'rear-guard-release': { shape: 'rect', origin: { x: 9, y: 7 }, width: 5, height: 10, metadata: { role: 'rear-guard-release' } },
    'final-extraction': { shape: 'rect', origin: { x: 2, y: 8 }, width: 7, height: 11, metadata: { role: 'final-extraction' } },
    'enemy-pursuit-axis': { shape: 'rect', origin: { x: 39, y: 6 }, width: 8, height: 13, metadata: { role: 'enemy-pursuit' } },
  },
  triggers: DEFENSIVE_WITHDRAWAL_SCRIPT_SOURCE.triggers,
  metadata: {
    operationId: DEFENSIVE_WITHDRAWAL_OPERATION_ID,
    fictional: true,
    scenario: 'defensive-withdrawal',
    contracts: ['UFR-034', 'UFR-044', 'UFR-054', 'UFR-086', 'UFR-087', 'UFR-088', 'UFR-089', 'UFR-090'],
  },
});

const startingForces = [
  { id: 'command-ifv-1', type: 'uaIfv', team: 0, startId: 'player-command', tag: 'withdrawal-force', role: 'command-element' },
  { id: 'mechanized-infantry-1', type: 'uaInfantry', team: 0, startId: 'player-main-body', tag: 'withdrawal-force', role: 'main-body' },
  { id: 'mechanized-infantry-2', type: 'uaInfantry', team: 0, startId: 'player-main-body', tag: 'withdrawal-force', role: 'main-body' },
  { id: 'support-artillery-1', type: 'uaArtillery', team: 0, startId: 'player-artillery', tag: 'withdrawal-force', role: 'fire-support', mechanic: 'artillery', contract: 'UFR-037' },
  { id: REAR_GUARD_ID, type: 'uaInfantry', team: 0, startId: 'player-rear-guard', tag: 'withdrawal-force', tags: ['rear-guard'], role: 'rear-guard' },
  {
    id: SALVAGE_ASSET_ID,
    type: 'uaIfv',
    team: 0,
    startId: 'player-salvage-asset',
    tag: 'salvage-asset',
    role: 'disabled-recovery-vehicle',
    state: { disabled: true, salvageResourceId: 'disabled-vehicle-salvage' },
    mechanic: 'destruction-salvage',
    contract: 'UFR-044',
  },
];

const enemyForces = [
  { id: 'enemy-pursuit-command', type: 'ruIfv', team: 1, startId: 'enemy-pursuit-command', tag: 'pursuit-command', role: 'pursuit-command' },
  { id: 'enemy-pursuit-1', type: 'ruInfantry', team: 1, startId: 'enemy-pursuit-main', tag: 'pursuit-force', role: 'pursuit' },
  { id: 'enemy-pursuit-2', type: 'ruInfantry', team: 1, startId: 'enemy-pursuit-main', tag: 'pursuit-force', role: 'pursuit' },
];

const objectiveDescription = (objective) => {
  if (objective.id === 'hold-forward-delay-line') return 'Keep the rear guard at the forward position until the two-minute release.';
  if (objective.id === 'hold-second-delay-line') return 'Re-establish the rear guard at the second position until the four-minute release.';
  if (objective.id === 'extract-withdrawal-force') return 'Move the command element and at least four core-force elements into final extraction before ten minutes.';
  if (objective.id === 'preserve-command-element') return 'Keep the command IFV alive and extract it.';
  if (objective.id === 'extract-rear-guard') return 'Withdraw the original rear-guard element after the main body crosses the checkpoint.';
  if (objective.id === 'recover-disabled-vehicle-salvage') return 'Optionally spend time recovering 100 metal from the disabled vehicle instead of scuttling it.';
  return 'Optionally disable the pursuit command vehicle to reduce pressure on the withdrawal route.';
};

export const DEFENSIVE_WITHDRAWAL_BRIEFING_SOURCE = deepFreeze({
  operationId: DEFENSIVE_WITHDRAWAL_OPERATION_ID,
  title: 'Operation Ember Line',
  summary: 'Conduct a fictional fighting withdrawal through two delaying positions, choose whether to recover or scuttle a disabled vehicle, release the rear guard, and preserve the command element.',
  mapPreview: {
    mapId: DEFENSIVE_WITHDRAWAL_OPERATION_MAP_ID,
    caption: 'East-to-west withdrawal corridor with two delaying positions, an optional salvage site, a checkpoint, rear-guard release line, and final extraction.',
    aspectRatio: 8 / 5,
    markers: [
      { id: 'forward-line', kind: 'defend', label: 'Forward delay line', x: 0.78, y: 0.38 },
      { id: 'salvage-site', kind: 'optional', label: 'Disabled vehicle', x: 0.66, y: 0.7 },
      { id: 'second-line', kind: 'defend', label: 'Second delay line', x: 0.52, y: 0.38 },
      { id: 'checkpoint', kind: 'checkpoint', label: 'Withdrawal checkpoint', x: 0.36, y: 0.48 },
      { id: 'release-line', kind: 'phase', label: 'Rear-guard release', x: 0.24, y: 0.4 },
      { id: 'extraction', kind: 'objective', label: 'Final extraction', x: 0.1, y: 0.48 },
    ],
  },
  forces: [
    { id: 'command-element', label: 'Command IFV', category: 'command', count: 1, note: 'Must reach extraction for mission victory.' },
    { id: 'main-body', label: 'Mechanized main body', category: 'combined-arms', count: 3, note: 'Preservation directly contributes to the debrief score.' },
    { id: 'rear-guard', label: 'Rear-guard infantry', category: 'infantry', count: 1, note: 'Must hold both delaying positions before displacement.' },
    { id: 'recovery-asset', label: 'Disabled recovery vehicle', category: 'salvage', count: 1, availability: 'disabled', note: 'Recover its salvage or scuttle it before the pursuit reaches the site.' },
  ],
  intelligence: [
    {
      id: 'pursuit-timing',
      title: 'Pursuit timing',
      detail: 'The pursuit is expected to close the final route at ten minutes. The rear guard must hold each line long enough for the main body to displace.',
      confidence: 'confirmed',
      source: 'fictional operations estimate',
    },
    {
      id: 'salvage-choice',
      title: 'Disabled recovery vehicle',
      detail: 'Recovering equipment yields more campaign value but costs time. Scuttling denies the equipment immediately and preserves tempo.',
      confidence: 'confirmed',
      source: 'fictional recovery-team report',
    },
  ],
  objectives: DEFENSIVE_WITHDRAWAL_OBJECTIVES.map((objective) => ({
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
    summary: 'Two fixed delaying windows, one optional salvage decision, and a ten-minute final extraction deadline.',
    modifiers: [
      'At least four core-force elements and the command IFV must extract.',
      'Force-preservation scoring uses stable authored identities rather than unit value or combat randomness.',
    ],
  },
  loadingHints: [
    'Displace by bounds; do not leave the rear guard before the main body is clear.',
    'Recovered salvage improves the debrief score, but scuttling preserves withdrawal tempo.',
    'The checkpoint is a stable campaign-save boundary.',
    'Only the original authored force identities count toward force-preservation scoring.',
  ],
  metadata: {
    fictional: true,
    contentNote: 'Military combatants and fictional military equipment only.',
    evidenceTarget: 'CONTRACT_COMPLETE',
  },
});

export const DEFENSIVE_WITHDRAWAL_SCORING_POLICY = deepFreeze({
  version: 1,
  id: 'operation-ember-line.force-preservation',
  maximumScore: 100,
  victoryBase: 30,
  preservedForcePoints: 8,
  rearGuardBonus: 10,
  delayingPositionPoints: 5,
  maximumDelayingPositions: 2,
  salvagePoints: {
    recovered: 10,
    scuttled: 5,
    abandoned: 0,
    unselected: 0,
  },
  medals: [
    { id: 'disciplined-withdrawal', minimumScore: 90, title: 'Disciplined Withdrawal', description: 'Preserved the force while completing both delaying actions.' },
    { id: 'line-preserved', minimumScore: 75, title: 'Line Preserved', description: 'Withdrew the command element and most of the original force.' },
  ],
});

export function scoreDefensiveWithdrawal({
  outcome = 'victory',
  survivingForceIds = [],
  salvageDecision = 'abandoned',
  delayingPositionsHeld = 0,
} = {}) {
  const survivorSet = new Set(Array.isArray(survivingForceIds) ? survivingForceIds : []);
  const preservedForceIds = DEFENSIVE_WITHDRAWAL_FORCE_IDS.filter((id) => survivorSet.has(id));
  const rearGuardSurvived = survivorSet.has(REAR_GUARD_ID);
  const held = Math.max(0, Math.min(
    DEFENSIVE_WITHDRAWAL_SCORING_POLICY.maximumDelayingPositions,
    Math.floor(Number(delayingPositionsHeld) || 0),
  ));
  const normalizedDecision = Object.hasOwn(
    DEFENSIVE_WITHDRAWAL_SCORING_POLICY.salvagePoints,
    salvageDecision,
  ) ? salvageDecision : 'abandoned';
  const breakdown = {
    victory: outcome === 'victory' ? DEFENSIVE_WITHDRAWAL_SCORING_POLICY.victoryBase : 0,
    preservedForce: preservedForceIds.length * DEFENSIVE_WITHDRAWAL_SCORING_POLICY.preservedForcePoints,
    rearGuard: rearGuardSurvived ? DEFENSIVE_WITHDRAWAL_SCORING_POLICY.rearGuardBonus : 0,
    delayingPositions: held * DEFENSIVE_WITHDRAWAL_SCORING_POLICY.delayingPositionPoints,
    salvage: DEFENSIVE_WITHDRAWAL_SCORING_POLICY.salvagePoints[normalizedDecision],
  };
  const rawScore = Object.values(breakdown).reduce((sum, value) => sum + value, 0);
  const score = Math.min(DEFENSIVE_WITHDRAWAL_SCORING_POLICY.maximumScore, rawScore);
  const medal = DEFENSIVE_WITHDRAWAL_SCORING_POLICY.medals.find((entry) => score >= entry.minimumScore) ?? null;
  return deepFreeze({
    version: DEFENSIVE_WITHDRAWAL_SCORING_POLICY.version,
    policyId: DEFENSIVE_WITHDRAWAL_SCORING_POLICY.id,
    outcome,
    score,
    breakdown,
    preservedForceIds,
    lostForceIds: DEFENSIVE_WITHDRAWAL_FORCE_IDS.filter((id) => !survivorSet.has(id)),
    rearGuardSurvived,
    delayingPositionsHeld: held,
    salvageDecision: normalizedDecision,
    medalIds: medal ? [medal.id] : [],
  });
}

export function createDefensiveWithdrawalDebriefSource({
  outcome = 'victory',
  completedTick = null,
  survivingForceIds = [],
  salvageDecision = 'abandoned',
  delayingPositionsHeld = 0,
} = {}) {
  const result = scoreDefensiveWithdrawal({
    outcome,
    survivingForceIds,
    salvageDecision,
    delayingPositionsHeld,
  });
  const medalSet = new Set(result.medalIds);
  return deepFreeze({
    operationId: DEFENSIVE_WITHDRAWAL_OPERATION_ID,
    title: outcome === 'victory' ? 'Withdrawal complete' : 'Withdrawal disrupted',
    outcome,
    score: result.score,
    completedTick,
    summary: outcome === 'victory'
      ? 'The command element cleared the corridor after a staged fighting withdrawal.'
      : 'The pursuit closed the route before the withdrawal was complete.',
    medals: DEFENSIVE_WITHDRAWAL_SCORING_POLICY.medals
      .filter((medal) => medalSet.has(medal.id))
      .map(({ id, title, description }) => ({ id, title, description })),
    losses: {
      totalLost: result.lostForceIds.length,
      totalDeployed: DEFENSIVE_WITHDRAWAL_FORCE_IDS.length,
      categories: [{
        id: 'original-force',
        label: 'Original withdrawal force',
        lost: result.lostForceIds.length,
        deployed: DEFENSIVE_WITHDRAWAL_FORCE_IDS.length,
      }],
    },
    timeline: [
      { id: 'forward-delay', tick: 120, kind: 'objective', title: 'Forward line released', detail: 'The first delaying action reached its authored release time.' },
      { id: 'second-delay', tick: 240, kind: 'objective', title: 'Second line released', detail: 'The second delaying action reached its authored release time.' },
      ...(completedTick == null ? [] : [{
        id: 'final-outcome',
        tick: completedTick,
        kind: 'outcome',
        title: outcome === 'victory' ? 'Force extracted' : 'Route closed',
        detail: `${result.preservedForceIds.length} of ${DEFENSIVE_WITHDRAWAL_FORCE_IDS.length} original force elements survived.`,
      }]),
    ],
    nextOperations: [{
      operationId: 'operation-combined-arms-offensive',
      title: 'Combined-Arms Offensive',
      summary: 'Commit the preserved force and reserves to the next fictional operation.',
      unlocked: outcome === 'victory',
      recommended: outcome === 'victory',
      lockReason: outcome === 'victory' ? null : 'Complete Operation Ember Line.',
    }],
    campaignConsequences: {
      forcePreservation: {
        policyId: result.policyId,
        preservedForceIds: result.preservedForceIds,
        lostForceIds: result.lostForceIds,
        rearGuardSurvived: result.rearGuardSurvived,
      },
      salvageDecision: result.salvageDecision,
      modernizationPoints: result.score >= 90 ? 2 : result.score >= 75 ? 1 : 0,
    },
  });
}

export const DEFENSIVE_WITHDRAWAL_MISSION = deepFreeze({
  id: DEFENSIVE_WITHDRAWAL_OPERATION_ID,
  title: 'Operation Ember Line',
  mapId: DEFENSIVE_WITHDRAWAL_OPERATION_MAP_ID,
  regions: SCRIPT_REGIONS,
  objectiveDefinitions: DEFENSIVE_WITHDRAWAL_OBJECTIVES,
  objectiveMode: 'scripted',
  objectiveIds: DEFENSIVE_WITHDRAWAL_OBJECTIVES.map((objective) => objective.id),
  script: DEFENSIVE_WITHDRAWAL_SCRIPT_SOURCE,
  start: { metal: 80, fuel: 140, intel: 20 },
  briefing: DEFENSIVE_WITHDRAWAL_BRIEFING_SOURCE,
  composition: {
    startingForces,
    enemyForces,
    salvageChoice: {
      assetScriptId: SALVAGE_ASSET_ID,
      resourceId: 'disabled-vehicle-salvage',
      recoveredThreshold: { resource: 'metal', amount: 180 },
      recovered: { scoreKey: 'recovered', contract: 'UFR-054' },
      scuttled: { scoreKey: 'scuttled', contract: 'UFR-044' },
      tieBreak: 'scuttled',
    },
  },
  checkpointPolicy: {
    enabled: true,
    contract: 'UFR-090',
    stablePoints: [
      { id: 'forward-delay-released', afterPhase: 1 },
      { id: 'second-delay-released', afterPhase: 2 },
      { id: 'main-body-through-checkpoint', afterPhase: 3 },
    ],
    excludeAfterSeconds: 600,
  },
  debriefPolicy: {
    contract: 'UFR-089',
    scoringPolicyId: DEFENSIVE_WITHDRAWAL_SCORING_POLICY.id,
    score: scoreDefensiveWithdrawal,
    createSource: createDefensiveWithdrawalDebriefSource,
  },
});

export const DEFENSIVE_WITHDRAWAL_OPERATION = deepFreeze({
  version: DEFENSIVE_WITHDRAWAL_OPERATION_VERSION,
  id: DEFENSIVE_WITHDRAWAL_OPERATION_ID,
  map: DEFENSIVE_WITHDRAWAL_MAP_SOURCE,
  mission: DEFENSIVE_WITHDRAWAL_MISSION,
  briefing: DEFENSIVE_WITHDRAWAL_BRIEFING_SOURCE,
  scoring: DEFENSIVE_WITHDRAWAL_SCORING_POLICY,
});
