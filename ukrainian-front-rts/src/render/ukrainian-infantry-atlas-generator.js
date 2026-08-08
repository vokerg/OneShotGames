const SOURCE_SCHEMA = 'fields-of-resolve.ukrainian-infantry-art-source';
const ATLAS_SCHEMA = 'fields-of-resolve.sprite-atlas';
const DIRECTIONS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
const REQUIRED_STATES = Object.freeze(['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck']);
const DIRECTION_VECTORS = Object.freeze({
  n: Object.freeze({ x: 0, y: -1 }),
  ne: Object.freeze({ x: 0.72, y: -0.72 }),
  e: Object.freeze({ x: 1, y: 0 }),
  se: Object.freeze({ x: 0.72, y: 0.72 }),
  s: Object.freeze({ x: 0, y: 1 }),
  sw: Object.freeze({ x: -0.72, y: 0.72 }),
  w: Object.freeze({ x: -1, y: 0 }),
  nw: Object.freeze({ x: -0.72, y: -0.72 }),
});

const BATTLEFIELD_PRESENTATION = Object.freeze({
  revision: 'screen-upright-directional-v3',
  frame: Object.freeze({ width: 48, height: 48 }),
  standingBody: Object.freeze({ x: 8, y: 3, width: 32, height: 42 }),
  equipment: Object.freeze({ maxWidth: 18, maxLength: 34 }),
  runtimeScale: Object.freeze({ multiplier: 1.08, floor: 0.6 }),
  drawYOffset: 7,
});

function assert(condition, message) {
  if (!condition) throw new TypeError(message);
}

function stableJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function validateSource(source) {
  assert(source?.schema === SOURCE_SCHEMA, `source.schema must be ${SOURCE_SCHEMA}`);
  assert(source.version === 1, 'source.version must be 1');
  assert(source.id && typeof source.id === 'string', 'source.id must be a string');
  assert(source.frame?.width === 48 && source.frame?.height === 48, 'battle frames must be 48x48');
  assert(Number.isInteger(source.frame.columns) && source.frame.columns >= 8, 'frame.columns must be an integer >= 8');
  assert(JSON.stringify(source.directions) === JSON.stringify(DIRECTIONS), 'directions must use canonical clockwise order');
  for (const state of REQUIRED_STATES) {
    const definition = source.states?.[state];
    assert(definition && Number.isInteger(definition.frames) && definition.frames >= 1, `${state} must declare frames`);
    assert(Array.isArray(definition.durationsMs) && definition.durationsMs.length === definition.frames, `${state} durations must match frame count`);
    assert(definition.durationsMs.every((value) => Number.isInteger(value) && value >= 1), `${state} durations must be positive integers`);
    assert(['loop', 'once', 'hold'].includes(definition.loop), `${state}.loop is invalid`);
  }
  assert(Array.isArray(source.units) && source.units.length > 0, 'source.units must be a non-empty array');
  const ids = new Set();
  const aliases = new Set();
  for (const unit of source.units) {
    assert(/^ua\.[a-z0-9-]+$/.test(unit.id), `invalid Ukrainian unit id ${unit.id}`);
    assert(!ids.has(unit.id), `duplicate unit id ${unit.id}`);
    ids.add(unit.id);
    assert(unit.displayName && unit.shortName && unit.role && unit.equipment, `${unit.id} is missing presentation fields`);
    assert(source.paletteTokens[unit.accent], `${unit.id} references unknown accent ${unit.accent}`);
    assert(Array.isArray(unit.aliases), `${unit.id}.aliases must be an array`);
    for (const alias of unit.aliases) {
      assert(typeof alias === 'string' && alias.length > 0, `${unit.id} has invalid alias`);
      assert(!aliases.has(alias), `duplicate alias ${alias}`);
      aliases.add(alias);
    }
  }
  assert(source.provenance?.license === 'CC0-1.0', 'source provenance must use CC0-1.0');
  assert(source.provenance?.redistribution === 'allowed', 'source redistribution must be allowed');
  assert(Array.isArray(source.provenance.externalInputs) && source.provenance.externalInputs.length === 0, 'externalInputs must be empty');
  assert(Array.isArray(source.provenance.publicFigures) && source.provenance.publicFigures.length === 0, 'publicFigures must be empty');
  return source;
}

