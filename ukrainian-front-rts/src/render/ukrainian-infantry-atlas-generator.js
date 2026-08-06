const SOURCE_SCHEMA = 'fields-of-resolve.ukrainian-infantry-art-source';
const ATLAS_SCHEMA = 'fields-of-resolve.sprite-atlas';
const DIRECTIONS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
const DIRECTION_ANGLES = Object.freeze([0, 45, 90, 135, 180, 225, 270, 315]);
const REQUIRED_STATES = Object.freeze(['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck']);

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

function rotatePoint(x, y, degrees, cx = 24, cy = 24) {
  const radians = degrees * Math.PI / 180;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: Math.round((cx + dx * Math.cos(radians) - dy * Math.sin(radians)) * 1000) / 1000,
    y: Math.round((cy + dx * Math.sin(radians) + dy * Math.cos(radians)) * 1000) / 1000,
  };
}

function roleMark(unit, palette) {
  const accent = palette[unit.accent];
  switch (unit.equipment) {
    case 'tool':
      return `<path d="M14 31l13-18 4 3-13 18z" fill="${palette.equipment}"/><path d="M27 12l8-1-3 7z" fill="${accent}"/>`;
    case 'launcher':
      return `<rect x="18" y="8" width="8" height="24" fill="${palette.ink}"/><rect x="20" y="5" width="4" height="24" fill="${palette.equipment}"/><rect x="17" y="5" width="10" height="5" fill="${accent}"/>`;
    case 'optic':
      return `<rect x="19" y="9" width="10" height="18" fill="${palette.ink}"/><rect x="21" y="7" width="6" height="16" fill="${palette.equipment}"/><rect x="22" y="8" width="4" height="5" fill="${accent}"/>`;
    case 'medical':
      return `<rect x="15" y="19" width="18" height="15" fill="${palette.medical}"/><rect x="22" y="21" width="4" height="11" fill="${palette['medical-mark']}"/><rect x="18" y="25" width="12" height="4" fill="${palette['medical-mark']}"/>`;
    case 'sam':
      return `<rect x="17" y="7" width="5" height="25" fill="${palette.ink}"/><rect x="26" y="7" width="5" height="25" fill="${palette.ink}"/><path d="M16 8l3-6 4 6zM25 8l3-6 4 6z" fill="${accent}"/>`;
    case 'radio':
      return `<rect x="14" y="18" width="10" height="15" fill="${palette.ink}"/><rect x="16" y="20" width="6" height="5" fill="${accent}"/><rect x="19" y="8" width="2" height="12" fill="${palette.equipment}"/><path d="M29 13q8 5 0 10M31 10q13 8 0 16" fill="none" stroke="${accent}" stroke-width="2"/>`;
    default:
      return `<rect x="21" y="5" width="5" height="27" fill="${palette.ink}"/><rect x="23" y="4" width="2" height="22" fill="${palette.equipment}"/><rect x="16" y="27" width="9" height="7" fill="${accent}"/>`;
  }
}

function stateTransform(state, frameIndex) {
  if (state === 'move') {
    const phases = [-2, 0, 2, 0];
    const phase = phases[frameIndex % phases.length];
    return { bodyY: Math.abs(phase) * -0.5, leftLeg: phase, rightLeg: -phase, lean: phase * 0.5, opacity: 1 };
  }
  if (state === 'attack') {
    return { bodyY: 0, leftLeg: 0, rightLeg: 0, lean: [0, -2, 1][frameIndex] ?? 0, opacity: 1 };
  }
  if (state === 'hit') return { bodyY: 1, leftLeg: -1, rightLeg: 1, lean: 6, opacity: 1, hit: true };
  if (state === 'damaged') return { bodyY: 2, leftLeg: -1, rightLeg: 1, lean: 3, opacity: 0.92, damaged: true };
  if (state === 'death') return { bodyY: frameIndex * 3, leftLeg: 0, rightLeg: 0, lean: frameIndex * 28, opacity: 1 - frameIndex * 0.18, death: true };
  if (state === 'wreck') return { bodyY: 8, leftLeg: 0, rightLeg: 0, lean: 88, opacity: 0.62, wreck: true };
  return { bodyY: frameIndex % 2 ? -0.5 : 0, leftLeg: 0, rightLeg: 0, lean: 0, opacity: 1 };
}

