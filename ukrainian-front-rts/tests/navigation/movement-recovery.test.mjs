import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MOVEMENT_RECOVERY_STATUSES,
  activateLocalDetour,
  chooseLocalDetour,
  ensureMovementRecoveryState,
  finishLocalDetour,
  recordMovementProgress,
} from '../../src/navigation/movement-recovery.js';

function makeGrid({ width = 5, height = 5, tileSize = 10, blocked = [] } = {}) {
  const blockedKeys = new Set(blocked.map(({ x, y }) => `${x},${y}`));
  return {
    width,
    height,
    tileSize,
    worldToCell(x, y) {
      const cell = { x: Math.floor(x / tileSize), y: Math.floor(y / tileSize) };
      if (cell.x < 0 || cell.y < 0 || cell.x >= width || cell.y >= height) throw new RangeError('outside');
      return cell;
    },
    cellToWorldCenter(x, y) {
      return { x: x * tileSize + tileSize / 2, y: y * tileSize + tileSize / 2 };
    },
    isPassable(x, y) {
      return x >= 0 && y >= 0 && x < width && y < height && !blockedKeys.has(`${x},${y}`);
    },
  };
}

test('detects deterministic stalls and oscillation that never beats best progress', () => {
  const order = {};
  const route = { nextIndex: 0 };
  const unit = { x: 5, y: 15 };
  const state = ensureMovementRecoveryState(order, route, unit, { x: 45, y: 15 });

  let result;
  for (let step = 0; step < 8; step += 1) {
    unit.x = step % 2 === 0 ? 6 : 5;
    result = recordMovementProgress(state, unit, 0.1, { minimumProgress: 2, stuckSeconds: 0.75 });
  }

  assert.equal(result.status, MOVEMENT_RECOVERY_STATUSES.STUCK);
  assert.equal(Math.abs(state.stalledSeconds - 0.8) < 1e-9, true);
});

test('resets the stall window after meaningful progress', () => {
  const order = {};
  const route = { nextIndex: 0 };
  const unit = { x: 5, y: 15 };
  const state = ensureMovementRecoveryState(order, route, unit, { x: 45, y: 15 });

  recordMovementProgress(state, unit, 0.5, { stuckSeconds: 0.75 });
  unit.x = 10;
  const progressing = recordMovementProgress(state, unit, 0.1, { stuckSeconds: 0.75 });
  const stalled = recordMovementProgress(state, unit, 0.2, { stuckSeconds: 0.75 });

  assert.equal(progressing.status, MOVEMENT_RECOVERY_STATUSES.PROGRESSING);
  assert.equal(stalled.status, MOVEMENT_RECOVERY_STATUSES.STALLED);
  assert.equal(state.stalledSeconds, 0.2);
});

test('chooses deterministic lateral detours and never retries an attempted cell', () => {
  const grid = makeGrid();
  const unit = { x: 15, y: 25 };
  const destination = { x: 45, y: 25 };

  const first = chooseLocalDetour(grid, unit, destination);
  const second = chooseLocalDetour(grid, unit, destination, { attemptedCellKeys: [first.cellKey] });

  assert.deepEqual(first.cell, { x: 2, y: 1 });
  assert.deepEqual(second.cell, { x: 2, y: 3 });
});

test('rejects diagonal corner cutting while selecting a local detour', () => {
  const grid = makeGrid({ blocked: [{ x: 2, y: 2 }] });
  const unit = { x: 15, y: 15 };
  const destination = { x: 45, y: 45 };
  const detour = chooseLocalDetour(grid, unit, destination);

  assert.notDeepEqual(detour.cell, { x: 2, y: 2 });
  assert.equal(grid.isPassable(detour.cell.x, detour.cell.y), true);
});

test('bounds repeated recovery attempts and resets the target after a completed detour', () => {
  const grid = makeGrid();
  const order = {};
  const route = { nextIndex: 0 };
  const unit = { x: 15, y: 25 };
  const destination = { x: 45, y: 25 };
  const state = ensureMovementRecoveryState(order, route, unit, destination);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const detour = chooseLocalDetour(grid, unit, destination, {
      attemptedCellKeys: state.attemptedCellKeys,
    });
    activateLocalDetour(state, detour, unit);
  }
  finishLocalDetour(state, unit, destination);

  assert.equal(state.detourAttempts, 3);
  assert.equal(new Set(state.attemptedCellKeys).size, 3);
  assert.equal(state.detour, null);
  assert.deepEqual(state.target, destination);
  assert.equal(state.stalledSeconds, 0);
});
