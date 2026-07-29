const UINT32_RANGE = 0x1_0000_0000;
const FALLBACK_SEED = 0x6d2b79f5;

export const DEFAULT_SIMULATION_SEED = 'fields-of-resolve-v1';

export function normalizeSeed(seed = DEFAULT_SIMULATION_SEED) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (Math.trunc(seed) >>> 0) || FALLBACK_SEED;
  }

  const text = String(seed);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) || FALLBACK_SEED;
}

export function deriveSimulationSeed(seed, stream) {
  return normalizeSeed(`${normalizeSeed(seed)}:${String(stream)}`);
}

export class SeededRandom {
  constructor(seed = DEFAULT_SIMULATION_SEED) {
    this.reset(seed);
  }

  reset(seed = this.seed ?? DEFAULT_SIMULATION_SEED) {
    this.seed = normalizeSeed(seed);
    this.state = this.seed;
    this.draws = 0;
    return this;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    this.draws += 1;
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }

  range(min, max) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new RangeError(`Invalid random range: ${min}..${max}`);
    }
    return min + this.next() * (max - min);
  }

  integer(min, maxExclusive) {
    if (!Number.isInteger(min) || !Number.isInteger(maxExclusive) || maxExclusive <= min) {
      throw new RangeError(`Invalid random integer range: ${min}..${maxExclusive}`);
    }
    return Math.floor(this.range(min, maxExclusive));
  }

  pick(values) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new RangeError('Cannot pick from an empty random collection.');
    }
    return values[this.integer(0, values.length)];
  }

  snapshot() {
    return { seed: this.seed, state: this.state, draws: this.draws };
  }

  restore(snapshot) {
    if (
      !snapshot ||
      !Number.isInteger(snapshot.seed) ||
      !Number.isInteger(snapshot.state) ||
      !Number.isInteger(snapshot.draws) ||
      snapshot.draws < 0
    ) {
      throw new TypeError('Invalid seeded-random snapshot.');
    }
    this.seed = snapshot.seed >>> 0;
    this.state = snapshot.state >>> 0;
    this.draws = snapshot.draws;
    return this;
  }
}

export const simulationRandom = new SeededRandom(DEFAULT_SIMULATION_SEED);

export const setSimulationSeed = (seed) => simulationRandom.reset(seed);
export const snapshotSimulationRandom = () => simulationRandom.snapshot();
export const restoreSimulationRandom = (snapshot) => simulationRandom.restore(snapshot);
