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
const finiteSurvivorCount = (value) => {
  try {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
  } catch {
    return 0;
  }
};

export const COMBINED_ARMS_OPERATION_VERSION = 1;
export const COMBINED_ARMS_OPERATION_ID = 'operation-iron-horizon';
export const COMBINED_ARMS_MAP_ID = 'map-iron-horizon';

const RESERVE_AXES = Object.freeze(['uncommitted', 'north', 'center', 'south']);
const BRIEFING_OBJECTIVE_DESCRIPTIONS = Object.freeze({
  'recon-center-axis': 'Move the reconnaissance drone into the central sector to identify reserve routes and the defensive layout.',
  'secure-north-sector': 'Destroy the northern fire-control node to open the allied spearhead axis.',
  'secure-center-sector': 'Destroy the central strongpoint to break the middle of the defensive network.',
  'secure-south-sector': 'Destroy the southern logistics node to deny reinforcement support.',
  'break-east-command': 'After opening all three sectors, destroy the eastern command post to complete the breakthrough.',
  'preserve-allied-spearhead': 'Keep at least part of the allied northern spearhead alive through the operation.',
  'preserve-player-reserve': 'Escort at least one committed reserve unit into the eastern consolidation zone.',
  'neutralize-enemy-reserve': 'Destroy four units tagged as part of the enemy operational reserve.',
});

const MAP_REGIONS = {
  'west-assembly': { shape: 'rect', origin: { x: 0, y: 8 }, width: 8, height: 8, metadata: { purpose: 'player-assembly' } },
  'allied-north-entry': { shape: 'rect', origin: { x: 0, y: 2 }, width: 5, height: 5, metadata: { purpose: 'allied-entry' } },
  'reserve-staging': { shape: 'rect', origin: { x: 3, y: 17 }, width: 6, height: 5, metadata: { purpose: 'player-reserve' } },
  'north-sector': { shape: 'rect', origin: { x: 12, y: 2 }, width: 9, height: 7, metadata: { purpose: 'sector-north' } },
  'center-sector': { shape: 'rect', origin: { x: 14, y: 9 }, width: 11, height: 7, metadata: { purpose: 'sector-center' } },
  'south-sector': { shape: 'rect', origin: { x: 12, y: 16 }, width: 9, height: 7, metadata: { purpose: 'sector-south' } },
  'east-command': { shape: 'rect', origin: { x: 31, y: 8 }, width: 9, height: 8, metadata: { purpose: 'final-objective' } },
  'north-counterattack-entry': { shape: 'rect', origin: { x: 35, y: 1 }, width: 5, height: 6, metadata: { purpose: 'enemy-reserve-entry' } },
  'center-counterattack-entry': { shape: 'rect', origin: { x: 34, y: 9 }, width: 6, height: 6, metadata: { purpose: 'enemy-reserve-entry' } },
  'south-counterattack-entry': { shape: 'rect', origin: { x: 35, y: 17 }, width: 5, height: 7, metadata: { purpose: 'enemy-reserve-entry' } },
  'consolidation-zone': { shape: 'rect', origin: { x: 27, y: 9 }, width: 7, height: 7, metadata: { purpose: 'final-consolidation' } },
};

const SCRIPT_REGIONS = Object.freeze(Object.entries(MAP_REGIONS).map(([id, region]) => ({
  id,
  ...worldRect(region.origin.x, region.origin.y, region.width, region.height),
})));

