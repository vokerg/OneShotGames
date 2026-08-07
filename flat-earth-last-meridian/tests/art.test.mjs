import test from "node:test";
import assert from "node:assert/strict";

import { createArtSystem } from "../art.mjs";

test("cinematic art system constructs without browser globals", () => {
  const art = createArtSystem();
  assert.equal(typeof art.update, "function");
  assert.equal(typeof art.render, "function");
});

test("art particle update accepts a stationary expedition model", () => {
  const art = createArtSystem();
  assert.doesNotThrow(() => art.update(1 / 60, {
    moving: false,
    overdrive: false,
    player: { x: 0, y: 0, heading: 0 },
  }));
});
