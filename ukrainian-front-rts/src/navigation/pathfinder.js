import { MOVEMENT_LAYERS } from './navigation-grid.js';

export const DIAGONAL_POLICIES = Object.freeze({
  NEVER: 'never',
  ALLOW: 'allow',
  NO_CORNER_CUT: 'no-corner-cut',
});

export const PATH_STATUSES = Object.freeze({
  FOUND: 'found',
  START_BLOCKED: 'start-blocked',
  GOAL_BLOCKED: 'goal-blocked',
  UNREACHABLE: 'unreachable',
  SEARCH_LIMIT: 'search-limit',
});

const CARDINAL_STEPS = Object.freeze([
  Object.freeze({ dx: 0, dy: -1, distance: 1 }),
  Object.freeze({ dx: 1, dy: 0, distance: 1 }),
  Object.freeze({ dx: 0, dy: 1, distance: 1 }),
  Object.freeze({ dx: -1, dy: 0, distance: 1 }),
]);

const DIAGONAL_STEPS = Object.freeze([
  Object.freeze({ dx: 1, dy: -1, distance: Math.SQRT2 }),
  Object.freeze({ dx: 1, dy: 1, distance: Math.SQRT2 }),
  Object.freeze({ dx: -1, dy: 1, distance: Math.SQRT2 }),
  Object.freeze({ dx: -1, dy: -1, distance: Math.SQRT2 }),
]);

function assertCell(cell, label) {
  if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)) {
    throw new TypeError(`${label} must contain integer x and y coordinates.`);
  }
}

