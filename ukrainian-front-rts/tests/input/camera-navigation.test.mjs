import test from 'node:test';
import assert from 'node:assert/strict';

import { createCameraNavigation, selectedCenter } from '../../src/input/camera-navigation.js';

function createGame() {
  const entities = [
    { id: 1, x: 100, y: 200, hp: 100 },
    { id: 2, x: 300, y: 400, hp: 100 },
  ];
  return {
    camera: { x: 10, y: 20, z: 1 },
    selectedEntities: () => entities,
  };
}

const viewport = { width: () => 800, height: () => 600 };

test('selectedCenter averages living selected entities', () => {
  const game = createGame();
  assert.deepEqual(selectedCenter(game), { x: 200, y: 300 });
  game.selectedEntities = () => [{ id: 3, x: 5, y: 7, hp: 0 }];
  assert.equal(selectedCenter(game), null);
});

test('edge scrolling pans while preserving existing keyboard navigation state', () => {
  const game = createGame();
  const camera = createCameraNavigation(game, viewport, { edgeSpeed: 100, edgeSize: 20 });
  camera.pointerMove({ clientX: 0, clientY: 300 });
  assert.equal(camera.update(0.5), true);
  assert.equal(game.camera.x, 60);
  assert.equal(game.camera.y, 20);
});

test('middle drag pans by pointer delta and suppresses edge scrolling', () => {
  const game = createGame();
  const camera = createCameraNavigation(game, viewport, { edgeSpeed: 100 });
  assert.equal(camera.pointerDown({ button: 1, clientX: 100, clientY: 100 }), true);
  assert.equal(camera.pointerMove({ clientX: 125, clientY: 85 }), true);
  assert.deepEqual(game.camera, { x: 35, y: 5, z: 1 });
  assert.equal(camera.update(1), false);
  assert.equal(camera.pointerUp({ button: 1 }), true);
});

test('bookmarks save with Shift+F-key and recall with F-key', () => {
  const game = createGame();
  const camera = createCameraNavigation(game, viewport);
  assert.equal(camera.handleBookmark({ key: 'F2', shiftKey: false }).changed, false);
  assert.equal(camera.handleBookmark({ key: 'F2', shiftKey: true }).changed, true);
  game.camera = { x: 999, y: 888, z: 0.5 };
  assert.equal(camera.handleBookmark({ key: 'F2', shiftKey: false }).changed, true);
  assert.deepEqual(game.camera, { x: 10, y: 20, z: 1 });
});

test('focus selected centers the averaged selection and settings can disable features', () => {
  const game = createGame();
  const camera = createCameraNavigation(game, viewport);
  assert.equal(camera.focusSelected(), true);
  assert.deepEqual(game.camera, { x: 200, y: 0, z: 1 });

  const disabled = createCameraNavigation(game, viewport, {
    edgeScroll: false,
    middleDrag: false,
    bookmarks: false,
    focusSelected: false,
  });
  disabled.pointerMove({ clientX: 0, clientY: 0 });
  assert.equal(disabled.update(1), false);
  assert.equal(disabled.pointerDown({ button: 1, clientX: 0, clientY: 0 }), false);
  assert.equal(disabled.handleBookmark({ key: 'F1', shiftKey: true }), null);
  assert.equal(disabled.focusSelected(), false);
});
