const DEFAULT_OPTIONS = Object.freeze({
  passes: 3,
  softness: 0.65,
  minimumRadius: 4,
});

function compareIds(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function assertOptions({ passes, softness, minimumRadius, worldWidth, worldHeight }) {
  if (!Number.isInteger(passes) || passes <= 0) throw new TypeError('Collision passes must be a positive integer.');
  if (!Number.isFinite(softness) || softness <= 0 || softness > 1) {
    throw new TypeError('Collision softness must be greater than 0 and at most 1.');
  }
  if (!Number.isFinite(minimumRadius) || minimumRadius <= 0) {
    throw new TypeError('Collision minimumRadius must be a positive number.');
  }
  if (!Number.isFinite(worldWidth) || worldWidth <= 0 || !Number.isFinite(worldHeight) || worldHeight <= 0) {
    throw new TypeError('Collision world bounds must be positive finite numbers.');
  }
}

function deterministicDirection(leftId, rightId) {
  const left = Number(leftId) || 0;
  const right = Number(rightId) || 0;
  const seed = ((left * 73856093) ^ (right * 19349663)) >>> 0;
  const angle = (seed / 0x100000000) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function collisionEntry(unit, getStats, minimumRadius) {
  if (!unit || unit.hp <= 0 || !Number.isFinite(unit.x) || !Number.isFinite(unit.y)) return null;
  const stats = getStats(unit);
  if (!stats || stats.air) return null;
  const radius = Math.max(minimumRadius, Number(stats.size) || minimumRadius);
  return { unit, radius, mass: radius * radius };
}

function clampUnit(entry, worldWidth, worldHeight) {
  entry.unit.x = Math.min(Math.max(entry.unit.x, entry.radius), worldWidth - entry.radius);
  entry.unit.y = Math.min(Math.max(entry.unit.y, entry.radius), worldHeight - entry.radius);
}

export function resolveUnitOverlaps(units, getStats, options = {}) {
  if (!Array.isArray(units)) throw new TypeError('Collision resolution requires a unit array.');
  if (typeof getStats !== 'function') throw new TypeError('Collision resolution requires a getStats callback.');

  const settings = {
    ...DEFAULT_OPTIONS,
    ...options,
  };
  assertOptions(settings);

  const entries = units
    .map((unit) => collisionEntry(unit, getStats, settings.minimumRadius))
    .filter(Boolean)
    .sort((left, right) => compareIds(left.unit.id, right.unit.id));
  const ids = new Set();
  for (const entry of entries) {
    const key = `${typeof entry.unit.id}:${entry.unit.id}`;
    if (ids.has(key)) throw new Error(`Duplicate collision unit id: ${entry.unit.id}`);
    ids.add(key);
    clampUnit(entry, settings.worldWidth, settings.worldHeight);
  }

  let pairsResolved = 0;
  let maximumOverlap = 0;
  for (let pass = 0; pass < settings.passes; pass += 1) {
    const displacement = new Map(entries.map((entry) => [entry.unit, { x: 0, y: 0 }]));
    let passPairs = 0;

    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      const left = entries[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < entries.length; rightIndex += 1) {
        const right = entries[rightIndex];
        let dx = right.unit.x - left.unit.x;
        let dy = right.unit.y - left.unit.y;
        let distance = Math.hypot(dx, dy);
        const requiredDistance = left.radius + right.radius;
        if (distance >= requiredDistance) continue;

        if (distance === 0) {
          const direction = deterministicDirection(left.unit.id, right.unit.id);
          dx = direction.x;
          dy = direction.y;
          distance = 1;
        }

        const overlap = requiredDistance - distance;
        maximumOverlap = Math.max(maximumOverlap, overlap);
        const push = overlap * settings.softness;
        const totalMass = left.mass + right.mass;
        const leftShare = right.mass / totalMass;
        const rightShare = left.mass / totalMass;
        const nx = dx / distance;
        const ny = dy / distance;
        const leftDelta = displacement.get(left.unit);
        const rightDelta = displacement.get(right.unit);
        leftDelta.x -= nx * push * leftShare;
        leftDelta.y -= ny * push * leftShare;
        rightDelta.x += nx * push * rightShare;
        rightDelta.y += ny * push * rightShare;
        passPairs += 1;
      }
    }

    for (const entry of entries) {
      const delta = displacement.get(entry.unit);
      entry.unit.x += delta.x;
      entry.unit.y += delta.y;
      clampUnit(entry, settings.worldWidth, settings.worldHeight);
    }
    pairsResolved += passPairs;
    if (passPairs === 0) break;
  }

  return Object.freeze({
    unitsConsidered: entries.length,
    pairsResolved,
    maximumOverlap,
  });
}