function stateTransform(state, frameIndex) {
  if (state === 'move') {
    const phases = [-2.5, -1.2, 1.2, 2.5, 1.2, -1.2];
    const phase = phases[frameIndex % phases.length];
    return { bob: Math.abs(phase) * -0.35, leftLeg: phase, rightLeg: -phase, recoil: 0, opacity: 1 };
  }
  if (state === 'attack') return { bob: 0, leftLeg: 0, rightLeg: 0, recoil: [0, 2.4, 0.8][frameIndex] ?? 0, opacity: 1 };
  if (state === 'hit') return { bob: frameIndex === 0 ? 1.5 : 0.5, leftLeg: -1, rightLeg: 1, recoil: -1, opacity: 1, hit: true };
  if (state === 'damaged') return { bob: 1.2, leftLeg: -1, rightLeg: 1, recoil: 0, opacity: frameIndex === 0 ? 0.9 : 0.95, damaged: true };
  if (state === 'death') {
    const sequence = [
      { bob: 1, fall: 10, opacity: 1, prone: false },
      { bob: 2, fall: 26, opacity: 0.95, prone: false },
      { bob: 4, fall: 52, opacity: 0.86, prone: true },
      { bob: 6, fall: 72, opacity: 0.74, prone: true },
      { bob: 7, fall: 86, opacity: 0.62, prone: true },
    ];
    return { leftLeg: 0, rightLeg: 0, recoil: 0, death: true, ...sequence[frameIndex] };
  }
  if (state === 'wreck') return { bob: 7, leftLeg: 0, rightLeg: 0, recoil: 0, fall: 86, opacity: 0.55, wreck: true, prone: true };
  return { bob: frameIndex % 2 ? -0.5 : 0, leftLeg: 0, rightLeg: 0, recoil: 0, opacity: 1 };
}

function directionalPose(direction, recoil = 0) {
  const vector = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.n;
  const shoulderX = 24 + vector.x * 3;
  const shoulderY = 21 + vector.y * 1.5;
  const weaponLengthX = 16;
  const weaponLengthY = 11;
  const weaponX = shoulderX + vector.x * (weaponLengthX - recoil);
  const weaponY = shoulderY + vector.y * (weaponLengthY - recoil * 0.45);
  const headX = 24 + vector.x * 1.8;
  const headY = 10 + vector.y * 1.1;
  return Object.freeze({ vector, shoulderX, shoulderY, weaponX, weaponY, headX, headY });
}

function standingBody(motion, pose, palette, uniform, light) {
  const faceShade = pose.vector.x >= 0 ? palette['uniform-dark'] : light;
  const oppositeShade = pose.vector.x >= 0 ? light : palette['uniform-dark'];
  return `<g data-human-body="standing" data-directional-body="fixed-upright">
    <rect x="13" y="31" width="8" height="13" rx="2" fill="${palette.ink}" transform="translate(${motion.leftLeg} 0)"/>
    <rect x="27" y="31" width="8" height="13" rx="2" fill="${palette.ink}" transform="translate(${motion.rightLeg} 0)"/>
    <rect x="8" y="18" width="8" height="15" rx="3" fill="${oppositeShade}"/>
    <rect x="32" y="18" width="8" height="15" rx="3" fill="${faceShade}"/>
    <path d="M12 18 Q24 12 36 18 L33 35 Q24 40 15 35 Z" fill="${uniform}" stroke="${palette.ink}" stroke-width="1.5"/>
    <path d="M14 19 Q19 15 24 15 L22 35 Q18 36 15 33 Z" fill="${light}" opacity=".82"/>
    <path d="M24 15 Q30 15 34 19 L33 33 Q29 36 24 35 Z" fill="${palette['uniform-dark']}" opacity=".78"/>
    <rect x="18" y="21" width="12" height="9" rx="2" fill="${palette.shadow}" opacity=".35"/>
    <circle cx="${pose.headX}" cy="${pose.headY}" r="7.5" fill="${light}" stroke="${palette.ink}" stroke-width="1.5"/>
    <path d="M${pose.headX - 7.5} ${pose.headY} Q${pose.headX} ${pose.headY - 10} ${pose.headX + 7.5} ${pose.headY} L${pose.headX + 7} ${pose.headY + 4} L${pose.headX - 7} ${pose.headY + 4} Z" fill="${palette['uniform-dark']}"/>
    <rect x="${pose.headX - 3}" y="${pose.headY + 1}" width="6" height="2.5" fill="${palette.ink}" opacity=".58"/>
  </g>`;
}

