import { ABILITIES, BUILDING_TYPES, UNIT_TYPES, UPGRADES } from '../config.js';
import { resolveUiArtAsset } from './ui-art-catalog.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const COMMAND_ICON_IDS = Object.freeze({
  'attack-ground': Object.freeze(['cursors', 'targetGround']),
  'attack-move': Object.freeze(['cursors', 'attackMove']),
  patrol: Object.freeze(['cursors', 'patrol']),
  guard: Object.freeze(['cursors', 'guard']),
  follow: Object.freeze(['cursors', 'follow']),
  'hold-position-order': Object.freeze(['cursors', 'holdPosition']),
  'return-for-repair': Object.freeze(['cursors', 'repair']),
  stop: Object.freeze(['cursors', 'select']),
});

function normalized(value) {
  return String(value || '').replace(/^✓\s*/, '').trim().toLowerCase();
}

function found(family, id) {
  const result = resolveUiArtAsset(family, id);
  return result.status === 'found' ? result : null;
}

function nameIndex() {
  const index = new Map();
  const register = (family, values) => {
    for (const [id, value] of Object.entries(values || {})) {
      if (!found(family, id)) continue;
      for (const label of [value?.name, value?.short, value?.role]) {
        const key = normalized(label);
        if (key && !index.has(key)) index.set(key, Object.freeze([family, id]));
      }
    }
  };
  register('unitIcons', UNIT_TYPES);
  register('buildingIcons', BUILDING_TYPES);
  register('abilityIcons', ABILITIES);
  register('upgradeIcons', UPGRADES);
  return index;
}

const ICON_BY_NAME = nameIndex();

export function resolveCommandCardIcon(action = {}) {
  const direct = COMMAND_ICON_IDS[action.id];
  const named = ICON_BY_NAME.get(normalized(action.title));
  const requested = direct || named;
  if (requested) {
    const result = resolveUiArtAsset(requested[0], requested[1]);
    if (result.status === 'found') return result;
  }

  const groupFallback = {
    order: ['cursors', 'select'],
    targeting: ['cursors', 'targetEntity'],
    stance: ['cursors', 'attack'],
    construction: ['cursors', 'buildValid'],
  }[action.group];
  if (groupFallback) return resolveUiArtAsset(groupFallback[0], groupFallback[1]);
  return resolveUiArtAsset('fallback', `command:${action.id || normalized(action.title) || 'unknown'}`);
}

function svgNode(documentTarget, tagName, attributes = {}) {
  const node = documentTarget.createElementNS(SVG_NS, tagName);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
}

function marker(asset) {
  let value = 2166136261;
  for (const character of String(asset.symbolId || asset.key)) {
    value ^= character.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return 5 + ((value >>> 0) % 21);
}

function drawGlyph(documentTarget, svg, asset, status) {
  const common = { fill: 'currentColor', stroke: 'currentColor', 'stroke-width': 2 };
  if (status !== 'found') {
    svg.append(
      svgNode(documentTarget, 'rect', { x: 2, y: 2, width: 28, height: 28, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }),
      svgNode(documentTarget, 'path', { d: 'M7 7L25 25M25 7L7 25', fill: 'none', stroke: 'currentColor', 'stroke-width': 4 }),
    );
    return;
  }

  if (asset.family === 'unitIcons') {
    svg.append(svgNode(documentTarget, 'path', { d: 'M16 3L27 10L24 25L16 29L8 25L5 10Z', ...common, fill: 'none' }));
    svg.append(svgNode(documentTarget, 'circle', { cx: 16, cy: 16, r: 4, ...common }));
  } else if (asset.family === 'buildingIcons') {
    svg.append(svgNode(documentTarget, 'path', { d: 'M4 14L16 5L28 14V28H4Z', ...common, fill: 'none' }));
    svg.append(svgNode(documentTarget, 'rect', { x: 13, y: 18, width: 6, height: 10, ...common, fill: 'none' }));
  } else if (asset.family === 'abilityIcons') {
    svg.append(svgNode(documentTarget, 'path', { d: 'M16 4L28 16L16 28L4 16Z', ...common, fill: 'none' }));
    svg.append(svgNode(documentTarget, 'path', { d: 'M10 21L16 7L22 21L16 17Z', ...common }));
  } else if (asset.family === 'upgradeIcons') {
    svg.append(svgNode(documentTarget, 'circle', { cx: 16, cy: 16, r: 11, ...common, fill: 'none' }));
    svg.append(svgNode(documentTarget, 'path', { d: 'M16 5V27M5 16H27M12 20L16 9L20 20L16 16Z', ...common, fill: 'none' }));
  } else {
    svg.append(svgNode(documentTarget, 'path', { d: 'M3 2L25 17L16 19L20 29L14 31L10 21L3 27Z', ...common, fill: 'none' }));
  }

  const coordinate = marker(asset);
  svg.append(svgNode(documentTarget, 'rect', { x: coordinate, y: 27 - (coordinate % 21), width: 2, height: 2, fill: 'currentColor' }));
}

export function createCommandCardIcon(documentTarget, action = {}) {
  if (!documentTarget?.createElementNS) return null;
  const result = resolveCommandCardIcon(action);
  const svg = svgNode(documentTarget, 'svg', {
    class: 'commandCardIcon',
    viewBox: '0 0 32 32',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.dataset.iconKey = result.asset.key;
  svg.dataset.iconStatus = result.status;
  drawGlyph(documentTarget, svg, result.asset, result.status);
  return svg;
}
