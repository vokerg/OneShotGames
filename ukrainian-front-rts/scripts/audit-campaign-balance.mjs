import { CAMPAIGN_OPERATION_SEQUENCE } from '../src/content/campaign/campaign-operation-registry.js';
import { buildCampaignPlaytestMatrix } from '../src/content/campaign/campaign-balance.js';

const matrix = buildCampaignPlaytestMatrix(CAMPAIGN_OPERATION_SEQUENCE);
const byOperation = new Map();
for (const row of matrix) {
  const rows = byOperation.get(row.operationId) ?? [];
  rows.push(row);
  byOperation.set(row.operationId, rows);
}

const failures = [];
for (const [operationId, rows] of byOperation) {
  const story = rows.find((row) => row.difficulty === 'story');
  const standard = rows.find((row) => row.difficulty === 'standard');
  const veteran = rows.find((row) => row.difficulty === 'veteran');
  if (!(story.resourceMultiplier > standard.resourceMultiplier && standard.resourceMultiplier > veteran.resourceMultiplier)) {
    failures.push(`${operationId}: starting-resource curve is not monotonic`);
  }
  if (!(story.pressureDelayMultiplier > standard.pressureDelayMultiplier && standard.pressureDelayMultiplier > veteran.pressureDelayMultiplier)) {
    failures.push(`${operationId}: pressure timing curve is not monotonic`);
  }
  if (!(story.objectiveTimerMultiplier > standard.objectiveTimerMultiplier && standard.objectiveTimerMultiplier > veteran.objectiveTimerMultiplier)) {
    failures.push(`${operationId}: objective timer curve is not monotonic`);
  }
  if (!(story.recoveryWindowSeconds > standard.recoveryWindowSeconds && standard.recoveryWindowSeconds > veteran.recoveryWindowSeconds)) {
    failures.push(`${operationId}: recovery window curve is not monotonic`);
  }
  if (rows.some((row) => row.combatStatMultiplier !== 1)) failures.push(`${operationId}: hidden combat-stat modifier detected`);
}

if (matrix.length !== 27) failures.push(`expected 27 operation/difficulty playtest rows, got ${matrix.length}`);

if (failures.length) {
  console.error('[campaign-balance] failed');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`[campaign-balance] PASS ${matrix.length} deterministic cases across ${byOperation.size} operations`);
for (const [operationId, rows] of byOperation) {
  console.log(`${operationId}: ${rows.map((row) => `${row.difficulty}=resources:${row.resourceMultiplier.toFixed(3)},pressure:${row.pressureDelayMultiplier.toFixed(3)},objective:${row.objectiveTimerMultiplier.toFixed(2)},recovery:${row.recoveryWindowSeconds}s`).join(' | ')}`);
}