export const COMBINED_ARMS_OBJECTIVES = deepFreeze([
  {
    id: 'recon-center-axis',
    type: 'recon',
    label: 'Reconnoitre the central axis',
    observer: { collection: 'units', team: 0, tag: 'player-recon' },
    regionId: 'center-sector',
  },
  {
    id: 'secure-north-sector',
    type: 'destroy',
    label: 'Neutralize the northern fire-control node',
    target: { collection: 'buildings', team: 1, scriptId: 'north-fire-control' },
    count: 1,
  },
  {
    id: 'secure-center-sector',
    type: 'destroy',
    label: 'Reduce the central strongpoint',
    target: { collection: 'buildings', team: 1, scriptId: 'center-strongpoint' },
    count: 1,
  },
  {
    id: 'secure-south-sector',
    type: 'destroy',
    label: 'Destroy the southern logistics node',
    target: { collection: 'buildings', team: 1, scriptId: 'south-logistics-node' },
    count: 1,
  },
  {
    id: 'break-east-command',
    type: 'destroy',
    label: 'Break the eastern command post',
    target: { collection: 'buildings', team: 1, scriptId: 'enemy-command-post' },
    count: 1,
  },
  {
    id: 'preserve-allied-spearhead',
    type: 'defend',
    label: 'Preserve the allied spearhead',
    optional: true,
    target: { collection: 'units', team: 0, tag: 'allied-ai-spearhead' },
    regionId: 'north-sector',
    durationSeconds: 720,
    failIfTargetLost: true,
    failureReason: 'The allied spearhead was eliminated.',
  },
  {
    id: 'preserve-player-reserve',
    type: 'escort',
    label: 'Consolidate the committed reserve',
    optional: true,
    target: { collection: 'units', team: 0, tag: 'player-reserve' },
    regionId: 'consolidation-zone',
    count: 1,
    failIfTargetLost: true,
    failureReason: 'The committed reserve was eliminated before reaching consolidation.',
  },
  {
    id: 'neutralize-enemy-reserve',
    type: 'destroy',
    label: 'Neutralize the enemy operational reserve',
    optional: true,
    target: { collection: 'units', team: 1, tag: 'enemy-operational-reserve' },
    count: 4,
  },
]);

const sectorDestroyedTrigger = ({ id, scriptId, axis }) => ({
  id,
  when: {
    kind: 'all',
    conditions: [
      { kind: 'variable', id: 'phase', operator: 'gte', value: 1 },
      { kind: 'entity', selector: { collection: 'buildings', scriptId }, state: 'destroyed', operator: 'gte', value: 1 },
    ],
  },
  actions: [
    { kind: 'setVariable', id: 'reserveAxisCandidate', value: axis },
    { kind: 'addVariable', id: 'sectorsSecured', amount: 1 },
    {
      kind: 'dialogue',
      speaker: 'major-olena-hrytsenko',
      text: `${axis[0].toUpperCase()}${axis.slice(1)} sector is secure. Hold the breach while reserves reposition.`,
      portrait: null,
      durationSeconds: 5,
      metadata: { channel: 'command', fictional: true, sector: axis },
    },
  ],
});

const reserveCommitTrigger = ({ id, axis, units, counterRegion, counterUnits }) => ({
  id,
  when: {
    kind: 'all',
    conditions: [
      { kind: 'variable', id: 'reserveAxis', operator: 'eq', value: 'uncommitted' },
      { kind: 'variable', id: 'reserveAxisCandidate', operator: 'eq', value: axis },
    ],
  },
  actions: [
    { kind: 'setVariable', id: 'reserveAxis', value: axis },
    { kind: 'setVariable', id: 'phase', value: 2 },
    {
      kind: 'reinforcement',
      team: 0,
      label: `player-${axis}-reserve`,
      entities: units.map((unit, index) => ({
        kind: 'unit',
        type: unit.type,
        count: unit.count,
        regionId: 'reserve-staging',
        spacingX: 18 + index * 2,
        spacingY: 16 + index * 2,
        scriptIdPrefix: `player-${axis}-reserve-${unit.type}`,
        tag: 'player-reserve',
      })),
    },
    {
      kind: 'reinforcement',
      team: 1,
      label: `enemy-${axis}-counterattack`,
      entities: counterUnits.map((unit, index) => ({
        kind: 'unit',
        type: unit.type,
        count: unit.count,
        regionId: counterRegion,
        spacingX: 20 + index * 2,
        spacingY: 18 + index * 2,
        scriptIdPrefix: `enemy-${axis}-counter-${unit.type}`,
        tag: 'enemy-operational-reserve',
      })),
    },
    {
      kind: 'dialogue',
      speaker: 'major-olena-hrytsenko',
      text: `Reserve committed on the ${axis} axis. Enemy operational reserves are counterattacking elsewhere.`,
      portrait: null,
      durationSeconds: 6,
      metadata: { channel: 'command', fictional: true, reserveAxis: axis },
    },
  ],
});