function assertGrid(grid) {
  if (!grid || typeof grid.isPassable !== 'function' || typeof grid.movementCost !== 'function') {
    throw new TypeError('Pathfinding requires a navigation-grid compatible object.');
  }
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function minimumMovementCost(grid, layer) {
  const costs = Object.values(grid.terrainRules ?? {})
    .map((rule) => rule?.[layer])
    .filter((cost) => Number.isFinite(cost) && cost > 0);
  return costs.length ? Math.min(...costs) : 1;
}

function heuristic(from, goal, diagonalPolicy, minimumCost) {
  const dx = Math.abs(goal.x - from.x);
  const dy = Math.abs(goal.y - from.y);
  if (diagonalPolicy === DIAGONAL_POLICIES.NEVER) return (dx + dy) * minimumCost;
  const diagonal = Math.min(dx, dy);
  const straight = Math.max(dx, dy) - diagonal;
  return (diagonal * Math.SQRT2 + straight) * minimumCost;
}

function compareNodes(left, right) {
  return left.f - right.f ||
    left.h - right.h ||
    left.y - right.y ||
    left.x - right.x ||
    left.sequence - right.sequence;
}

function freezePath(path) {
  return Object.freeze(path.map((cell) => Object.freeze({ x: cell.x, y: cell.y })));
}

function result(status, { path = [], cost = null, visited = 0 } = {}) {
  return Object.freeze({ status, path: freezePath(path), cost, visited });
}

function reconstruct(nodes, goalKey) {
  const path = [];
  let key = goalKey;
  while (key !== null) {
    const node = nodes.get(key);
    path.push({ x: node.x, y: node.y });
    key = node.parent;
  }
  return path.reverse();
}

function isInBounds(grid, x, y, footprint) {
  return x >= 0 && y >= 0 &&
    x + footprint.width <= grid.width &&
    y + footprint.height <= grid.height;
}

function canUseDiagonal(grid, x, y, step, query, diagonalPolicy) {
  if (diagonalPolicy !== DIAGONAL_POLICIES.NO_CORNER_CUT) return true;
  const horizontal = { x: x + step.dx, y };
  const vertical = { x, y: y + step.dy };
  return grid.isPassable(horizontal.x, horizontal.y, query) &&
    grid.isPassable(vertical.x, vertical.y, query);
}

export function findPath(grid, start, goal, {
  layer = MOVEMENT_LAYERS.GROUND,
  footprint = { width: 1, height: 1 },
  ignoreBlockerIds = [],
  diagonalPolicy = DIAGONAL_POLICIES.NO_CORNER_CUT,
  maxVisited = grid?.width * grid?.height,
} = {}) {
  assertGrid(grid);
  assertCell(start, 'Path start');
  assertCell(goal, 'Path goal');
  if (!Object.values(DIAGONAL_POLICIES).includes(diagonalPolicy)) {
    throw new Error(`Unknown diagonal policy: ${diagonalPolicy}`);
  }
  if (!Number.isInteger(maxVisited) || maxVisited <= 0) {
    throw new TypeError('Path search maxVisited must be a positive integer.');
  }
  if (!footprint || !Number.isInteger(footprint.width) || !Number.isInteger(footprint.height) ||
      footprint.width <= 0 || footprint.height <= 0) {
    throw new TypeError('Path footprint must have positive integer width and height.');
  }

  if (!isInBounds(grid, start.x, start.y, footprint)) return result(PATH_STATUSES.START_BLOCKED);
  if (!isInBounds(grid, goal.x, goal.y, footprint)) return result(PATH_STATUSES.GOAL_BLOCKED);

  const query = { layer, footprint, ignoreBlockerIds };
  if (!grid.isPassable(start.x, start.y, query)) return result(PATH_STATUSES.START_BLOCKED);
  if (!grid.isPassable(goal.x, goal.y, query)) return result(PATH_STATUSES.GOAL_BLOCKED);
  if (start.x === goal.x && start.y === goal.y) {
    return result(PATH_STATUSES.FOUND, { path: [start], cost: 0, visited: 1 });
  }

  const minimumCost = minimumMovementCost(grid, layer);
  const nodes = new Map();
  const open = [];
  const openKeys = new Set();
  const closed = new Set();
  let sequence = 0;

  const startKey = keyOf(start.x, start.y);
  const startH = heuristic(start, goal, diagonalPolicy, minimumCost);
  const startNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: startH,
    f: startH,
    parent: null,
    sequence: sequence++,
  };
  nodes.set(startKey, startNode);
  open.push(startNode);
  openKeys.add(startKey);

  let visited = 0;
  const steps = diagonalPolicy === DIAGONAL_POLICIES.NEVER
    ? CARDINAL_STEPS
    : [...CARDINAL_STEPS, ...DIAGONAL_STEPS];

  while (open.length) {
    open.sort(compareNodes);
    const current = open.shift();
    const currentKey = keyOf(current.x, current.y);
    openKeys.delete(currentKey);
    if (closed.has(currentKey)) continue;

    if (visited >= maxVisited) return result(PATH_STATUSES.SEARCH_LIMIT, { visited });
    closed.add(currentKey);
    visited += 1;

    if (current.x === goal.x && current.y === goal.y) {
      return result(PATH_STATUSES.FOUND, {
        path: reconstruct(nodes, currentKey),
        cost: current.g,
        visited,
      });
    }

    for (const step of steps) {
      const x = current.x + step.dx;
      const y = current.y + step.dy;
      if (!isInBounds(grid, x, y, footprint)) continue;
      if (step.distance > 1 && !canUseDiagonal(grid, current.x, current.y, step, query, diagonalPolicy)) continue;
      if (!grid.isPassable(x, y, query)) continue;

      const neighborKey = keyOf(x, y);
      if (closed.has(neighborKey)) continue;
      const movementCost = grid.movementCost(x, y, layer);
      const tentativeG = current.g + movementCost * step.distance;
      const existing = nodes.get(neighborKey);
      if (existing && tentativeG >= existing.g) continue;

      const h = heuristic({ x, y }, goal, diagonalPolicy, minimumCost);
      const neighbor = existing ?? { x, y, sequence: sequence++ };
      neighbor.g = tentativeG;
      neighbor.h = h;
      neighbor.f = tentativeG + h;
      neighbor.parent = currentKey;
      nodes.set(neighborKey, neighbor);
      if (!openKeys.has(neighborKey)) {
        open.push(neighbor);
        openKeys.add(neighborKey);
      }
    }
  }

  return result(PATH_STATUSES.UNREACHABLE, { visited });
}
