const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const horizontal = (y, fromX, toX) => Array.from({ length: toX - fromX + 1 }, (_, offset) => ({ x: fromX + offset, y }));
const worldRect = (x, y, width, height, tileSize = 32) => ({
  shape: 'rect', x: x * tileSize, y: y * tileSize, width: width * tileSize, height: height * tileSize,
});

export const LOWER_DNIPRO_OPERATION_ID = 'operation-long-night';
export const LOWER_DNIPRO_MAP_ID = 'map-lower-dnipro-bridgehead';

const MAP_REGIONS = {
  'rear-logistics': { shape: 'rect', origin: { x: 2, y: 8 }, width: 9, height: 9, metadata: { purpose: 'river-logistics-origin' } },
  'north-crossing': { shape: 'rect', origin: { x: 10, y: 6 }, width: 10, height: 6, metadata: { purpose: 'river-logistics-route' } },
  'south-crossing': { shape: 'rect', origin: { x: 10, y: 14 }, width: 10, height: 6, metadata: { purpose: 'alternate-river-route' } },
  bridgehead: { shape: 'rect', origin: { x: 19, y: 8 }, width: 7, height: 9, metadata: { purpose: 'bridgehead-sustainment' } },
  'north-command-sector': { shape: 'rect', origin: { x: 20, y: 3 }, width: 5, height: 5, metadata: { purpose: 'command-decision-north' } },
  'south-command-sector': { shape: 'rect', origin: { x: 20, y: 17 }, width: 5, height: 5, metadata: { purpose: 'command-decision-south' } },
  'enemy-entry-north': { shape: 'rect', origin: { x: 27, y: 3 }, width: 5, height: 7, metadata: { purpose: 'wave-entry' } },
  'enemy-entry-south': { shape: 'rect', origin: { x: 27, y: 15 }, width: 5, height: 7, metadata: { purpose: 'wave-entry' } },
  'counterattack-zone': { shape: 'rect', origin: { x: 25, y: 9 }, width: 7, height: 7, metadata: { purpose: 'counterattack-objective' } },
};

const SCRIPT_REGIONS = deepFreeze([
  { id: 'rear-logistics', ...worldRect(2, 8, 9, 9) },
  { id: 'north-crossing', ...worldRect(10, 6, 10, 6) },
  { id: 'south-crossing', ...worldRect(10, 14, 10, 6) },
  { id: 'bridgehead', ...worldRect(19, 8, 7, 9) },
  { id: 'north-command-sector', ...worldRect(20, 3, 5, 5) },
  { id: 'south-command-sector', ...worldRect(20, 17, 5, 5) },
  { id: 'enemy-entry-north', ...worldRect(27, 3, 5, 7) },
  { id: 'enemy-entry-south', ...worldRect(27, 15, 5, 7) },
  { id: 'counterattack-zone', ...worldRect(25, 9, 7, 7) },
]);

export const LOWER_DNIPRO_WAVE_PLAN = deepFreeze({
  version: 1,
  totalWaves: 6,
  scheduleSeconds: [45, 90, 135, 180, 225, 270],
  waves: [
    { id: 'wave-1', at: 45, entry: 'enemy-entry-north', composition: ['ruInfantry', 'ruInfantry', 'ruIfv'] },
    { id: 'wave-2', at: 90, entry: 'enemy-entry-south', composition: ['ruInfantry', 'ruIfv', 'ruTank'] },
    {
      id: 'wave-3', at: 135, decision: 'reserveAxis',
      variants: {
        north: { entry: 'enemy-entry-south', composition: ['ruInfantry', 'ruInfantry', 'ruIfv'] },
        south: { entry: 'enemy-entry-north', composition: ['ruInfantry', 'ruIfv', 'ruTank'] },
      },
    },
    { id: 'wave-4', at: 180, entry: 'enemy-entry-north', composition: ['ruInfantry', 'ruTank', 'ruArtillery'] },
    {
      id: 'wave-5', at: 225, decision: 'reserveAxis',
      variants: {
        north: { entry: 'enemy-entry-north', composition: ['ruInfantry', 'ruTank', 'ruTank'] },
        south: { entry: 'enemy-entry-south', composition: ['ruInfantry', 'ruInfantry', 'ruArtillery'] },
      },
    },
    { id: 'wave-6', at: 270, entry: 'enemy-entry-south', composition: ['ruInfantry', 'ruIfv', 'ruTank', 'ruArtillery'] },
  ],
});