export const COMBINED_ARMS_SCRIPT = deepFreeze({
  version: 1,
  id: 'operation-iron-horizon.script',
  regions: SCRIPT_REGIONS,
  initialVariables: {
    phase: 0,
    sectorsSecured: 0,
    reserveAxisCandidate: 'none',
    reserveAxis: 'uncommitted',
    finalCounterattackDeployed: false,
    commandPostDestroyed: false,
  },
  triggers: [
    {
      id: 'opening-orders',
      when: { kind: 'timer', clock: 'ticks', operator: 'gte', value: 1 },
      actions: [
        { kind: 'setVariable', id: 'phase', value: 1 },
        {
          kind: 'reinforcement',
          team: 0,
          label: 'allied-northern-spearhead',
          entities: [
            { kind: 'unit', type: 'uaInfantry', count: 2, regionId: 'allied-north-entry', spacingX: 18, spacingY: 16, scriptIdPrefix: 'allied-north-infantry', tag: 'allied-ai-spearhead' },
            { kind: 'unit', type: 'uaIfv', count: 1, regionId: 'allied-north-entry', spacingX: 0, spacingY: 0, scriptIdPrefix: 'allied-north-ifv', tag: 'allied-ai-spearhead' },
          ],
        },
        {
          kind: 'dialogue',
          speaker: 'major-olena-hrytsenko',
          text: 'Three sectors block the eastern command post. Reconnoitre the center, support the allied northern spearhead, and choose where to commit the reserve by creating the first breach.',
          portrait: null,
          durationSeconds: 8,
          metadata: { channel: 'command', fictional: true },
        },
        { kind: 'camera', x: 608, y: 384, zoom: 0.9, durationSeconds: 2, label: 'Three-sector front' },
        { kind: 'weather', weatherId: 'dry-steppe-wind', intensity: 0.25, transitionSeconds: 2, durationSeconds: null },
      ],
    },
    {
      id: 'center-axis-reconnoitred',
      when: {
        kind: 'region',
        regionId: 'center-sector',
        event: 'enter',
        selector: { collection: 'units', team: 0, tag: 'player-recon' },
        operator: 'gte',
        value: 1,
      },
      actions: [
        { kind: 'addResource', resource: 'intel', amount: 25 },
        {
          kind: 'dialogue',
          speaker: 'recon-lead-taras',
          text: 'Central reserve routes confirmed. The first sector breached will determine our reserve axis and the enemy response.',
          portrait: null,
          durationSeconds: 6,
          metadata: { channel: 'recon', fictional: true },
        },
      ],
    },
    sectorDestroyedTrigger({ id: 'north-sector-secured', scriptId: 'north-fire-control', axis: 'north' }),
    sectorDestroyedTrigger({ id: 'center-sector-secured', scriptId: 'center-strongpoint', axis: 'center' }),
    sectorDestroyedTrigger({ id: 'south-sector-secured', scriptId: 'south-logistics-node', axis: 'south' }),
    reserveCommitTrigger({
      id: 'commit-north-reserve',
      axis: 'north',
      units: [{ type: 'uaTank', count: 1 }, { type: 'uaIfv', count: 1 }],
      counterRegion: 'south-counterattack-entry',
      counterUnits: [{ type: 'ruTank', count: 1 }, { type: 'ruInfantry', count: 2 }],
    }),
    reserveCommitTrigger({
      id: 'commit-center-reserve',
      axis: 'center',
      units: [{ type: 'uaArtillery', count: 1 }, { type: 'uaIfv', count: 1 }],
      counterRegion: 'north-counterattack-entry',
      counterUnits: [{ type: 'ruIfv', count: 1 }, { type: 'ruInfantry', count: 2 }],
    }),
    reserveCommitTrigger({
      id: 'commit-south-reserve',
      axis: 'south',
      units: [{ type: 'uaTank', count: 1 }, { type: 'uaInfantry', count: 2 }],
      counterRegion: 'north-counterattack-entry',
      counterUnits: [{ type: 'ruTank', count: 1 }, { type: 'ruIfv', count: 1 }, { type: 'ruInfantry', count: 1 }],
    }),
    {
      id: 'deploy-final-counterattack',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'sectorsSecured', operator: 'gte', value: 2 },
          { kind: 'variable', id: 'finalCounterattackDeployed', operator: 'eq', value: false },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'finalCounterattackDeployed', value: true },
        {
          kind: 'reinforcement',
          team: 1,
          label: 'enemy-final-counterattack',
          entities: [
            { kind: 'unit', type: 'ruTank', count: 2, regionId: 'center-counterattack-entry', spacingX: 24, spacingY: 20, scriptIdPrefix: 'enemy-final-tank', tag: 'enemy-operational-reserve' },
            { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'center-counterattack-entry', spacingX: 18, spacingY: 16, scriptIdPrefix: 'enemy-final-infantry', tag: 'enemy-operational-reserve' },
          ],
        },
        {
          kind: 'dialogue',
          speaker: 'allied-lead-mykhailo',
          text: 'Enemy armor is moving through the center. Consolidate the sectors before the final push.',
          portrait: null,
          durationSeconds: 6,
          metadata: { channel: 'allied', fictional: true },
        },
      ],
    },
    {
      id: 'east-command-exposed',
      when: { kind: 'variable', id: 'sectorsSecured', operator: 'gte', value: 3 },
      actions: [
        { kind: 'setVariable', id: 'phase', value: 3 },
        {
          kind: 'dialogue',
          speaker: 'major-olena-hrytsenko',
          text: 'All three sectors are open. Break the eastern command post and preserve what remains of the combined force.',
          portrait: null,
          durationSeconds: 6,
          metadata: { channel: 'command', fictional: true },
        },
        { kind: 'camera', x: 1136, y: 384, zoom: 1, durationSeconds: 1.5, label: 'Eastern command post' },
      ],
    },
    {
      id: 'east-command-destroyed',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'sectorsSecured', operator: 'gte', value: 3 },
          { kind: 'entity', selector: { collection: 'buildings', scriptId: 'enemy-command-post' }, state: 'destroyed', operator: 'gte', value: 1 },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'commandPostDestroyed', value: true },
        { kind: 'setVariable', id: 'phase', value: 4 },
        {
          kind: 'dialogue',
          speaker: 'major-olena-hrytsenko',
          text: 'The command post is down. Record surviving allied and reserve strength for the next operation.',
          portrait: null,
          durationSeconds: 6,
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
  ],
});

