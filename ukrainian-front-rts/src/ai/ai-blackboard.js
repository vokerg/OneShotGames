import {
  AI_ARCHITECTURE_SCHEMA_VERSION,
  canonicalAiSnapshot,
  createAiBudgetPlan,
  createAiDoctrineProfile,
  createAiGoal,
  sortAiGoals,
} from './ai-contracts.js';

export const AI_KNOWLEDGE_SOURCES = Object.freeze([
  'line-of-sight',
  'domain-event',
  'mission-intel',
]);

const BLACKBOARD_KIND = 'fields-of-resolve-ai-blackboard';

function assertBlackboard(blackboard) {
  if (!blackboard || blackboard.kind !== BLACKBOARD_KIND) throw new TypeError('invalid AI blackboard');
  return blackboard;
}

function assertTick(value, label = 'tick') {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be an integer >= 0`);
  return value;
}

function assertFinite(value, label, minimum = -Infinity) {
  if (!Number.isFinite(value) || value < minimum) throw new RangeError(`${label} must be finite and >= ${minimum}`);
  return value;
}

function assertId(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

function positionSnapshot(value) {
  if (!value || typeof value !== 'object') throw new TypeError('position must be an object');
  return canonicalAiSnapshot({
    x: assertFinite(value.x, 'position.x'),
    y: assertFinite(value.y, 'position.y'),
  }, 'position');
}

function bump(blackboard) {
  blackboard.revision += 1;
}

export function createAiBlackboard({ factionId, doctrine, initialTick = 0, historyLimit = 32 } = {}) {
  const normalizedDoctrine = createAiDoctrineProfile(doctrine);
  const normalizedFaction = assertId(factionId, 'factionId');
  if (normalizedDoctrine.factionId !== normalizedFaction) throw new RangeError('doctrine factionId must match blackboard factionId');
  if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > 256) {
    throw new RangeError('historyLimit must be an integer between 1 and 256');
  }
  const tick = assertTick(initialTick, 'initialTick');
  return {
    kind: BLACKBOARD_KIND,
    schemaVersion: AI_ARCHITECTURE_SCHEMA_VERSION,
    factionId: normalizedFaction,
    doctrine: normalizedDoctrine,
    tick,
    revision: 0,
    knowledge: new Map(),
    goals: Object.freeze([]),
    budgetPlan: createAiBudgetPlan({ tick, resources: {}, allocations: {} }),
    cadence: {
      decisionIndex: 0,
      lastDecisionTick: null,
      nextDecisionTick: tick + normalizedDoctrine.decisionOffsetTicks,
    },
    decisionHistory: [],
    historyLimit,
  };
}

export function ageAiKnowledge(blackboard, throughTick) {
  const board = assertBlackboard(blackboard);
  const tick = assertTick(throughTick, 'throughTick');
  if (tick < board.tick) throw new RangeError('throughTick cannot move backward');
  let changed = tick !== board.tick;
  board.tick = tick;
  for (const [contactId, contact] of [...board.knowledge.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (tick >= contact.forgetTick) {
      board.knowledge.delete(contactId);
      changed = true;
    } else if (contact.state !== 'stale' && tick >= contact.staleTick) {
      board.knowledge.set(contactId, Object.freeze({ ...contact, state: 'stale' }));
      changed = true;
    }
  }
  if (changed) bump(board);
  return board.tick;
}

export function observeAiContact(blackboard, {
  id,
  tick,
  source,
  kind,
  teamId,
  position,
  strength = 0,
  details = {},
} = {}) {
  const board = assertBlackboard(blackboard);
  const observationTick = assertTick(tick, 'observation tick');
  if (!AI_KNOWLEDGE_SOURCES.includes(source)) {
    throw new RangeError(`source must be one of: ${AI_KNOWLEDGE_SOURCES.join(', ')}`);
  }
  if (observationTick > board.tick) ageAiKnowledge(board, observationTick);
  const contactId = assertId(id, 'contact id');
  const previous = board.knowledge.get(contactId);
  if (previous && observationTick < previous.lastSeenTick) throw new RangeError('contact observations cannot move backward');
  const contact = Object.freeze({
    id: contactId,
    kind: assertId(kind, 'contact kind'),
    teamId: assertId(teamId, 'teamId'),
    source,
    state: 'confirmed',
    firstSeenTick: previous?.firstSeenTick ?? observationTick,
    lastSeenTick: observationTick,
    staleTick: observationTick + board.doctrine.contactStaleAfterTicks,
    forgetTick: observationTick + board.doctrine.contactForgetAfterTicks,
    observationCount: (previous?.observationCount ?? 0) + 1,
    position: positionSnapshot(position),
    strength: assertFinite(strength, 'strength', 0),
    details: canonicalAiSnapshot(details, 'details'),
  });
  board.knowledge.set(contactId, contact);
  bump(board);
  return contact;
}

export function forgetAiContact(blackboard, contactId) {
  const board = assertBlackboard(blackboard);
  const removed = board.knowledge.delete(assertId(contactId, 'contact id'));
  if (removed) bump(board);
  return removed;
}

export function replaceAiGoals(blackboard, goals) {
  const board = assertBlackboard(blackboard);
  if (!Array.isArray(goals)) throw new TypeError('goals must be an array');
  const normalized = goals.map((goal) => createAiGoal(goal));
  const ids = new Set();
  for (const goal of normalized) {
    if (ids.has(goal.id)) throw new RangeError(`duplicate goal id: ${goal.id}`);
    ids.add(goal.id);
  }
  board.goals = sortAiGoals(normalized);
  bump(board);
  return board.goals;
}

export function setAiBudgetPlan(blackboard, plan) {
  const board = assertBlackboard(blackboard);
  const budgetPlan = createAiBudgetPlan(plan);
  if (budgetPlan.tick < board.tick) throw new RangeError('budget plan tick cannot be older than blackboard tick');
  if (budgetPlan.tick > board.tick) ageAiKnowledge(board, budgetPlan.tick);
  board.budgetPlan = budgetPlan;
  bump(board);
  return budgetPlan;
}

export function inspectAiBlackboard(blackboard, { includeDecisionHistory = true } = {}) {
  const board = assertBlackboard(blackboard);
  const contacts = [...board.knowledge.values()].sort((left, right) => left.id.localeCompare(right.id));
  const confirmedContacts = contacts.filter((contact) => contact.state === 'confirmed').length;
  const staleContacts = contacts.length - confirmedContacts;
  const snapshot = {
    schemaVersion: AI_ARCHITECTURE_SCHEMA_VERSION,
    factionId: board.factionId,
    tick: board.tick,
    revision: board.revision,
    doctrine: board.doctrine,
    cadence: {
      decisionIndex: board.cadence.decisionIndex,
      lastDecisionTick: board.cadence.lastDecisionTick,
      nextDecisionTick: board.cadence.nextDecisionTick,
      intervalTicks: board.doctrine.decisionIntervalTicks,
    },
    budgetPlan: board.budgetPlan,
    goals: board.goals,
    knowledge: contacts,
    summary: {
      activeGoals: board.goals.length,
      confirmedContacts,
      staleContacts,
      knownContacts: contacts.length,
      decisionsRetained: board.decisionHistory.length,
    },
    decisionHistory: includeDecisionHistory ? board.decisionHistory : [],
  };
  return canonicalAiSnapshot(snapshot, 'AI debug snapshot');
}

export function runAiDecisionCadence(blackboard, { throughTick, decide } = {}) {
  const board = assertBlackboard(blackboard);
  const targetTick = assertTick(throughTick, 'throughTick');
  if (targetTick < board.tick) throw new RangeError('throughTick cannot move backward');
  if (typeof decide !== 'function') throw new TypeError('decide must be a function');
  const generated = [];
  while (board.cadence.nextDecisionTick <= targetTick) {
    const decisionTick = board.cadence.nextDecisionTick;
    ageAiKnowledge(board, decisionTick);
    const decisionIndex = board.cadence.decisionIndex;
    const input = inspectAiBlackboard(board, { includeDecisionHistory: false });
    const result = canonicalAiSnapshot(decide(input, Object.freeze({ tick: decisionTick, index: decisionIndex })) ?? null, 'decision result');
    const record = canonicalAiSnapshot({ index: decisionIndex, tick: decisionTick, result }, 'decision record');
    board.decisionHistory.push(record);
    if (board.decisionHistory.length > board.historyLimit) board.decisionHistory.splice(0, board.decisionHistory.length - board.historyLimit);
    board.cadence.lastDecisionTick = decisionTick;
    board.cadence.decisionIndex += 1;
    board.cadence.nextDecisionTick += board.doctrine.decisionIntervalTicks;
    bump(board);
    generated.push(record);
  }
  ageAiKnowledge(board, targetTick);
  return canonicalAiSnapshot(generated, 'generated decisions');
}
