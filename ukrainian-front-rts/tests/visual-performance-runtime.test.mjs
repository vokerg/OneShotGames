import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VISUAL_PERFORMANCE_BUDGETS,
  classifyAtlasOwnedEntity,
  installReleaseArtFallbackGuard,
  installRendererPerformancePatch,
  isWorldPointVisible,
  shouldSuppressProceduralFallback,
} from '../src/render/visual-performance-runtime.js';

function context() {
  return {
    imageSmoothingEnabled: true,
    clearRect() {},
  };
}

function makeRendererClass() {
  return class FakeRenderer {
    constructor() {
      this.c = { clientWidth: 800, clientHeight: 600 };
      this.x = context(); this.mx = context(); this.px = context(); this.fx = context();
      this.viewportMetrics = { cssWidth: 800, cssHeight: 600 };
      this.g = {
        camera: { x: 0, y: 0, z: 1 },
        units: [], buildings: [], nodes: [], projectiles: [], effects: [],
        selectedEntities: () => [],
        unitStats: (type) => ({
          uaDrone: { id: 'ua.recon-drone.fpv-strike', air: true },
          uaTank: { id: 'ua.tank.main-battle', armor: true },
          uaInfantry: { id: 'ua.rifle-squad', roleId: 'line-infantry' },
        }[type] ?? null),
      };
      this.calls = { unit: 0, building: 0, node: 0, effects: 0, fog: 0, render: 0, portrait: 0 };
    }
    sp(x, y) { return { x: x + this.g.camera.x, y: y + this.g.camera.y }; }
    unit() { this.calls.unit += 1; }
    building() { this.calls.building += 1; }
    resourceNode() { this.calls.node += 1; }
    effects() { this.calls.effects += 1; }
    fog() { this.calls.fog += 1; }
    portrait() { this.calls.portrait += 1; }
    render() {
      this.calls.render += 1;
      for (const node of this.g.nodes) this.resourceNode(node);
      for (const building of this.g.buildings) this.building(building);
      for (const unit of this.g.units) this.unit(unit);
      this.effects(); this.fog(); this.portrait(null);
    }
  };
}

test('atlas ownership identifies release-art entities and procedural fallback policy', () => {
  const Renderer = makeRendererClass();
  const renderer = new Renderer();
  assert.equal(classifyAtlasOwnedEntity(renderer, { type: 'uaDrone' })?.family, 'support');
  assert.equal(classifyAtlasOwnedEntity(renderer, { type: 'uaTank' })?.family, 'ukrainianVehicle');
  assert.equal(classifyAtlasOwnedEntity(renderer, { type: 'uaInfantry' })?.family, 'ukrainianInfantry');
  assert.equal(shouldSuppressProceduralFallback(renderer, { type: 'uaDrone' }), true);
  renderer.ukrainianInfantryAtlasStatus = () => ({ ready: false });
  assert.equal(shouldSuppressProceduralFallback(renderer, { type: 'uaInfantry' }), true);
  renderer.ukrainianInfantryAtlasStatus = () => ({ ready: true });
  assert.equal(shouldSuppressProceduralFallback(renderer, { type: 'uaInfantry' }), false);
});

test('release fallback guard suppresses owned procedural unit draw while preserving unrelated units', () => {
  const Renderer = makeRendererClass();
  installReleaseArtFallbackGuard(Renderer);
  const renderer = new Renderer();
  renderer.unit({ type: 'uaDrone' });
  renderer.unit({ type: 'unknown' });
  assert.equal(renderer.calls.unit, 1);
});

test('performance patch culls offscreen draw work, preserves game arrays, and forces nearest-neighbor contexts', () => {
  const Renderer = makeRendererClass();
  let clock = 0;
  installRendererPerformancePatch(Renderer, { now: () => (clock += 8) });
  const renderer = new Renderer();
  renderer.g.units = [{ x: 100, y: 100 }, { x: 5000, y: 5000 }];
  renderer.g.buildings = [{ x: 200, y: 200 }, { x: -5000, y: -5000 }];
  renderer.g.nodes = [{ x: 300, y: 300 }, { x: 9000, y: 9000 }];
  renderer.g.projectiles = [{ x: 400, y: 400 }, { x: 9000, y: 9000 }];
  renderer.g.effects = [{ x: 450, y: 450, radius: 20 }, { x: 9000, y: 9000, radius: 20 }];
  const units = renderer.g.units, buildings = renderer.g.buildings, projectiles = renderer.g.projectiles, effects = renderer.g.effects;
  renderer.render();
  const status = renderer.visualPerformanceStatus();
  assert.equal(status.unitsDrawn, 1); assert.equal(status.unitsCulled, 1);
  assert.equal(status.buildingsDrawn, 1); assert.equal(status.buildingsCulled, 1);
  assert.equal(status.nodesDrawn, 1); assert.equal(status.nodesCulled, 1);
  assert.equal(status.projectilesDrawn, 1); assert.equal(status.projectilesCulled, 1);
  assert.equal(status.effectsDrawn, 1); assert.equal(status.effectsCulled, 1);
  assert.equal(status.nearestNeighbor, true);
  assert.equal(renderer.g.units, units); assert.equal(renderer.g.buildings, buildings);
  assert.equal(renderer.g.projectiles, projectiles); assert.equal(renderer.g.effects, effects);
});

test('viewport culling keeps the configured safety margin', () => {
  const Renderer = makeRendererClass();
  const renderer = new Renderer();
  assert.equal(isWorldPointVisible(renderer, -VISUAL_PERFORMANCE_BUDGETS.viewportMarginPx + 1, 20), true);
  assert.equal(isWorldPointVisible(renderer, -VISUAL_PERFORMANCE_BUDGETS.viewportMarginPx - 1, 20), false);
});
