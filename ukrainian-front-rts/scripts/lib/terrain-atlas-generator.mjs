import {
  TERRAIN_ATLAS_ID,
  TERRAIN_ATLAS_PROVENANCE,
  TERRAIN_BIOME_PROFILES,
  TERRAIN_TILE_SIZE,
  TERRAIN_VARIANT_COUNT,
  TERRAIN_VISUAL_FAMILIES,
  terrainFrameId,
  terrainInnerCornerFrameId,
} from '../../src/render/terrain-tile-system.js';

const COLUMN_COUNT = 16;
const MASKS = Object.freeze(Array.from({ length: 16 }, (_, index) => index));

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function rect(x, y, width, height, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}"${extra}/>`;
}

function connectedShape(mask, fill, width = 12) {
  const start = 16 - width / 2;
  const elements = [rect(start, start, width, width, fill)];
  if (mask & 1) elements.push(rect(start, 0, width, 16, fill));
  if (mask & 2) elements.push(rect(16, start, 16, width, fill));
  if (mask & 4) elements.push(rect(start, 16, width, 16, fill));
  if (mask & 8) elements.push(rect(0, start, 16, width, fill));
  return elements.join('');
}

function variantMark(mask, palette, variant) {
  return variant === 0
    ? rect(24 - (mask % 4), 3 + (mask % 5), 4, 2, palette.edge, ' opacity=".24"')
    : rect(3 + (mask % 5), 27 - (mask % 4), 5, 2, palette.groundLight, ' opacity=".34"');
}

function texture(family, palette) {
  if (family === 'ground') {
    return [
      rect(4, 6, 8, 2, palette.groundLight, ' opacity=".42"'),
      rect(20, 23, 7, 2, palette.groundDark, ' opacity=".55"'),
      rect(15, 13, 3, 3, palette.groundLight, ' opacity=".25"'),
    ].join('');
  }
  if (family === 'rubble') {
    return [
      rect(4, 5, 5, 4, palette.rock),
      rect(23, 8, 4, 6, palette.edge),
      rect(8, 22, 7, 5, palette.rubble),
      rect(20, 24, 6, 3, palette.ink, ' opacity=".45"'),
    ].join('');
  }
  if (family === 'water') {
    return [
      rect(3, 7, 10, 2, palette.waterLight, ' opacity=".5"'),
      rect(17, 17, 12, 2, palette.waterLight, ' opacity=".38"'),
      rect(8, 26, 7, 1, palette.ink, ' opacity=".25"'),
    ].join('');
  }
  if (family === 'field') {
    return [4, 10, 16, 22, 28]
      .map((x) => rect(x, 0, 2, 32, palette.groundLight, ' opacity=".38"'))
      .join('');
  }
  if (family === 'industrial') {
    return '<path d="M0 8h32M0 16h32M0 24h32M8 0v32M16 0v32M24 0v32" ' +
      `stroke="${palette.edge}" stroke-width="1" opacity=".34"/>`;
  }
  if (family === 'settlement') {
    return '<path d="M0 8h32M0 16h32M0 24h32M8 0v8M24 0v8M16 8v8M8 16v8M24 16v8M16 24v8" ' +
      `stroke="${palette.edge}" stroke-width="1" opacity=".38"/>`;
  }
  return '';
}

function tileMarkup(family, mask, palette, variant) {
  const ground = rect(0, 0, 32, 32, palette.ground);
  let markup;
  switch (family) {
    case 'ground':
      markup = ground + texture(family, palette);
      break;
    case 'road':
      markup = ground + connectedShape(mask, palette.road, 14) +
        `<path d="M16 0v32M0 16h32" stroke="${palette.edge}" stroke-width="1" stroke-dasharray="4 5" opacity=".38"/>`;
      break;
    case 'mud':
      markup = ground + connectedShape(mask, palette.mud, 18) +
        `<path d="M5 9c6 4 15-3 22 2M4 24c8-5 15 3 24-2" stroke="${palette.groundDark}" stroke-width="2" fill="none" opacity=".55"/>`;
      break;
    case 'rubble':
      markup = ground + connectedShape(mask, palette.rubble, 20) + texture(family, palette);
      break;
    case 'water':
      markup = rect(0, 0, 32, 32, palette.groundDark) + connectedShape(mask, palette.water, 24) + texture(family, palette);
      break;
    case 'bridge':
      markup = rect(0, 0, 32, 32, palette.water) + connectedShape(mask, palette.bridge, 13) +
        `<path d="M10 0v32M22 0v32M0 10h32M0 22h32" stroke="${palette.edge}" stroke-width="1" opacity=".5"/>`;
      break;
    case 'shelterbelt':
      markup = ground + connectedShape(mask, palette.shelter, 20) +
        `<circle cx="8" cy="9" r="5" fill="${palette.groundLight}" opacity=".34"/>` +
        `<circle cx="23" cy="19" r="6" fill="${palette.edge}" opacity=".5"/>`;
      break;
    case 'blocked':
      markup = rect(0, 0, 32, 32, palette.rock) +
        `<path d="M0 25L8 10l6 7 5-12 13 20v7H0z" fill="${palette.edge}"/>` +
        `<path d="M2 24L9 12l5 7 5-10 10 16" stroke="${palette.groundLight}" stroke-width="2" fill="none" opacity=".38"/>`;
      break;
    case 'settlement':
      markup = rect(0, 0, 32, 32, palette.settlement) + texture(family, palette);
      break;
    case 'industrial':
      markup = rect(0, 0, 32, 32, palette.industrial) + texture(family, palette);
      break;
    case 'field':
      markup = rect(0, 0, 32, 32, palette.field) + texture(family, palette);
      break;
    case 'bank':
      markup = ground + connectedShape(mask, palette.water, 19) +
        `<path d="M2 5c8 4 20-2 28 3M2 27c8-4 20 2 28-3" stroke="${palette.road}" stroke-width="3" fill="none" opacity=".7"/>`;
      break;
    case 'cliff':
      markup = rect(0, 0, 32, 32, palette.rock) + connectedShape(mask, palette.groundDark, 18) +
        `<path d="M0 21l6-8 5 5 6-10 6 9 9-6v21H0z" fill="${palette.edge}" opacity=".75"/>`;
      break;
    default:
      throw new RangeError(`Unknown terrain family: ${family}.`);
  }
  return markup + variantMark(mask, palette, variant);
}