const roadCells = uniqueCells([
  ...horizontal(5, 0, 35),
  ...horizontal(12, 0, 39),
  ...horizontal(19, 0, 35),
  ...vertical(34, 5, 19),
]);

const terrainRows = Array.from({ length: 24 }, (_, y) => Array.from({ length: 40 }, (_, x) => {
  if ((y < 8 && x > 9 && x < 31) || (y > 15 && x > 9 && x < 31)) return (x + y) % 6 === 0 ? 's' : '.';
  if (x > 20 && x < 30 && y > 8 && y < 16) return (x + y) % 4 === 0 ? 'r' : '.';
  if (x > 4 && x < 12 && y > 15) return (x + y) % 3 === 0 ? 'm' : '.';
  return '.';
}).join(''));

export const COMBINED_ARMS_MAP = deepFreeze({
  formatVersion: 1,
  id: COMBINED_ARMS_MAP_ID,
  name: 'Iron Horizon Front',
  width: 1280,
  height: 768,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', s: 'shelterbelt', r: 'rubble', m: 'mud' },
    rows: terrainRows,
  },
  roads: [{ id: 'three-sector-axis-network', cells: roadCells, metadata: { purpose: 'combined-arms-axis', marked: true } }],
  props: [
    { id: 'north-sector-marker', type: 'sector-marker', cell: { x: 16, y: 5 }, footprint: { width: 1, height: 1 }, blockingLayers: [], metadata: { sector: 'north', targetScriptId: 'north-fire-control' } },
    { id: 'center-sector-marker', type: 'sector-marker', cell: { x: 19, y: 12 }, footprint: { width: 1, height: 1 }, blockingLayers: [], metadata: { sector: 'center', targetScriptId: 'center-strongpoint' } },
    { id: 'south-sector-marker', type: 'sector-marker', cell: { x: 16, y: 19 }, footprint: { width: 1, height: 1 }, blockingLayers: [], metadata: { sector: 'south', targetScriptId: 'south-logistics-node' } },
    { id: 'allied-route-marker', type: 'allied-route', cell: { x: 8, y: 5 }, footprint: { width: 1, height: 1 }, blockingLayers: [], metadata: { controlMode: 'existing-team-ai', forceTag: 'allied-ai-spearhead', targetSector: 'north' } },
    { id: 'reserve-route-marker', type: 'reserve-route', cell: { x: 8, y: 19 }, footprint: { width: 1, height: 1 }, blockingLayers: [], metadata: { forceTag: 'player-reserve', commitment: 'first-sector-breached' } },
  ],
  starts: {
    player: [
      { id: 'player-forward-command', cell: { x: 4, y: 11 }, facing: 0, metadata: { kind: 'building', type: 'hq', team: 0, scriptId: 'player-forward-command', tag: 'persistent-command-cadre' } },
      { id: 'player-recon-start', cell: { x: 6, y: 12 }, facing: 0, metadata: { kind: 'unit', type: 'uaDrone', team: 0, scriptId: 'player-recon-1', tag: 'player-recon' } },
      { id: 'player-line-infantry', cell: { x: 7, y: 10 }, facing: 0, metadata: { kind: 'unit', type: 'uaInfantry', team: 0, scriptId: 'player-line-infantry-1', tag: 'player-main-force' } },
      { id: 'player-line-ifv', cell: { x: 7, y: 14 }, facing: 0, metadata: { kind: 'unit', type: 'uaIfv', team: 0, scriptId: 'player-line-ifv-1', tag: 'player-main-force' } },
      { id: 'player-fire-support', cell: { x: 4, y: 15 }, facing: 0, metadata: { kind: 'unit', type: 'uaArtillery', team: 0, scriptId: 'player-fire-support-1', tag: 'player-main-force' } },
    ],
    enemy: [
      { id: 'north-fire-control-start', cell: { x: 17, y: 5 }, facing: 180, metadata: { kind: 'building', type: 'depot', team: 1, scriptId: 'north-fire-control', tag: 'sector-objective' } },
      { id: 'center-strongpoint-start', cell: { x: 20, y: 12 }, facing: 180, metadata: { kind: 'building', type: 'hq', team: 1, scriptId: 'center-strongpoint', tag: 'sector-objective' } },
      { id: 'south-logistics-start', cell: { x: 17, y: 19 }, facing: 180, metadata: { kind: 'building', type: 'depot', team: 1, scriptId: 'south-logistics-node', tag: 'sector-objective' } },
      { id: 'enemy-command-start', cell: { x: 35, y: 12 }, facing: 180, metadata: { kind: 'building', type: 'hq', team: 1, scriptId: 'enemy-command-post', tag: 'final-objective' } },
      { id: 'north-screen-start', cell: { x: 22, y: 5 }, facing: 180, metadata: { kind: 'unit', type: 'ruInfantry', team: 1, scriptId: 'north-screen-1', tag: 'sector-defense' } },
      { id: 'center-armor-start', cell: { x: 25, y: 12 }, facing: 180, metadata: { kind: 'unit', type: 'ruIfv', team: 1, scriptId: 'center-armor-1', tag: 'sector-defense' } },
      { id: 'south-screen-start', cell: { x: 22, y: 19 }, facing: 180, metadata: { kind: 'unit', type: 'ruInfantry', team: 1, scriptId: 'south-screen-1', tag: 'sector-defense' } },
    ],
  },
  regions: MAP_REGIONS,
  triggers: COMBINED_ARMS_SCRIPT.triggers,
  metadata: {
    operationId: COMBINED_ARMS_OPERATION_ID,
    biome: 'open-steppe-front',
    startHour: 7,
    alliedControlMode: 'existing-team-ai-handoff',
    reservePolicy: 'first-sector-breached-with-declaration-order-tie-break',
    persistentForcePolicy: 'tagged-survivor-summary',
    fictionalFraming: true,
  },
});

