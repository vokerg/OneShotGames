import { TERRAIN_TYPES } from '../../src/navigation/navigation-grid.js';

function freezePoint(point) {
  return Object.freeze({ ...point });
}

function freezeBlocker(blocker) {
  return Object.freeze({
    ...blocker,
    origin: freezePoint(blocker.origin),
    footprint: Object.freeze({ ...blocker.footprint }),
  });
}

function freezeMap(map) {
  return Object.freeze({
    ...map,
    terrain: Object.freeze((map.terrain || []).map(freezePoint)),
    bridges: Object.freeze((map.bridges || []).map(freezePoint)),
    blockers: Object.freeze((map.blockers || []).map(freezeBlocker)),
    start: map.start ? freezePoint(map.start) : undefined,
    destination: map.destination ? freezePoint(map.destination) : undefined,
    starts: map.starts ? Object.freeze(map.starts.map(freezePoint)) : undefined,
    destinations: map.destinations
      ? Object.freeze(map.destinations.map(freezePoint))
      : undefined,
    transportStart: map.transportStart ? freezePoint(map.transportStart) : undefined,
    transportExit: map.transportExit ? freezePoint(map.transportExit) : undefined,
    crossing: map.crossing ? freezePoint(map.crossing) : undefined,
  });
}

function verticalTerrain(x, height, type) {
  return Array.from({ length: height }, (_, y) => ({ x, y, type }));
}

function gateWall(x, height, gateY, prefix) {
  return Array.from({ length: height }, (_, y) => y)
    .filter((y) => y !== gateY)
    .map((y) => ({
      id: `${prefix}:${y}`,
      origin: { x, y },
      footprint: { width: 1, height: 1 },
    }));
}

const denseStarts = Array.from({ length: 36 }, (_, index) => ({
  x: 1 + (index % 6),
  y: 2 + Math.floor(index / 6),
}));
const denseDestinations = Array.from({ length: 36 }, (_, index) => ({
  x: 17 + (index % 6),
  y: 8 + Math.floor(index / 6),
}));

export const NAVIGATION_TORTURE_MAPS = Object.freeze({
  bridge: freezeMap({
    id: 'bridge-crossing',
    width: 18,
    height: 9,
    tileSize: 32,
    terrain: verticalTerrain(8, 9, TERRAIN_TYPES.WATER),
    bridges: [{ x: 8, y: 4 }],
    start: { x: 1, y: 2 },
    destination: { x: 16, y: 6 },
    crossing: { x: 8, y: 4 },
  }),
  baseGate: freezeMap({
    id: 'base-gate',
    width: 18,
    height: 9,
    tileSize: 32,
    blockers: gateWall(8, 9, 4, 'gate-wall'),
    start: { x: 1, y: 1 },
    destination: { x: 16, y: 7 },
    crossing: { x: 8, y: 4 },
  }),
  denseGroup: freezeMap({
    id: 'dense-group',
    width: 24,
    height: 16,
    tileSize: 32,
    starts: denseStarts,
    destinations: denseDestinations,
  }),
  transport: freezeMap({
    id: 'transport-crossing',
    width: 20,
    height: 12,
    tileSize: 32,
    terrain: verticalTerrain(9, 12, TERRAIN_TYPES.WATER),
    bridges: [{ x: 9, y: 6 }],
    transportStart: { x: 4, y: 6 },
    transportExit: { x: 15, y: 6 },
    crossing: { x: 9, y: 6 },
  }),
  destruction: Object.freeze({
    before: freezeMap({
      id: 'destruction-before',
      width: 18,
      height: 9,
      tileSize: 32,
      blockers: [{
        id: 'demolished-gate',
        origin: { x: 8, y: 4 },
        footprint: { width: 1, height: 1 },
      }],
      start: { x: 1, y: 4 },
      destination: { x: 16, y: 4 },
    }),
    after: freezeMap({
      id: 'destruction-after',
      width: 18,
      height: 9,
      tileSize: 32,
      start: { x: 1, y: 4 },
      destination: { x: 16, y: 4 },
    }),
  }),
  construction: Object.freeze({
    before: freezeMap({
      id: 'construction-before',
      width: 18,
      height: 9,
      tileSize: 32,
      start: { x: 1, y: 2 },
      destination: { x: 16, y: 2 },
    }),
    after: freezeMap({
      id: 'construction-after',
      width: 18,
      height: 9,
      tileSize: 32,
      blockers: gateWall(8, 9, 6, 'construction-wall'),
      start: { x: 1, y: 2 },
      destination: { x: 16, y: 2 },
      crossing: { x: 8, y: 6 },
    }),
  }),
});