function renderBattleFrame(unit, state, frameIndex, palette) {
  const motion = stateTransform(state, frameIndex);
  const uniform = motion.damaged || motion.death || motion.wreck ? palette['uniform-dark'] : palette['uniform-base'];
  const light = motion.damaged || motion.wreck ? palette.shadow : palette['uniform-light'];
  const muzzle = state === 'attack' && frameIndex === 1
    ? `<path d="M24 2l3 5-3 4-3-4z" fill="${palette['ukrainian-yellow']}"/><rect x="23" y="2" width="2" height="4" fill="#fff1aa"/>`
    : '';
  const damage = motion.hit
    ? `<path d="M12 12l5 3-4 4 6 2-3 5-8-5z" fill="${palette.damage}" opacity=".9"/>`
    : motion.damaged
      ? `<path d="M15 23l5-3 4 4-3 7-7-2z" fill="${palette.damage}" opacity=".62"/>`
      : '';
  const prone = motion.death || motion.wreck;
  const body = prone
    ? `<rect x="12" y="22" width="25" height="11" rx="2" fill="${uniform}"/><rect x="16" y="19" width="10" height="8" fill="${light}"/><circle cx="37" cy="27" r="6" fill="${light}"/>`
    : `<rect x="16" y="17" width="16" height="20" rx="2" fill="${uniform}"/><rect x="17" y="18" width="6" height="17" fill="${light}"/><rect x="25" y="19" width="6" height="16" fill="${palette['uniform-dark']}"/><path d="M17 16q7-9 14 0v4H17z" fill="${light}"/><rect x="19" y="14" width="10" height="5" fill="${light}"/><rect x="16" y="35" width="6" height="8" fill="${palette.ink}" transform="translate(${motion.leftLeg} 0)"/><rect x="26" y="35" width="6" height="8" fill="${palette.ink}" transform="translate(${motion.rightLeg} 0)"/>`;
  return `<g opacity="${motion.opacity}"><ellipse cx="24" cy="41" rx="13" ry="4" fill="${palette.ink}" opacity=".45"/><g transform="translate(0 ${motion.bodyY}) rotate(${motion.lean} 24 28)">${body}${roleMark(unit, palette)}<rect x="30" y="29" width="5" height="7" fill="${palette['ukrainian-blue']}"/><rect x="30" y="33" width="5" height="3" fill="${palette['ukrainian-yellow']}"/>${damage}${muzzle}</g></g>`;
}

function renderPortrait(unit, palette) {
  const accent = palette[unit.accent];
  return `<rect width="48" height="48" fill="${palette.shadow}"/><path d="M6 43V27q2-11 18-11t18 11v16z" fill="${palette['uniform-base']}"/><path d="M9 42V29q3-8 11-10v23z" fill="${palette['uniform-light']}"/><circle cx="24" cy="15" r="9" fill="${palette['uniform-light']}"/><path d="M15 14q9-12 18 0v4H15z" fill="${palette['uniform-dark']}"/><rect x="19" y="15" width="3" height="2" fill="${palette.ink}"/><rect x="27" y="15" width="3" height="2" fill="${palette.ink}"/><rect x="21" y="22" width="7" height="2" fill="${palette['uniform-dark']}"/><rect x="34" y="27" width="7" height="9" fill="${accent}"/><rect x="35" y="28" width="5" height="3" fill="${palette['ukrainian-blue']}"/><rect x="35" y="32" width="5" height="3" fill="${palette['ukrainian-yellow']}"/>`;
}