export const LOWER_DNIPRO_COMMAND_DECISIONS = deepFreeze({
  selectorScriptId: 'command-liaison',
  variable: 'reserveAxis',
  choices: [
    { id: 'north', regionId: 'north-command-sector', effect: 'Commit the mobile reserve to the northern screen; wave 3 shifts south and wave 5 masses north.' },
    { id: 'south', regionId: 'south-command-sector', effect: 'Commit the mobile reserve to the southern screen; wave 3 shifts north and wave 5 leans south with fires.' },
  ],
});

export const LOWER_DNIPRO_MISSION_SCRIPT = deepFreeze({
  version: 1,
  id: 'operation-long-night.script',
  regions: SCRIPT_REGIONS,
  initialVariables: { reserveAxis: 'uncommitted', logisticsDelivered: false, counterattackReleased: false },
  triggers: [
    {
      id: 'opening-night-orders',
      when: { kind: 'timer', clock: 'ticks', operator: 'gte', value: 1 },
      actions: [
        { kind: 'setResource', resource: 'metal', amount: 430 },
        { kind: 'setResource', resource: 'fuel', amount: 260 },
        { kind: 'setResource', resource: 'intel', amount: 230 },
        { kind: 'weather', weatherId: 'river-night', intensity: 0.85, transitionSeconds: 1, durationSeconds: null },
        { kind: 'camera', x: 704, y: 384, zoom: 0.9, durationSeconds: 1.5, label: 'Lower Dnipro bridgehead' },
        {
          kind: 'dialogue', speaker: 'major-anna-bondar', portrait: null, durationSeconds: 7,
          text: 'Keep the bridgehead supplied through the night. Bring the river logistics team across, choose where to commit the mobile reserve, survive six assault groups, then counterattack the command bunker.',
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
    {
      id: 'river-logistics-delivered',
      when: { kind: 'region', regionId: 'bridgehead', selector: { collection: 'units', scriptId: 'river-logistics-team' }, state: 'alive', event: 'enter', operator: 'gte', value: 1 },
      actions: [
        { kind: 'setVariable', id: 'logisticsDelivered', value: true },
        { kind: 'addResource', resource: 'fuel', amount: 80 },
        {
          kind: 'dialogue', speaker: 'logistics-lead-petro-savchuk', portrait: null, durationSeconds: 5,
          text: 'River logistics package is inside the bridgehead. Fuel reserve is up by eighty; keep the crossing lanes open.',
          metadata: { channel: 'logistics', fictional: true },
        },
      ],
    },
    {
      id: 'commit-reserve-north',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'reserveAxis', operator: 'eq', value: 'uncommitted' },
          { kind: 'region', regionId: 'north-command-sector', selector: { collection: 'units', scriptId: 'command-liaison' }, state: 'alive', event: 'enter', operator: 'gte', value: 1 },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'reserveAxis', value: 'north' },
        {
          kind: 'dialogue', speaker: 'major-anna-bondar', portrait: null, durationSeconds: 5,
          text: 'Reserve committed north. Expect the enemy to test the southern seam before massing again against the reinforced screen.',
          metadata: { channel: 'command', fictional: true, decision: 'north' },
        },
      ],
    },
    {
      id: 'commit-reserve-south',
      when: {
        kind: 'all',
        conditions: [
          { kind: 'variable', id: 'reserveAxis', operator: 'eq', value: 'uncommitted' },
          { kind: 'region', regionId: 'south-command-sector', selector: { collection: 'units', scriptId: 'command-liaison' }, state: 'alive', event: 'enter', operator: 'gte', value: 1 },
        ],
      },
      actions: [
        { kind: 'setVariable', id: 'reserveAxis', value: 'south' },
        {
          kind: 'dialogue', speaker: 'major-anna-bondar', portrait: null, durationSeconds: 5,
          text: 'Reserve committed south. The northern lane is thinner now; prepare for a heavier armored test there.',
          metadata: { channel: 'command', fictional: true, decision: 'south' },
        },
      ],
    },
    {
      id: 'wave-1',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 45 },
      actions: [{
        kind: 'reinforcement', team: 1, label: 'Assault group one',
        entities: [
          { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'enemy-entry-north', spacingX: 18, spacingY: 16, scriptIdPrefix: 'wave1-rifles', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'enemy-entry-north', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave1-ifv', tag: 'dnipro-wave' },
        ],
      }],
    },
    {
      id: 'wave-2',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 90 },
      actions: [{
        kind: 'reinforcement', team: 1, label: 'Assault group two',
        entities: [
          { kind: 'unit', type: 'ruInfantry', count: 1, regionId: 'enemy-entry-south', spacingX: 18, spacingY: 16, scriptIdPrefix: 'wave2-rifles', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'enemy-entry-south', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave2-ifv', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruTank', count: 1, regionId: 'enemy-entry-south', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave2-tank', tag: 'dnipro-wave' },
        ],
      }],
    },
    {
      id: 'wave-3-north-choice',
      when: { kind: 'all', conditions: [{ kind: 'timer', clock: 'seconds', operator: 'gte', value: 135 }, { kind: 'variable', id: 'reserveAxis', operator: 'eq', value: 'north' }] },
      actions: [{
        kind: 'reinforcement', team: 1, label: 'Assault group three — southern seam',
        entities: [
          { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'enemy-entry-south', spacingX: 18, spacingY: 16, scriptIdPrefix: 'wave3-north-rifles', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'enemy-entry-south', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave3-north-ifv', tag: 'dnipro-wave' },
        ],
      }],
    },
    {
      id: 'wave-3-south-choice',
      when: { kind: 'all', conditions: [{ kind: 'timer', clock: 'seconds', operator: 'gte', value: 135 }, { kind: 'variable', id: 'reserveAxis', operator: 'eq', value: 'south' }] },
      actions: [{
        kind: 'reinforcement', team: 1, label: 'Assault group three — northern armor',
        entities: [
          { kind: 'unit', type: 'ruInfantry', count: 1, regionId: 'enemy-entry-north', spacingX: 18, spacingY: 16, scriptIdPrefix: 'wave3-south-rifles', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'enemy-entry-north', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave3-south-ifv', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruTank', count: 1, regionId: 'enemy-entry-north', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave3-south-tank', tag: 'dnipro-wave' },
        ],
      }],
    },
    {
      id: 'wave-4',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 180 },
      actions: [{
        kind: 'reinforcement', team: 1, label: 'Assault group four',
        entities: [
          { kind: 'unit', type: 'ruInfantry', count: 1, regionId: 'enemy-entry-north', spacingX: 18, spacingY: 16, scriptIdPrefix: 'wave4-rifles', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruTank', count: 1, regionId: 'enemy-entry-north', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave4-tank', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruArtillery', count: 1, regionId: 'enemy-entry-north', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave4-artillery', tag: 'dnipro-wave' },
        ],
      }],
    },
    {
      id: 'wave-5-north-choice',
      when: { kind: 'all', conditions: [{ kind: 'timer', clock: 'seconds', operator: 'gte', value: 225 }, { kind: 'variable', id: 'reserveAxis', operator: 'eq', value: 'north' }] },
      actions: [{
        kind: 'reinforcement', team: 1, label: 'Assault group five — northern mass',
        entities: [
          { kind: 'unit', type: 'ruInfantry', count: 1, regionId: 'enemy-entry-north', spacingX: 18, spacingY: 16, scriptIdPrefix: 'wave5-north-rifles', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruTank', count: 2, regionId: 'enemy-entry-north', spacingX: 20, spacingY: 16, scriptIdPrefix: 'wave5-north-tanks', tag: 'dnipro-wave' },
        ],
      }],
    },
    {
      id: 'wave-5-south-choice',
      when: { kind: 'all', conditions: [{ kind: 'timer', clock: 'seconds', operator: 'gte', value: 225 }, { kind: 'variable', id: 'reserveAxis', operator: 'eq', value: 'south' }] },
      actions: [{
        kind: 'reinforcement', team: 1, label: 'Assault group five — southern fires',
        entities: [
          { kind: 'unit', type: 'ruInfantry', count: 2, regionId: 'enemy-entry-south', spacingX: 18, spacingY: 16, scriptIdPrefix: 'wave5-south-rifles', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruArtillery', count: 1, regionId: 'enemy-entry-south', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave5-south-artillery', tag: 'dnipro-wave' },
        ],
      }],
    },
    {
      id: 'predawn-visibility-shift',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 240 },
      actions: [
        { kind: 'weather', weatherId: 'predawn-river-mist', intensity: 0.45, transitionSeconds: 8, durationSeconds: null },
        {
          kind: 'dialogue', speaker: 'major-anna-bondar', portrait: null, durationSeconds: 4,
          text: 'Predawn light is coming up through the river mist. Sight lines are opening; the final assault will be easier to see and harder to hide from.',
          metadata: { channel: 'command', fictional: true, visibilityPhase: 'predawn' },
        },
      ],
    },
    {
      id: 'wave-6',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 270 },
      actions: [{
        kind: 'reinforcement', team: 1, label: 'Assault group six',
        entities: [
          { kind: 'unit', type: 'ruInfantry', count: 1, regionId: 'enemy-entry-south', spacingX: 18, spacingY: 16, scriptIdPrefix: 'wave6-rifles', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruIfv', count: 1, regionId: 'enemy-entry-south', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave6-ifv', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruTank', count: 1, regionId: 'enemy-entry-south', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave6-tank', tag: 'dnipro-wave' },
          { kind: 'unit', type: 'ruArtillery', count: 1, regionId: 'enemy-entry-south', spacingX: 0, spacingY: 0, scriptIdPrefix: 'wave6-artillery', tag: 'dnipro-wave' },
        ],
      }],
    },
    {
      id: 'counterattack-release',
      when: { kind: 'timer', clock: 'seconds', operator: 'gte', value: 300 },
      actions: [
        { kind: 'setVariable', id: 'counterattackReleased', value: true },
        { kind: 'camera', x: 912, y: 384, zoom: 1, durationSeconds: 1.2, label: 'Counterattack objective' },
        {
          kind: 'dialogue', speaker: 'major-anna-bondar', portrait: null, durationSeconds: 5,
          text: 'Six assault groups have committed. Push out of the bridgehead and destroy the command bunker before the enemy can reset the line.',
          metadata: { channel: 'command', fictional: true, phase: 'counterattack' },
        },
      ],
    },
    {
      id: 'command-bunker-destroyed',
      when: { kind: 'entity', selector: { collection: 'buildings', scriptId: 'ru-command-bunker' }, state: 'destroyed', operator: 'gte', value: 1 },
      actions: [
        {
          kind: 'dialogue', speaker: 'major-anna-bondar', portrait: null, durationSeconds: 4,
          text: 'Command bunker destroyed. Keep the bridgehead intact and complete any remaining sustainment requirement.',
          metadata: { channel: 'command', fictional: true },
        },
      ],
    },
  ],
});

