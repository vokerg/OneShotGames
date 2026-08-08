const SOURCE_SCHEMA = 'fields-of-resolve.russian-vehicle-art-source';
export const RUSSIAN_VEHICLE_DIRECTIONS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export const RUSSIAN_VEHICLE_REQUIRED_STATES = Object.freeze(['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck']);

const DIRECTION_ANGLES = Object.freeze({ n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 });

function assertSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('Russian vehicle source must be an object.');
  if (source.schema !== SOURCE_SCHEMA || source.version !== 1) throw new TypeError('Unsupported Russian vehicle art source schema.');
  if (!Array.isArray(source.units) || source.units.length !== 5) throw new RangeError('Russian vehicle source must define exactly five vehicle identities.');
  if (new Set(source.units.map((unit) => unit.id)).size !== source.units.length) throw new Error('Russian vehicle unit IDs must be unique.');
  if (source.directions?.join('|') !== RUSSIAN_VEHICLE_DIRECTIONS.join('|')) throw new Error('Russian vehicle directions must use the canonical eight-direction order.');
  for (const state of RUSSIAN_VEHICLE_REQUIRED_STATES) {
    const definition = source.states?.[state];
    if (!definition || !Number.isInteger(definition.frames) || definition.frames < 1) throw new Error(`Missing Russian vehicle state: ${state}`);
    if (!Array.isArray(definition.durationsMs) || definition.durationsMs.length !== definition.frames) throw new Error(`${state} durations must match frame count.`);
  }
  for (const unit of source.units) {
    if (!unit.id.startsWith('ru.')) throw new Error(`Russian vehicle unit ID must start with ru.: ${unit.id}`);
    if (!unit.displayName || !unit.role || !unit.profile || !unit.accent) throw new Error(`Russian vehicle identity is incomplete: ${unit.id}`);
  }
  if (!source.provenance?.license || !Array.isArray(source.provenance.externalInputs)) throw new Error('Russian vehicle source requires provenance and external input disclosure.');
  return source;
}

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function token(source, key, fallback) {
  return source.paletteTokens?.[key] ?? fallback;
}

function profileSvg(unit, p, recoil = 0) {
  const stowage = `<g data-detail="stowage"><rect x="20" y="39" width="7" height="5" rx="1" fill="${p.deep}"/><rect x="29" y="39" width="8" height="5" rx="1" fill="${p.shadow}"/><path d="M20 37 H40" stroke="${p.metal}" stroke-width="1" opacity=".65"/></g>`;
  if (unit.profile === 'apc') {
    return `${stowage}<g data-profile="apc"><rect x="23" y="22" width="21" height="18" rx="5" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><circle cx="34" cy="29" r="5" fill="${p.deep}"/><path d="M38 28 L54 ${24 + recoil}" stroke="${p.ink}" stroke-width="5"/><path d="M39 27 L55 ${23 + recoil}" stroke="${p.metal}" stroke-width="2"/><rect x="25" y="23" width="6" height="4" fill="${p.optic}"/><rect x="40" y="34" width="5" height="4" fill="${p.accent}"/></g>`;
  }
  if (unit.profile === 'ifv') {
    return `${stowage}<g data-profile="ifv"><path d="M23 25 L31 20 L43 23 L47 31 L42 40 L27 40 L20 34 Z" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><circle cx="34" cy="30" r="6" fill="${p.deep}"/><rect x="29" y="25" width="7" height="5" fill="${p.optic}"/><path d="M38 27 L59 ${24 + recoil}" stroke="${p.ink}" stroke-width="6"/><path d="M41 26 L60 ${23 + recoil}" stroke="${p.metal}" stroke-width="2"/><path d="M43 34 L54 39" stroke="${p.deep}" stroke-width="4"/><circle cx="52" cy="38" r="2.5" fill="${p.accent}"/></g>`;
  }
  if (unit.profile === 'tank') {
    return `${stowage}<g data-profile="tank"><path d="M20 25 L29 19 L43 20 L50 27 L47 39 L37 44 L24 40 L17 33 Z" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><circle cx="34" cy="30" r="6" fill="${p.deep}"/><path d="M38 27 L63 ${22 + recoil}" stroke="${p.ink}" stroke-width="7"/><path d="M42 26 L63 ${21 + recoil}" stroke="${p.metal}" stroke-width="2"/><g data-detail="era"><rect x="19" y="27" width="6" height="5" fill="${p.shadow}"/><rect x="25" y="22" width="6" height="5" fill="${p.shadow}"/><rect x="39" y="22" width="6" height="5" fill="${p.shadow}"/><rect x="44" y="28" width="6" height="5" fill="${p.shadow}"/></g><rect x="30" y="21" width="5" height="4" fill="${p.optic}"/></g>`;
  }
  if (unit.profile === 'recovery') {
    return `${stowage}<g data-profile="recovery"><rect x="21" y="22" width="25" height="18" rx="3" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><path d="M28 25 L47 8 L54 14 L42 32" fill="none" stroke="${p.ink}" stroke-width="7"/><path d="M29 24 L48 9 L53 14 L41 31" fill="none" stroke="${p.metal}" stroke-width="3"/><path d="M51 12 L57 29" stroke="${p.metal}" stroke-width="2"/><circle cx="57" cy="31" r="3" fill="${p.accent}"/><rect x="23" y="25" width="8" height="6" fill="${p.deep}"/><path d="M18 42 H49" stroke="${p.accent}" stroke-width="3"/></g>`;
  }
  return `${stowage}<g data-profile="engineering"><rect x="21" y="22" width="25" height="18" rx="3" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><rect x="27" y="25" width="10" height="8" fill="${p.deep}"/><path d="M45 18 L61 13 L61 48 L45 43 Z" fill="${p.accent}" stroke="${p.ink}" stroke-width="2"/><path d="M48 23 L58 19 M48 31 L58 29 M48 39 L58 41" stroke="${p.deep}" stroke-width="2"/><path d="M18 38 L10 48 M26 40 L19 53" stroke="${p.metal}" stroke-width="3"/></g>`;
}