export const COMBINED_ARMS_BRIEFING = deepFreeze({
  operationId: COMBINED_ARMS_OPERATION_ID,
  title: 'Iron Horizon',
  summary: 'Open three fictional defensive sectors, coordinate with an allied spearhead, commit the reserve to the first breach, defeat counterattacks, and break the eastern command post.',
  mapPreview: {
    mapId: COMBINED_ARMS_MAP_ID,
    imageId: 'preview-iron-horizon',
    caption: 'Three sector objectives, allied northern entry, player reserve staging, and eastern command post',
    markers: [
      { id: 'assembly', kind: 'friendly-start', label: 'Player assembly', x: 0.12, y: 0.5 },
      { id: 'allied', kind: 'ally', label: 'Allied spearhead', x: 0.1, y: 0.22 },
      { id: 'north', kind: 'objective', label: 'North sector', x: 0.42, y: 0.22 },
      { id: 'center', kind: 'objective', label: 'Center sector', x: 0.5, y: 0.5 },
      { id: 'south', kind: 'objective', label: 'South sector', x: 0.42, y: 0.78 },
      { id: 'command', kind: 'enemy', label: 'Eastern command', x: 0.88, y: 0.5 },
    ],
  },
  forces: [
    { id: 'main-force', label: 'Mechanized main force', category: 'combined-arms', count: 3 },
    { id: 'recon', label: 'Reconnaissance drone', category: 'support', count: 1 },
    { id: 'allied-spearhead', label: 'Allied northern spearhead', category: 'ally', count: 3, note: 'Authored allied force using the existing team-AI handoff' },
    { id: 'reserve', label: 'Uncommitted operational reserve', category: 'reserve', count: 2, note: 'Composition depends on the first sector breached' },
  ],
  intelligence: [
    { id: 'sector-network', title: 'Three-sector defense', detail: 'Northern fire control, a central strongpoint, and southern logistics protect the eastern command post.', confidence: 'confirmed' },
    { id: 'reserve-response', title: 'Enemy operational reserve', detail: 'The enemy will counterattack away from the first breach and commit a final armored response after two sectors fall.', confidence: 'confirmed' },
    { id: 'carryover', title: 'Persistent force consequences', detail: 'Surviving allied, reserve, and command-cadre strength is recorded for later campaign composition.', confidence: 'confirmed' },
  ],
  objectives: COMBINED_ARMS_OBJECTIVES.map((objective) => ({
    id: objective.id,
    title: objective.label,
    description: BRIEFING_OBJECTIVE_DESCRIPTIONS[objective.id],
    optional: Boolean(objective.optional),
  })),
  difficulty: 'standard',
  difficultyNotes: {
    label: 'Standard',
    summary: 'Three coordinated sector fights with deterministic reserve commitment and two counterattack layers.',
    modifiers: ['First breach determines reserve composition', 'Enemy response opens on the opposite axis', 'Survivors affect campaign handoff data'],
  },
  loadingHints: [
    'Reconnoitre the center before committing the main force.',
    'The first sector destroyed determines the reserve package; simultaneous breaches use stable north-center-south declaration order, leaving south as the tie-break.',
    'Escort a committed reserve element into the consolidation zone and preserve surviving forces for the campaign handoff.',
  ],
  metadata: { fictional: true, contentNote: 'Stylized fictional combined-arms operation with original fictional speakers.' },
});

