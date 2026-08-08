const SOURCE_SCHEMA = 'fields-of-resolve.russian-infantry-art-source';
export const RUSSIAN_INFANTRY_DIRECTIONS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export const RUSSIAN_INFANTRY_REQUIRED_STATES = Object.freeze(['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck']);

const DIRECTION_ANGLES = Object.freeze({ n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 });

function assertSource(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new TypeError('Russian infantry source must be an object.');
  if (source.schema !== SOURCE_SCHEMA || source.version !== 1) throw new TypeError('Unsupported Russian infantry art source schema.');
  if (!Array.isArray(source.units) || source.units.length !== 8) throw new RangeError('Russian infantry source must define exactly eight role identities.');
  if (new Set(source.units.map((unit) => unit.id)).size !== source.units.length) throw new Error('Russian infantry unit IDs must be unique.');
  if (source.directions?.join('|') !== RUSSIAN_INFANTRY_DIRECTIONS.join('|')) throw new Error('Russian infantry directions must use the canonical eight-direction order.');
  for (const state of RUSSIAN_INFANTRY_REQUIRED_STATES) {
    const definition = source.states?.[state];
    if (!definition || !Number.isInteger(definition.frames) || definition.frames < 1) throw new Error(`Missing Russian infantry state: ${state}`);
    if (!Array.isArray(definition.durationsMs) || definition.durationsMs.length !== definition.frames) throw new Error(`${state} durations must match frame count.`);
  }
  for (const unit of source.units) {
    if (!unit.id.startsWith('ru.')) throw new Error(`Russian infantry unit ID must start with ru.: ${unit.id}`);
    if (!unit.displayName || !unit.role || !unit.equipment || !unit.accent) throw new Error(`Russian infantry identity is incomplete: ${unit.id}`);
  }
  if (!source.provenance?.license || !Array.isArray(source.provenance.externalInputs)) throw new Error('Russian infantry source requires provenance and external input disclosure.');
  return source;
}

