import {
  ENVIRONMENT_PROP_ATLAS_ID,
  ENVIRONMENT_PROP_BIOME_PALETTES,
  ENVIRONMENT_PROP_BIOMES,
  ENVIRONMENT_PROP_FAMILIES,
  ENVIRONMENT_PROP_PROFILES,
  ENVIRONMENT_PROP_PROVENANCE,
  environmentPropFrameId,
} from '../../src/render/environment-prop-system.js';

const PADDING = 1;
const MAX_WIDTH = 1024;

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function seasonPalette(palette, season) {
  if (season === 'snow') return { primary: palette.snow, secondary: palette.masonry, accent: palette.ink };
  if (season === 'wet') return { primary: palette.mud, secondary: palette.metal, accent: palette.highlight };
  if (season === 'autumn') return { primary: palette.foliageAutumn, secondary: palette.foliageDry, accent: palette.bark };
  if (season === 'leafless') return { primary: palette.bark, secondary: palette.wood, accent: palette.ink };
  if (season === 'burned') return { primary: palette.ink, secondary: palette.rust, accent: palette.flame };
  if (season === 'green') return { primary: palette.foliage, secondary: palette.foliageLight, accent: palette.bark };
  return { primary: palette.foliageDry, secondary: palette.earth, accent: palette.bark };
}

function stateOpacity(state) {
  if (state === 'salvaged') return 0.72;
  if (state === 'destroyed' || state === 'wreck') return 0.88;
  if (state === 'damaged' || state === 'disabled') return 0.94;
  return 1;
}

function commonVariantMarks(width, height, palette, variant) {
  const offset = 4 + variant * 3;
  return [
    `<path d="M${offset} ${height - 8}h8v2h-8zM${Math.max(2, width - offset - 10)} ${height - 13}h6v2h-6z" fill="${palette.highlight}" opacity="0.35"/>`,
    variant % 2
      ? `<path d="M${width / 2 - 5} ${height - 6}h10v2h-10z" fill="${palette.ink}" opacity="0.28"/>`
      : `<path d="M${width / 2 - 8} ${height - 10}h16v2h-16z" fill="${palette.ink}" opacity="0.22"/>`,
  ];
}

function damageMarks(width, height, palette, state) {
  if (state === 'intact') return [];
  if (state === 'burning') {
    return [
      `<path d="M${width / 2 - 8} ${height / 2 + 4}l5-15 5 9 5-18 7 22-7 11z" fill="${palette.flame}"/>`,
      `<path d="M${width / 2 - 3} ${height / 2 + 1}l4-10 4 10-4 8z" fill="#ffe08a"/>`,
    ];
  }
  const rubbleY = Math.max(8, height - 14);
  return [
    `<path d="M4 ${rubbleY}l8-6 7 5 8-8 8 9 9-5 8 7 8-4v12H4z" fill="${palette.rust}" opacity="0.7"/>`,
    `<path d="M${width / 2 - 2} 8l-5 ${height / 3} 8 7-6 ${height / 3}" fill="none" stroke="${palette.ink}" stroke-width="2"/>`,
  ];
}

