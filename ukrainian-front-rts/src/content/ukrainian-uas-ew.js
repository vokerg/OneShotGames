export const UKRAINIAN_UAS_EW_SCHEMA_VERSION = 1;

export const UAS_EW_CAPABILITIES = Object.freeze([
  'reconnaissance',
  'fpv-strike',
  'relay',
  'jamming',
  'counter-uas',
  'targeting-support',
]);

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const profile = (definition) => ({ faction: 'ukraine', family: 'uas-ew', ...definition });

const profiles = [
  profile({
    id: 'ua.recon-drone', name: 'Leleka Reconnaissance Section', tier: 1,
    producer: 'ua.uas-ew-cell', requires: ['ua.uas-ew-cell'],
    capabilities: ['reconnaissance', 'targeting-support'], domain: 'air', mobility: 'loiter', reusable: true,
    link: { baseRange: 720, relayBonus: 260, hardening: 0.2 }, endurance: 105, signature: 0.34,
    payload: { type: 'sensor', charges: null },
    counters: ['mobile-sam', 'electronic-jamming', 'close-range-counter-uas'],
    vulnerabilities: ['link-loss', 'weather', 'air-defense'],
    supportLinks: ['ua.self-propelled-artillery', 'ua.anti-armor-team'],
    cost: { manpower: 30, materiel: 85, command: 1 },
  }),
  profile({
    id: 'ua.fpv-strike-team', name: 'FPV Strike Team', tier: 2,
    producer: 'ua.uas-ew-cell', requires: ['ua.recon-drone', 'ua.shared-target-network'],
    capabilities: ['fpv-strike'], domain: 'air', mobility: 'one-way', reusable: false,
    link: { baseRange: 520, relayBonus: 320, hardening: 0.12 }, endurance: 42, signature: 0.48,
    payload: { type: 'shaped-charge', charges: 1 },
    counters: ['electronic-jamming', 'close-range-counter-uas', 'dispersion'],
    vulnerabilities: ['link-loss', 'interception', 'short-endurance'],
    supportLinks: ['ua.recon-drone', 'ua.relay-drone'],
    cost: { manpower: 24, materiel: 70, command: 1 },
  }),
  profile({
    id: 'ua.relay-drone', name: 'Airborne Relay Detachment', tier: 2,
    producer: 'ua.uas-ew-cell', requires: ['ua.spectrum-agility'],
    capabilities: ['relay', 'targeting-support'], domain: 'air', mobility: 'loiter', reusable: true,
    link: { baseRange: 860, relayBonus: 440, hardening: 0.42 }, endurance: 92, signature: 0.44,
    payload: { type: 'relay', charges: null },
    counters: ['mobile-sam', 'fighter-interception', 'electronic-jamming'],
    vulnerabilities: ['high-value-signature', 'air-defense', 'weather'],
    supportLinks: ['ua.recon-drone', 'ua.fpv-strike-team', 'ua.ew-team'],
    cost: { manpower: 36, materiel: 120, command: 2 },
  }),
  profile({
    id: 'ua.ew-team', name: 'Spectrum Protection Team', tier: 2,
    producer: 'ua.uas-ew-cell', requires: ['ua.uas-ew-cell', 'ua.spectrum-agility'],
    capabilities: ['jamming', 'counter-uas'], domain: 'ground', mobility: 'vehicle-mounted', reusable: true,
    link: { baseRange: 610, relayBonus: 0, hardening: 0.62 }, endurance: null, signature: 0.68,
    payload: { type: 'electronic-attack', charges: null },
    counters: ['anti-radiation-fires', 'flanking', 'artillery'],
    vulnerabilities: ['emissions-detection', 'direct-fire', 'overextension'],
    supportLinks: ['ua.relay-drone', 'ua.mobile-counter-uas'],
    cost: { manpower: 48, materiel: 145, command: 2 },
  }),
  profile({
    id: 'ua.mobile-counter-uas', name: 'Mobile Counter-UAS Team', tier: 2,
    producer: 'ua.air-defense-site', requires: ['ua.uas-ew-cell', 'ua.spectrum-agility'],
    capabilities: ['counter-uas'], domain: 'ground', mobility: 'vehicle-mounted', reusable: true,
    link: { baseRange: 540, relayBonus: 100, hardening: 0.36 }, endurance: null, signature: 0.57,
    payload: { type: 'interceptor-and-jammer', charges: 6 },
    counters: ['artillery', 'armor', 'saturation'],
    vulnerabilities: ['ammo-exhaustion', 'long-range-fires', 'flanking'],
    supportLinks: ['ua.ew-team', 'ua.mobile-sam'],
    cost: { manpower: 44, materiel: 155, command: 2 },
  }),
  profile({
    id: 'ua.targeting-cell', name: 'Distributed Targeting Cell', tier: 3,
    producer: 'ua.uas-ew-cell', requires: ['ua.shared-target-network', 'ua.spectrum-agility'],
    capabilities: ['targeting-support', 'relay'], domain: 'ground', mobility: 'deployable', reusable: true,
    link: { baseRange: 780, relayBonus: 300, hardening: 0.58 }, endurance: null, signature: 0.51,
    payload: { type: 'command-and-control', charges: null },
    counters: ['electronic-jamming', 'deep-strike', 'reconnaissance'],
    vulnerabilities: ['network-disruption', 'static-deployment', 'command-loss'],
    supportLinks: ['ua.recon-drone', 'ua.relay-drone', 'ua.self-propelled-artillery'],
    cost: { manpower: 58, materiel: 180, command: 3 },
  }),
];