function renderIcon(unit, palette) {
  const accent = palette[unit.accent];
  return `<rect width="48" height="48" rx="4" fill="${palette.shadow}"/><rect x="4" y="4" width="40" height="40" rx="3" fill="${palette['uniform-dark']}" stroke="${palette.equipment}" stroke-width="2"/><circle cx="24" cy="17" r="7" fill="${palette['uniform-light']}"/><path d="M13 39q1-14 11-14t11 14z" fill="${palette['uniform-base']}"/>${roleMark(unit, { ...palette, ink: accent, equipment: accent })}<rect x="7" y="37" width="15" height="3" fill="${palette['ukrainian-blue']}"/><rect x="22" y="37" width="19" height="3" fill="${palette['ukrainian-yellow']}"/>`;
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
      hit: { x: 6, y: 5, w: width - 12, h: height - 9 },
      selection: { x: 7, y: 12, w: width - 14, h: height - 15 },
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
  const definitionIds = new Set();
  let index = 0;

  const missingCell = makeCell(index++, columns, width, height);
  definitions.push('<g id="missing-frame"><rect width="48" height="48" fill="#ff4fa3"/><path d="M6 6l36 36M42 6L6 42" stroke="#fff" stroke-width="5"/><rect x="2" y="2" width="44" height="44" fill="none" stroke="#111512" stroke-width="3"/></g>');
  cells.push({ x: missingCell.x, y: missingCell.y, definition: 'missing-frame', angle: 0 });
  frames.missing = frameRecord('missing', missingCell.x, missingCell.y, width, height, ['fallback', 'diagnostic']);

  for (const unit of source.units) {
    aliases[unit.id] = unit.id;
    for (const alias of unit.aliases) aliases[alias] = unit.id;
    for (const state of REQUIRED_STATES) {
      const definition = source.states[state];
      const directions = {};
      for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
        const direction = DIRECTIONS[directionIndex];
        directions[direction] = [];
        for (let frameIndex = 0; frameIndex < definition.frames; frameIndex += 1) {
          const id = `${unit.id}.${state}.${direction}.f${String(frameIndex).padStart(2, '0')}`;
          const cell = makeCell(index++, columns, width, height);
          const muzzle = rotatePoint(24, 3, DIRECTION_ANGLES[directionIndex]);
          frames[id] = frameRecord(id, cell.x, cell.y, width, height, ['ukraine', 'infantry', unit.role, state, direction], { muzzle });
          directions[direction].push({ frame: id, durationMs: definition.durationsMs[frameIndex] });
          const definitionId = `${unit.id.replaceAll('.', '-')}-${state}-f${frameIndex}`;
          if (!definitionIds.has(definitionId)) {
            definitionIds.add(definitionId);
            definitions.push(`<g id="${definitionId}">${renderBattleFrame(unit, state, frameIndex, source.paletteTokens)}</g>`);
          }
          cells.push({ x: cell.x, y: cell.y, definition: definitionId, angle: DIRECTION_ANGLES[directionIndex] });
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
      const definition = `${unit.id.replaceAll('.', '-')}-${kind}`;
      if (!definitionIds.has(definition)) {
        definitionIds.add(definition);
        definitions.push(`<g id="${definition}">${kind === 'portrait' ? renderPortrait(unit, source.paletteTokens) : renderIcon(unit, source.paletteTokens)}</g>`);
      }
      cells.push({ x: cell.x, y: cell.y, definition, angle: 0 });
    }
  }

  const rows = Math.ceil(index / columns);
  const imageWidth = columns * width;
  const imageHeight = rows * height;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" shape-rendering="crispEdges"><defs>${definitions.join('')}</defs>${cells.map((cell) => `<use href="#${cell.definition}" transform="translate(${cell.x} ${cell.y}) rotate(${cell.angle} 24 24)"/>`).join('')}</svg>\n`;
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
    const content = sample === 'portrait' ? renderPortrait(unit, source.paletteTokens) : sample === 'icon' ? renderIcon(unit, source.paletteTokens) : renderBattleFrame(unit, sample, 0, source.paletteTokens);
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
