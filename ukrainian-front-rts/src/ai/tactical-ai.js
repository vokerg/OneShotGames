import { canonicalAiSnapshot } from './ai-contracts.js';

export const TACTICAL_AI_SCHEMA_VERSION = 1;

export const TACTICAL_AI_POSTURES = Object.freeze({
  SCOUTING: 'scouting',
  ASSEMBLING: 'assembling',
  DEFENDING: 'defending',
  ATTACKING: 'attacking',
  FLANKING: 'flanking',
  RETREATING: 'retreating',
  REINFORCING: 'reinforcing',
});

export const TACTICAL_AI_COMMAND_KINDS = Object.freeze([
  'move',
  'attackMove',
  'attack',
]);

const DEFAULT_POLICY = Object.freeze({
  maxUnits: 96,
  maxContacts: 64,
  maxCommands: 12,
  scoutCount: 2,
  defenseRadius: 480,
  assemblyRadius: 260,
  reinforcementDistance: 420,
  directEngageDistance: 240,
  retreatHealthRatio: 0.35,
  attackStrengthRatio: 1.05,
  flankMinimumUnits: 6,
  flankOffset: 220,
  worldWidth: 2560,
  worldHeight: 1664,
  worldMargin: 64,
});

const POSTURE_VALUES = new Set(Object.values(TACTICAL_AI_POSTURES));
const COMMAND_VALUES = new Set(TACTICAL_AI_COMMAND_KINDS);

function assertRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value;
}

