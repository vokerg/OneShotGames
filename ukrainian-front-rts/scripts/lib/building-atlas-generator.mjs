import { validateSpriteAtlasManifest } from '../../src/render/sprite-atlas-manifest.js';
import {
  BUILDING_ATLAS_ATTACHMENTS,
  BUILDING_ATLAS_DIMENSIONS,
  BUILDING_ATLAS_FAMILY,
  BUILDING_ATLAS_IDS,
  BUILDING_ATLAS_PROVENANCE,
  BUILDING_ATLAS_SCHEMA_VERSION,
  BUILDING_ATLAS_SOURCE_SCHEMA,
  BUILDING_ATLAS_STATES,
  buildingAtlasAnimation,
  buildingAtlasFrame,
  buildingAtlasId,
} from '../../src/render/building-atlas.js';

const MAX_ATLAS_WIDTH = 1024;
const PADDING = 2;
const REVIEW_COLUMNS = 8;
const REVIEW_CELL = 132;

const PALETTE = Object.freeze({
  ink: '#111512',
  metal: '#9aa291',
  fire: '#d95b3f',
  smoke: '#5e625b',
  diagnostic: '#ff4fa3',
  white: '#ffffff',
  ua: Object.freeze({ deep: '#18271f', shadow: '#293c30', base: '#50684c', light: '#81956a', accent: '#e4ca54', optic: '#4e8db2' }),
  ru: Object.freeze({ deep: '#2a211b', shadow: '#41342a', base: '#6c5947', light: '#94775a', accent: '#cdbd9d', optic: '#786957' }),
});

const EXPECTED_ROLES = Object.freeze([
  'air-defense', 'command', 'engineer', 'fires', 'infantry', 'logistics', 'uas-ew', 'vehicle',
]);

function stableCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sameRecord(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateBuildingArtSource(value) {
  const input = requireObject(value, 'Building art source');
  if (input.schema !== BUILDING_ATLAS_SOURCE_SCHEMA) throw new TypeError(`Building art source schema must be ${BUILDING_ATLAS_SOURCE_SCHEMA}.`);
  if (input.version !== BUILDING_ATLAS_SCHEMA_VERSION) throw new TypeError(`Unsupported building art source version: ${input.version}.`);
  if (input.family !== BUILDING_ATLAS_FAMILY) throw new TypeError(`Building art source family must be ${BUILDING_ATLAS_FAMILY}.`);
  const provenance = requireObject(input.provenance, 'Building art provenance');
  if (!sameRecord(provenance, BUILDING_ATLAS_PROVENANCE)) throw new TypeError('Building art provenance does not match the runtime contract.');
  if (!Array.isArray(input.buildings)) throw new TypeError('Building art source buildings must be an array.');
  const expectedIds = Object.values(BUILDING_ATLAS_IDS).flat().sort(stableCompare);
  const ids = new Set();
  const rolesByFaction = { ukraine: new Set(), russia: new Set() };
  const buildings = input.buildings.map((value, index) => {
    const building = requireObject(value, `Building art source entry ${index}`);
    const id = requireString(building.id, `Building art source entry ${index} id`);
    if (ids.has(id)) throw new TypeError(`Duplicate building art source ID: ${id}.`);
    ids.add(id);
    const faction = requireString(building.faction, `${id} faction`);
    if (!Object.hasOwn(BUILDING_ATLAS_IDS, faction) || !BUILDING_ATLAS_IDS[faction].includes(id)) {
      throw new TypeError(`${id}: faction does not match the canonical building atlas contract.`);
    }
    const role = requireString(building.role, `${id} role`);
    if (!EXPECTED_ROLES.includes(role)) throw new TypeError(`${id}: unsupported building role ${role}.`);
    rolesByFaction[faction].add(role);
    if (!Number.isInteger(building.tier) || building.tier < 0 || building.tier > 2) throw new TypeError(`${id}: tier must be an integer from 0 through 2.`);
    return Object.freeze({ id, faction, role, tier: building.tier, silhouette: requireString(building.silhouette, `${id} silhouette`) });
  }).sort((left, right) => stableCompare(left.id, right.id));
  if (!sameRecord(buildings.map((building) => building.id), expectedIds)) throw new TypeError('Building art source does not cover the exact canonical production-structure roster.');
  for (const faction of Object.keys(rolesByFaction)) {
    if (!sameRecord([...rolesByFaction[faction]].sort(stableCompare), [...EXPECTED_ROLES])) {
      throw new TypeError(`${faction}: building art source must cover every visual role exactly once.`);
    }
  }
  return Object.freeze({
    schema: input.schema,
    version: input.version,
    id: requireString(input.id, 'Building art source id'),
    family: input.family,
    provenance: BUILDING_ATLAS_PROVENANCE,
    buildings: Object.freeze(buildings),
  });
}

function colorsFor(faction) {
  return faction === 'ukraine' ? PALETTE.ua : PALETTE.ru;
}

function largeRoleMarkup(role, colors) {
  switch (role) {
    case 'command': return [
      `<rect x="68" y="17" width="5" height="37" fill="${colors.deep}"/>`,
      `<rect x="60" y="16" width="21" height="5" fill="${colors.accent}"/>`,
      `<rect x="66" y="8" width="9" height="9" fill="${colors.optic}"/>`,
    ].join('');
    case 'logistics': return [
      `<rect x="17" y="52" width="19" height="19" fill="${colors.shadow}"/>`,
      `<rect x="39" y="49" width="18" height="22" fill="${colors.light}"/>`,
      `<rect x="60" y="52" width="19" height="19" fill="${colors.shadow}"/>`,
    ].join('');
    case 'infantry': return [
      `<rect x="17" y="28" width="13" height="18" fill="${colors.light}"/>`,
      `<rect x="34" y="23" width="13" height="23" fill="${colors.shadow}"/>`,
      `<rect x="51" y="28" width="13" height="18" fill="${colors.light}"/>`,
    ].join('');
    case 'vehicle': return [
      `<rect x="16" y="49" width="64" height="23" fill="${colors.deep}"/>`,
      `<rect x="22" y="54" width="52" height="14" fill="${colors.shadow}"/>`,
      `<rect x="34" y="58" width="28" height="9" fill="${PALETTE.metal}"/>`,
    ].join('');
    case 'uas-ew': return [
      `<rect x="46" y="14" width="5" height="37" fill="${colors.deep}"/>`,
      `<rect x="29" y="18" width="39" height="5" fill="${colors.optic}"/>`,
      `<rect x="37" y="27" width="22" height="11" fill="${colors.shadow}"/>`,
    ].join('');
    case 'fires': return [
      `<rect x="24" y="24" width="48" height="13" fill="${colors.shadow}"/>`,
      `<rect x="30" y="18" width="36" height="6" fill="${PALETTE.metal}"/>`,
      `<rect x="37" y="12" width="22" height="6" fill="${colors.accent}"/>`,
    ].join('');
    case 'air-defense': return [
      `<rect x="45" y="14" width="7" height="37" fill="${colors.deep}"/>`,
      `<path d="M48 14L28 32h40z" fill="${colors.optic}"/>`,
      `<rect x="34" y="35" width="28" height="9" fill="${colors.shadow}"/>`,
    ].join('');
    case 'engineer': return [
      `<rect x="19" y="49" width="58" height="20" fill="${colors.shadow}"/>`,
      `<path d="M24 49l12-16h25l12 16z" fill="${colors.light}"/>`,
      `<rect x="45" y="29" width="7" height="20" fill="${colors.accent}"/>`,
    ].join('');
    default: throw new RangeError(`Unknown building role: ${role}.`);
  }
}

function iconRoleMarkup(role, colors) {
  const common = `<rect x="7" y="22" width="26" height="11" fill="${colors.shadow}"/>`;
  switch (role) {
    case 'command': return `${common}<rect x="25" y="7" width="2" height="16" fill="${colors.accent}"/><rect x="21" y="6" width="10" height="3" fill="${colors.optic}"/>`;
    case 'logistics': return `${common}<rect x="8" y="17" width="7" height="7" fill="${colors.light}"/><rect x="17" y="15" width="7" height="9" fill="${colors.base}"/><rect x="26" y="17" width="7" height="7" fill="${colors.light}"/>`;
    case 'infantry': return `${common}<rect x="9" y="12" width="5" height="11" fill="${colors.light}"/><rect x="17" y="9" width="6" height="14" fill="${colors.base}"/><rect x="26" y="12" width="5" height="11" fill="${colors.light}"/>`;
    case 'vehicle': return `${common}<rect x="9" y="16" width="22" height="9" fill="${colors.deep}"/><rect x="15" y="19" width="10" height="5" fill="${PALETTE.metal}"/>`;
    case 'uas-ew': return `${common}<rect x="19" y="7" width="2" height="16" fill="${colors.optic}"/><rect x="11" y="10" width="18" height="3" fill="${colors.optic}"/>`;
    case 'fires': return `${common}<rect x="11" y="13" width="18" height="7" fill="${colors.base}"/><rect x="15" y="9" width="10" height="4" fill="${colors.accent}"/>`;
    case 'air-defense': return `${common}<path d="M20 8L10 20h20z" fill="${colors.optic}"/><rect x="18" y="18" width="4" height="6" fill="${colors.deep}"/>`;
    case 'engineer': return `${common}<path d="M10 22l6-10h8l6 10z" fill="${colors.light}"/><rect x="19" y="9" width="3" height="13" fill="${colors.accent}"/>`;
    default: throw new RangeError(`Unknown building role: ${role}.`);
  }
}

function constructionMarkup(state, colors) {
  if (state === 'placement') return `<rect x="5" y="53" width="86" height="38" fill="none" stroke="${colors.accent}" stroke-width="2" stroke-dasharray="5 3"/><path d="M9 87L87 57M9 57l78 30" stroke="${colors.optic}" stroke-width="2" opacity=".8"/>`;
  if (state === 'foundation') return `<rect x="10" y="70" width="76" height="18" fill="${colors.deep}"/><rect x="14" y="73" width="68" height="10" fill="${PALETTE.metal}"/>`;
  if (state === 'frame') return `<rect x="10" y="70" width="76" height="18" fill="${colors.deep}"/><path d="M16 70V32h64v38M16 35h64M31 32v38M48 32v38M65 32v38" fill="none" stroke="${PALETTE.metal}" stroke-width="5"/>`;
  if (state === 'fitout') return `<rect x="10" y="34" width="76" height="54" fill="${colors.shadow}"/><rect x="15" y="39" width="66" height="44" fill="${colors.base}"/><path d="M15 39l13-15h40l13 15z" fill="${colors.light}"/><rect x="41" y="64" width="14" height="19" fill="${colors.deep}"/>`;
  return null;
}

function damageMarkup(state) {
  if (state === 'damaged') return '<path d="M24 28l9 9-6 8 11 10" fill="none" stroke="#111512" stroke-width="4"/><rect x="64" y="26" width="8" height="12" fill="#5e625b"/>';
  if (state === 'critical') return '<path d="M22 25l12 12-8 10 14 13M61 25l-8 12 10 10-8 12" fill="none" stroke="#111512" stroke-width="4"/><rect x="62" y="15" width="14" height="21" fill="#5e625b"/><rect x="66" y="27" width="8" height="15" fill="#d95b3f"/>';
  return '';
}

function destructionMarkup(phase, colors) {
  const roofHeight = phase === 0 ? 28 : 18;
  const peak = phase === 2 ? 8 : 28;
  return [
    `<rect x="10" y="62" width="76" height="26" fill="${colors.deep}"/>`,
    `<path d="M12 62l14-${roofHeight}h42l16 ${peak}z" fill="${phase === 2 ? colors.shadow : colors.base}"/>`,
    '<path d="M18 63l13-18 10 8 12-20 21 27" fill="none" stroke="#111512" stroke-width="5"/>',
    phase >= 1 ? '<rect x="30" y="27" width="13" height="22" fill="#5e625b"/>' : '',
    phase === 2 ? '<rect x="58" y="49" width="12" height="18" fill="#d95b3f"/>' : '',
  ].join('');
}

function runtimeMarkup(building, state, phase) {
  const colors = colorsFor(building.faction);
  if (state === 'icon') {
    return `<rect x="2" y="2" width="36" height="36" fill="${colors.deep}"/><rect x="5" y="5" width="30" height="30" fill="${colors.base}"/>${iconRoleMarkup(building.role, colors)}<rect x="6" y="6" width="5" height="5" fill="${colors.accent}"/>`;
  }
  const construction = constructionMarkup(state, colors);
  if (construction) return `<ellipse cx="50" cy="86" rx="42" ry="7" fill="${PALETTE.ink}" opacity=".65"/>${construction}<rect x="44" y="78" width="8" height="8" fill="${colors.accent}"/>`;
  if (state === 'destruction') return `<ellipse cx="50" cy="86" rx="42" ry="7" fill="${PALETTE.ink}" opacity=".65"/>${destructionMarkup(phase, colors)}`;
  if (state === 'rubble') return `<ellipse cx="50" cy="86" rx="42" ry="7" fill="${PALETTE.ink}" opacity=".65"/><path d="M8 82l13-19 14 8 14-20 12 17 13-9 14 23z" fill="${colors.shadow}"/><rect x="18" y="73" width="59" height="14" fill="${colors.deep}"/><rect x="34" y="65" width="12" height="9" fill="${PALETTE.metal}"/>`;
  return [
    `<ellipse cx="50" cy="86" rx="42" ry="7" fill="${PALETTE.ink}" opacity=".65"/>`,
    `<rect x="8" y="37" width="80" height="51" fill="${colors.deep}"/>`,
    `<rect x="12" y="40" width="72" height="43" fill="${colors.base}"/>`,
    `<path d="M12 40l14-18h44l14 18z" fill="${colors.light}"/>`,
    `<rect x="41" y="62" width="14" height="21" fill="${colors.deep}"/>`,
    `<rect x="17" y="48" width="14" height="10" fill="${colors.optic}"/>`,
    `<rect x="65" y="48" width="14" height="10" fill="${colors.optic}"/>`,
    largeRoleMarkup(building.role, colors),
    state === 'active' ? `<rect x="15" y="79" width="66" height="4" fill="${colors.accent}"/><rect x="76" y="26" width="8" height="8" fill="${colors.optic}"/>` : '',
    damageMarkup(state),
    `<rect x="44" y="78" width="8" height="8" fill="${colors.accent}"/>`,
  ].join('');
}

function diagnosticMarkup() {
  return `<rect x="1" y="1" width="38" height="38" fill="${PALETTE.diagnostic}"/><path d="M1 1h10v10H1zm20 0h10v10H21zM11 11h10v10H11zm20 0h8v10h-8zM1 21h10v10H1zm20 0h10v10H21zM11 31h10v8H11zm20 0h8v8h-8z" fill="${PALETTE.ink}"/><rect x="1" y="1" width="38" height="38" fill="none" stroke="${PALETTE.white}" stroke-width="2"/>`;
}

function frameSpecs(buildings) {
  const frames = [];
  for (const building of buildings) {
    for (const [state, contract] of Object.entries(BUILDING_ATLAS_STATES)) {
      for (let phase = 0; phase < contract.frames; phase += 1) {
        const icon = state === 'icon';
        const dimensions = icon ? BUILDING_ATLAS_DIMENSIONS.icon : BUILDING_ATLAS_DIMENSIONS.battlefield;
        frames.push({
          id: buildingAtlasFrame(building.id, state, { phase }),
          building,
          state,
          phase,
          width: dimensions.width,
          height: dimensions.height,
          anchor: dimensions.anchor,
          markup: runtimeMarkup(building, state, phase),
        });
      }
    }
  }
  frames.push({
    id: `buildings.${buildings[0].faction}.missing`,
    building: null,
    state: 'missing',
    phase: 0,
    width: 40,
    height: 40,
    anchor: { x: 20, y: 20 },
    markup: diagnosticMarkup(),
  });
  return frames.sort((left, right) => stableCompare(left.id, right.id));
}

function packFrames(frames) {
  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;
  let usedWidth = 0;
  const placed = [];
  for (const frame of frames) {
    if (x > PADDING && x + frame.width + PADDING > MAX_ATLAS_WIDTH) {
      x = PADDING;
      y += rowHeight + PADDING;
      rowHeight = 0;
    }
    placed.push(Object.freeze({ ...frame, x, y }));
    usedWidth = Math.max(usedWidth, x + frame.width + PADDING);
    rowHeight = Math.max(rowHeight, frame.height);
    x += frame.width + PADDING;
  }
  return Object.freeze({ frames: Object.freeze(placed), width: usedWidth, height: y + rowHeight + PADDING });
}

function frameRecord(frame) {
  const battlefield = frame.state !== 'icon' && frame.state !== 'missing';
  const attachments = battlefield
    ? {
        entrance: { x: 48, y: 82 },
        exit: { x: 48, y: 84 },
        rally: { x: 48, y: 90 },
        capture: { x: 48, y: 18 },
        effect: { x: 48, y: 22 },
      }
    : { center: { x: frame.width / 2, y: frame.height / 2 } };
  const masks = battlefield
    ? { selection: { x: 4, y: 52, w: 88, h: 40 }, footprint: { x: 8, y: 55, w: 80, h: 37 } }
    : { icon: { x: 1, y: 1, w: frame.width - 2, h: frame.height - 2 } };
  return {
    rect: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
    sourceSize: { w: frame.width, h: frame.height },
    offset: { x: 0, y: 0 },
    anchor: frame.anchor,
    attachments,
    masks,
    tags: frame.building
      ? ['building', frame.building.faction, frame.building.role, frame.state]
      : ['building', 'fallback', 'diagnostic'],
  };
}

function animationsFor(buildings) {
  const animations = {};
  for (const building of buildings) {
    for (const [state, contract] of Object.entries(BUILDING_ATLAS_STATES)) {
      const frames = Array.from({ length: contract.frames }, (_, phase) => ({
        frame: buildingAtlasFrame(building.id, state, { phase }),
        durationMs: state === 'destruction' ? [120, 120, 180][phase] : contract.durationMs,
      }));
      animations[buildingAtlasAnimation(building.id, state)] = {
        loop: contract.loop,
        defaultDurationMs: contract.durationMs,
        frames,
      };
    }
  }
  return Object.fromEntries(Object.entries(animations).sort(([left], [right]) => stableCompare(left, right)));
}

function atlasSvg(faction, layout) {
  const groups = layout.frames.map((frame) =>
    `  <g id="${xmlEscape(frame.id)}" transform="translate(${frame.x} ${frame.y})">${frame.markup}</g>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" shape-rendering="crispEdges">`,
    `  <title>Fields of Resolve ${xmlEscape(faction)} production building atlas</title>`,
    `  <metadata>${xmlEscape(JSON.stringify(BUILDING_ATLAS_PROVENANCE))}</metadata>`,
    ...groups,
    '</svg>',
    '',
  ].join('\n');
}

function generateFactionAtlas(faction, buildings) {
  const layout = packFrames(frameSpecs(buildings));
  const frames = Object.fromEntries(layout.frames.map((frame) => [frame.id, frameRecord(frame)]));
  const fallback = `buildings.${faction}.missing`;
  const manifestValue = {
    schema: 'fields-of-resolve.sprite-atlas',
    version: 1,
    id: buildingAtlasId(faction),
    sampling: 'nearest',
    image: { src: `buildings-${faction}.svg`, width: layout.width, height: layout.height, pixelRatio: 1 },
    directions: { order: ['n'], zero: 'n', clockwise: true },
    paletteTokens: {
      ink: PALETTE.ink,
      metal: PALETTE.metal,
      fire: PALETTE.fire,
      smoke: PALETTE.smoke,
      accent: colorsFor(faction).accent,
      optic: colorsFor(faction).optic,
    },
    frames,
    animations: animationsFor(buildings),
    fallback: { frame: fallback },
  };
  const manifest = validateSpriteAtlasManifest(manifestValue, { source: `${faction} building atlas` });
  return Object.freeze({
    faction,
    manifestValue,
    manifest: `${JSON.stringify(manifestValue, null, 2)}\n`,
    svg: atlasSvg(faction, layout),
    frameCount: layout.frames.length,
    productionFrameCount: layout.frames.length - 1,
    animationCount: Object.keys(manifest.animations).length,
    width: layout.width,
    height: layout.height,
    frameMarkups: Object.freeze(Object.fromEntries(layout.frames.map((frame) => [frame.id, frame.markup]))),
  });
}

function contactSheet(atlases) {
  const frames = atlases.flatMap((atlas) => Object.entries(atlas.frameMarkups)
    .filter(([id]) => !id.endsWith('.missing'))
    .map(([id, markup]) => ({ id, markup, manifest: atlas.manifestValue.frames[id] })))
    .sort((left, right) => stableCompare(left.id, right.id));
  const rows = Math.ceil(frames.length / REVIEW_COLUMNS);
  const cells = frames.map((frame, index) => {
    const x = (index % REVIEW_COLUMNS) * REVIEW_CELL;
    const y = Math.floor(index / REVIEW_COLUMNS) * REVIEW_CELL;
    const sourceWidth = frame.manifest.sourceSize.w;
    const sourceHeight = frame.manifest.sourceSize.h;
    const scale = Math.min(92 / sourceWidth, 92 / sourceHeight);
    const drawX = x + (REVIEW_CELL - sourceWidth * scale) / 2;
    const drawY = y + 7 + (92 - sourceHeight * scale) / 2;
    return [
      `  <g transform="translate(${drawX} ${drawY}) scale(${scale})">${frame.markup}</g>`,
      `  <rect x="${x}" y="${y}" width="${REVIEW_CELL}" height="${REVIEW_CELL}" fill="none" stroke="#5b655c"/>`,
      `  <text x="${x + 5}" y="${y + 112}" font-family="monospace" font-size="7" fill="#e5eadf">${xmlEscape(frame.id)}</text>`,
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${REVIEW_COLUMNS * REVIEW_CELL}" height="${rows * REVIEW_CELL}" viewBox="0 0 ${REVIEW_COLUMNS * REVIEW_CELL} ${rows * REVIEW_CELL}">`,
    '  <title>Fields of Resolve production building review sheet</title>',
    '  <rect width="100%" height="100%" fill="#1b211d"/>',
    ...cells,
    '</svg>',
    '',
  ].join('\n');
}

export function generateBuildingArt(sourceValue) {
  const source = validateBuildingArtSource(sourceValue);
  const atlases = Object.freeze(['ukraine', 'russia'].map((faction) =>
    generateFactionAtlas(faction, source.buildings.filter((building) => building.faction === faction)),
  ));
  return Object.freeze({
    source,
    atlases,
    contactSheet: contactSheet(atlases),
    buildingCount: source.buildings.length,
    productionFrameCount: atlases.reduce((sum, atlas) => sum + atlas.productionFrameCount, 0),
    runtimeFrameCount: atlases.reduce((sum, atlas) => sum + atlas.frameCount, 0),
    animationCount: atlases.reduce((sum, atlas) => sum + atlas.animationCount, 0),
  });
}

export function verifyBuildingArtArtifacts(sourceValue) {
  const first = generateBuildingArt(sourceValue);
  const second = generateBuildingArt(sourceValue);
  if (!sameRecord(first.atlases.map((atlas) => atlas.manifest), second.atlases.map((atlas) => atlas.manifest))) {
    throw new Error('Building atlas manifests are not deterministic.');
  }
  if (!sameRecord(first.atlases.map((atlas) => atlas.svg), second.atlases.map((atlas) => atlas.svg))) {
    throw new Error('Building atlas SVG outputs are not deterministic.');
  }
  if (first.contactSheet !== second.contactSheet) throw new Error('Building review sheet is not deterministic.');
  if (first.buildingCount !== 16 || first.productionFrameCount !== 208 || first.runtimeFrameCount !== 210) {
    throw new Error(`Unexpected building art coverage: ${first.buildingCount} buildings, ${first.productionFrameCount} production frames, ${first.runtimeFrameCount} runtime frames.`);
  }
  if (first.animationCount !== 176) throw new Error(`Unexpected building animation count: ${first.animationCount}.`);
  for (const atlas of first.atlases) {
    const manifest = validateSpriteAtlasManifest(JSON.parse(atlas.manifest));
    for (const buildingId of BUILDING_ATLAS_IDS[atlas.faction]) {
      const idleId = buildingAtlasFrame(buildingId, 'idle');
      const idle = manifest.frames[idleId];
      if (!idle) throw new Error(`Missing idle frame ${idleId}.`);
      if (idle.anchor.x !== 48 || idle.anchor.y !== 88) throw new Error(`${idleId}: footprint-origin anchor drift.`);
      for (const attachment of BUILDING_ATLAS_ATTACHMENTS) {
        if (!idle.attachments[attachment]) throw new Error(`${idleId}: missing ${attachment} attachment.`);
      }
      for (const [state, contract] of Object.entries(BUILDING_ATLAS_STATES)) {
        const animationId = buildingAtlasAnimation(buildingId, state);
        const animation = manifest.animations[animationId];
        if (!animation) throw new Error(`Missing animation ${animationId}.`);
        const sequence = animation.frames;
        if (sequence.length !== contract.frames) throw new Error(`${animationId}: expected ${contract.frames} frames.`);
        for (let phase = 0; phase < contract.frames; phase += 1) {
          const frameId = buildingAtlasFrame(buildingId, state, { phase });
          if (!manifest.frames[frameId]) throw new Error(`Missing frame ${frameId}.`);
        }
      }
    }
    const idleMarkups = BUILDING_ATLAS_IDS[atlas.faction].map((id) => atlas.frameMarkups[buildingAtlasFrame(id, 'idle')]);
    if (new Set(idleMarkups).size !== idleMarkups.length) throw new Error(`${atlas.faction}: building role silhouettes are not distinct.`);
  }
  if (/<script\b|<foreignObject\b|href=["']https?:/i.test(first.contactSheet)) throw new Error('Building review sheet contains unsafe external content.');
  return Object.freeze({
    buildingCount: first.buildingCount,
    productionFrameCount: first.productionFrameCount,
    runtimeFrameCount: first.runtimeFrameCount,
    animationCount: first.animationCount,
    atlasBytes: first.atlases.reduce((sum, atlas) => sum + Buffer.byteLength(atlas.svg) + Buffer.byteLength(atlas.manifest), 0),
    contactSheetBytes: Buffer.byteLength(first.contactSheet),
  });
}
