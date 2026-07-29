import assert from 'node:assert/strict';
import test from 'node:test';

import {
  VISIBILITY_BLOCKERS,
  createVisibilityField,
  createVisibilityQuery,
  resolveLineOfSight,
  traceGridCells,
} from '../../src/visibility/line-of-sight.js';

const point = (x, y) => ({ x: x * 32 + 16, y: y * 32 + 16 });

test('traces deterministic grid cells between endpoints', () => {
  assert.deepEqual(traceGridCells(point(0, 0), point(3, 2)), [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 2 },
  ]);
});

test('reports clear line of sight through open cells', () => {
  const field = createVisibilityField({ width: 5, height: 1 });
  assert.deepEqual(resolveLineOfSight(field, point(0, 0), point(4, 0)), {
    visible: true,
    reason: null,
    cell: null,
  });
});

test('terrain occlusion blocks visibility', () => {
  const field = createVisibilityField({ width: 5, height: 1, terrain: [{ x: 2, y: 0 }] });
  const result = resolveLineOfSight(field, point(0, 0), point(4, 0));
  assert.equal(result.visible, false);
  assert.equal(result.reason, VISIBILITY_BLOCKERS.TERRAIN);
  assert.deepEqual(result.cell, { x: 2, y: 0 });
});

test('building blockers use the same authoritative result', () => {
  const field = createVisibilityField({ width: 5, height: 1, blockers: [{ x: 2, y: 0 }] });
  assert.equal(resolveLineOfSight(field, point(0, 0), point(4, 0)).reason, VISIBILITY_BLOCKERS.BUILDING);
});

test('smoke blocks unless explicitly ignored', () => {
  const field = createVisibilityField({ width: 5, height: 1, smoke: [{ x: 2, y: 0 }] });
  assert.equal(resolveLineOfSight(field, point(0, 0), point(4, 0)).reason, VISIBILITY_BLOCKERS.SMOKE);
  assert.equal(resolveLineOfSight(field, point(0, 0), point(4, 0), { smokeBlocks: false }).visible, true);
});

test('elevation above the interpolated sight ray occludes', () => {
  const field = createVisibilityField({ width: 3, height: 1, elevation: [0, 3, 0] });
  assert.equal(resolveLineOfSight(field, point(0, 0), point(2, 0)).reason, VISIBILITY_BLOCKERS.ELEVATION);
});

test('visibility query powers fog-style entity filtering', () => {
  const field = createVisibilityField({ width: 5, height: 1, blockers: [{ x: 2, y: 0 }] });
  const query = createVisibilityQuery(field);
  const entities = [point(1, 0), point(4, 0)];
  assert.deepEqual(query.visibleEntities(point(0, 0), entities), [point(1, 0)]);
  assert.equal(query.canSee(point(0, 0), point(4, 0)), false);
});