export const LOWER_DNIPRO_OBJECTIVES = deepFreeze([
  {
    id: 'deliver-river-logistics', type: 'escort', label: 'Bring the river logistics team into the bridgehead',
    target: { collection: 'units', scriptId: 'river-logistics-team' }, regionId: 'bridgehead',
    failureReason: 'The river logistics team was lost before reaching the bridgehead.',
  },
  {
    id: 'sustain-fuel-reserve', type: 'gather', label: 'Build the bridgehead fuel reserve to 320', resource: 'fuel', amount: 320,
    failureReason: 'The bridgehead ran short of the fuel reserve required for the counterattack.',
  },
  {
    id: 'hold-bridgehead', type: 'defend', label: 'Hold the bridgehead command post through the night fight',
    target: { collection: 'buildings', scriptId: 'bridgehead-command-post' }, regionId: 'bridgehead', durationSeconds: 300,
    failureReason: 'The bridgehead command post was destroyed.',
  },
  {
    id: 'survive-six-waves', type: 'survive', label: 'Survive the six deliberate assault groups', durationSeconds: 300,
    failureReason: 'The bridgehead did not survive through the sixth assault window.',
  },
  {
    id: 'destroy-command-bunker', type: 'destroy', label: 'Counterattack and destroy the Russian command bunker',
    target: { collection: 'buildings', scriptId: 'ru-command-bunker' }, count: 1,
    failureReason: 'The Russian command bunker survived the counterattack.',
  },
]);