function proneBody(palette, uniform, light) {
  return `<g data-human-body="prone"><rect x="7" y="20" width="34" height="14" rx="4" fill="${uniform}" stroke="${palette.ink}" stroke-width="1.5"/><rect x="10" y="21" width="16" height="6" fill="${light}"/><circle cx="39" cy="27" r="7" fill="${light}" stroke="${palette.ink}" stroke-width="1.5"/><rect x="8" y="33" width="14" height="6" rx="2" fill="${palette.ink}"/><rect x="24" y="33" width="14" height="6" rx="2" fill="${palette.ink}"/></g>`;
}

function serviceWeapon(pose, palette, accent, width = 4) {
  return `<g data-equipment="service-weapon"><path d="M${pose.shoulderX} ${pose.shoulderY} L${pose.weaponX} ${pose.weaponY}" stroke="${palette.ink}" stroke-width="${width + 2}" stroke-linecap="square"/><path d="M${pose.shoulderX} ${pose.shoulderY} L${pose.weaponX} ${pose.weaponY}" stroke="${palette.equipment}" stroke-width="${width}" stroke-linecap="square"/><rect x="${pose.shoulderX - 3}" y="${pose.shoulderY + 2}" width="7" height="5" fill="${accent}"/></g>`;
}

function roleMark(unit, pose, palette) {
  const accent = palette[unit.accent];
  const vx = pose.vector.x;
  const vy = pose.vector.y;
  if (unit.equipment === 'tool') {
    const x2 = 13 - vx * 8;
    const y2 = 24 - vy * 6;
    return `<g data-role="tool"><path d="M15 27 L${x2} ${y2}" stroke="${palette.equipment}" stroke-width="4"/><path d="M${x2 - 3} ${y2 - 2} L${x2 + 4} ${y2 + 3}" stroke="${accent}" stroke-width="4"/></g>`;
  }
  if (unit.equipment === 'launcher') return `${serviceWeapon(pose, palette, accent, 6)}<rect x="10" y="22" width="7" height="11" rx="2" fill="${accent}" opacity=".8"/>`;
  if (unit.equipment === 'optic') return `${serviceWeapon(pose, palette, accent, 3)}<circle cx="${pose.shoulderX + pose.vector.x * 7}" cy="${pose.shoulderY + pose.vector.y * 5}" r="2.5" fill="${accent}" stroke="${palette.ink}"/>`;
  if (unit.equipment === 'medical') return `<g data-role="medical"><rect x="17" y="21" width="14" height="12" rx="2" fill="${palette.medical}" stroke="${palette.ink}"/><rect x="22" y="22" width="4" height="10" fill="${palette['medical-mark']}"/><rect x="19" y="25" width="10" height="4" fill="${palette['medical-mark']}"/></g>`;
  if (unit.equipment === 'sam') {
    const p1x = 16 + vx * 10;
    const p1y = 21 + vy * 8;
    const p2x = 20 + vx * 10;
    const p2y = 19 + vy * 8;
    return `<g data-role="sam"><path d="M13 29 L${p1x} ${p1y}" stroke="${palette.ink}" stroke-width="6"/><path d="M17 28 L${p2x} ${p2y}" stroke="${palette.ink}" stroke-width="6"/><path d="M13 29 L${p1x} ${p1y}" stroke="${palette.equipment}" stroke-width="2"/><path d="M17 28 L${p2x} ${p2y}" stroke="${palette.equipment}" stroke-width="2"/><rect x="11" y="27" width="9" height="5" fill="${accent}"/></g>`;
  }
  if (unit.equipment === 'radio') return `${serviceWeapon(pose, palette, accent, 3)}<g data-role="radio"><rect x="9" y="21" width="9" height="12" rx="2" fill="${palette.ink}"/><rect x="11" y="23" width="5" height="4" fill="${accent}"/><path d="M13 21 L11 8" stroke="${palette.equipment}" stroke-width="2"/></g>`;
  return serviceWeapon(pose, palette, accent, 3);
}