function esc(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function palette(source, key, fallback) {
  return source.paletteTokens?.[key] ?? fallback;
}

function equipmentSvg(unit, p) {
  if (unit.equipment === 'tool') return `<path d="M27 20 L38 10" stroke="${p.metal}" stroke-width="3"/><path d="M34 9 L41 15" stroke="${p.accent}" stroke-width="4"/>`;
  if (unit.equipment === 'radio') return `<rect x="10" y="17" width="6" height="11" fill="${p.deep}"/><path d="M13 17 L11 6" stroke="${p.metal}" stroke-width="1.5"/><circle cx="13" cy="14" r="2" fill="${p.accent}"/>`;
  if (unit.equipment === 'launcher') return `<rect x="23" y="18" width="19" height="5" rx="1" fill="${p.deep}" stroke="${p.ink}" stroke-width="1"/><rect x="34" y="16" width="5" height="9" fill="${p.accent}"/>`;
  if (unit.equipment === 'air-defense') return `<path d="M22 22 L40 8" stroke="${p.deep}" stroke-width="7"/><path d="M25 20 L42 7" stroke="${p.metal}" stroke-width="2"/><rect x="35" y="7" width="7" height="5" fill="${p.accent}" stroke="${p.ink}"/><circle cx="29" cy="15" r="2.5" fill="${p.optic}" stroke="${p.ink}"/>`;
  if (unit.equipment === 'optic') return `<path d="M24 20 L40 17" stroke="${p.deep}" stroke-width="4"/><circle cx="34" cy="17" r="3" fill="${p.optic}" stroke="${p.ink}"/>`;
  if (unit.equipment === 'medical') return `<rect x="12" y="20" width="12" height="11" fill="${p.medical}" stroke="${p.ink}"/><rect x="17" y="21" width="3" height="9" fill="${p.medicalMark}"/><rect x="14" y="24" width="9" height="3" fill="${p.medicalMark}"/>`;
  if (unit.equipment === 'grenade') return `<path d="M24 21 L39 14" stroke="${p.deep}" stroke-width="4"/><circle cx="15" cy="21" r="3" fill="${p.accent}" stroke="${p.ink}"/>`;
  return `<path d="M23 20 L41 15" stroke="${p.deep}" stroke-width="4"/><path d="M28 18 L40 15" stroke="${p.metal}" stroke-width="1.5"/>`;
}

function renderInfantryFrame(source, unit, state, direction, frameIndex) {
  const angle = DIRECTION_ANGLES[direction];
  const p = {
    ink: palette(source, 'ink', '#111512'), deep: palette(source, 'deep', '#2a211b'), shadow: palette(source, 'shadow', '#41342a'),
    base: palette(source, 'base', '#6c5947'), light: palette(source, 'light', '#94775a'), metal: palette(source, 'metal', '#918d7d'),
    accent: palette(source, unit.accent, palette(source, 'accent', '#cdbd9d')), optic: palette(source, 'optic', '#786957'),
    damage: palette(source, 'damage', '#d95f45'), medical: palette(source, 'medical', '#d7d9cf'), medicalMark: palette(source, 'medical-mark', '#9d3835'),
  };
  const move = state === 'move' ? Math.sin((frameIndex / 6) * Math.PI * 2) * 2 : 0;
  const idle = state === 'idle' ? (frameIndex % 2 ? 0.8 : 0) : 0;
  const recoil = state === 'attack' ? [0, -2.2, -0.8][frameIndex] ?? 0 : 0;
  const hit = state === 'hit' ? (frameIndex === 0 ? -2 : 1) : 0;
  const death = state === 'death' ? Math.min(1, frameIndex / 4) : 0;
  const bodyRotate = death * 72 + hit * 4;
  const bodyY = 1 + idle + death * 8;
  const opacity = state === 'wreck' ? 0.78 : 1;
  const damageOverlay = state === 'damaged' || state === 'hit' ? `<path d="M14 27 L19 23 L22 28 L27 24" stroke="${p.damage}" stroke-width="2" fill="none"/>` : '';
  const muzzle = state === 'attack' && frameIndex === 1 ? `<path d="M42 15 l5 -3 l-2 5 l3 2 l-6 1 z" fill="#f2d57a"/>` : '';
  if (state === 'wreck') {
    return `<g opacity="${opacity}"><ellipse cx="24" cy="34" rx="14" ry="5" fill="rgba(0,0,0,.3)"/><g transform="rotate(${angle} 24 24) rotate(78 24 28)"><rect x="15" y="20" width="18" height="13" rx="3" fill="${p.shadow}" stroke="${p.ink}" stroke-width="2"/><circle cx="12" cy="25" r="5" fill="${p.deep}"/><path d="M18 26 L38 22" stroke="${p.deep}" stroke-width="4"/></g></g>`;
  }
  return `<g transform="rotate(${angle} 24 24) translate(${recoil} 0)" opacity="${opacity}">
    <ellipse cx="24" cy="38" rx="11" ry="4" fill="rgba(0,0,0,.28)"/>
    <g transform="translate(0 ${bodyY}) rotate(${bodyRotate} 24 27)">
      <path d="M18 ${31 + move} L17 40" stroke="${p.deep}" stroke-width="5"/><path d="M29 ${31 - move} L31 40" stroke="${p.deep}" stroke-width="5"/>
      <rect x="15" y="18" width="18" height="17" rx="3" fill="${p.base}" stroke="${p.ink}" stroke-width="2"/>
      <path d="M17 19 L23 19 L20 34 L16 34 Z" fill="${p.light}" opacity=".75"/><path d="M29 19 L33 22 L32 34 L27 34 Z" fill="${p.shadow}" opacity=".8"/>
      <circle cx="24" cy="13" r="6" fill="${p.light}" stroke="${p.ink}" stroke-width="2"/><path d="M18 13 Q24 7 30 13" fill="${p.deep}" stroke="${p.ink}" stroke-width="1.5"/>
      <rect x="15" y="20" width="4" height="11" fill="${p.accent}" opacity=".8"/>
      ${equipmentSvg(unit, p)}${damageOverlay}${muzzle}
    </g>
  </g>`;
}

function renderPortrait(source, unit) {
  return `<rect width="48" height="48" fill="#161a16"/><rect x="3" y="3" width="42" height="42" fill="#222820" stroke="${palette(source, unit.accent, '#cdbd9d')}" stroke-width="2"/><g transform="translate(0 2) scale(1.12) translate(-2.6 -2.6)">${renderInfantryFrame(source, unit, 'idle', 's', 0)}</g>`;
}

function renderIcon(source, unit) {
  const accent = palette(source, unit.accent, '#cdbd9d');
  return `<rect width="48" height="48" fill="#111512"/><circle cx="24" cy="24" r="17" fill="${palette(source, 'shadow', '#41342a')}" stroke="${accent}" stroke-width="3"/><path d="M15 29 L24 13 L33 29 L29 35 L19 35 Z" fill="${palette(source, 'base', '#6c5947')}"/><rect x="21" y="18" width="6" height="16" fill="${accent}" opacity=".9"/>`;
}

function directionAttachment(direction) {
  const radians = (DIRECTION_ANGLES[direction] * Math.PI) / 180;
  return { x: Number((24 + Math.cos(radians) * 18).toFixed(2)), y: Number((24 + Math.sin(radians) * 18).toFixed(2)) };
}

function frameRecord(id, index, columns, width, height, tags, muzzle = { x: 40, y: 20 }) {
  const x = (index % columns) * 48;
  const y = Math.floor(index / columns) * 48;
  return {
    id,
    rect: { x, y, w: 48, h: 48 },
    sourceSize: { w: 48, h: 48 },
    offset: { x: 0, y: 0 },
    anchor: { x: 24, y: 43 },
    attachments: { center: { x: 24, y: 24 }, effect: { x: 24, y: 18 }, muzzle, selection: { x: 24, y: 39 }, shadow: { x: 24, y: 38 } },
    masks: { hit: { x: 5, y: 5, w: 38, h: 38 }, selection: { x: 7, y: 8, w: 34, h: 34 } },
    tags,
  };
}

export function generateRussianInfantryAtlas(input) {
  const source = assertSource(input);
  const columns = source.frame.columns;
  const cells = [{ id: 'missing', svg: '<rect width="48" height="48" fill="#111512"/><path d="M5 5 L43 43 M43 5 L5 43" stroke="#ff4fa3" stroke-width="5"/>', tags: ['fallback', 'diagnostic'], muzzle: { x: 24, y: 24 } }];
  const animations = {};
  const aliases = {};

  for (const unit of source.units) {
    aliases[unit.id] = unit.id;
    for (const alias of unit.aliases ?? []) aliases[alias] = unit.id;
    for (const state of RUSSIAN_INFANTRY_REQUIRED_STATES) {
      const definition = source.states[state];
      const directions = {};
      for (const direction of source.directions) {
        const sequence = [];
        for (let frameIndex = 0; frameIndex < definition.frames; frameIndex += 1) {
          const id = `${unit.id}.${state}.${direction}.f${String(frameIndex).padStart(2, '0')}`;
          cells.push({
            id,
            svg: renderInfantryFrame(source, unit, state, direction, frameIndex),
            tags: ['russian-infantry', unit.role, state, direction],
            muzzle: directionAttachment(direction),
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
    cells.push({ id: `${unit.id}.portrait`, svg: renderPortrait(source, unit), tags: ['portrait', unit.role], muzzle: { x: 24, y: 24 } });
    cells.push({ id: `${unit.id}.icon`, svg: renderIcon(source, unit), tags: ['icon', unit.role], muzzle: { x: 24, y: 24 } });
  }

  const rows = Math.ceil(cells.length / columns);
  const imageWidth = columns * 48;
  const imageHeight = rows * 48;
  const frames = Object.fromEntries(cells.map((cell, index) => [cell.id, frameRecord(cell.id, index, columns, imageWidth, imageHeight, cell.tags, cell.muzzle)]));
  const groups = cells.map((cell, index) => {
    const x = (index % columns) * 48;
    const y = Math.floor(index / columns) * 48;
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
      image: { src: 'russian-infantry.svg', width: imageWidth, height: imageHeight, pixelRatio: 1 },
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
      family: 'russian-infantry',
      units: source.units.map((unit) => ({ ...unit })),
      aliases,
      provenance: { ...source.provenance },
      frameCount: cells.length,
      animationCount: Object.keys(animations).length,
    },
  });
}