function innerCornerMarkup(mask, palette) {
  const elements = [];
  if (mask & 1) elements.push(`<path d="M32 0H20Q20 12 32 12Z" fill="${palette.edge}" opacity=".5"/>`);
  if (mask & 2) elements.push(`<path d="M32 32V20Q20 20 20 32Z" fill="${palette.edge}" opacity=".5"/>`);
  if (mask & 4) elements.push(`<path d="M0 32H12Q12 20 0 20Z" fill="${palette.edge}" opacity=".5"/>`);
  if (mask & 8) elements.push(`<path d="M0 0V12Q12 12 12 0Z" fill="${palette.edge}" opacity=".5"/>`);
  return elements.join('');
}

function missingMarkup() {
  return rect(0, 0, 32, 32, '#ff4fa3') +
    '<path d="M0 0h8v8H0zm16 0h8v8h-8zM8 8h8v8H8zm16 0h8v8h-8zM0 16h8v8H0zm16 0h8v8h-8zM8 24h8v8H8zm16 0h8v8h-8z" fill="#111512"/>' +
    rect(1, 1, 30, 30, 'none', ' stroke="#ffffff" stroke-width="2"');
}

function frameRecord(id, x, y, tags) {
  return {
    id,
    rect: { x, y, w: TERRAIN_TILE_SIZE, h: TERRAIN_TILE_SIZE },
    sourceSize: { w: TERRAIN_TILE_SIZE, h: TERRAIN_TILE_SIZE },
    offset: { x: 0, y: 0 },
    anchor: { x: 0, y: 0 },
    attachments: { center: { x: 16, y: 16 } },
    masks: { tile: { x: 0, y: 0, w: 32, h: 32 } },
    tags,
  };
}

export function generateTerrainAtlas() {
  const frameSpecs = [];
  for (const biome of Object.keys(TERRAIN_BIOME_PROFILES).sort()) {
    const palette = TERRAIN_BIOME_PROFILES[biome].palette;
    for (const family of TERRAIN_VISUAL_FAMILIES) {
      for (let variant = 0; variant < TERRAIN_VARIANT_COUNT; variant += 1) {
        for (const mask of MASKS) {
          frameSpecs.push({
            id: terrainFrameId({ biome, family, cardinalMask: mask, variant }),
            markup: tileMarkup(family, mask, palette, variant),
            tags: ['terrain', biome, family, `variant-${variant}`, `mask-${mask}`],
          });
        }
      }
    }
    for (const mask of MASKS.slice(1)) {
      frameSpecs.push({
        id: terrainInnerCornerFrameId({ biome, innerCornerMask: mask }),
        markup: innerCornerMarkup(mask, palette),
        tags: ['terrain', biome, 'inner-corner', `mask-${mask}`],
      });
    }
  }
  frameSpecs.push({ id: 'terrain.missing', markup: missingMarkup(), tags: ['terrain', 'fallback', 'diagnostic'] });

  const rowCount = Math.ceil(frameSpecs.length / COLUMN_COUNT);
  const width = COLUMN_COUNT * TERRAIN_TILE_SIZE;
  const height = rowCount * TERRAIN_TILE_SIZE;
  const frames = {};
  const groups = [];
  frameSpecs.forEach((spec, index) => {
    const x = (index % COLUMN_COUNT) * TERRAIN_TILE_SIZE;
    const y = Math.floor(index / COLUMN_COUNT) * TERRAIN_TILE_SIZE;
    frames[spec.id] = frameRecord(spec.id, x, y, spec.tags);
    groups.push(`  <g id="${escapeXml(spec.id)}" transform="translate(${x} ${y})">${spec.markup}</g>`);
  });

  const paletteTokens = {};
  for (const [biome, profile] of Object.entries(TERRAIN_BIOME_PROFILES)) {
    for (const [token, value] of Object.entries(profile.palette)) paletteTokens[`${biome}.${token}`] = value;
  }

  const manifest = {
    schema: 'fields-of-resolve.sprite-atlas',
    version: 1,
    id: TERRAIN_ATLAS_ID,
    sampling: 'nearest',
    image: { src: 'terrain.svg', width, height, pixelRatio: 1 },
    directions: { order: ['n'], zero: 'n', clockwise: true },
    paletteTokens,
    frames,
    animations: {},
    fallback: { frame: 'terrain.missing' },
  };

  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">`,
    '  <title>Fields of Resolve authored terrain atlas</title>',
    `  <metadata>${escapeXml(JSON.stringify(TERRAIN_ATLAS_PROVENANCE))}</metadata>`,
    ...groups,
    '</svg>',
    '',
  ].join('\n');

  return Object.freeze({
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    svg,
    frameCount: frameSpecs.length,
    width,
    height,
  });
}