function renderBattleFrame(unit, state, direction, frameIndex, palette) {
  const motion = stateTransform(state, frameIndex);
  const pose = directionalPose(direction, motion.recoil);
  const uniform = motion.damaged || motion.death || motion.wreck ? palette['uniform-dark'] : palette['uniform-base'];
  const light = motion.damaged || motion.wreck ? palette.shadow : palette['uniform-light'];
  const accent = palette[unit.accent];
  const body = motion.prone ? proneBody(palette, uniform, light) : standingBody(motion, pose, palette, uniform, light);
  const equipment = motion.prone ? '' : roleMark(unit, pose, palette);
  const muzzle = state === 'attack' && frameIndex === 1
    ? `<g data-effect="muzzle"><circle cx="${pose.weaponX}" cy="${pose.weaponY}" r="4" fill="${palette['ukrainian-yellow']}"/><rect x="${pose.weaponX - 1.5}" y="${pose.weaponY - 1.5}" width="3" height="3" fill="#fff1aa"/></g>`
    : '';
  const damage = motion.hit
    ? `<path d="M11 18 L17 21 L13 26 L19 28 L15 33 L8 27 Z" fill="${palette.damage}" opacity=".9"/>`
    : motion.damaged
      ? `<path d="M15 26 L20 22 L25 26 L22 33 L14 31 Z" fill="${palette.damage}" opacity=".58"/>`
      : '';
  const corpseRotation = motion.prone ? motion.fall ?? 0 : Math.min(16, motion.fall ?? 0);
  return `<g data-presentation="${BATTLEFIELD_PRESENTATION.revision}" data-direction="${direction}" opacity="${motion.opacity}">
    <ellipse cx="24" cy="40" rx="14" ry="5" fill="${palette.ink}" opacity=".34"/>
    <g transform="translate(0 ${motion.bob}) rotate(${corpseRotation} 24 29)">
      ${body}${equipment}<rect x="28" y="29" width="6" height="7" fill="${palette['ukrainian-blue']}"/><rect x="28" y="33" width="6" height="3" fill="${palette['ukrainian-yellow']}"/>${damage}${muzzle}
    </g>
  </g>`;
}

function renderPortrait(unit, palette) {
  const accent = palette[unit.accent];
  return `<rect width="48" height="48" fill="${palette.shadow}"/><path d="M4 46V31q2-13 20-13t20 13v15z" fill="${palette['uniform-base']}"/><path d="M7 44V32q3-9 13-12v24z" fill="${palette['uniform-light']}"/><path d="M20 20q4-3 8 0l6 24H20z" fill="${palette['uniform-dark']}" opacity=".72"/><circle cx="24" cy="14" r="10" fill="${palette['uniform-light']}"/><path d="M14 13q10-13 20 0v5H14z" fill="${palette['uniform-dark']}"/><rect x="18" y="14" width="4" height="2" fill="${palette.ink}"/><rect x="27" y="14" width="4" height="2" fill="${palette.ink}"/><rect x="21" y="22" width="7" height="3" fill="${palette['uniform-dark']}"/><rect x="34" y="28" width="9" height="11" fill="${accent}"/><rect x="35" y="29" width="7" height="4" fill="${palette['ukrainian-blue']}"/><rect x="35" y="34" width="7" height="4" fill="${palette['ukrainian-yellow']}"/>`;
}

