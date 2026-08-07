import test from "node:test";
import assert from "node:assert/strict";

import {
  ICE_WALL_RADIUS,
  SUN_TRACK_RADIUS,
  ambientTemperatureAt,
  daylightAt,
  edgePressureAt,
  sunPosition,
  windVectorAt,
} from "../physics.mjs";

const nearlyEqual = (a, b, epsilon = 1e-9) => Math.abs(a - b) <= epsilon;

test("the low Sun projection follows a circular track around the central pole", () => {
  for (const elapsed of [0, 17, 49, 103, 150, 301]) {
    const sun = sunPosition(elapsed);
    assert.ok(nearlyEqual(Math.hypot(sun.x, sun.y), SUN_TRACK_RADIUS));
  }
});

test("daylight is local to the Sun footprint rather than global", () => {
  const sun = sunPosition(0);
  const underSun = daylightAt(sun.x, sun.y, 0);
  const opposite = daylightAt(-sun.x, -sun.y, 0);
  assert.ok(underSun > 0.99);
  assert.ok(opposite < underSun * 0.35);
});

test("ice-wall pressure rises toward the rim", () => {
  assert.equal(edgePressureAt(0, 0), 0);
  assert.ok(edgePressureAt(0.8, 0) > edgePressureAt(0.68, 0));
  assert.ok(edgePressureAt(ICE_WALL_RADIUS, 0) > 0.99);
});

test("a firmament star fix materially reduces rim wind drift", () => {
  const unlocked = windVectorAt(0.87, 0.1, 72, 0);
  const locked = windVectorAt(0.87, 0.1, 72, 8);
  assert.ok(unlocked.strength > 0);
  assert.ok(locked.strength < unlocked.strength * 0.4);
});

test("the rim is colder than an equally dark inner position", () => {
  const elapsed = 0;
  const inner = ambientTemperatureAt(0, 0.3, elapsed);
  const rim = ambientTemperatureAt(0, 0.9, elapsed);
  assert.ok(rim < inner);
});