export const UKRAINIAN_UAS_EW = deepFreeze({
  schemaVersion: UKRAINIAN_UAS_EW_SCHEMA_VERSION,
  faction: 'ukraine', doctrine: 'networked-maneuver', producer: 'ua.uas-ew-cell', profiles,
});

export function validateUkrainianUasEw(data = UKRAINIAN_UAS_EW) {
  const errors = [];
  if (data?.schemaVersion !== UKRAINIAN_UAS_EW_SCHEMA_VERSION) errors.push('unsupported schemaVersion');
  if (data?.faction !== 'ukraine') errors.push('faction must be ukraine');
  if (data?.doctrine !== 'networked-maneuver') errors.push('doctrine must be networked-maneuver');
  const byId = new Map();
  const covered = new Set();
  for (const item of data?.profiles || []) {
    if (!item?.id?.startsWith('ua.')) errors.push(`${item?.id || '<missing>'}: invalid id`);
    if (byId.has(item.id)) errors.push(`${item.id}: duplicate profile`);
    byId.set(item.id, item);
    if (item.faction !== 'ukraine' || item.family !== 'uas-ew') errors.push(`${item.id}: invalid ownership`);
    if (!Number.isInteger(item.tier) || item.tier < 1 || item.tier > 3) errors.push(`${item.id}: invalid tier`);
    if (!item.producer?.startsWith('ua.')) errors.push(`${item.id}: invalid producer`);
    if (!Array.isArray(item.requires) || item.requires.length === 0) errors.push(`${item.id}: requires must be non-empty`);
    if (!Array.isArray(item.capabilities) || item.capabilities.length === 0) errors.push(`${item.id}: missing capabilities`);
    for (const capability of item.capabilities || []) {
      if (!UAS_EW_CAPABILITIES.includes(capability)) errors.push(`${item.id}: invalid capability ${capability}`);
      covered.add(capability);
    }
    if (!['air', 'ground'].includes(item.domain)) errors.push(`${item.id}: invalid domain`);
    if (!item.link || item.link.baseRange <= 0 || item.link.relayBonus < 0 || item.link.hardening < 0 || item.link.hardening > 1) errors.push(`${item.id}: invalid link profile`);
    if (!item.payload?.type) errors.push(`${item.id}: missing payload`);
    if (!Array.isArray(item.counters) || item.counters.length < 3) errors.push(`${item.id}: needs at least three counters`);
    if (!Array.isArray(item.vulnerabilities) || item.vulnerabilities.length < 3) errors.push(`${item.id}: needs at least three vulnerabilities`);
    if (!Array.isArray(item.supportLinks) || item.supportLinks.length === 0) errors.push(`${item.id}: missing support links`);
    for (const resource of ['manpower', 'materiel', 'command']) {
      if (!Number.isFinite(item.cost?.[resource]) || item.cost[resource] < 0) errors.push(`${item.id}: invalid ${resource} cost`);
    }
  }
  for (const capability of UAS_EW_CAPABILITIES) if (!covered.has(capability)) errors.push(`missing capability ${capability}`);
  if (!byId.has('ua.recon-drone') || !byId.has('ua.ew-team')) errors.push('UFR-070 roster anchors are missing');
  return errors;
}

export function resolveUasEwTaskGroup(profileIds, unlockedNodeIds = []) {
  const profilesById = new Map(UKRAINIAN_UAS_EW.profiles.map((item) => [item.id, item]));
  const unlocked = new Set(unlockedNodeIds);
  const selected = [];
  const rejected = [];
  for (const id of profileIds) {
    const item = profilesById.get(id);
    if (!item) { rejected.push({ id, reason: 'unknown-profile' }); continue; }
    const missing = item.requires.filter((requirement) => !unlocked.has(requirement));
    if (missing.length) { rejected.push({ id, reason: 'missing-requirements', missing }); continue; }
    selected.push(item);
  }
  const capabilities = [...new Set(selected.flatMap((item) => item.capabilities))].sort();
  const cost = selected.reduce((total, item) => ({
    manpower: total.manpower + item.cost.manpower,
    materiel: total.materiel + item.cost.materiel,
    command: total.command + item.cost.command,
  }), { manpower: 0, materiel: 0, command: 0 });
  return deepFreeze({
    profileIds: selected.map((item) => item.id), capabilities, cost, rejected,
    networkResilience: selected.length
      ? Number((selected.reduce((sum, item) => sum + item.link.hardening, 0) / selected.length).toFixed(3))
      : 0,
  });
}
