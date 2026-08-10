import {
  RUSSIAN_VEHICLE_DIRECTIONS,
  RUSSIAN_VEHICLE_STATES,
  RUSSIAN_VEHICLE_UNIT_IDS,
  loadRussianVehicleAtlas,
  russianVehicleAnimationId,
} from './russian-vehicle-atlas.js';
import { loadSpriteAtlas } from './sprite-atlas-runtime.js';

const canvas = document.querySelector('#game');
const context = canvas.getContext('2d');
const labels = ['APC', 'IFV', 'BREAKTHROUGH MBT', 'RECOVERY', 'ENGINEERING'];
const scales = Object.freeze({ '1': 0.78, '2': 1.02, '3': 1.25 });
let runtime = null;
let loadError = null;
let stateIndex = 0;
let directionIndex = 2;
let reviewScale = scales['2'];
let paused = false;
let valueCheck = false;
let startedAt = performance.now();

const reviewState = {
  get ready() { return Boolean(runtime); },
  get error() { return loadError ? String(loadError.message ?? loadError) : null; },
  get state() { return RUSSIAN_VEHICLE_STATES[stateIndex]; },
  get direction() { return RUSSIAN_VEHICLE_DIRECTIONS[directionIndex]; },
  get scale() { return reviewScale; },
  get unitIds() { return [...RUSSIAN_VEHICLE_UNIT_IDS]; },
};
Object.defineProperty(window, '__russianVehicleArtLabReview', { value: reviewState, configurable: true });

function supportReviewActive() {
  const page = window.__UFR114_ART_LAB__?.getStatus?.().page;
  return Number.isInteger(page) && page >= 0;
}

async function load() {
  const fallback = await loadSpriteAtlas(new URL('../../assets/atlases/fallback.atlas.json', import.meta.url));
  runtime = await loadRussianVehicleAtlas({ fallbackRuntime: fallback });
}
load().catch((error) => {
  loadError = error;
  console.error('[art-lab] Russian vehicle atlas review load failed', error);
});

addEventListener('keydown', (event) => {
  if (supportReviewActive()) return;
  if (scales[event.key]) reviewScale = scales[event.key];
  if (event.key.toLowerCase() === 'u') stateIndex = (stateIndex + 1) % RUSSIAN_VEHICLE_STATES.length;
  if (event.key.toLowerCase() === 'r') directionIndex = (directionIndex + 1) % RUSSIAN_VEHICLE_DIRECTIONS.length;
  if (event.key.toLowerCase() === 'v') {
    valueCheck = !valueCheck;
    canvas.style.filter = valueCheck ? 'grayscale(1)' : '';
  }
  if (event.code === 'Space') {
    paused = !paused;
    if (!paused) startedAt = performance.now();
  }
});

function draw(now) {
  if (supportReviewActive()) {
    requestAnimationFrame(draw);
    return;
  }
  const width = canvas.clientWidth || innerWidth;
  const state = RUSSIAN_VEHICLE_STATES[stateIndex];
  const direction = RUSSIAN_VEHICLE_DIRECTIONS[directionIndex];
  const spacing = Math.min(150, Math.max(110, (width - 220) / RUSSIAN_VEHICLE_UNIT_IDS.length));
  const start = width / 2 - spacing * (RUSSIAN_VEHICLE_UNIT_IDS.length - 1) / 2;
  const y = 475;
  context.save();
  context.fillStyle = 'rgba(14,11,10,.92)';
  context.fillRect(Math.round(start - spacing * .58), y - 58, Math.round(spacing * RUSSIAN_VEHICLE_UNIT_IDS.length + spacing * .16), 100);
  context.textAlign = 'center';
  context.font = 'bold 11px ui-monospace, monospace';
  context.fillStyle = '#dfb49e';
  context.fillText(`UFR-113 RUSSIAN VEHICLES · ${state.toUpperCase()} · ${direction.toUpperCase()}`, Math.round(width / 2), y - 42);
  if (runtime) {
    for (let index = 0; index < RUSSIAN_VEHICLE_UNIT_IDS.length; index += 1) {
      const unitId = RUSSIAN_VEHICLE_UNIT_IDS[index];
      const x = start + index * spacing;
      runtime.drawAnimation(context, russianVehicleAnimationId(unitId, state), {
        x,
        y,
        elapsedMs: paused ? 0 : now - startedAt,
        direction,
        scale: reviewScale,
      });
      context.fillStyle = '#c9c1a2';
      context.font = 'bold 9px ui-monospace, monospace';
      context.fillText(labels[index], Math.round(x), y + 31);
    }
  } else {
    context.fillStyle = '#dfb49e';
    context.fillText(loadError ? 'RUSSIAN VEHICLE ATLAS FAILED TO LOAD' : 'LOADING RUSSIAN VEHICLE ATLAS…', Math.round(width / 2), y);
  }
  context.restore();
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);