function finite(value, label, minimum = -Infinity, maximum = Infinity) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be finite and between ${minimum} and ${maximum}`);
  }
  return value;
}

function integer(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function id(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) throw new TypeError(`${label} must be a non-empty id`);
  return normalized;
}

function point(value, label) {
  assertRecord(value, label);
  return Object.freeze({
    x: finite(value.x, `${label}.x`),
    y: finite(value.y, `${label}.y`),
  });
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizePolicy(value = {}) {
  assertRecord(value, 'tactical AI policy');
  const policy = { ...DEFAULT_POLICY, ...value };
  return Object.freeze({
    maxUnits: integer(policy.maxUnits, 'policy.maxUnits', 1, 512),
    maxContacts: integer(policy.maxContacts, 'policy.maxContacts', 1, 512),
    maxCommands: integer(policy.maxCommands, 'policy.maxCommands', 1, 64),
    scoutCount: integer(policy.scoutCount, 'policy.scoutCount', 1, 12),
    defenseRadius: finite(policy.defenseRadius, 'policy.defenseRadius', 1),
    assemblyRadius: finite(policy.assemblyRadius, 'policy.assemblyRadius', 1),
    reinforcementDistance: finite(
      policy.reinforcementDistance,
      'policy.reinforcementDistance',
      1,
    ),
    directEngageDistance: finite(
      policy.directEngageDistance,
      'policy.directEngageDistance',
      1,
    ),
    retreatHealthRatio: finite(policy.retreatHealthRatio, 'policy.retreatHealthRatio', 0, 1),
    attackStrengthRatio: finite(policy.attackStrengthRatio, 'policy.attackStrengthRatio', 0.1, 5),
    flankMinimumUnits: integer(policy.flankMinimumUnits, 'policy.flankMinimumUnits', 2, 64),
    flankOffset: finite(policy.flankOffset, 'policy.flankOffset', 1),
    worldWidth: finite(policy.worldWidth, 'policy.worldWidth', 128),
    worldHeight: finite(policy.worldHeight, 'policy.worldHeight', 128),
    worldMargin: finite(policy.worldMargin, 'policy.worldMargin', 0),
  });
}

export function createTacticalAiPolicy(value = {}) {
  return normalizePolicy(value);
}

function normalizeUnit(value, index) {
  assertRecord(value, `ownUnits[${index}]`);
  const maxHp = finite(value.maxHp, `ownUnits[${index}].maxHp`, 1);
  return Object.freeze({
    id: id(value.id, `ownUnits[${index}].id`),
    kind: id(value.kind ?? 'unit', `ownUnits[${index}].kind`),
    x: finite(value.x, `ownUnits[${index}].x`),
    y: finite(value.y, `ownUnits[${index}].y`),
    hp: finite(value.hp, `ownUnits[${index}].hp`, 0, maxHp),
    maxHp,
    strength: finite(value.strength ?? 0, `ownUnits[${index}].strength`, 0),
    speed: finite(value.speed ?? 0, `ownUnits[${index}].speed`, 0),
    sight: finite(value.sight ?? 0, `ownUnits[${index}].sight`, 0),
    combat: Boolean(value.combat),
    scout: Boolean(value.scout),
    support: Boolean(value.support),
  });
}

function normalizeStructure(value, index) {
  assertRecord(value, `ownStructures[${index}]`);
  return Object.freeze({
    id: id(value.id, `ownStructures[${index}].id`),
    kind: id(value.kind ?? 'structure', `ownStructures[${index}].kind`),
    x: finite(value.x, `ownStructures[${index}].x`),
    y: finite(value.y, `ownStructures[${index}].y`),
    strength: finite(value.strength ?? 0, `ownStructures[${index}].strength`, 0),
  });
}

function normalizeContact(value, index) {
  assertRecord(value, `knowledge[${index}]`);
  const positionValue = point(value.position, `knowledge[${index}].position`);
  return Object.freeze({
    id: id(value.id, `knowledge[${index}].id`),
    kind: id(value.kind ?? 'unit', `knowledge[${index}].kind`),
    state: value.state === 'stale' ? 'stale' : 'confirmed',
    lastSeenTick: integer(value.lastSeenTick ?? 0, `knowledge[${index}].lastSeenTick`),
    strength: finite(value.strength ?? 0, `knowledge[${index}].strength`, 0),
    position: positionValue,
    details: value.details && typeof value.details === 'object' ? value.details : {},
  });
}

function centroid(items, fallback) {
  if (!items.length) return Object.freeze({ ...fallback });
  const sum = items.reduce(
    (result, item) => ({ x: result.x + item.x, y: result.y + item.y }),
    { x: 0, y: 0 },
  );
  return Object.freeze({ x: sum.x / items.length, y: sum.y / items.length });
}

function healthRatio(units) {
  const totals = units.reduce(
    (result, unit) => ({ hp: result.hp + unit.hp, maxHp: result.maxHp + unit.maxHp }),
    { hp: 0, maxHp: 0 },
  );
  return totals.maxHp > 0 ? totals.hp / totals.maxHp : 0;
}

function totalStrength(items) {
  return items.reduce((sum, item) => sum + item.strength, 0);
}

function homeAnchor(structures, units, policy) {
  const headquarters = structures.find((structure) => structure.kind === 'hq');
  if (headquarters) return Object.freeze({ x: headquarters.x, y: headquarters.y });
  if (structures.length) return Object.freeze({ x: structures[0].x, y: structures[0].y });
  if (units.length) return centroid(units, { x: policy.worldWidth / 2, y: policy.worldHeight / 2 });
  return Object.freeze({ x: policy.worldWidth - policy.worldMargin, y: policy.worldMargin });
}

function contactPriority(contact, structures, policy, tick) {
  const confirmedMultiplier = contact.state === 'confirmed' ? 1 : 0.45;
  const age = Math.max(0, tick - contact.lastSeenTick);
  const freshness = 1 / (1 + age / 60);
  const kindBonus = contact.kind === 'building' || contact.kind === 'hq' ? 18 : 0;
  const defenseBonus = structures.some(
    (structure) => distance(structure, contact.position) <= policy.defenseRadius,
  ) ? 35 : 0;
  return contact.strength * confirmedMultiplier * freshness + kindBonus + defenseBonus;
}

function orderedContacts(contacts, structures, policy, tick) {
  return [...contacts].sort((left, right) =>
    contactPriority(right, structures, policy, tick) -
      contactPriority(left, structures, policy, tick) ||
    right.lastSeenTick - left.lastSeenTick ||
    left.id.localeCompare(right.id));
}

function command({ role, kind, units, target, targetId = null, reason }) {
  if (!COMMAND_VALUES.has(kind)) throw new RangeError(`Unknown tactical command kind: ${kind}`);
  return Object.freeze({
    role,
    kind,
    unitIds: Object.freeze(units.map((unit) => unit.id).sort()),
    target: Object.freeze({ x: target.x, y: target.y }),
    targetId,
    reason,
  });
}

function boundedCommands(commands, policy) {
  return Object.freeze(commands
    .filter((candidate) => candidate.unitIds.length)
    .slice(0, policy.maxCommands));
}

function scoutWaypoints(policy) {
  const margin = policy.worldMargin;
  const right = policy.worldWidth - margin;
  const bottom = policy.worldHeight - margin;
  const middleX = policy.worldWidth / 2;
  const middleY = policy.worldHeight / 2;
  return Object.freeze([
    Object.freeze({ x: margin, y: margin }),
    Object.freeze({ x: right, y: bottom }),
    Object.freeze({ x: right, y: margin }),
    Object.freeze({ x: margin, y: bottom }),
    Object.freeze({ x: middleX, y: margin }),
    Object.freeze({ x: middleX, y: bottom }),
    Object.freeze({ x: margin, y: middleY }),
    Object.freeze({ x: right, y: middleY }),
  ]);
}

function flankPoint(origin, target, policy, side) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const magnitude = Math.hypot(dx, dy) || 1;
  const offsetX = (-dy / magnitude) * policy.flankOffset * side;
  const offsetY = (dx / magnitude) * policy.flankOffset * side;
  return Object.freeze({
    x: clamp(target.x + offsetX, policy.worldMargin, policy.worldWidth - policy.worldMargin),
    y: clamp(target.y + offsetY, policy.worldMargin, policy.worldHeight - policy.worldMargin),
  });
}

function planScouting({ units, home, decisionIndex, policy }) {
  const scouts = [...units]
    .sort((left, right) =>
      Number(right.scout) - Number(left.scout) ||
      right.speed - left.speed ||
      left.id.localeCompare(right.id))
    .slice(0, Math.min(policy.scoutCount, units.length));
  const scoutIds = new Set(scouts.map((unit) => unit.id));
  const reserve = units.filter((unit) => !scoutIds.has(unit.id));
  const waypoints = scoutWaypoints(policy);
  const commands = scouts.map((unit, index) => command({
    role: 'scout',
    kind: 'move',
    units: [unit],
    target: waypoints[(decisionIndex + index) % waypoints.length],
    reason: 'No confirmed enemy contact; expand observed map knowledge.',
  }));
  if (reserve.length) {
    commands.push(command({
      role: 'reserve',
      kind: 'move',
      units: reserve,
      target: home,
      reason: 'Maintain a reserve while scouts search.',
    }));
  }
  return commands;
}

function planRetreat({ units, home }) {
  return [command({
    role: 'retreat',
    kind: 'move',
    units,
    target: home,
    reason: 'Force readiness is below the deterministic retreat threshold.',
  })];
}

function planDefense({ combatUnits, supportUnits, home, threat, policy }) {
  const commands = [];
  const close = combatUnits.filter(
    (unit) => distance(unit, threat.position) <= policy.directEngageDistance,
  );
  const closeIds = new Set(close.map((unit) => unit.id));
  const approach = combatUnits.filter((unit) => !closeIds.has(unit.id));
  if (close.length) {
    commands.push(command({
      role: 'defense-engage',
      kind: 'attack',
      units: close,
      target: threat.position,
      targetId: threat.id,
      reason: 'Engage the highest-priority observed threat inside the defense radius.',
    }));
  }
  if (approach.length) {
    commands.push(command({
      role: 'defense-response',
      kind: 'attackMove',
      units: approach,
      target: threat.position,
      targetId: threat.id,
      reason: 'Route the defensive force toward the observed threat.',
    }));
  }
  if (supportUnits.length) {
    commands.push(command({
      role: 'defense-support',
      kind: 'move',
      units: supportUnits,
      target: home,
      reason: 'Keep support units behind the defensive anchor.',
    }));
  }
  return commands;
}

function planAssembly({ units, forceCenter, target }) {
  const staging = Object.freeze({
    x: forceCenter.x + (target.x - forceCenter.x) * 0.35,
    y: forceCenter.y + (target.y - forceCenter.y) * 0.35,
  });
  return [command({
    role: 'assembly',
    kind: 'move',
    units,
    target: staging,
    reason: 'Concentrate the force before committing to the observed target.',
  })];
}

function planReinforcement({ mainForce, stragglers, supportUnits, forceCenter, threat }) {
  const commands = [];
  if (mainForce.length) {
    commands.push(command({
      role: 'screen',
      kind: 'attackMove',
      units: mainForce,
      target: threat.position,
      targetId: threat.id,
      reason: 'Maintain pressure while separated units reinforce.',
    }));
  }
  const reinforcements = [...stragglers, ...supportUnits]
    .filter((unit, index, all) => all.findIndex((candidate) => candidate.id === unit.id) === index);
  if (reinforcements.length) {
    commands.push(command({
      role: 'reinforcement',
      kind: 'move',
      units: reinforcements,
      target: forceCenter,
      reason: 'Rejoin the main force before the next commitment.',
    }));
  }
  return commands;
}

function planAttack({ combatUnits, supportUnits, forceCenter, threat, policy, decisionIndex }) {
  const close = combatUnits.filter(
    (unit) => distance(unit, threat.position) <= policy.directEngageDistance,
  );
  const closeIds = new Set(close.map((unit) => unit.id));
  const mobile = combatUnits.filter((unit) => !closeIds.has(unit.id));
  const commands = [];
  if (close.length) {
    commands.push(command({
      role: 'engage',
      kind: 'attack',
      units: close,
      target: threat.position,
      targetId: threat.id,
      reason: 'Attack the selected observed target directly.',
    }));
  }

  let posture = TACTICAL_AI_POSTURES.ATTACKING;
  if (mobile.length >= policy.flankMinimumUnits) {
    posture = TACTICAL_AI_POSTURES.FLANKING;
    const flankCount = Math.max(2, Math.floor(mobile.length / 3));
    const flank = mobile.slice(-flankCount);
    const flankIds = new Set(flank.map((unit) => unit.id));
    const main = mobile.filter((unit) => !flankIds.has(unit.id));
    const side = (stableHash(`${threat.id}:${decisionIndex}`) & 1) === 0 ? -1 : 1;
    if (main.length) {
      commands.push(command({
        role: 'main-attack',
        kind: 'attackMove',
        units: main,
        target: threat.position,
        targetId: threat.id,
        reason: 'Advance the main force on the selected observed target.',
      }));
    }
    commands.push(command({
      role: 'flank',
      kind: 'attackMove',
      units: flank,
      target: flankPoint(forceCenter, threat.position, policy, side),
      targetId: threat.id,
      reason: 'Approach the selected target from a deterministic lateral route.',
    }));
  } else if (mobile.length) {
    commands.push(command({
      role: 'main-attack',
      kind: 'attackMove',
      units: mobile,
      target: threat.position,
      targetId: threat.id,
      reason: 'Advance on the selected observed target.',
    }));
  }

  if (supportUnits.length) {
    commands.push(command({
      role: 'support',
      kind: 'move',
      units: supportUnits,
      target: forceCenter,
      reason: 'Keep support units with the attacking force without leading the assault.',
    }));
  }
  return Object.freeze({ posture, commands });
}

function result({
  tick,
  decisionIndex,
  posture,
  reason,
  target,
  units,
  contacts,
  forceCenter,
  home,
  commands,
  policy,
}) {
  if (!POSTURE_VALUES.has(posture)) throw new RangeError(`Unknown tactical posture: ${posture}`);
  const bounded = boundedCommands(commands, policy);
  return canonicalAiSnapshot({
    schemaVersion: TACTICAL_AI_SCHEMA_VERSION,
    tick,
    decisionIndex,
    posture,
    reason,
    target: target ? {
      id: target.id,
      kind: target.kind,
      state: target.state,
      position: target.position,
      strength: target.strength,
    } : null,
    force: {
      unitCount: units.length,
      combatCount: units.filter((unit) => unit.combat).length,
      supportCount: units.filter((unit) => unit.support || !unit.combat).length,
      healthRatio: healthRatio(units),
      strength: totalStrength(units),
      center: forceCenter,
      home,
    },
    commands: bounded,
    metrics: {
      unitsConsidered: units.length,
      contactsConsidered: contacts.length,
      commandGroups: bounded.length,
      unitAssignments: bounded.reduce((sum, item) => sum + item.unitIds.length, 0),
      bounded: units.length <= policy.maxUnits &&
        contacts.length <= policy.maxContacts &&
        bounded.length <= policy.maxCommands,
    },
  }, 'tactical AI plan');
}

export function planTacticalAi({
  tick = 0,
  decisionIndex = 0,
  doctrine = {},
  goals = [],
  knowledge = [],
  ownUnits = [],
  ownStructures = [],
  policy: policyInput = {},
} = {}) {
  const policy = normalizePolicy(policyInput);
  const normalizedTick = integer(tick, 'tick');
  const normalizedDecisionIndex = integer(decisionIndex, 'decisionIndex');
  assertRecord(doctrine, 'doctrine');
  if (!Array.isArray(goals)) throw new TypeError('goals must be an array');
  if (!Array.isArray(knowledge)) throw new TypeError('knowledge must be an array');
  if (!Array.isArray(ownUnits)) throw new TypeError('ownUnits must be an array');
  if (!Array.isArray(ownStructures)) throw new TypeError('ownStructures must be an array');

  const units = ownUnits
    .map(normalizeUnit)
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, policy.maxUnits);
  const structures = ownStructures
    .map(normalizeStructure)
    .sort((left, right) =>
      Number(right.kind === 'hq') - Number(left.kind === 'hq') || left.id.localeCompare(right.id));
  const contacts = orderedContacts(
    knowledge.map(normalizeContact).slice(0, policy.maxContacts),
    structures,
    policy,
    normalizedTick,
  );
  const confirmedContacts = contacts.filter((contact) => contact.state === 'confirmed');
  const home = homeAnchor(structures, units, policy);
  const forceCenter = centroid(units, home);
  const topGoal = goals[0] && typeof goals[0] === 'object' ? goals[0] : null;
  const threat = confirmedContacts[0] ?? contacts[0] ?? null;
  const combatUnits = units.filter((unit) => unit.combat);
  const supportUnits = units.filter((unit) => !unit.combat || unit.support);
  const readiness = healthRatio(units);
  const retreatThreshold = Math.max(
    policy.retreatHealthRatio,
    Number.isFinite(doctrine.retreatThreshold) ? doctrine.retreatThreshold : 0,
  );
  const riskTolerance = Number.isFinite(doctrine.riskTolerance)
    ? clamp(doctrine.riskTolerance, 0, 1)
    : 0.5;

  if (!units.length) {
    return result({
      tick: normalizedTick,
      decisionIndex: normalizedDecisionIndex,
      posture: TACTICAL_AI_POSTURES.ASSEMBLING,
      reason: 'No controllable tactical units are available.',
      target: threat,
      units,
      contacts,
      forceCenter,
      home,
      commands: [],
      policy,
    });
  }

  const enemyStrength = confirmedContacts.reduce((sum, contact) => sum + contact.strength, 0);
  const ownStrength = totalStrength(combatUnits);
  const outmatched = enemyStrength > ownStrength * (1.45 - riskTolerance * 0.45);
  if (readiness <= retreatThreshold || (threat && outmatched && readiness < 0.7)) {
    return result({
      tick: normalizedTick,
      decisionIndex: normalizedDecisionIndex,
      posture: TACTICAL_AI_POSTURES.RETREATING,
      reason: 'Readiness or observed force ratio requires withdrawal.',
      target: threat,
      units,
      contacts,
      forceCenter,
      home,
      commands: planRetreat({ units, home }),
      policy,
    });
  }

  const threatInsideDefense = threat && structures.some(
    (structure) => distance(structure, threat.position) <= policy.defenseRadius,
  );
  if (threat && (threatInsideDefense || topGoal?.kind === 'defense')) {
    return result({
      tick: normalizedTick,
      decisionIndex: normalizedDecisionIndex,
      posture: TACTICAL_AI_POSTURES.DEFENDING,
      reason: 'An observed threat or explicit goal requires defensive response.',
      target: threat,
      units,
      contacts,
      forceCenter,
      home,
      commands: planDefense({ combatUnits, supportUnits, home, threat, policy }),
      policy,
    });
  }

  if (!confirmedContacts.length) {
    return result({
      tick: normalizedTick,
      decisionIndex: normalizedDecisionIndex,
      posture: TACTICAL_AI_POSTURES.SCOUTING,
      reason: 'No confirmed contacts are available under observed-only information.',
      target: threat,
      units,
      contacts,
      forceCenter,
      home,
      commands: planScouting({ units, home, decisionIndex: normalizedDecisionIndex, policy }),
      policy,
    });
  }

  const stragglers = combatUnits.filter(
    (unit) => distance(unit, forceCenter) > policy.reinforcementDistance,
  );
  const stragglerIds = new Set(stragglers.map((unit) => unit.id));
  const mainForce = combatUnits.filter((unit) => !stragglerIds.has(unit.id));
  if (stragglers.length && mainForce.length >= 2) {
    return result({
      tick: normalizedTick,
      decisionIndex: normalizedDecisionIndex,
      posture: TACTICAL_AI_POSTURES.REINFORCING,
      reason: 'Separated units must rejoin while the main force screens the target.',
      target: threat,
      units,
      contacts,
      forceCenter,
      home,
      commands: planReinforcement({ mainForce, stragglers, supportUnits, forceCenter, threat }),
      policy,
    });
  }

  const dispersion = combatUnits.reduce(
    (maximum, unit) => Math.max(maximum, distance(unit, forceCenter)),
    0,
  );
  const requiredStrength = threat.strength * policy.attackStrengthRatio * (1.25 - riskTolerance * 0.5);
  if (dispersion > policy.assemblyRadius || ownStrength < requiredStrength) {
    return result({
      tick: normalizedTick,
      decisionIndex: normalizedDecisionIndex,
      posture: TACTICAL_AI_POSTURES.ASSEMBLING,
      reason: 'Force concentration or observed strength is insufficient for attack.',
      target: threat,
      units,
      contacts,
      forceCenter,
      home,
      commands: planAssembly({ units, forceCenter, target: threat.position }),
      policy,
    });
  }

  const attackPlan = planAttack({
    combatUnits,
    supportUnits,
    forceCenter,
    threat,
    policy,
    decisionIndex: normalizedDecisionIndex,
  });
  return result({
    tick: normalizedTick,
    decisionIndex: normalizedDecisionIndex,
    posture: attackPlan.posture,
    reason: attackPlan.posture === TACTICAL_AI_POSTURES.FLANKING
      ? 'The concentrated force can apply deterministic main-and-flank pressure.'
      : 'The concentrated force can attack the selected observed target.',
    target: threat,
    units,
    contacts,
    forceCenter,
    home,
    commands: attackPlan.commands,
    policy,
  });
}