export const LOWER_DNIPRO_MAP = deepFreeze({
  formatVersion: 1,
  id: LOWER_DNIPRO_MAP_ID,
  name: 'Lower Dnipro Bridgehead',
  width: 1024,
  height: 768,
  tileSize: 32,
  terrain: {
    encoding: 'rows',
    default: 'open',
    legend: { '.': 'open', s: 'shelterbelt', m: 'mud', w: 'water', b: 'bridge' },
    rows: [
      '.............wwwwww.............',
      '.............wwwwww.............',
      '.............wwwwww.............',
      '.........m.m.wwwwww.m.m.........',
      '........m.m.mwwwwwwm.m.m........',
      '..ssssss.m.m.wwwwww.m.m.........',
      '..ssssssm.m.mwwwwwwm.m.m........',
      '.........m.m.wwwwww.m.m.........',
      '........m.m.mbbbbbbm.m.m........',
      '.........m.m.bbbbbb.m.m.........',
      '........m.m.mwwwwwwm.m.m........',
      '.........m.m.wwwwww.m.m.........',
      '........m.m.mwwwwwwm.m.m........',
      '.........m.m.wwwwww.m.m.........',
      '........m.m.mwwwwwwm.m.m........',
      '.........m.m.wwwwww.m.m.........',
      '........m.m.mbbbbbbm.m.m........',
      '.........m.m.bbbbbb.m.m.........',
      '........m.m.mwwwwwwm.m.m........',
      '..ssssss.m.m.wwwwww.m.m.........',
      '..ssssssm.m.mwwwwwwm.m.m........',
      '.............wwwwww.............',
      '.............wwwwww.............',
      '.............wwwwww.............',
    ],
  },
  roads: [
    { id: 'north-pontoon-route', cells: horizontal(8, 3, 26), metadata: { crossing: 'north', logistics: true } },
    { id: 'south-pontoon-route', cells: horizontal(17, 3, 26), metadata: { crossing: 'south', logistics: true } },
  ],
  props: [
    { id: 'north-river-marker', type: 'pontoon-marker', cell: { x: 12, y: 8 }, footprint: { width: 1, height: 2 }, blockingLayers: [], metadata: { route: 'north' } },
    { id: 'south-river-marker', type: 'pontoon-marker', cell: { x: 19, y: 16 }, footprint: { width: 1, height: 2 }, blockingLayers: [], metadata: { route: 'south' } },
    { id: 'bridgehead-revetment', type: 'field-fortification', cell: { x: 22, y: 11 }, footprint: { width: 2, height: 2 }, blockingLayers: ['ground'], metadata: { cover: 'heavy' } },
  ],
  starts: {
    rear: [
      { id: 'ua-rear-hq', cell: { x: 5, y: 12 }, facing: 0, metadata: { kind: 'building', type: 'hq', team: 0, scriptId: 'rear-logistics-hq', tag: 'river-logistics' } },
      { id: 'ua-river-logistics', cell: { x: 9, y: 9 }, facing: 90, metadata: { kind: 'unit', type: 'uaEngineer', team: 0, scriptId: 'river-logistics-team', tag: 'river-logistics' } },
    ],
    bridgehead: [
      { id: 'ua-bridgehead-command', cell: { x: 21, y: 12 }, facing: 0, metadata: { kind: 'building', type: 'depot', team: 0, scriptId: 'bridgehead-command-post', tag: 'defense-anchor' } },
      { id: 'ua-bridgehead-rifles', cell: { x: 22, y: 10 }, facing: 90, metadata: { kind: 'unit', type: 'uaInfantry', team: 0, scriptId: 'bridgehead-rifles', tag: 'bridgehead-defense' } },
      { id: 'ua-mobile-reserve', cell: { x: 23, y: 14 }, facing: 90, metadata: { kind: 'unit', type: 'uaTank', team: 0, scriptId: 'mobile-reserve', tag: 'reserve' } },
      { id: 'ua-command-liaison', cell: { x: 20, y: 12 }, facing: 0, metadata: { kind: 'unit', type: 'uaInfantry', team: 0, scriptId: 'command-liaison', tag: 'command-decision' } },
    ],
    enemy: [
      { id: 'ru-command-bunker-start', cell: { x: 29, y: 12 }, facing: 180, metadata: { kind: 'building', type: 'hq', team: 1, scriptId: 'ru-command-bunker', tag: 'counterattack-target' } },
      { id: 'ru-north-screen-start', cell: { x: 27, y: 8 }, facing: 270, metadata: { kind: 'unit', type: 'ruInfantry', team: 1, scriptId: 'north-screen', tag: 'bridgehead-screen' } },
      { id: 'ru-south-screen-start', cell: { x: 27, y: 16 }, facing: 270, metadata: { kind: 'unit', type: 'ruIfv', team: 1, scriptId: 'south-screen', tag: 'bridgehead-screen' } },
    ],
  },
  regions: MAP_REGIONS,
  triggers: LOWER_DNIPRO_MISSION_SCRIPT.triggers,
  metadata: {
    operationId: LOWER_DNIPRO_OPERATION_ID,
    legacyMissionId: 'kherson',
    regionId: 'kherson',
    startHour: 1,
    visibilityPhases: [
      { id: 'river-night', fromSeconds: 0, intensity: 0.85 },
      { id: 'predawn-river-mist', fromSeconds: 240, intensity: 0.45 },
    ],
    wavePlan: LOWER_DNIPRO_WAVE_PLAN,
    commandDecisions: LOWER_DNIPRO_COMMAND_DECISIONS,
    startingResources: { metal: 430, fuel: 260, intel: 230 },
    fictionalFraming: true,
  },
});

