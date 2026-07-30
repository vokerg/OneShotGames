const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const SMOKE_POLICY = Object.freeze({
  maxDensity: 1,
  visionBlockDensity: 0.65,
  accuracyPenaltyAtMaxDensity: 0.55,
  minimumAccuracyMultiplier: 0.35,
  fadeFraction: 0.25,
});

export function normalizeSmokeDensity(value) {
  const density = Number(value);
  if (!Number.isFinite(density)) return 0;
  return clamp(density, 0, SMOKE_POLICY.maxDensity);
}

export function combineSmokeDensity(...values) {
  return normalizeSmokeDensity(values.flat().reduce((total, value) => total + normalizeSmokeDensity(value), 0));
}

export function smokeBlocksVision(density, threshold = SMOKE_POLICY.visionBlockDensity) {
  const normalizedThreshold = normalizeSmokeDensity(threshold);
  return normalizeSmokeDensity(density) >= normalizedThreshold;
}

export function smokeAccuracyMultiplier(density) {
  const multiplier = 1 - normalizeSmokeDensity(density) * SMOKE_POLICY.accuracyPenaltyAtMaxDensity;
  return clamp(multiplier, SMOKE_POLICY.minimumAccuracyMultiplier, 1);
}
