export const COVER_TYPES = Object.freeze({
  NONE: 'none',
  LIGHT: 'light',
  HEAVY: 'heavy',
  FORTIFIED: 'fortified',
});

export const CONCEALMENT_TYPES = Object.freeze({
  NONE: 'none',
  PARTIAL: 'partial',
  DENSE: 'dense',
});

export const COVER_PROFILES = Object.freeze({
  [COVER_TYPES.NONE]: Object.freeze({ accuracy: 1, damage: 1, label: 'No cover' }),
  [COVER_TYPES.LIGHT]: Object.freeze({ accuracy: 0.85, damage: 0.9, label: 'Light cover' }),
  [COVER_TYPES.HEAVY]: Object.freeze({ accuracy: 0.68, damage: 0.75, label: 'Heavy cover' }),
  [COVER_TYPES.FORTIFIED]: Object.freeze({ accuracy: 0.55, damage: 0.6, label: 'Fortified' }),
});

export const CONCEALMENT_PROFILES = Object.freeze({
  [CONCEALMENT_TYPES.NONE]: Object.freeze({ accuracy: 1, label: 'Exposed' }),
  [CONCEALMENT_TYPES.PARTIAL]: Object.freeze({ accuracy: 0.88, label: 'Partially concealed' }),
  [CONCEALMENT_TYPES.DENSE]: Object.freeze({ accuracy: 0.72, label: 'Concealed' }),
});

const TERRAIN_PROFILES = Object.freeze({
  open: Object.freeze({ cover: COVER_TYPES.NONE, concealment: CONCEALMENT_TYPES.NONE }),
  road: Object.freeze({ cover: COVER_TYPES.NONE, concealment: CONCEALMENT_TYPES.NONE }),
  mud: Object.freeze({ cover: COVER_TYPES.NONE, concealment: CONCEALMENT_TYPES.PARTIAL }),
  rubble: Object.freeze({ cover: COVER_TYPES.HEAVY, concealment: CONCEALMENT_TYPES.PARTIAL }),
  shelterbelt: Object.freeze({ cover: COVER_TYPES.LIGHT, concealment: CONCEALMENT_TYPES.DENSE }),
  trench: Object.freeze({ cover: COVER_TYPES.FORTIFIED, concealment: CONCEALMENT_TYPES.PARTIAL }),
  building: Object.freeze({ cover: COVER_TYPES.HEAVY, concealment: CONCEALMENT_TYPES.DENSE }),
});

function assertKnown(value, profiles, label) {
  if (!profiles[value]) throw new Error(`Unknown ${label}: ${value}`);
}

export function profileForTerrain(terrain = 'open') {
  return TERRAIN_PROFILES[terrain] || TERRAIN_PROFILES.open;
}

export function resolveCoverModifiers({
  terrain = 'open',
  cover,
  concealment,
  ignoresCover = false,
  ignoresConcealment = false,
} = {}) {
  const terrainProfile = profileForTerrain(terrain);
  const coverType = cover || terrainProfile.cover;
  const concealmentType = concealment || terrainProfile.concealment;
  assertKnown(coverType, COVER_PROFILES, 'cover type');
  assertKnown(concealmentType, CONCEALMENT_PROFILES, 'concealment type');

  const coverProfile = COVER_PROFILES[coverType];
  const concealmentProfile = CONCEALMENT_PROFILES[concealmentType];
  const accuracyMultiplier =
    (ignoresCover ? 1 : coverProfile.accuracy) *
    (ignoresConcealment ? 1 : concealmentProfile.accuracy);
  const damageMultiplier = ignoresCover ? 1 : coverProfile.damage;

  return Object.freeze({
    cover: coverType,
    concealment: concealmentType,
    accuracyMultiplier,
    damageMultiplier,
    feedback: Object.freeze({
      protected: coverType !== COVER_TYPES.NONE && !ignoresCover,
      concealed: concealmentType !== CONCEALMENT_TYPES.NONE && !ignoresConcealment,
      coverLabel: coverProfile.label,
      concealmentLabel: concealmentProfile.label,
    }),
  });
}

export function applyCoverToAttack({ accuracy = 1, damage = 0, ...context } = {}) {
  if (!Number.isFinite(accuracy) || accuracy < 0) throw new TypeError('Accuracy must be a non-negative number.');
  if (!Number.isFinite(damage) || damage < 0) throw new TypeError('Damage must be a non-negative number.');
  const modifiers = resolveCoverModifiers(context);
  return Object.freeze({
    accuracy: accuracy * modifiers.accuracyMultiplier,
    damage: damage * modifiers.damageMultiplier,
    modifiers,
  });
}
