const SOURCE_SCHEMA = 'fields-of-resolve.ukrainian-vehicle-art-source';
export const UKRAINIAN_VEHICLE_DIRECTIONS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export const UKRAINIAN_VEHICLE_REQUIRED_STATES = Object.freeze(['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck']);

const DIRECTION_ANGLES = Object.freeze({ n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 });

function assertSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('Ukrainian vehicle source must be an object.');
  if (source.schema !== SOURCE_SCHEMA || source.version !== 1) throw new TypeError('Unsupported Ukrainian vehicle art source schema.');
  if (!Array.isArray(source.units) || source.units.length !== 5) throw new RangeError('Ukrainian vehicle source must define exactly five vehicle identities.');
  if (new Set(source.units.map((unit) => unit.id)).size !== source.units.length) throw new Error('Ukrainian vehicle unit IDs must be unique.');
  if (source.directions?.join('|') !== UKRAINIAN_VEHICLE_DIRECTIONS.join('|')) throw new Error('Ukrainian vehicle directions must use the canonical eight-direction order.');
  for (const state of UKRAINIAN_VEHICLE_REQUIRED_STATES) {
    const definition = source.states?.[state];
    if (!definition || !Number.isInteger(definition.frames) || definition.frames < 1) throw new Error(`Missing Ukrainian vehicle state: ${state}`);
    if (!Array.isArray(definition.durationsMs) || definition.durationsMs.length !== definition.frames) throw new Error(`${state} durations must match frame count.`);
  }
  for (const unit of source.units) {
    if (!unit.id.startsWith('ua.')) throw new Error(`Ukrainian vehicle unit ID must start with ua.: ${unit.id}`);
    if (!unit.displayName || !unit.role || !unit.profile || !unit.accent) throw new Error(`Ukrainian vehicle identity is incomplete: ${unit.id}`);
  }
  if (!source.provenance?.license || !Array.isArray(source.provenance.externalInputs)) throw new Error('Ukrainian vehicle source requires provenance and external input disclosure.');
  return source;
}

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function token(source, key, fallback) {
  return source.paletteTokens?.[key] ?? fallback;
}

function profileSvg(unit, p, recoil = 0) {
  if (unit.profile === 'apc') {
    return `<rect x="28" y="24" width="14" height="16" rx="5" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><circle cx="35" cy="31" r="4" fill="${p.deep}"/><path d="M39 29 L55 24" stroke="${p.metal}" stroke-width="3"/>`;
  }
  if (unit.profile === 'ifv') {
    return `<circle cx="34" cy="31" r="10" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><rect x="31" y="27" width="7" height="8" fill="${p.optic}"/><path d="M39 29 L58 ${27 + recoil}" stroke="${p.deep}" stroke-width="5"/><path d="M42 28 L59 ${26 + recoil}" stroke="${p.metal}" stroke-width="2"/>`;
  }
  if (unit.profile === 'tank') {
    return `<path d="M24 24 L39 21 L47 28 L44 39 L28 42 L20 35 Z" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><circle cx="34" cy="31" r="5" fill="${p.deep}"/><path d="M39 28 L62 ${24 + recoil}" stroke="${p.deep}" stroke-width="6"/><path d="M43 27 L63 ${23 + recoil}" stroke="${p.metal}" stroke-width="2"/>`;
  }
  if (unit.profile === 'recovery') {
    return `<rect x="24" y="24" width="18" height="14" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><path d="M31 25 L48 10 L54 16 L43 31" fill="none" stroke="${p.deep}" stroke-width="5"/><path d="M50 13 L56 28" stroke="${p.metal}" stroke-width="2"/><circle cx="56" cy="30" r="3" fill="${p.accent}"/>`;
  }
  return `<rect x="25" y="24" width="18" height="15" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><path d="M45 21 L61 16 L61 45 L45 41 Z" fill="${p.accent}" stroke="${p.ink}" stroke-width="2"/><path d="M47 26 L58 23 M47 36 L58 38" stroke="${p.deep}" stroke-width="2"/>`;
}