export const COMBINED_ARMS_PERSISTENCE = deepFreeze({
  version: 1,
  policy: 'tagged-survivor-summary',
  forceGroups: [
    { id: 'allied-spearhead', tag: 'allied-ai-spearhead', objectiveId: 'preserve-allied-spearhead', preservedModifier: 'allied-support-ready', lostModifier: 'allied-support-depleted' },
    { id: 'player-reserve', tag: 'player-reserve', objectiveId: 'preserve-player-reserve', preservedModifier: 'reserve-retained', lostModifier: 'reserve-rebuild-required' },
    { id: 'command-cadre', tag: 'persistent-command-cadre', objectiveId: null, preservedModifier: 'command-cadre-retained', lostModifier: 'command-cadre-replaced' },
  ],
  campaignHandoff: {
    preserveVeterancy: true,
    preserveCurrentHealthFraction: true,
    minimumHealthFraction: 0.35,
    reserveAxisVariable: 'reserveAxis',
    nextOperationOwner: 'campaign-progression-runtime',
  },
});

export function evaluateCombinedArmsPersistence({ survivorCounts = {}, reserveAxis = 'uncommitted' } = {}) {
  if (!survivorCounts || typeof survivorCounts !== 'object' || Array.isArray(survivorCounts)) {
    throw new TypeError('survivorCounts must be an object keyed by persistent force tag.');
  }
  if (!RESERVE_AXES.includes(reserveAxis)) {
    throw new RangeError(`Unknown reserve axis: ${reserveAxis}`);
  }
  const groups = Object.fromEntries(COMBINED_ARMS_PERSISTENCE.forceGroups.map((group) => {
    const survivors = finiteSurvivorCount(survivorCounts[group.tag]);
    return [group.id, deepFreeze({
      tag: group.tag,
      survivors,
      state: survivors > 0 ? 'preserved' : 'lost',
      modifier: survivors > 0 ? group.preservedModifier : group.lostModifier,
    })];
  }));
  return deepFreeze({
    version: COMBINED_ARMS_PERSISTENCE.version,
    operationId: COMBINED_ARMS_OPERATION_ID,
    reserveAxis,
    groups,
    modifiers: Object.values(groups).map((group) => group.modifier),
  });
}

