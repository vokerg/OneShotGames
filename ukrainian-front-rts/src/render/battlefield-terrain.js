import { WORLD } from '../config.js';

// Presentation of the authoritative runtime cells: never infer passability from art.
const SURFACES = Object.freeze({
  0: ['#778867', '#7b8b6b'], // open
  1: ['#897458', '#917d60'], // mud
  2: ['#384f3c', '#405944'], // shelterbelt
  3: ['#777b77', '#858984'], // rubble
  4: ['#397e95', '#40879d'], // water
  5: ['#b3a17c', '#baa984'], // road
  6: ['#494f50', '#535a5b'], // blocked
});
const tileCaches = new WeakMap();

export function battlefieldTerrainColor(value, x = 0, y = 0, region = 'donbas') {
  const colors = SURFACES[value] ?? SURFACES[0];
  if (value === 0 && region === 'zaporizhzhia') return (x * 7 + y * 11) % 5 ? '#968f68' : '#99926b';
  if (value === 0 && region === 'kherson') return (x * 7 + y * 11) % 5 ? '#789279' : '#7c967c';
  return colors[(x * 7 + y * 11) % 5 === 0 ? 1 : 0];
}

function tile(renderer, value, x, y, region) {
  let cache = tileCaches.get(renderer);
  if (!cache) { cache = new Map(); tileCaches.set(renderer, cache); }
  const variant = (x * 7 + y * 11) % 5 === 0 ? 1 : 0;
  const key = `${region}:${value}:${variant}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = renderer.c.ownerDocument.createElement('canvas');
  canvas.width = canvas.height = WORLD.tile;
  const q = canvas.getContext('2d');
  q.fillStyle = battlefieldTerrainColor(value, x, y, region);
  q.fillRect(0, 0, WORLD.tile, WORLD.tile);
  // Fine grain replaces the conspicuous checkerboard. Each surface has its own marks.
  for (let i = 0; i < 9; i += 1) {
    const tx = (i * 13 + variant * 9) % 30, ty = (i * 19 + variant * 7) % 30;
    q.fillStyle = i % 2 ? 'rgba(255,255,230,.055)' : 'rgba(15,28,24,.07)';
    q.fillRect(tx, ty, 2 + i % 3, 1);
  }
  if (value === 4) {
    q.fillStyle = '#8fc6cb';
    for (const [tx, ty, width] of [[4, 7, 12], [19, 17, 8], [3, 26, 14]]) q.fillRect(tx, ty, width, 1);
    q.fillStyle = '#2e687e'; q.fillRect(9, 12, 16, 2);
  } else if (value === 1) {
    q.fillStyle = '#5f513e'; q.fillRect(5, 12, 11, 2); q.fillRect(18, 25, 8, 2);
  } else if (value === 3 || value === 6) {
    for (let i = 0; i < 4; i += 1) {
      const tx = (i * 13 + 3) % 26, ty = (i * 9 + 4) % 26;
      q.fillStyle = '#454e4d'; q.fillRect(tx + 1, ty + 2, 7, 5);
      q.fillStyle = value === 6 ? '#7a8380' : '#c0c3b7'; q.fillRect(tx, ty, 6, 4);
    }
  }
  cache.set(key, canvas);
  return canvas;
}

function drawShore(renderer, x, y, point, zoom, columns) {
  const q = renderer.x, terrain = renderer.g.terrain, size = WORLD.tile * zoom;
  const water = (cx, cy) => cx >= 0 && cy >= 0 && cx < columns && cy < WORLD.h / WORLD.tile && terrain[cy * columns + cx] === 4;
  q.fillStyle = '#c2bc8f';
  const edge = Math.max(1, 2 * zoom);
  if (!water(x, y - 1)) q.fillRect(point.x, point.y, size, edge);
  if (!water(x, y + 1)) q.fillRect(point.x, point.y + size - edge, size, edge);
  if (!water(x - 1, y)) q.fillRect(point.x, point.y, edge, size);
  if (!water(x + 1, y)) q.fillRect(point.x + size - edge, point.y, edge, size);
}

export function drawBattlefieldTerrain(renderer) {
  const { g: game, x: q } = renderer, zoom = game.camera.z, size = WORLD.tile;
  const columns = WORLD.w / size, rows = WORLD.h / size;
  const start = game.worldPos(0, 0), end = game.worldPos(renderer.c.clientWidth, renderer.c.clientHeight);
  const region = game.mission?.region ?? 'donbas';
  q.save();
  for (let y = Math.max(0, Math.floor(start.y / size)); y < Math.min(rows, Math.ceil(end.y / size)); y += 1) {
    for (let x = Math.max(0, Math.floor(start.x / size)); x < Math.min(columns, Math.ceil(end.x / size)); x += 1) {
      const value = game.terrain[y * columns + x] ?? 0, point = renderer.sp(x * size, y * size);
      q.drawImage(tile(renderer, value, x, y, region), point.x, point.y, Math.ceil(size * zoom) + 1, Math.ceil(size * zoom) + 1);
      if (value === 4) drawShore(renderer, x, y, point, zoom, columns);
      if (value === 2 && (x * 13 + y * 7) % 3 === 0) renderer.tree(point.x + 16 * zoom, point.y + 17 * zoom, zoom, x + y);
    }
  }
  // Authored operations already carry exact road cells. The polyline is only a legacy overlay.
  if (!game.mission?.authored && game.road?.length) {
    q.beginPath();
    game.road.forEach(([x, y], i) => { const p = renderer.sp(x, y); i ? q.lineTo(p.x, p.y) : q.moveTo(p.x, p.y); });
    q.lineCap = 'square'; q.strokeStyle = '#71654e'; q.lineWidth = 50 * zoom; q.stroke();
    q.strokeStyle = '#b3a17c'; q.lineWidth = 44 * zoom; q.stroke();
    q.strokeStyle = '#d2c29d'; q.lineWidth = 1.5 * zoom; q.setLineDash([12 * zoom, 18 * zoom]); q.stroke(); q.setLineDash([]);
  }
  for (const bridge of game.bridges ?? []) {
    const point = renderer.sp(bridge.x * size, bridge.y * size), width = size * zoom;
    if (point.x + width < 0 || point.y + width < 0 || point.x > renderer.c.clientWidth || point.y > renderer.c.clientHeight) continue;
    q.fillStyle = '#b6a381'; q.fillRect(point.x, point.y, width + 1, width + 1);
    q.fillStyle = '#685c46';
    for (let offset = 6; offset < size; offset += 6) q.fillRect(point.x, point.y + offset * zoom, width, Math.max(1, zoom));
    q.fillStyle = '#e1cfaa'; q.fillRect(point.x, point.y, Math.max(1, 2 * zoom), width); q.fillRect(point.x + width - 2 * zoom, point.y, Math.max(1, 2 * zoom), width);
  }
  q.restore();
}

export function resourceDisplayLabel(node, locale = 'en') {
  // Content authors may supply prose labels. Stable machine IDs stay out of the battlefield.
  if (typeof node.label === 'string' && !/[-_]/.test(node.label)) return node.label;
  const labels = locale === 'uk'
    ? { metal: 'Матеріали', fuel: 'Пальне', intel: 'Розвіддані' }
    : { metal: 'Materials', fuel: 'Fuel supply', intel: 'Intelligence' };
  return labels[node.kind] ?? '';
}