function renderVehicleFrame(source, unit, state, direction, frameIndex) {
  const angle = DIRECTION_ANGLES[direction];
  const p = {
    ink: token(source, 'ink', '#111512'), deep: token(source, 'deep', '#18271f'), shadow: token(source, 'shadow', '#293c30'),
    base: token(source, unit.accent, token(source, 'base', '#50684c')), light: token(source, 'light', '#81956a'), metal: token(source, 'metal', '#9aa291'),
    accent: token(source, 'accent', '#e4ca54'), optic: token(source, 'optic', '#4e8db2'), track: token(source, 'track', '#252a25'),
    damage: token(source, 'damage', '#d95f45'), smoke: token(source, 'smoke', '#5d625d'),
  };
  const treadShift = state === 'move' ? frameIndex * 3 : 0;
  const recoil = state === 'attack' ? [0, 3, 1][frameIndex] ?? 0 : 0;
  const impact = state === 'hit' && frameIndex === 0 ? -2 : 0;
  const death = state === 'death' ? frameIndex / 5 : 0;
  const wreck = state === 'wreck';
  const body = wreck ? p.shadow : p.base;
  const smoke = state === 'damaged' || (state === 'death' && frameIndex > 1) || wreck
    ? `<g opacity="${wreck ? 0.45 : 0.7}"><circle cx="18" cy="15" r="5" fill="${p.smoke}"/><circle cx="14" cy="10" r="4" fill="${p.smoke}"/><circle cx="21" cy="8" r="3" fill="${p.smoke}"/></g>` : '';
  const sparks = state === 'hit' ? `<path d="M46 17 l8 -8 M47 20 l11 -1 M44 14 l2 -10" stroke="#f2d57a" stroke-width="2"/>` : '';
  const blast = state === 'death' && frameIndex < 4
    ? `<circle cx="34" cy="29" r="${8 + frameIndex * 5}" fill="${frameIndex < 2 ? '#f2d57a' : p.damage}" opacity="${0.85 - frameIndex * 0.14}"/><path d="M34 4 L39 18 L53 10 L45 24 L61 28 L45 33 L52 49 L38 40 L31 57 L28 40 L11 50 L21 34 L5 29 L22 24 L12 10 L28 18 Z" fill="${p.damage}" opacity="${0.65 - frameIndex * 0.12}"/>` : '';
  const damageMarks = state === 'damaged' || state === 'hit' || state === 'death' || wreck
    ? `<path d="M20 22 L29 31 L24 39 M43 20 L36 29 L44 35" stroke="${p.damage}" stroke-width="2.5" fill="none"/>` : '';
  const corpseTilt = wreck ? 5 : death * 10;
  return `<g transform="rotate(${angle} 32 32) translate(${impact} 0) rotate(${corpseTilt} 32 32)">
    <ellipse cx="31" cy="51" rx="22" ry="7" fill="rgba(0,0,0,.3)"/>
    <rect x="8" y="18" width="11" height="31" rx="4" fill="${p.track}" stroke="${p.ink}" stroke-width="2"/>
    <rect x="45" y="18" width="11" height="31" rx="4" fill="${p.track}" stroke="${p.ink}" stroke-width="2"/>
    <g stroke="${p.metal}" stroke-width="2" opacity=".65">
      <path d="M10 ${21 + (treadShift % 6)} H17 M10 ${29 + (treadShift % 6)} H17 M10 ${37 + (treadShift % 6)} H17 M47 ${21 + (treadShift % 6)} H54 M47 ${29 + (treadShift % 6)} H54 M47 ${37 + (treadShift % 6)} H54"/>
    </g>
    <path d="M17 15 L45 15 L50 22 L48 46 L42 51 L20 51 L14 44 L14 22 Z" fill="${body}" stroke="${p.ink}" stroke-width="3"/>
    <path d="M18 19 L43 19 L46 24 L45 29 L17 29 Z" fill="${p.light}" opacity=".5"/>
    <rect x="18" y="43" width="27" height="5" fill="${p.deep}" opacity=".8"/>
    ${profileSvg(unit, p, recoil)}
    <rect x="19" y="17" width="5" height="4" fill="${p.accent}"/><rect x="38" y="17" width="5" height="4" fill="${p.accent}"/>
    ${damageMarks}${smoke}${sparks}${blast}
  </g>`;
}

function renderPortrait(source, unit) {
  return `<rect width="64" height="64" fill="#111713"/><rect x="3" y="3" width="58" height="58" fill="#202a22" stroke="${token(source, unit.accent, '#50684c')}" stroke-width="3"/><g transform="translate(0 3)">${renderVehicleFrame(source, unit, 'idle', 'se', 0)}</g>`;
}

function renderIcon(source, unit) {
  const accent = token(source, unit.accent, '#50684c');
  const glyph = unit.profile === 'tank' ? 'T' : unit.profile === 'ifv' ? 'I' : unit.profile === 'apc' ? 'P' : unit.profile === 'recovery' ? 'R' : 'E';
  return `<rect width="64" height="64" fill="#111512"/><rect x="10" y="13" width="44" height="38" rx="8" fill="${token(source, 'deep', '#18271f')}" stroke="${accent}" stroke-width="4"/><circle cx="20" cy="52" r="5" fill="${token(source, 'track', '#252a25')}"/><circle cx="44" cy="52" r="5" fill="${token(source, 'track', '#252a25')}"/><text x="32" y="41" text-anchor="middle" font-family="monospace" font-size="25" font-weight="700" fill="${token(source, 'accent', '#e4ca54')}">${glyph}</text>`;
}