function familyMarkup(spec) {
  const { family, state, season, variant, width, height, palette } = spec;
  const colors = seasonPalette(palette, season);
  const cx = width / 2;
  const ground = height - 8;
  const marks = [];

  if (family === 'shelterbelt') {
    marks.push(`<rect x="4" y="${ground - 4}" width="${width - 8}" height="5" fill="${palette.earth}"/>`);
    for (let i = 0; i < 4; i += 1) {
      const x = 10 + i * 17 + (variant % 2 ? (i % 2) * 2 : 0);
      marks.push(`<rect x="${x}" y="${ground - 30 - (i % 2) * 4}" width="5" height="30" fill="${palette.bark}"/>`);
      if (state !== 'destroyed') {
        marks.push(`<rect x="${x - 8}" y="${ground - 42 - (i % 2) * 4}" width="21" height="17" rx="3" fill="${colors.primary}"/>`);
        marks.push(`<rect x="${x - 4}" y="${ground - 47 - (i % 2) * 4}" width="15" height="11" rx="3" fill="${colors.secondary}"/>`);
      }
    }
  } else if (family === 'tree') {
    marks.push(`<ellipse cx="${cx + 4}" cy="${ground}" rx="15" ry="5" fill="${palette.ink}" opacity="0.2"/>`);
    marks.push(`<rect x="${cx - 3}" y="${ground - 34}" width="7" height="34" fill="${palette.bark}"/>`);
    if (state !== 'destroyed') {
      const canopyW = 34 + variant * 2;
      marks.push(`<rect x="${cx - canopyW / 2}" y="${ground - 52}" width="${canopyW}" height="25" rx="8" fill="${colors.primary}"/>`);
      marks.push(`<rect x="${cx - 12 + variant}" y="${ground - 60}" width="24" height="17" rx="7" fill="${colors.secondary}"/>`);
    } else {
      marks.push(`<path d="M${cx - 3} ${ground - 28}l-10-7 3-3 10 5 8-12 4 2-8 17z" fill="${palette.bark}"/>`);
    }
  } else if (family === 'wall') {
    marks.push(`<rect x="3" y="${ground - 18}" width="${width - 6}" height="18" fill="${palette.masonry}" stroke="${palette.ink}" stroke-width="2"/>`);
    marks.push(`<path d="M5 ${ground - 10}h${width - 10}M12 ${ground - 18}v18M25 ${ground - 18}v18" stroke="${palette.roof}" stroke-width="2"/>`);
    if (state === 'destroyed') marks.push(`<rect x="${cx - 7}" y="${ground - 18}" width="14" height="18" fill="${palette.earth}"/>`);
  } else if (family === 'fence') {
    marks.push(`<path d="M6 ${ground - 24}v24M${width - 7} ${ground - 24}v24M5 ${ground - 18}h${width - 10}M5 ${ground - 8}h${width - 10}" stroke="${palette.wood}" stroke-width="4"/>`);
    if (state !== 'intact') marks.push(`<path d="M${cx - 3} ${ground - 20}l7 14" stroke="${palette.ink}" stroke-width="3"/>`);
  } else if (family === 'house') {
    marks.push(`<rect x="8" y="${ground - 43}" width="${width - 16}" height="43" fill="${palette.masonry}" stroke="${palette.ink}" stroke-width="2"/>`);
    marks.push(`<path d="M4 ${ground - 43}L${cx} ${ground - 70 - variant * 2}l${cx - 4} ${27 + variant * 2}z" fill="${palette.roof}" stroke="${palette.ink}" stroke-width="2"/>`);
    marks.push(`<rect x="${cx - 7}" y="${ground - 22}" width="14" height="22" fill="${palette.wood}"/>`);
    marks.push(`<rect x="15" y="${ground - 32}" width="10" height="10" fill="${palette.highlight}" opacity="0.65"/>`);
    if (state === 'destroyed') marks.push(`<path d="M8 ${ground - 43}l18 18 14-14 18 22v23H8z" fill="${palette.earth}"/>`);
  } else if (family === 'industrial') {
    marks.push(`<rect x="7" y="${ground - 35}" width="${width - 14}" height="35" fill="${palette.metal}" stroke="${palette.ink}" stroke-width="2"/>`);
    marks.push(`<ellipse cx="${cx - 18}" cy="${ground - 36}" rx="14" ry="9" fill="${palette.masonry}" stroke="${palette.ink}" stroke-width="2"/>`);
    marks.push(`<rect x="${cx - 32}" y="${ground - 38}" width="28" height="31" fill="${palette.masonry}"/>`);
    marks.push(`<path d="M${cx + 4} ${ground - 8}v-52h9v25h24" fill="none" stroke="${palette.rust}" stroke-width="6"/>`);
    marks.push(`<rect x="${cx + 24}" y="${ground - 43}" width="18" height="16" fill="${palette.roof}"/>`);
  } else if (family === 'crater') {
    marks.push(`<ellipse cx="${cx}" cy="${ground - 7}" rx="${14 + variant}" ry="${8 + variant % 2}" fill="${palette.ink}" opacity="0.65"/>`);
    marks.push(`<ellipse cx="${cx - 2}" cy="${ground - 9}" rx="${9 + variant}" ry="${4 + variant % 2}" fill="${season === 'wet' ? palette.mud : palette.earth}"/>`);
    marks.push(`<path d="M5 ${ground - 9}l8-3M${width - 5} ${ground - 8}l-8-4" stroke="${palette.earth}" stroke-width="3"/>`);
  } else if (family === 'wreckage') {
    marks.push(`<ellipse cx="${cx + 3}" cy="${ground - 3}" rx="${width / 2 - 7}" ry="8" fill="${palette.ink}" opacity="0.25"/>`);
    marks.push(`<path d="M8 ${ground - 12}l9-23h${width - 35}l14 13 9 17-12 5H12z" fill="${palette.rust}" stroke="${palette.ink}" stroke-width="2"/>`);
    marks.push(`<rect x="${cx - 13}" y="${ground - 37}" width="26" height="15" fill="${palette.metal}" transform="rotate(${variant * 4 - 4} ${cx} ${ground - 29})"/>`);
    marks.push(`<circle cx="${cx - 20}" cy="${ground - 7}" r="6" fill="${palette.ink}"/><circle cx="${cx + 21}" cy="${ground - 7}" r="6" fill="${palette.ink}"/>`);
    if (state === 'salvaged') marks.push(`<path d="M16 ${ground - 30}h${width - 32}v18H16z" fill="${palette.earth}" opacity="0.75"/>`);
  }

  marks.push(...damageMarks(width, height, palette, state));
  marks.push(...commonVariantMarks(width, height, palette, variant));
  return `<g id="${xmlEscape(spec.id)}" opacity="${stateOpacity(state)}">${marks.join('')}</g>`;
}

