import assert from 'node:assert/strict';
import test from 'node:test';

import {
  cameraPositionForViewportCenter,
  createViewportMetrics,
  readViewportMetrics,
  viewportWorldCenter,
} from '../../src/core/viewport-model.js';

test('viewport metrics normalize dimensions, bound DPR, and classify layout modes', () => {
  const standard = createViewportMetrics({ width: 1920, height: 1080, pixelRatio: 3 });
  assert.deepEqual(
    {
      cssWidth: standard.cssWidth,
      cssHeight: standard.cssHeight,
      pixelRatio: standard.pixelRatio,
      backingWidth: standard.backingWidth,
      backingHeight: standard.backingHeight,
      layoutMode: standard.layoutMode,
      belowMinimum: standard.belowMinimum,
    },
    {
      cssWidth: 1920,
      cssHeight: 1080,
      pixelRatio: 2,
      backingWidth: 3840,
      backingHeight: 2160,
      layoutMode: 'standard',
      belowMinimum: false,
    },
  );

  const compact = createViewportMetrics({ width: 1100, height: 680, pixelRatio: 1.25 });
  assert.equal(compact.layoutMode, 'compact');
  assert.equal(compact.belowMinimum, false);

  const minimum = createViewportMetrics({ width: 800, height: 500, pixelRatio: 0.2 });
  assert.equal(minimum.layoutMode, 'minimum');
  assert.equal(minimum.belowMinimum, true);
  assert.equal(minimum.pixelRatio, 0.75);
  assert.ok(Object.isFrozen(minimum));
  assert.ok(Object.isFrozen(minimum.limits));
});

test('viewport metrics keep maximum DPR at or above the normalized minimum', () => {
  const metrics = createViewportMetrics({
    width: 1280,
    height: 720,
    pixelRatio: 4,
    limits: {
      minimumPixelRatio: -2,
      maximumPixelRatio: -1,
    },
  });

  assert.equal(metrics.limits.minimumPixelRatio, 0.1);
  assert.equal(metrics.limits.maximumPixelRatio, 0.1);
  assert.equal(metrics.pixelRatio, 0.1);
  assert.equal(metrics.backingWidth, 128);
  assert.equal(metrics.backingHeight, 72);
});

test('camera world center remains stable when viewport dimensions change', () => {
  const camera = { x: -320, y: -180, z: 1.5 };
  const before = createViewportMetrics({ width: 1280, height: 720, pixelRatio: 1 });
  const after = createViewportMetrics({ width: 1920, height: 1080, pixelRatio: 2 });
  const center = viewportWorldCenter(camera, before);
  const position = cameraPositionForViewportCenter(camera, center, after);
  const resizedCamera = { ...camera, ...position };

  assert.deepEqual(viewportWorldCenter(resizedCamera, after), center);
  assert.equal(resizedCamera.z, camera.z);
});

test('viewport target reads fullscreen and zoom-related DPR without mutating targets', () => {
  const fullscreenTarget = { fullscreenElement: { id: 'shell' } };
  const viewportTarget = {
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1.5,
  };
  const metrics = readViewportMetrics(viewportTarget, fullscreenTarget);

  assert.equal(metrics.fullscreen, true);
  assert.equal(metrics.backingWidth, 2160);
  assert.equal(metrics.backingHeight, 1350);
  assert.equal(viewportTarget.innerWidth, 1440);
});