function muzzleAttachment(direction, profile) {
  const radius = profile === 'tank' ? 31 : profile === 'ifv' ? 28 : 24;
  const radians = (DIRECTION_ANGLES[direction] * Math.PI) / 180;
  return { x: Number((32 + Math.cos(radians) * radius).toFixed(2)), y: Number((32 + Math.sin(radians) * radius).toFixed(2)) };
}

function frameRecord(id, index, columns, tags, muzzle) {
  return {
    id,
    rect: { x: (index % columns) * 64, y: Math.floor(index / columns) * 64, w: 64, h: 64 },
    sourceSize: { w: 64, h: 64 },
    offset: { x: 0, y: 0 },
    anchor: { x: 32, y: 55 },
    attachments: { center: { x: 32, y: 32 }, effect: { x: 32, y: 24 }, muzzle, selection: { x: 32, y: 50 }, shadow: { x: 32, y: 50 } },
    masks: { hit: { x: 6, y: 7, w: 52, h: 50 }, selection: { x: 7, y: 10, w: 50, h: 45 } },
    tags,
  };
}

export function generateUkrainianVehicleAtlas(input) {
  const source = assertSource(input);
  const columns = source.frame.columns;
  const cells = [{ id: 'missing', svg: '<rect width="64" height="64" fill="#111512"/><path d="M7 7 L57 57 M57 7 L7 57" stroke="#ff4fa3" stroke-width="7"/>', tags: ['fallback', 'diagnostic'], muzzle: { x: 32, y: 32 } }];
  const animations = {};
  const aliases = {};

  for (const unit of source.units) {
    aliases[unit.id] = unit.id;
    for (const alias of unit.aliases ?? []) aliases[alias] = unit.id;
    for (const state of UKRAINIAN_VEHICLE_REQUIRED_STATES) {
      const definition = source.states[state];
      const directions = {};
      for (const direction of source.directions) {
        const sequence = [];
        for (let frameIndex = 0; frameIndex < definition.frames; frameIndex += 1) {
          const id = `${unit.id}.${state}.${direction}.f${String(frameIndex).padStart(2, '0')}`;
          cells.push({
            id,
            svg: renderVehicleFrame(source, unit, state, direction, frameIndex),
            tags: ['ukrainian-vehicle', unit.role, state, direction],
            muzzle: muzzleAttachment(direction, unit.profile),
          });
          sequence.push({ frame: id, durationMs: definition.durationsMs[frameIndex] });
        }
        directions[direction] = sequence;
      }
      animations[`${unit.id}.${state}`] = {
        loop: definition.loop,
        defaultDurationMs: definition.durationsMs[0],
        directions,
      };
    }
    cells.push({ id: `${unit.id}.portrait`, svg: renderPortrait(source, unit), tags: ['portrait', unit.role], muzzle: { x: 32, y: 32 } });
    cells.push({ id: `${unit.id}.icon`, svg: renderIcon(source, unit), tags: ['icon', unit.role], muzzle: { x: 32, y: 32 } });
  }

  const rows = Math.ceil(cells.length / columns);
  const imageWidth = columns * 64;
  const imageHeight = rows * 64;
  const frames = Object.fromEntries(cells.map((cell, index) => [cell.id, frameRecord(cell.id, index, columns, cell.tags, cell.muzzle)]));
  const groups = cells.map((cell, index) => {
    const x = (index % columns) * 64;
    const y = Math.floor(index / columns) * 64;
    return `<g id="${esc(cell.id)}" transform="translate(${x} ${y})">${cell.svg}</g>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" shape-rendering="crispEdges">${groups}</svg>`;

  return Object.freeze({
    source,
    svg,
    manifestObject: {
      schema: 'fields-of-resolve.sprite-atlas',
      version: 1,
      id: source.id,
      sampling: 'nearest',
      image: { src: 'ukrainian-vehicles.svg', width: imageWidth, height: imageHeight, pixelRatio: 1 },
      directions: { order: [...source.directions], zero: 'n', clockwise: true },
      paletteTokens: { ...source.paletteTokens },
      frames,
      animations,
      fallback: { frame: 'missing' },
    },
    catalogObject: {
      schema: 'fields-of-resolve.production-unit-art-catalog',
      version: 1,
      id: source.id,
      family: 'ukrainian-vehicles',
      units: source.units.map((unit) => ({ ...unit })),
      aliases,
      provenance: { ...source.provenance },
      frameCount: cells.length,
      animationCount: Object.keys(animations).length,
    },
  });
}