function frameSpecs() {
  const frames = [{
    id: 'environment.missing', family: 'missing', biome: 'diagnostic', state: 'intact', season: 'diagnostic', variant: 0,
    width: 32, height: 32, palette: ENVIRONMENT_PROP_BIOME_PALETTES.donbas,
  }];
  for (const biome of ENVIRONMENT_PROP_BIOMES) {
    const palette = ENVIRONMENT_PROP_BIOME_PALETTES[biome];
    for (const family of ENVIRONMENT_PROP_FAMILIES) {
      const profile = ENVIRONMENT_PROP_PROFILES[family];
      for (const state of profile.states.filter((candidate) => candidate !== 'cleared')) {
        for (const season of profile.seasons) {
          for (let variant = 0; variant < profile.variants; variant += 1) {
            frames.push({
              id: environmentPropFrameId({ biome, family, state, season, variant }),
              family, biome, state, season, variant,
              width: profile.canvas.width,
              height: profile.canvas.height,
              palette,
            });
          }
        }
      }
    }
  }
  return frames.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function pack(frames) {
  let x = PADDING;
  let y = PADDING;
  let rowHeight = 0;
  let packedWidth = 0;
  for (const frame of frames) {
    if (x + frame.width + PADDING > MAX_WIDTH && x > PADDING) {
      x = PADDING;
      y += rowHeight + PADDING;
      rowHeight = 0;
    }
    frame.x = x;
    frame.y = y;
    x += frame.width + PADDING;
    rowHeight = Math.max(rowHeight, frame.height);
    packedWidth = Math.max(packedWidth, x);
  }
  return { width: Math.max(1, packedWidth), height: y + rowHeight + PADDING };
}

function fallbackMarkup() {
  return '<g id="environment.missing"><rect x="1" y="1" width="30" height="30" fill="#ff4fa3"/><path d="M1 1h8v8H1zm16 0h8v8h-8zM9 9h8v8H9zm16 0h6v8h-6zM1 17h8v8H1zm16 0h8v8h-8zM9 25h8v6H9zm16 0h6v6h-6z" fill="#111512"/><rect x="1" y="1" width="30" height="30" fill="none" stroke="#fff" stroke-width="2"/></g>';
}

export function generateEnvironmentPropAtlas() {
  const frames = frameSpecs();
  const dimensions = pack(frames);
  const manifestFrames = {};
  const frameMarkup = {};
  const svgGroups = [];

  for (const frame of frames) {
    const profile = frame.family === 'missing' ? null : ENVIRONMENT_PROP_PROFILES[frame.family];
    const localMarkup = frame.family === 'missing' ? fallbackMarkup() : familyMarkup(frame);
    frameMarkup[frame.id] = localMarkup;
    svgGroups.push(`<g transform="translate(${frame.x} ${frame.y})">${localMarkup}</g>`);
    const footprintWidth = profile ? profile.footprint.width * 32 : 30;
    const footprintHeight = profile ? profile.footprint.height * 32 : 13;
    const footprintX = profile ? Math.max(0, Math.floor((frame.width - footprintWidth) / 2)) : 1;
    const footprintY = profile ? Math.max(0, frame.height - footprintHeight) : 18;
    manifestFrames[frame.id] = {
      id: frame.id,
      rect: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      sourceSize: { w: frame.width, h: frame.height },
      offset: { x: 0, y: 0 },
      anchor: { x: frame.width / 2, y: frame.height },
      attachments: {
        effect: { x: frame.width / 2, y: Math.max(1, Math.floor(frame.height * 0.35)) },
        selection: { x: frame.width / 2, y: Math.max(1, frame.height - 8) },
      },
      masks: {
        footprint: { x: footprintX, y: footprintY, w: Math.min(frame.width - footprintX, footprintWidth), h: Math.min(frame.height - footprintY, footprintHeight) },
        ...(profile?.occlusion ? { occlusion: profile.occlusion.region } : {}),
      },
      tags: frame.family === 'missing'
        ? ['fallback', 'diagnostic']
        : ['environment', frame.family, frame.biome, frame.state, frame.season, `variant-${frame.variant}`, profile.layer],
    };
  }

  const manifest = {
    schema: 'fields-of-resolve.sprite-atlas',
    version: 1,
    id: ENVIRONMENT_PROP_ATLAS_ID,
    sampling: 'nearest',
    image: { src: 'environment-props.svg', width: dimensions.width, height: dimensions.height, pixelRatio: 1 },
    directions: { order: ['n'], zero: 'n', clockwise: true },
    paletteTokens: Object.fromEntries(Object.entries(ENVIRONMENT_PROP_BIOME_PALETTES.donbas).sort()),
    frames: manifestFrames,
    animations: {},
    fallback: { frame: 'environment.missing' },
    metadata: {
      provenance: ENVIRONMENT_PROP_PROVENANCE,
      families: ENVIRONMENT_PROP_FAMILIES,
      biomes: ENVIRONMENT_PROP_BIOMES,
      frameCount: frames.length,
    },
  };
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimensions.width}" height="${dimensions.height}" viewBox="0 0 ${dimensions.width} ${dimensions.height}" shape-rendering="crispEdges">`,
    '  <title>Fields of Resolve authored environment prop atlas</title>',
    `  <metadata>${xmlEscape(JSON.stringify({ atlas: ENVIRONMENT_PROP_ATLAS_ID, provenance: ENVIRONMENT_PROP_PROVENANCE }))}</metadata>`,
    ...svgGroups.map((group) => `  ${group}`),
    '</svg>',
    '',
  ].join('\n');

  return Object.freeze({
    frameCount: frames.length,
    width: dimensions.width,
    height: dimensions.height,
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    svg,
    frames: Object.freeze(frames.map((frame) => Object.freeze({ ...frame }))),
    frameMarkup: Object.freeze(frameMarkup),
  });
}
