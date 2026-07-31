import test from "node:test";
import assert from "node:assert/strict";
import { LEVELS } from "../src/levels.js";

const inside = (value, max) => Number.isFinite(value) && value >= 0 && value <= max;

test("campaign has five uniquely identified levels", () => {
  assert.equal(LEVELS.length, 5);
  assert.equal(new Set(LEVELS.map((level) => level.id)).size, LEVELS.length);
});

test("required objectives and entities stay inside the 40x22 world", () => {
  for (const level of LEVELS) {
    assert.ok(level.name, `${level.id}: missing name`);
    assert.ok(level.par > 0, `${level.id}: invalid par time`);

    for (const [label, point] of [["spawn", level.spawn], ["switch", level.switch], ["exit", level.exit]]) {
      assert.ok(inside(point.x, 40), `${level.id}: ${label}.x outside world`);
      assert.ok(inside(point.y, 22), `${level.id}: ${label}.y outside world`);
    }

    for (const solid of [...level.solids, ...level.spikes]) {
      assert.ok(solid.w > 0 && solid.h > 0, `${level.id}: non-positive rectangle`);
      assert.ok(solid.x >= 0 && solid.y >= 0, `${level.id}: rectangle starts outside world`);
      assert.ok(solid.x + solid.w <= 40, `${level.id}: rectangle exceeds world width`);
      assert.ok(solid.y + solid.h <= 22, `${level.id}: rectangle exceeds world height`);
    }

    for (const point of [...level.gold, ...level.mines, ...level.turrets]) {
      assert.ok(inside(point.x, 40), `${level.id}: entity.x outside world`);
      assert.ok(inside(point.y, 22), `${level.id}: entity.y outside world`);
    }

    for (const drone of level.drones) {
      assert.ok(drone.x1 < drone.x2, `${level.id}: drone patrol is reversed`);
      assert.ok(inside(drone.x1, 40) && inside(drone.x2, 40), `${level.id}: drone patrol outside world`);
      assert.ok(inside(drone.y, 22), `${level.id}: drone.y outside world`);
      assert.ok(drone.speed > 0, `${level.id}: drone speed must be positive`);
    }
  }
});

test("each level offers collectibles and the campaign escalates hazards", () => {
  for (const level of LEVELS) assert.ok(level.gold.length >= 10, `${level.id}: too little gold`);
  assert.equal(LEVELS[0].mines.length + LEVELS[0].turrets.length + LEVELS[0].drones.length, 0);
  assert.ok(LEVELS.at(-1).mines.length >= 5);
  assert.ok(LEVELS.at(-1).turrets.length >= 2);
  assert.ok(LEVELS.at(-1).drones.length >= 2);
});