function renderVehicleFrame(source, unit, state, direction, frameIndex) {
  const angle = DIRECTION_ANGLES[direction];
  const p = {
    ink: token(source, 'ink', '#111512'), deep: token(source, 'deep', '#2a211b'), shadow: token(source, 'shadow', '#41342a'),
    base: token(source, unit.accent, token(source, 'base', '#6c5947')), light: token(source, 'light', '#94775a'), metal: token(source, 'metal', '#918d7d'),
    accent: token(source, 'accent', '#cdbd9d'), optic: token(source, 'optic', '#786957'), track: token(source, 'track', '#252421'),
    damage: token(source, 'damage', '#d95f45'), smoke: token(source, 'smoke', '#625d58'),
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
    <ellipse cx="31" cy="52" rx="23" ry="7" fill="rgba(0,0,0,.32)"/>
    <rect x="7" y="17" width="12" height="33" rx="4" fill="${p.track}" stroke="${p.ink}" stroke-width="2"/>
    <rect x="45" y="17" width="12" height="33" rx="4" fill="${p.track}" stroke="${p.ink}" stroke-width="2"/>
    <g data-detail="tracks" stroke="${p.metal}" stroke-width="2" opacity=".68"><path d="M9 ${20 + (treadShift % 6)} H17 M9 ${28 + (treadShift % 6)} H17 M9 ${36 + (treadShift % 6)} H17 M9 ${44 + (treadShift % 6)} H17 M47 ${20 + (treadShift % 6)} H55 M47 ${28 + (treadShift % 6)} H55 M47 ${36 + (treadShift % 6)} H55 M47 ${44 + (treadShift % 6)} H55"/></g>
    <path d="M16 14 L46 14 L51 22 L49 46 L42 52 L20 52 L13 44 L13 22 Z" fill="${body}" stroke="${p.ink}" stroke-width="3"/>
    <path d="M17 18 L44 18 L47 24 L45 29 L16 29 Z" fill="${p.light}" opacity=".55"/>
    <g data-detail="hull-panels"><path d="M17 33 H46 M21 47 H42" stroke="${p.deep}" stroke-width="2" opacity=".75"/><rect x="17" y="20" width="5" height="4" fill="${p.accent}"/><rect x="40" y="20" width="5" height="4" fill="${p.accent}"/><rect x="18" y="43" width="7" height="5" fill="${p.shadow}"/></g>
    ${profileSvg(unit, p, recoil)}
    ${damageMarks}${smoke}${sparks}${blast}
  </g>`;
}

function renderPortrait(source, unit) {
  return `<rect width="64" height="64" fill="#151311"/><rect x="3" y="3" width="58" height="58" fill="#29231d" stroke="${token(source, unit.accent, '#6c5947')}" stroke-width="3"/><g transform="translate(0 3)">${renderVehicleFrame(source, unit, 'idle', 'se', 0)}</g>`;
}

function renderIcon(source, unit) {
  const accent = token(source, unit.accent, '#6c5947');
  const glyph = unit.profile === 'tank' ? 'T' : unit.profile === 'ifv' ? 'I' : unit.profile === 'apc' ? 'P' : unit.profile === 'recovery' ? 'R' : 'E';
  return `<rect width="64" height="64" fill="#111512"/><rect x="10" y="13" width="44" height="38" rx="8" fill="${token(source, 'deep', '#2a211b')}" stroke="${accent}" stroke-width="4"/><circle cx="20" cy="52" r="5" fill="${token(source, 'track', '#252421')}"/><circle cx="44" cy="52" r="5" fill="${token(source, 'track', '#252421')}"/><text x="32" y="41" text-anchor="middle" font-family="monospace" font-size="25" font-weight="700" fill="${token(source, 'accent', '#cdbd9d')}">${glyph}</text>`;
}

function muzzleAttachment(direction, profile) {
  const radius = profile === 'tank' ? 31 : profile === 'ifv' ? 28 : profile === 'apc' ? 27 : 24;
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

export function generateRussianVehicleAtlas(input) {
  const source = assertSource(input);
  const columns = source.frame.columns;
  const cells = [{ id: 'missing', svg: '<rect width="64" height="64" fill="#111512"/><path d="M7 7 L57 57 M57 7 L7 57" stroke="#ff4fa3" stroke-width="7"/>', tags: ['fallback', 'diagnostic'], muzzle: { x: 32, y: 32 } }];
  const animations = {};
  const aliases = {};

  for (const unit of source.units) {
    aliases[unit.id] = unit.id;
    for (const alias of unit.aliases ?? []) aliases[alias] = unit.id;
    for (const state of RUSSIAN_VEHICLE_REQUIRED_STATES) {
      const definition = source.states[state];
      const directions = {};
      for (const direction of source.directions) {
        const sequence = [];
        for (let frameIndex = 0; frameIndex < definition.frames; frameIndex += 1) {
          const id = `${unit.id}.${state}.${direction}.f${String(frameIndex).padStart(2, '0')}`;
          cells.push({ id, svg: renderVehicleFrame(source, unit, state, direction, frameIndex), tags: ['russian-vehicle', unit.role, state, direction], muzzle: muzzleAttachment(direction, unit.profile) });
          sequence.push({ frame: id, durationMs: definition.durationsMs[frameIndex] });
        }
        directions[direction] = sequence;
      }
      animations[`${unit.id}.${state}`] = { loop: definition.loop, defaultDurationMs: definition.durationsMs[0], directions };
    }
    cells.push({ id: `${unit.id}.portrait`, svg: renderPortrait(source, unit), tags: ['portrait', unit.role], muzzle: { x: 32, y: 32 } });
    cells.push({ id: `${unit.id}.icon`, svg: renderIcon(source, unit), tags: ['icon', unit.role], muzzle: { x: 32, y: 32 } });
  }

  const rows = Math.ceil(cells.length / columns);
  const imageWidth = columns * 64;
  const imageHeight = rows * 64;
  const frames = Object.fromEntries(cells.map((cell, index) => [cell.id, frameRecord(cell.id, index, columns, cell.tags, cell.muzzle)]));
  const groups = cells.map((cell, index) => `<g id="${esc(cell.id)}" transform="translate(${(index % columns) * 64} ${Math.floor(index / columns) * 64})">${cell.svg}</g>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${imageWidth}" height="${imageHeight}" viewBox="0 0 ${imageWidth} ${imageHeight}" shape-rendering="crispEdges">${groups}</svg>`;

  return Object.freeze({
    source,
    svg,
    manifestObject: {
      schema: 'fields-of-resolve.sprite-atlas', version: 1, id: source.id, sampling: 'nearest',
      image: { src: 'russian-vehicles.svg', width: imageWidth, height: imageHeight, pixelRatio: 1 },
      directions: { order: [...source.directions], zero: 'n', clockwise: true }, paletteTokens: { ...source.paletteTokens },
      frames, animations, fallback: { frame: 'missing' },
    },
    catalogObject: {
      schema: 'fields-of-resolve.production-unit-art-catalog', version: 1, id: source.id, family: 'russian-vehicles',
      units: source.units.map((unit) => ({ ...unit })), aliases, provenance: { ...source.provenance },
      frameCount: cells.length, animationCount: Object.keys(animations).length,
    },
  });
}