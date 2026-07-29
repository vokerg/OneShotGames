import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveUnitOverlaps } from '../../src/systems/unit-collision-system.js';

const stats = {
  infantry: { size: 10 },
  vehicle: { size: 20 },
  drone: { size: 8, air: true },
};
const getStats = (unit) => stats[unit.type];
const options = { worldWidth: 500, worldHeight: 500 };

function cloneUnits(units) {
  return units.map((unit) => ({ ...unit }));
}

test('separates overlapping infantry using size-derived footprints', () => {
  const units = cloneUnits([
    { id: 1, type: 'infantry', hp: 100, x: 100, y: 100 },
    { id: 2, type: 'infantry', hp: 100, x: 110, y: 100 },
  ]);
  const before = Math.hypot(units[1].x - units[0].x, units[1].y - units[0].y);

  const result = resolveUnitOverlaps(units, getStats, options);
  const after = Math.hypot(units[1].x - units[0].x, units[1].y - units[0].y);

  assert.equal(result.unitsConsidered, 2);
  assert.equal(result.pairsResolved > 0, true);
  assert.equal(after > before, true);
});

test('moves lighter infantry farther than a larger vehicle', () => {
  const units = cloneUnits([
    { id: 1, type: 'infantry', hp: 100, x: 100, y: 100 },
    { id: 2, type: 'vehicle', hp: 300, x: 110, y: 100 },
  ]);

  resolveUnitOverlaps(units, getStats, { ...options, passes: 1, softness: 1 });

  assert.equal(100 - units[0].x > units[1].x - 110, true);
});

test('resolves exact overlaps deterministically regardless of input order', () => {
  const source = [
    { id: 7, type: 'infantry', hp: 100, x: 200, y: 200 },
    { id: 3, type: 'infantry', hp: 100, x: 200, y: 200 },
  ];
  const first = cloneUnits(source);
  const second = cloneUnits([...source].reverse());

  resolveUnitOverlaps(first, getStats, options);
  resolveUnitOverlaps(second, getStats, options);

  const normalized = (units) => units
    .sort((left, right) => left.id - right.id)
    .map(({ id, x, y }) => ({ id, x, y }));
  assert.deepEqual(normalized(first), normalized(second));
});

test('clamps collision footprints inside world bounds', () => {
  const units = [{ id: 1, type: 'vehicle', hp: 300, x: -50, y: 999 }];

  resolveUnitOverlaps(units, getStats, options);

  assert.deepEqual({ x: units[0].x, y: units[0].y }, { x: 20, y: 480 });
});

test('ignores air and destroyed units', () => {
  const units = cloneUnits([
    { id: 1, type: 'drone', hp: 50, x: 100, y: 100 },
    { id: 2, type: 'infantry', hp: 0, x: 100, y: 100 },
  ]);

  const result = resolveUnitOverlaps(units, getStats, options);

  assert.equal(result.unitsConsidered, 0);
  assert.deepEqual(units.map(({ x, y }) => ({ x, y })), [{ x: 100, y: 100 }, { x: 100, y: 100 }]);
});

test('rejects duplicate stable unit ids', () => {
  const units = cloneUnits([
    { id: 1, type: 'infantry', hp: 100, x: 100, y: 100 },
    { id: 1, type: 'vehicle', hp: 300, x: 110, y: 100 },
  ]);

  assert.throws(() => resolveUnitOverlaps(units, getStats, options), /Duplicate collision unit id/);
});
