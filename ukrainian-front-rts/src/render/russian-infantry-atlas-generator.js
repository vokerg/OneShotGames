const SOURCE_SCHEMA = 'fields-of-resolve.russian-infantry-art-source';
export const RUSSIAN_INFANTRY_DIRECTIONS = Object.freeze(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']);
export const RUSSIAN_INFANTRY_REQUIRED_STATES = Object.freeze(['idle', 'move', 'attack', 'hit', 'damaged', 'death', 'wreck']);

const DIRECTION_ANGLES = Object.freeze({ n: -90, ne: -45, e: 0, se: 45, s: 90, sw: 135, w: 180, nw: -135 });

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

function directionalPose(direction, recoil = 0) {
  const vector = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.n;
  const shoulderX = 24 + vector.x * 2.8;
  const shoulderY = 21 + vector.y * 1.4;
  const weaponX = shoulderX + vector.x * (16 - recoil);
  const weaponY = shoulderY + vector.y * (11 - recoil * 0.45);
  const headX = 24 + vector.x * 1.7;
  const headY = 11 + vector.y * 1.0;
  return Object.freeze({ vector, shoulderX, shoulderY, weaponX, weaponY, headX, headY });
}

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

function equipmentSvg(unit, p, pose) {
  const vx = pose.vector.x;
  const vy = pose.vector.y;
  const sx = pose.shoulderX;
  const sy = pose.shoulderY;
  const wx = pose.weaponX;
  const wy = pose.weaponY;
  const weapon = `<g data-detail="weapon-material"><path d="M${sx - vx * 5} ${sy - vy * 4} L${wx} ${wy}" stroke="${p.ink}" stroke-width="6"/><path d="M${sx} ${sy} L${wx} ${wy}" stroke="${p.metal}" stroke-width="3"/><circle cx="${sx + vx * 5}" cy="${sy + vy * 3.5}" r="2" fill="${p.deep}"/></g>`;
  if (unit.equipment === 'tool') return `<g data-role="tool"><path d="M15 28 L${15 - vx * 10} ${27 - vy * 8}" stroke="${p.metal}" stroke-width="4"/><path d="M${12 - vx * 10} ${25 - vy * 8} L${18 - vx * 10} ${30 - vy * 8}" stroke="${p.accent}" stroke-width="4"/></g>`;
  if (unit.equipment === 'radio') return `${weapon}<g data-role="radio"><rect x="10" y="21" width="9" height="12" rx="2" fill="${p.deep}"/><rect x="12" y="23" width="5" height="4" fill="${p.accent}"/><path d="M14 21 L12 7" stroke="${p.metal}" stroke-width="2"/></g>`;
  if (unit.equipment === 'launcher') return `<g data-detail="weapon-material" data-role="launcher"><path d="M${sx - vx * 4} ${sy - vy * 3} L${wx} ${wy}" stroke="${p.ink}" stroke-width="9"/><path d="M${sx} ${sy} L${wx} ${wy}" stroke="${p.deep}" stroke-width="6"/><circle cx="${wx - vx * 3}" cy="${wy - vy * 2}" r="3" fill="${p.accent}"/></g>`;
  if (unit.equipment === 'air-defense') return `<g data-role="air-defense"><path d="M15 28 L${17 + vx * 18} ${23 + vy * 14}" stroke="${p.ink}" stroke-width="8"/><path d="M19 29 L${21 + vx * 18} ${25 + vy * 14}" stroke="${p.ink}" stroke-width="8"/><path d="M15 28 L${17 + vx * 18} ${23 + vy * 14}" stroke="${p.metal}" stroke-width="3"/><path d="M19 29 L${21 + vx * 18} ${25 + vy * 14}" stroke="${p.metal}" stroke-width="3"/><rect x="12" y="27" width="10" height="5" fill="${p.accent}"/></g>`;
  if (unit.equipment === 'optic') return `${weapon}<circle cx="${sx + vx * 8}" cy="${sy + vy * 5}" r="3" fill="${p.optic}" stroke="${p.ink}"/>`;
  if (unit.equipment === 'medical') return `<g data-role="medical"><rect x="17" y="21" width="14" height="12" rx="2" fill="${p.medical}" stroke="${p.ink}"/><rect x="22" y="22" width="4" height="10" fill="${p.medicalMark}"/><rect x="19" y="25" width="10" height="4" fill="${p.medicalMark}"/></g>`;
  if (unit.equipment === 'grenade') return `${weapon}<circle cx="14" cy="28" r="3" fill="${p.accent}" stroke="${p.ink}"/>`;
  return weapon;
}

function renderInfantryFrame(source, unit, state, direction, frameIndex) {
  const p = {
    ink: palette(source, 'ink', '#111512'), deep: palette(source, 'deep', '#2a211b'), shadow: palette(source, 'shadow', '#41342a'),
    base: palette(source, 'base', '#6c5947'), light: palette(source, 'light', '#94775a'), metal: palette(source, 'metal', '#918d7d'),
    accent: palette(source, unit.accent, palette(source, 'accent', '#cdbd9d')), optic: palette(source, 'optic', '#786957'),
    damage: palette(source, 'damage', '#d95f45'), medical: palette(source, 'medical', '#d7d9cf'), medicalMark: palette(source, 'medical-mark', '#9d3835'),
  };
  const move = state === 'move' ? Math.sin((frameIndex / 6) * Math.PI * 2) * 2 : 0;
  const idle = state === 'idle' ? (frameIndex % 2 ? 0.8 : 0) : 0;
  const recoil = state === 'attack' ? [0, 2.2, 0.8][frameIndex] ?? 0 : 0;
  const hit = state === 'hit' ? (frameIndex === 0 ? 1 : 0) : 0;
  const death = state === 'death' ? Math.min(1, frameIndex / 4) : 0;
  const bodyRotate = death * 72 + hit * 5;
  const bodyY = idle + death * 7;
  const opacity = state === 'wreck' ? 0.72 : 1;
  const pose = directionalPose(direction, recoil);
  const damageOverlay = state === 'damaged' || state === 'hit' ? `<path d="M13 26 L18 22 L22 27 L27 23" stroke="${p.damage}" stroke-width="2" fill="none"/>` : '';
  const muzzle = state === 'attack' && frameIndex === 1 ? `<circle cx="${pose.weaponX}" cy="${pose.weaponY}" r="4" fill="#f2d57a"/><rect x="${pose.weaponX - 1}" y="${pose.weaponY - 1}" width="2" height="2" fill="#fff1aa"/>` : '';
  if (state === 'wreck') {
    return `<g opacity="${opacity}"><ellipse cx="24" cy="38" rx="15" ry="4" fill="rgba(0,0,0,.3)"/><g data-human-body="prone" transform="rotate(78 24 29)"><rect x="8" y="21" width="32" height="14" rx="4" fill="${p.shadow}" stroke="${p.ink}" stroke-width="2"/><circle cx="38" cy="27" r="6" fill="${p.deep}"/><path d="M18 27 L38 23" stroke="${p.deep}" stroke-width="4"/></g></g>`;
  }
  return `<g opacity="${opacity}">
    <ellipse cx="24" cy="41" rx="12" ry="3.5" fill="rgba(0,0,0,.28)"/>
    <g data-human-body="standing" data-directional-body="fixed-upright" transform="translate(0 ${bodyY}) rotate(${bodyRotate} 24 28)">
      <g data-detail="boots-knees">
        <path d="M17 ${31 + move} L16 42" stroke="${p.ink}" stroke-width="7"/><path d="M30 ${31 - move} L32 42" stroke="${p.ink}" stroke-width="7"/>
        <path d="M17 ${31 + move} L17 37" stroke="${p.base}" stroke-width="4"/><path d="M30 ${31 - move} L31 37" stroke="${p.base}" stroke-width="4"/>
        <rect x="13" y="36" width="8" height="3" rx="1" fill="${p.shadow}"/><rect x="28" y="36" width="8" height="3" rx="1" fill="${p.shadow}"/>
        <rect x="13" y="40" width="9" height="3" rx="1" fill="${p.deep}"/><rect x="27" y="40" width="10" height="3" rx="1" fill="${p.deep}"/>
      </g>
      <rect x="9" y="19" width="8" height="14" rx="3" fill="${pose.vector.x >= 0 ? p.light : p.shadow}"/>
      <rect x="31" y="19" width="8" height="14" rx="3" fill="${pose.vector.x >= 0 ? p.shadow : p.light}"/>
      <path d="M13 18 Q24 13 35 18 L33 35 Q24 39 15 35 Z" fill="${p.base}" stroke="${p.ink}" stroke-width="1.5"/>
      <path d="M15 19 L23 16 L21 35 L16 34 Z" fill="${p.light}" opacity=".72"/><path d="M24 16 L34 19 L32 34 L25 35 Z" fill="${p.shadow}" opacity=".78"/>
      <g data-detail="load-bearing-kit">
        <path d="M17 18 L21 18 L20 34 L16 33 Z M27 18 L31 19 L32 33 L28 34 Z" fill="${p.deep}" opacity=".72"/>
        <rect x="19" y="21" width="10" height="9" rx="1" fill="${p.shadow}"/>
        <rect x="18" y="29" width="5" height="5" rx="1" fill="${p.deep}"/><rect x="25" y="29" width="5" height="5" rx="1" fill="${p.deep}"/>
        <path d="M20 23 H28 M24 20 V32" stroke="${p.metal}" stroke-width="1" opacity=".42"/>
      </g>
      <circle cx="${pose.headX}" cy="${pose.headY}" r="7" fill="${p.light}" stroke="${p.ink}" stroke-width="1.5"/>
      <path d="M${pose.headX - 7} ${pose.headY} Q${pose.headX} ${pose.headY - 9} ${pose.headX + 7} ${pose.headY} L${pose.headX + 6} ${pose.headY + 3} L${pose.headX - 6} ${pose.headY + 3} Z" fill="${p.deep}"/>
      <g data-detail="helmet-fittings"><path d="M${pose.headX - 5} ${pose.headY - 1} H${pose.headX + 5}" stroke="${p.shadow}" stroke-width="1.5"/><rect x="${pose.headX - 2}" y="${pose.headY - 5}" width="4" height="3" rx="1" fill="${p.ink}"/><rect x="${pose.headX + pose.vector.x * 4 - 1}" y="${pose.headY + pose.vector.y * 2 - 1}" width="2" height="2" fill="${p.metal}"/></g>
      ${equipmentSvg(unit, p, pose)}${damageOverlay}${muzzle}
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
  const vector = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.n;
  return { x: Number((24 + vector.x * 18).toFixed(2)), y: Number((24 + vector.y * 18).toFixed(2)) };
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
