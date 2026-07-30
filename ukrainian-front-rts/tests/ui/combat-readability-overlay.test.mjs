import assert from 'node:assert/strict';
import test from 'node:test';

import {
  drawCombatReadabilityOverlay,
  installCombatReadabilityOverlay,
} from '../../src/render/combat-readability-overlay.js';

function context() {
  const calls = [];
  return {
    calls,
    save() { calls.push('save'); },
    restore() { calls.push('restore'); },
    setLineDash(value) { calls.push(['dash', ...value]); },
    beginPath() { calls.push('begin'); },
    arc(...value) { calls.push(['arc', ...value]); },
    stroke() { calls.push('stroke'); },
    moveTo(...value) { calls.push(['move', ...value]); },
    lineTo(...value) { calls.push(['line', ...value]); },
    fillText(...value) { calls.push(['text', ...value]); },
    set strokeStyle(value) {},
    set fillStyle(value) {},
    set lineWidth(value) {},
    set globalAlpha(value) {},
    set textAlign(value) {},
    set font(value) {},
  };
}

const snapshot = {
  rangeRings: [{ position: { x: 1, y: 2 }, minRange: 5, maxRange: 10 }],
  targetLines: [{ from: { x: 1, y: 2 }, to: { x: 3, y: 4 } }],
  cues: [{
    kind: 'damage',
    position: { x: 3, y: 4 },
    value: 12,
    remainingTicks: 10,
    durationTicks: 45,
    severity: 'info',
  }],
};

test('draws range rings, target lines, and transient labels', () => {
  const drawing = context();
  const renderer = { x: drawing, sp: (x, y) => ({ x: x * 2, y: y * 2 }) };
  assert.equal(drawCombatReadabilityOverlay({
    game: { camera: { z: 1 } },
    renderer,
    snapshot,
  }), true);
  assert.ok(drawing.calls.some((call) => Array.isArray(call) && call[0] === 'arc'));
  assert.ok(drawing.calls.some((call) => Array.isArray(call) && call[0] === 'line'));
  assert.ok(drawing.calls.some(
    (call) => Array.isArray(call) && call[0] === 'text' && call[1] === '-12',
  ));
});

test('installer renders after the base renderer and restores exact method identity', () => {
  const order = [];
  const game = { combatReadabilitySnapshot: () => snapshot, camera: { z: 1 } };
  const renderer = {
    x: context(),
    sp: (x, y) => ({ x, y }),
    render() { order.push('base'); },
  };
  const originalRender = renderer.render;
  const dispose = installCombatReadabilityOverlay({ game, renderer });
  renderer.render();
  assert.equal(order[0], 'base');
  dispose();
  assert.equal(renderer.render, originalRender);
});

test('overlay fails closed without a snapshot', () => {
  assert.equal(drawCombatReadabilityOverlay({ game: {}, renderer: {}, snapshot: null }), false);
});