export const LOWER_DNIPRO_BRIEFING = deepFreeze({
  operationId: LOWER_DNIPRO_OPERATION_ID,
  title: 'The Long Night',
  summary: 'Sustain a Lower Dnipro bridgehead through six assault groups, keep river logistics moving under night visibility, make a reserve commitment, and counterattack at first light.',
  mapPreview: {
    mapId: LOWER_DNIPRO_MAP_ID,
    imageId: 'preview-lower-dnipro-bridgehead',
    caption: 'Rear logistics, two river crossings, bridgehead, command-decision sectors, assault entries, and counterattack bunker',
    markers: [
      { id: 'rear', kind: 'friendly-start', label: 'Rear logistics', x: 0.17, y: 0.52 },
      { id: 'bridgehead', kind: 'objective', label: 'Bridgehead', x: 0.7, y: 0.52 },
      { id: 'north-decision', kind: 'objective', label: 'North reserve sector', x: 0.7, y: 0.23 },
      { id: 'south-decision', kind: 'objective', label: 'South reserve sector', x: 0.7, y: 0.78 },
      { id: 'bunker', kind: 'enemy', label: 'Command bunker', x: 0.91, y: 0.52 },
    ],
  },
  forces: [
    { id: 'logistics', label: 'River logistics engineer team', category: 'support', count: 1 },
    { id: 'bridgehead-rifles', label: 'Bridgehead mechanized squad', category: 'infantry', count: 1 },
    { id: 'reserve', label: 'Mobile tank reserve', category: 'armor', count: 1 },
    { id: 'liaison', label: 'Command liaison squad', category: 'command', count: 1, note: 'Move this single element into a command sector to choose the reserve axis.' },
  ],
  intelligence: [
    { id: 'waves', title: 'Six deliberate assault groups', detail: 'Assault windows are expected at 45-second intervals from 45 through 270 seconds.', confidence: 'confirmed' },
    { id: 'visibility', title: 'Night into predawn', detail: 'The operation begins in deep river darkness and transitions to predawn mist after four minutes.', confidence: 'confirmed' },
    { id: 'decision', title: 'Reserve commitment matters', detail: 'The single command liaison selects north or south; later wave compositions respond deterministically to that commitment.', confidence: 'confirmed' },
  ],
  objectives: LOWER_DNIPRO_OBJECTIVES.map((objective) => ({
    id: objective.id, title: objective.label, description: objective.failureReason, optional: Boolean(objective.optional),
  })),
  difficulty: 'standard',
  difficultyNotes: {
    label: 'Standard',
    summary: 'A five-minute sustainment fight followed by a command-bunker counterattack.',
    modifiers: ['Six authored assault windows', 'Single-element north/south reserve decision', 'Night-to-predawn visibility transition', 'River logistics adds 80 fuel on delivery'],
  },
  loadingHints: [
    'Deliver the river logistics team early: its fuel package raises the legacy 260 starting fuel above the 320 sustainment target.',
    'Move the command liaison—not multiple units—into the north or south command sector to commit the reserve without ambiguous branch races.',
    'Do not spend the mobile reserve so aggressively that the bridgehead command post is exposed before the counterattack release at 300 seconds.',
  ],
  metadata: { fictional: true, legacyMissionId: 'kherson' },
});