export const COMBINED_ARMS_OPERATION = deepFreeze({
  version: COMBINED_ARMS_OPERATION_VERSION,
  id: COMBINED_ARMS_OPERATION_ID,
  title: 'Iron Horizon',
  gate: 'campaign-alpha',
  map: COMBINED_ARMS_MAP,
  mission: {
    id: COMBINED_ARMS_OPERATION_ID,
    mapId: COMBINED_ARMS_MAP_ID,
    objectiveMode: 'library',
    objectiveIds: COMBINED_ARMS_OBJECTIVES.map((objective) => objective.id),
    objectiveDefinitions: COMBINED_ARMS_OBJECTIVES,
    regions: SCRIPT_REGIONS,
    script: COMBINED_ARMS_SCRIPT,
    checkpointPolicy: 'enabled',
    checkpointLabels: [
      { id: 'center-recon-complete', label: 'Central axis reconnoitred', authoredEvent: 'center-axis-reconnoitred' },
      { id: 'reserve-committed', label: 'Operational reserve committed', variable: 'reserveAxis', excludesValue: 'uncommitted' },
      { id: 'two-sectors-secured', label: 'Two sectors secured', variable: 'sectorsSecured', minimum: 2 },
      { id: 'east-command-exposed', label: 'Eastern command exposed', variable: 'sectorsSecured', minimum: 3 },
    ],
    alliedForce: {
      id: 'allied-northern-spearhead',
      team: 0,
      controlMode: 'existing-team-ai-handoff',
      forceTag: 'allied-ai-spearhead',
      objectiveId: 'preserve-allied-spearhead',
      routeRegionIds: ['allied-north-entry', 'north-sector', 'consolidation-zone'],
    },
    persistence: COMBINED_ARMS_PERSISTENCE,
  },
  briefing: COMBINED_ARMS_BRIEFING,
  debrief: {
    victoryTitle: 'Iron Horizon Opened',
    defeatTitle: 'Offensive Momentum Lost',
    medalRules: [
      { id: 'medal-allied-preservation', title: 'Combined Effort', condition: { objectiveId: 'preserve-allied-spearhead', complete: true } },
      { id: 'medal-reserve-preservation', title: 'Operational Depth', condition: { objectiveId: 'preserve-player-reserve', complete: true } },
      { id: 'medal-counterattack', title: 'Break the Reserve', condition: { objectiveId: 'neutralize-enemy-reserve', complete: true } },
    ],
  },
  contentNotes: [
    'All speakers and formations are fictional.',
    'Allied participation is authored through existing team-unit and future campaign-composition handoffs; this content does not add an AI planner.',
    'Persistent-force consequences are immutable summary data for the existing campaign progression owner and do not mutate runtime rosters directly.',
  ],
});
