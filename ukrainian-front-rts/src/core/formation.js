export const FORMATION_STATES = Object.freeze({
  NONE: 'none',
  FORMED: 'formed',
  COMPRESSED: 'compressed',
});

export const DEFAULT_FORMATION_COMPRESSION_STEPS = Object.freeze([1, 0.75, 0.5, 0.25, 0]);

function assertPoint(point, label) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new TypeError(`${label} must contain finite x and y coordinates.`);
  }
}

function compareIds(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const leftKey = String(left);
  const rightKey = String(right);
  if (leftKey === rightKey) return 0;
  return leftKey < rightKey ? -1 : 1;
}

function freezePoint(point) {
  return Object.freeze({ x: point.x, y: point.y });
}

function normalizedDirection(start, destination) {
  const dx = destination.x - start.x;
  const dy = destination.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-9) return Object.freeze({ x: 0, y: -1 });
  return Object.freeze({ x: dx / length, y: dy / length });
}

function project(point, anchor, axis) {
  return (point.x - anchor.x) * axis.x + (point.y - anchor.y) * axis.y;
}

function formationSlots(count, spacing, forward, right) {
  const columns = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / columns);
  const slots = [];
  let assigned = 0;

  for (let row = 0; row < rows; row += 1) {
    const rowCount = Math.min(columns, count - assigned);
    const depth = (row - (rows - 1) / 2) * spacing;
    for (let column = 0; column < rowCount; column += 1) {
      const lateral = (column - (rowCount - 1) / 2) * spacing;
      slots.push(Object.freeze({
        lateral,
        depth,
        offset: freezePoint({
          x: right.x * lateral + forward.x * depth,
          y: right.y * lateral + forward.y * depth,
        }),
      }));
      assigned += 1;
    }
  }
  return slots;
}

function normalizedCompressionSteps(steps = DEFAULT_FORMATION_COMPRESSION_STEPS) {
  if (!Array.isArray(steps) || !steps.length) {
    throw new TypeError('Formation compression steps must be a non-empty array.');
  }
  const normalized = [...new Set(steps.map(Number))]
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 1)
    .sort((left, right) => right - left);
  if (!normalized.includes(0)) normalized.push(0);
  if (!normalized.includes(1)) normalized.unshift(1);
  return Object.freeze(normalized);
}

export function createFormationAssignments(units, anchorDestination, {
  spacing = 34,
  compressionSteps = DEFAULT_FORMATION_COMPRESSION_STEPS,
} = {}) {
  if (!Array.isArray(units) || units.length === 0) {
    throw new TypeError('Formation assignment requires at least one unit.');
  }
  assertPoint(anchorDestination, 'Formation destination');
  if (!Number.isFinite(spacing) || spacing <= 0) {
    throw new TypeError('Formation spacing must be a positive finite number.');
  }
  for (const unit of units) {
    assertPoint(unit, 'Formation unit');
    if (unit.id === undefined || unit.id === null) throw new TypeError('Formation units require stable ids.');
  }

  const anchorStart = freezePoint({
    x: units.reduce((sum, unit) => sum + unit.x, 0) / units.length,
    y: units.reduce((sum, unit) => sum + unit.y, 0) / units.length,
  });
  const destination = freezePoint(anchorDestination);
  const forward = normalizedDirection(anchorStart, destination);
  const right = Object.freeze({ x: -forward.y, y: forward.x });
  const slots = formationSlots(units.length, spacing, forward, right);
  const orderedUnits = [...units].sort((left, rightUnit) => {
    const depthDelta = project(left, anchorStart, forward) - project(rightUnit, anchorStart, forward);
    if (Math.abs(depthDelta) > 1e-9) return depthDelta;
    const lateralDelta = project(left, anchorStart, right) - project(rightUnit, anchorStart, right);
    if (Math.abs(lateralDelta) > 1e-9) return lateralDelta;
    return compareIds(left.id, rightUnit.id);
  });
  const groupIds = [...units].map((unit) => unit.id).sort(compareIds).join('.');
  const groupId = `formation:${groupIds}:${destination.x.toFixed(3)}:${destination.y.toFixed(3)}`;
  const steps = normalizedCompressionSteps(compressionSteps);

  const assignments = orderedUnits.map((unit, index) => {
    const slot = slots[index];
    const finalDestination = freezePoint({
      x: destination.x + slot.offset.x,
      y: destination.y + slot.offset.y,
    });
    return Object.freeze({
      unitId: unit.id,
      destination: finalDestination,
      formation: Object.freeze({
        groupId,
        anchorStart,
        anchorDestination: destination,
        slotOffset: slot.offset,
        slotIndex: index,
        spacing,
        compressionSteps: steps,
      }),
    });
  });

  return Object.freeze(assignments.sort((left, rightAssignment) => compareIds(left.unitId, rightAssignment.unitId)));
}

export function formationRouteDestination(order) {
  const destination = order?.formation?.anchorDestination ?? order?.navigationDestination ?? order;
  assertPoint(destination, 'Formation route destination');
  return destination;
}

function candidatePassable(grid, candidate, options) {
  try {
    const cell = grid.worldToCell(candidate.x, candidate.y);
    return grid.isPassable(cell.x, cell.y, options);
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

export function resolveFormationWaypoint(grid, anchorWaypoint, order, {
  layer,
  footprint,
  ignoreBlockerIds,
} = {}) {
  if (!grid || typeof grid.worldToCell !== 'function' || typeof grid.isPassable !== 'function') {
    throw new TypeError('Formation waypoint resolution requires a navigation-grid compatible object.');
  }
  assertPoint(anchorWaypoint, 'Formation anchor waypoint');
  const formation = order?.formation;
  if (!formation?.slotOffset) {
    return Object.freeze({
      x: anchorWaypoint.x,
      y: anchorWaypoint.y,
      compression: 1,
      state: FORMATION_STATES.NONE,
    });
  }

  const options = {};
  if (layer !== undefined) options.layer = layer;
  if (footprint !== undefined) options.footprint = footprint;
  if (ignoreBlockerIds !== undefined) options.ignoreBlockerIds = ignoreBlockerIds;
  const steps = normalizedCompressionSteps(formation.compressionSteps);

  for (const compression of steps) {
    const candidate = {
      x: anchorWaypoint.x + formation.slotOffset.x * compression,
      y: anchorWaypoint.y + formation.slotOffset.y * compression,
    };
    if (!candidatePassable(grid, candidate, options)) continue;
    return Object.freeze({
      ...candidate,
      compression,
      state: compression === 1 ? FORMATION_STATES.FORMED : FORMATION_STATES.COMPRESSED,
    });
  }

  return Object.freeze({
    x: anchorWaypoint.x,
    y: anchorWaypoint.y,
    compression: 0,
    state: FORMATION_STATES.COMPRESSED,
  });
}