function renderIcon(unit, palette) {
  const accent = palette[unit.accent];
  return `<rect width="48" height="48" rx="4" fill="${palette.shadow}"/><rect x="4" y="4" width="40" height="40" rx="3" fill="${palette['uniform-dark']}" stroke="${palette.equipment}" stroke-width="2"/><circle cx="24" cy="15" r="8" fill="${palette['uniform-light']}"/><path d="M12 39q2-15 12-15t12 15z" fill="${palette['uniform-base']}"/><rect x="17" y="27" width="14" height="10" fill="${accent}" opacity=".7"/><rect x="7" y="39" width="17" height="3" fill="${palette['ukrainian-blue']}"/><rect x="24" y="39" width="17" height="3" fill="${palette['ukrainian-yellow']}"/>`;
}

function frameRecord(id, x, y, width, height, tags, attachments = {}) {
  return {
    id,
    rect: { x, y, w: width, h: height },
    sourceSize: { w: width, h: height },
    offset: { x: 0, y: 0 },
    anchor: { x: width / 2, y: height - 4 },
    attachments: {
      center: { x: width / 2, y: height / 2 },
      selection: { x: width / 2, y: height - 8 },
      shadow: { x: width / 2, y: height - 7 },
      ...attachments,
    },
    masks: {
      hit: { x: 6, y: 4, w: width - 12, h: height - 7 },
      selection: { x: 6, y: 8, w: width - 12, h: height - 10 },
    },
    tags,
  };
}

function makeCell(index, columns, width, height) {
  return { x: (index % columns) * width, y: Math.floor(index / columns) * height };
}