export const LOWER_DNIPRO_OPERATION = deepFreeze({
  id: LOWER_DNIPRO_OPERATION_ID,
  title: 'The Long Night',
  gate: 'campaign-alpha',
  map: LOWER_DNIPRO_MAP,
  mission: {
    id: LOWER_DNIPRO_OPERATION_ID,
    legacyMissionId: 'kherson',
    mapId: LOWER_DNIPRO_MAP_ID,
    objectiveMode: 'library',
    objectiveIds: LOWER_DNIPRO_OBJECTIVES.map((objective) => objective.id),
    objectiveDefinitions: LOWER_DNIPRO_OBJECTIVES,
    regions: SCRIPT_REGIONS,
    script: LOWER_DNIPRO_MISSION_SCRIPT,
    wavePlan: LOWER_DNIPRO_WAVE_PLAN,
    commandDecisions: LOWER_DNIPRO_COMMAND_DECISIONS,
    checkpointPolicy: 'enabled',
    checkpointLabels: [
      { id: 'logistics-delivered', label: 'River logistics delivered', authoredEvent: 'deliver-river-logistics-complete' },
      { id: 'reserve-committed', label: 'Reserve axis committed', authoredVariable: 'reserveAxis' },
      { id: 'counterattack-released', label: 'Counterattack released', afterSeconds: 300 },
    ],
  },
  briefing: LOWER_DNIPRO_BRIEFING,
  debrief: {
    victoryTitle: 'Bridgehead Sustained',
    defeatTitle: 'Bridgehead Collapsed',
    medalRules: [
      { id: 'medal-logistics', title: 'River Lifeline', condition: { variable: 'logisticsDelivered', operator: 'eq', value: true } },
      { id: 'medal-counterattack', title: 'First-Light Counterstroke', condition: { objectiveId: 'destroy-command-bunker', complete: true } },
    ],
  },
  contentNotes: [
    'This is a stylized fictional operation using the legacy Lower Dnipro/Kherson mission identity.',
    'River logistics is represented by a canonical engineer team and scripted resource handoff rather than a new transport subsystem.',
    'The single command-liaison selector prevents simultaneous north/south decision activation in ordinary play.',
    'No browser campaign mounting is owned by UFR-096.',
  ],
});
