import {
  createVisualRegressionScenes,
  summarizeVisualRegressionScenes,
  validateVisualRegressionScenes,
} from './visual-regression-scenes.js';

const WIDTH = 144;
const HEIGHT = 56;
const factionColor = { Ukraine: '#2f74b5', Russia: '#a6463d' };
const terrainColor = {
  ground: '#5e7a46', road: '#62666a', mud: '#584b3b', rubble: '#777267', water: '#315d78',
  bridge: '#725b3d', shelterbelt: '#314d32', blocked: '#4a4742', settlement: '#6d7276',
  industrial: '#626862', field: '#7f7a48', bank: '#aa925e', cliff: '#6a5f54',
};

function hash(value) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

function seededColor(value, lightness = 48) {
  return `hsl(${hash(value) % 360} 52% ${lightness}%)`;
}

function drawBackdrop(context, entry) {
  context.fillStyle = '#111820';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = '#2d3944';
  context.lineWidth = 1;
  for (let x = 0; x < WIDTH; x += 12) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, HEIGHT); context.stroke(); }
  for (let y = 0; y < HEIGHT; y += 12) { context.beginPath(); context.moveTo(0, y); context.lineTo(WIDTH, y); context.stroke(); }
  context.fillStyle = seededColor(entry.id, 32);
  context.fillRect(0, HEIGHT - 9, WIDTH, 9);
}

function drawUnit(context, entry) {
  drawBackdrop(context, entry);
  context.fillStyle = factionColor[entry.faction] ?? seededColor(entry.faction);
  context.beginPath(); context.arc(72, 27, 14, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#e8edf2'; context.fillRect(68, 10, 8, 24); context.fillRect(58, 22, 28, 7);
  context.fillStyle = seededColor(entry.unitId, 62); context.fillRect(65, 31, 14, 9);
}

function drawBuilding(context, entry) {
  drawBackdrop(context, entry);
  context.fillStyle = factionColor[entry.faction] ?? seededColor(entry.faction); context.fillRect(39, 19, 66, 27);
  context.fillStyle = seededColor(entry.buildingId, 60);
  context.beginPath(); context.moveTo(34, 20); context.lineTo(72, 5); context.lineTo(110, 20); context.closePath(); context.fill();
  context.fillStyle = '#1b232b'; context.fillRect(64, 30, 16, 16);
}

function drawTerrain(context, entry) {
  context.fillStyle = terrainColor[entry.tileId] ?? seededColor(entry.tileId); context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = seededColor(entry.biomeId, 58);
  const offset = hash(entry.id) % 11;
  for (let y = -8; y < HEIGHT; y += 16) for (let x = -8; x < WIDTH; x += 18) context.fillRect(x + ((y / 16) % 2) * 8 + offset, y + offset, 5, 5);
}

function drawEffect(context, entry) {
  drawBackdrop(context, entry);
  const hue = hash(entry.effectFamily) % 360;
  for (let radius = 23; radius > 2; radius -= 5) {
    context.fillStyle = `hsla(${hue + radius * 3} 88% 60% / ${0.18 + (24 - radius) / 30})`;
    context.beginPath(); context.arc(72, 28, radius, 0, Math.PI * 2); context.fill();
  }
}

function drawUi(context, entry) {
  context.fillStyle = '#111820'; context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#27343f'; context.fillRect(5, 5, WIDTH - 10, HEIGHT - 10);
  context.strokeStyle = seededColor(entry.screenId, 65); context.lineWidth = 2; context.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
  context.fillStyle = '#4b5965'; context.fillRect(10, 10, 34, 32);
  context.fillStyle = '#7d8e9c'; context.fillRect(49, 10, 84, 7); context.fillRect(49, 22, 65, 6); context.fillRect(49, 33, 76, 9);
}

function drawZoom(context, entry) {
  drawBackdrop(context, entry);
  context.save(); context.translate(72, 28); context.scale(entry.scale, entry.scale);
  context.fillStyle = '#d8b34e'; context.fillRect(-18, -12, 36, 24);
  context.fillStyle = '#3b566a'; context.fillRect(-8, -20, 16, 40); context.restore();
}

function drawDisplay(context) {
  context.fillStyle = '#1d2c36'; context.fillRect(0, 0, WIDTH, HEIGHT);
  ['#2f74b5', '#d8b34e', '#a6463d', '#5e7a46'].forEach((color, index) => { context.fillStyle = color; context.fillRect(8 + index * 34, 8, 28, 40); });
}

const drawers = { unit: drawUnit, building: drawBuilding, terrain: drawTerrain, effect: drawEffect, ui: drawUi, zoom: drawZoom, display: drawDisplay };
const catalog = validateVisualRegressionScenes(createVisualRegressionScenes());
const grid = document.querySelector('#sceneGrid');

for (const entry of catalog.scenes) {
  const card = document.createElement('article');
  card.className = 'scene'; card.dataset.sceneId = entry.id; card.dataset.category = entry.category;
  if (entry.displayMode) card.dataset.displayMode = entry.displayMode;
  const title = entry.id.slice(entry.id.indexOf(':') + 1);
  const header = document.createElement('header');
  const strong = document.createElement('strong'); strong.title = title; strong.textContent = title;
  const small = document.createElement('small'); small.textContent = entry.category;
  header.append(strong, small); card.append(header);
  const canvas = document.createElement('canvas'); canvas.width = WIDTH; canvas.height = HEIGHT; canvas.setAttribute('aria-label', entry.id);
  card.append(canvas); drawers[entry.category](canvas.getContext('2d'), entry); grid.append(card);
}

const summary = summarizeVisualRegressionScenes(catalog);
document.querySelector('#summary').textContent = `${summary.total} scenes · ${Object.entries(summary.categories).map(([key, value]) => `${key} ${value}`).join(' · ')}`;
document.documentElement.dataset.visualRegressionReady = 'true';
document.documentElement.dataset.sceneCount = String(summary.total);
window.__visualRegression = Object.freeze({ catalog, summary, ready: true });