export function generateUkrainianInfantryAtlas(sourceValue) {
  const source = validateSource(structuredClone(sourceValue));
  const width = source.frame.width;
  const height = source.frame.height;
  const columns = source.frame.columns;
  const frames = {};
  const animations = {};
  const aliases = {};
  const cells = [];
  const definitions = [];
  let index = 0;

  const missingCell = makeCell(index++, columns, width, height);
  definitions.push(`<g id="missing-frame"><rect width="48" height="48" fill="#ff4fa3"/><path d="M6 6l36 36M42 6L6 42" stroke="#fff" stroke-width="5"/><rect x="2" y="2" width="44" height="44" fill="none" stroke="#111512" stroke-width="3"/></g>`);
  cells.push({ x: missingCell.x, y: missingCell.y, definition: 'missing-frame' });
  frames.missing = frameRecord('missing', missingCell.x, missingCell.y, width, height, ['fallback', 'diagnostic']);

  for (const unit of source.units) {
    aliases[unit.id] = unit.id;
    for (const alias of unit.aliases) aliases[alias] = unit.id;
    for (const state of REQUIRED_STATES) {
      const definition = source.states[state];
      const directions = {};
      for (const direction of DIRECTIONS) {
        directions[direction] = [];
        for (let frameIndex = 0; frameIndex < definition.frames; frameIndex += 1) {
          const id = `${unit.id}.${state}.${direction}.f${String(frameIndex).padStart(2, '0')}`;
          const cell = makeCell(index++, columns, width, height);
          const pose = directionalPose(direction, state === 'attack' && frameIndex === 1 ? 2.4 : 0);
          frames[id] = frameRecord(
            id,
            cell.x,
            cell.y,
            width,
            height,
            ['ukraine', 'infantry', unit.role, state, direction, BATTLEFIELD_PRESENTATION.revision],
            { muzzle: { x: pose.weaponX, y: pose.weaponY } },
          );
          directions[direction].push({ frame: id, durationMs: definition.durationsMs[frameIndex] });
          const definitionId = `${unit.id.replaceAll('.', '-')}-${state}-${direction}-f${frameIndex}`;
          definitions.push(`<g id="${definitionId}">${renderBattleFrame(unit, state, direction, frameIndex, source.paletteTokens)}</g>`);
          cells.push({ x: cell.x, y: cell.y, definition: definitionId });
        }
      }
      animations[`${unit.id}.${state}`] = {
        id: `${unit.id}.${state}`,
        loop: definition.loop,
        defaultDurationMs: definition.durationsMs[0],
        directions,
      };
    }

    for (const kind of ['portrait', 'icon']) {
      const id = `${unit.id}.${kind}`;
      const cell = makeCell(index++, columns, width, height);
      frames[id] = frameRecord(id, cell.x, cell.y, width, height, ['ukraine', 'infantry', unit.role, kind]);
      const definitionId = `${unit.id.replaceAll('.', '-')}-${kind}`;
      definitions.push(`<g id="${definitionId}">${kind === 'portrait' ? renderPortrait(unit, source.paletteTokens) : renderIcon(unit, source.paletteTokens)}</g>`);
      cells.push({ x: cell.x, y: cell.y, definition: definitionId });
    }
  }

  const rows = Math.ceil(index / columns);
  const imageWidth = columns * width;
  const imageHeight = rows * height;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" data-presentation="${BATTLEFIELD_PRESENTATION.revision}" data-directional-body="fixed-upright" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" shape-rendering="crispEdges"><defs>${definitions.join('')}</defs>${cells.map((cell) => `<use href="#${cell.definition}" transform="translate(${cell.x} ${cell.y})"/>`).join('')}</svg>\n`;
  const manifestObject = {
    schema: ATLAS_SCHEMA,
    version: 1,
    id: source.id,
    sampling: 'nearest',
    image: { src: 'ukrainian-infantry.svg', width: imageWidth, height: imageHeight, pixelRatio: 1 },
    directions: { order: DIRECTIONS, zero: 'n', clockwise: true },
    paletteTokens: source.paletteTokens,
    frames,
    animations,
    fallback: { frame: 'missing' },
  };

  const contactWidth = 7 * 150;
  const contactHeight = 8 * 88;
  const samples = ['portrait', 'icon', 'idle', 'move', 'attack', 'damaged', 'death', 'wreck'];
  const contactSheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${contactWidth}" height="${contactHeight}" viewBox="0 0 ${contactWidth} ${contactHeight}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#101510"/>${source.units.map((unit, column) => samples.map((sample, row) => {
    const x = column * 150;
    const y = row * 88;
    const content = sample === 'portrait' ? renderPortrait(unit, source.paletteTokens) : sample === 'icon' ? renderIcon(unit, source.paletteTokens) : renderBattleFrame(unit, sample, 'se', 0, source.paletteTokens);
    return `<g transform="translate(${x} ${y})"><rect x="1" y="1" width="148" height="86" fill="#172019" stroke="#9a8353"/><g transform="translate(51 8) scale(1.45)">${content}</g><path d="M8 76h134" stroke="#9a8353"/><rect x="8" y="79" width="${Math.max(12, Math.min(132, unit.shortName.length * 5))}" height="3" fill="${source.paletteTokens[unit.accent]}"/></g>`;
  }).join('')).join('')}</svg>\n`;

  const catalog = {
    schema: 'fields-of-resolve.ukrainian-infantry-atlas-catalog',
    version: 1,
    atlasId: source.id,
    canonicalUnitIds: source.units.map((unit) => unit.id),
    aliases,
    states: REQUIRED_STATES,
    directions: DIRECTIONS,
    portraits: Object.fromEntries(source.units.map((unit) => [unit.id, `${unit.id}.portrait`])),
    icons: Object.fromEntries(source.units.map((unit) => [unit.id, `${unit.id}.icon`])),
    provenance: source.provenance,
    counts: {
      units: source.units.length,
      battleFrames: Object.values(frames).filter((frame) => frame.tags.includes('infantry') && !frame.tags.includes('portrait') && !frame.tags.includes('icon')).length,
      totalFrames: Object.keys(frames).length,
      animations: Object.keys(animations).length,
    },
  };

  return Object.freeze({
    source,
    manifest: stableJson(manifestObject),
    manifestObject,
    svg,
    contactSheet,
    catalog: stableJson(catalog),
    catalogObject: catalog,
  });
}

export const UKRAINIAN_INFANTRY_ART_SOURCE_SCHEMA = SOURCE_SCHEMA;
export const UKRAINIAN_INFANTRY_REQUIRED_STATES = REQUIRED_STATES;
export const UKRAINIAN_INFANTRY_DIRECTIONS = DIRECTIONS;
export const UKRAINIAN_INFANTRY_BATTLEFIELD_PRESENTATION = BATTLEFIELD_PRESENTATION;
