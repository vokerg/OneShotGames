import { setCampaignChoice, unlockCampaignUpgrade, validateCampaignProfile } from './campaign-profile.js';

export const CAMPAIGN_MODERNIZATION_VERSION = 1;
export const CAMPAIGN_MODERNIZATION_CHOICE_ID = 'modernization';
export const MODERNIZATION_REFUND_MODES = Object.freeze({ FULL: 'full', PARTIAL: 'partial', LOCKED: 'locked' });

const ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const freeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const plain = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value;
};
const id = (value, label) => {
  if (typeof value !== 'string' || !ID.test(value)) throw new TypeError(`${label} must be a stable identifier.`);
  return value;
};
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 240) throw new TypeError(`${label} must be non-empty text.`);
  return value.trim();
};
const integer = (value, label, minimum = 0) => {
  if (!Number.isInteger(value) || value < minimum) throw new TypeError(`${label} must be an integer >= ${minimum}.`);
  return value;
};
const ratio = (value, label) => {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError(`${label} must be between 0 and 1.`);
  return value;
};
const ids = (values = [], label = 'Identifiers') => {
  if (!Array.isArray(values)) throw new TypeError(`${label} must be an array.`);
  const result = values.map((value) => id(value, `${label} entry`));
  if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicates.`);
  return Object.freeze(result.sort());
};

export const DEFAULT_MODERNIZATION_CHOICES = freeze([
  { id: 'modernization.cage-armor', upgradeId: 'cageArmor', name: 'Counter-UAS Roof Protection', description: 'Field expedient roof protection for armored formations.', category: 'protection', tier: 1, cost: 2 },
  { id: 'modernization.thermal-sights', upgradeId: 'thermal', name: 'Thermal Fire-Control Sights', description: 'Improved night and obscurant target acquisition.', category: 'sensors', tier: 1, cost: 2 },
  { id: 'modernization.nato-ammunition', upgradeId: 'natoAmmo', name: 'NATO 155 mm Ammunition', description: 'Standardized ammunition for sustained precision fires.', category: 'fires', tier: 1, cost: 3, unlock: { minimumCompletedOperations: 1 } },
  { id: 'modernization.active-protection', upgradeId: 'activeProtection', name: 'Active Protection Suite', description: 'A higher-tier survivability package for main battle tanks.', category: 'protection', tier: 2, cost: 4, requiresChoiceIds: ['modernization.cage-armor'], unlock: { minimumCompletedOperations: 2 } },
  { id: 'modernization.digital-c2', upgradeId: 'digitalC2', name: 'Digital Battle Management', description: 'Networked target sharing and faster fire-control coordination.', category: 'command', tier: 2, cost: 4, requiresChoiceIds: ['modernization.thermal-sights'], unlock: { minimumCompletedOperations: 2 } },
  { id: 'modernization.mine-roller', upgradeId: 'mineRoller', name: 'KMT Mine-Roller Kit', description: 'A mobility package for breaching prepared approaches.', category: 'mobility', tier: 2, cost: 2, unlock: { minimumCompletedOperations: 1 } },
]);
export const DEFAULT_MODERNIZATION_POLICY = freeze({
  maxEarnedPoints: 12,
  maxSelectedChoices: 4,
  categoryCaps: { protection: 2, sensors: 1, fires: 1, command: 1, mobility: 1 },
  refund: { freeThroughCompletedOperations: 1, partialRatio: 0.5, lockedAfterCompletedOperations: null, respecFee: 0 },
});

function normalizeChoice(choice, index) {
  plain(choice, `Modernization choice ${index}`);
  const unlock = plain(choice.unlock ?? {}, `Modernization choice ${index} unlock`);
  return Object.freeze({
    id: id(choice.id, `Choice ${index} ID`),
    upgradeId: id(choice.upgradeId, `Choice ${index} upgrade ID`),
    name: text(choice.name, `Choice ${index} name`),
    description: text(choice.description, `Choice ${index} description`),
    category: id(choice.category, `Choice ${index} category`),
    tier: integer(choice.tier ?? 1, `Choice ${index} tier`, 1),
    cost: integer(choice.cost, `Choice ${index} cost`, 1),
    requiresChoiceIds: ids(choice.requiresChoiceIds, `Choice ${index} prerequisites`),
    excludesChoiceIds: ids(choice.excludesChoiceIds, `Choice ${index} exclusions`),
    unlock: Object.freeze({
      minimumCompletedOperations: integer(unlock.minimumCompletedOperations ?? 0, 'Minimum completed operations'),
      requiredOperationIds: ids(unlock.requiredOperationIds, 'Required operation IDs'),
      requiredMedalIds: ids(unlock.requiredMedalIds, 'Required medal IDs'),
    }),
  });
}

function normalizePolicy(value) {
  const policy = plain(value, 'Modernization policy');
  const caps = plain(policy.categoryCaps ?? {}, 'Modernization category caps');
  const refund = plain(policy.refund ?? {}, 'Modernization refund policy');
  const normalizedCaps = {};
  for (const key of Object.keys(caps).sort()) normalizedCaps[id(key, 'Category cap ID')] = integer(caps[key], `Category cap ${key}`, 1);
  const free = integer(refund.freeThroughCompletedOperations ?? 1, 'Free refund window');
  const locked = refund.lockedAfterCompletedOperations ?? null;
  if (locked !== null && integer(locked, 'Refund lock threshold') <= free) throw new RangeError('Refund lock must follow the free-refund window.');
  return Object.freeze({
    maxEarnedPoints: integer(policy.maxEarnedPoints ?? 12, 'Point cap', 1),
    maxSelectedChoices: integer(policy.maxSelectedChoices ?? 4, 'Selection cap', 1),
    categoryCaps: Object.freeze(normalizedCaps),
    refund: Object.freeze({
      freeThroughCompletedOperations: free,
      partialRatio: ratio(refund.partialRatio ?? 0.5, 'Partial refund ratio'),
      lockedAfterCompletedOperations: locked,
      respecFee: integer(refund.respecFee ?? 0, 'Respec fee'),
    }),
  });
}

function validateGraph(choices) {
  const byId = Object.fromEntries(choices.map((choice) => [choice.id, choice]));
  if (Object.keys(byId).length !== choices.length) throw new Error('Modernization choice IDs must be unique.');
  if (new Set(choices.map((choice) => choice.upgradeId)).size !== choices.length) throw new Error('Modernization upgrade IDs must be unique.');
  for (const choice of choices) {
    for (const required of choice.requiresChoiceIds) {
      if (!byId[required]) throw new Error(`Unknown prerequisite ${required} for ${choice.id}.`);
      if (choice.excludesChoiceIds.includes(required)) throw new Error(`${choice.id} cannot require and exclude ${required}.`);
    }
    for (const excluded of choice.excludesChoiceIds) {
      if (!byId[excluded]) throw new Error(`Unknown exclusion ${excluded} for ${choice.id}.`);
      if (!byId[excluded].excludesChoiceIds.includes(choice.id)) throw new Error(`Exclusion must be reciprocal: ${choice.id} and ${excluded}.`);
    }
  }
  const active = new Set();
  const done = new Set();
  const visit = (choiceId) => {
    if (active.has(choiceId)) throw new Error(`Modernization prerequisite cycle includes ${choiceId}.`);
    if (done.has(choiceId)) return;
    active.add(choiceId);
    for (const required of byId[choiceId].requiresChoiceIds) visit(required);
    active.delete(choiceId);
    done.add(choiceId);
  };
  for (const choice of choices) visit(choice.id);
  return Object.freeze(byId);
}

export function createModernizationCatalog({ choices = DEFAULT_MODERNIZATION_CHOICES, policy = DEFAULT_MODERNIZATION_POLICY, upgradeDefinitions } = {}) {
  if (!Array.isArray(choices) || !choices.length) throw new TypeError('Modernization choices must be a non-empty array.');
  const normalized = choices.map(normalizeChoice).sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id));
  const byId = validateGraph(normalized);
  if (upgradeDefinitions !== undefined) {
    if (!Array.isArray(upgradeDefinitions)) throw new TypeError('Upgrade definitions must be an array.');
    const known = new Set(upgradeDefinitions.map((definition, index) => id(plain(definition, `Upgrade ${index}`).id, `Upgrade ${index} ID`)));
    for (const choice of normalized) if (!known.has(choice.upgradeId)) throw new Error(`${choice.id} references unknown upgrade ${choice.upgradeId}.`);
  }
  const normalizedPolicy = normalizePolicy(policy);
  for (const [category, cap] of Object.entries(normalizedPolicy.categoryCaps)) {
    const count = normalized.filter((choice) => choice.category === category).length;
    if (!count || cap > count) throw new RangeError(`Invalid category cap for ${category}.`);
  }
  return freeze({ version: 1, choices: normalized, choiceIds: normalized.map((choice) => choice.id), byId, policy: normalizedPolicy });
}

const assertCatalog = (catalog) => {
  if (!catalog || catalog.version !== 1 || !catalog.byId || !Array.isArray(catalog.choices)) throw new TypeError('Invalid modernization catalog.');
  return catalog;
};
const context = (value = {}) => {
  plain(value, 'Modernization context');
  return Object.freeze({ completedOperationIds: ids(value.completedOperationIds, 'Completed operations'), medalIds: ids(value.medalIds, 'Medals') });
};
const cost = (catalog, selected) => selected.reduce((sum, choiceId) => sum + catalog.byId[choiceId].cost, 0);

function validateSelected(catalog, selected) {
  if (selected.length > catalog.policy.maxSelectedChoices) throw new RangeError('Modernization selection exceeds its cap.');
  const set = new Set(selected);
  const categoryCounts = {};
  for (const choiceId of selected) {
    const choice = catalog.byId[choiceId];
    if (!choice) throw new Error(`Unknown modernization choice: ${choiceId}`);
    for (const required of choice.requiresChoiceIds) if (!set.has(required)) throw new Error(`${choiceId} requires ${required}.`);
    for (const excluded of choice.excludesChoiceIds) if (set.has(excluded)) throw new Error(`${choiceId} excludes ${excluded}.`);
    categoryCounts[choice.category] = (categoryCounts[choice.category] ?? 0) + 1;
  }
  for (const [category, count] of Object.entries(categoryCounts)) {
    if (catalog.policy.categoryCaps[category] !== undefined && count > catalog.policy.categoryCaps[category]) throw new RangeError(`${category} exceeds its category cap.`);
  }
}

export function createModernizationState({ earnedPoints = 0, availablePoints = earnedPoints, selectedChoiceIds = [] } = {}, catalog = createModernizationCatalog()) {
  assertCatalog(catalog);
  const earned = integer(earnedPoints, 'Earned points');
  const available = integer(availablePoints, 'Available points');
  if (earned > catalog.policy.maxEarnedPoints) throw new RangeError('Earned points exceed the campaign cap.');
  const selected = ids(selectedChoiceIds, 'Selected choices');
  validateSelected(catalog, selected);
  const activeCost = cost(catalog, selected);
  if (available + activeCost > earned) throw new RangeError('Modernization state spends more points than have been earned.');
  return freeze({ version: 1, earnedPoints: earned, availablePoints: available, selectedChoiceIds: selected, activeCost, sunkPoints: earned - available - activeCost });
}

export function awardModernizationPoints(state, points, catalog = createModernizationCatalog()) {
  const current = createModernizationState(state, catalog);
  const award = integer(points, 'Point award', 1);
  if (current.earnedPoints + award > catalog.policy.maxEarnedPoints) throw new RangeError('Point award exceeds the campaign cap.');
  return createModernizationState({ earnedPoints: current.earnedPoints + award, availablePoints: current.availablePoints + award, selectedChoiceIds: current.selectedChoiceIds }, catalog);
}

function unlockReasons(choice, campaign) {
  const reasons = [];
  if (campaign.completedOperationIds.length < choice.unlock.minimumCompletedOperations) reasons.push('insufficient-completed-operations');
  for (const value of choice.unlock.requiredOperationIds) if (!campaign.completedOperationIds.includes(value)) reasons.push(`missing-operation:${value}`);
  for (const value of choice.unlock.requiredMedalIds) if (!campaign.medalIds.includes(value)) reasons.push(`missing-medal:${value}`);
  return reasons;
}

export function evaluateModernizationChoice({ catalog, state, choiceId, context: campaign = {} }) {
  assertCatalog(catalog);
  const current = createModernizationState(state, catalog);
  const choice = catalog.byId[id(choiceId, 'Choice ID')];
  if (!choice) throw new Error(`Unknown modernization choice: ${choiceId}`);
  const selected = current.selectedChoiceIds.includes(choice.id);
  const reasons = unlockReasons(choice, context(campaign));
  if (!selected) {
    if (current.availablePoints < choice.cost) reasons.push('insufficient-points');
    if (current.selectedChoiceIds.length >= catalog.policy.maxSelectedChoices) reasons.push('selection-cap');
    const sameCategory = current.selectedChoiceIds.filter((value) => catalog.byId[value].category === choice.category).length;
    if (catalog.policy.categoryCaps[choice.category] !== undefined && sameCategory >= catalog.policy.categoryCaps[choice.category]) reasons.push(`category-cap:${choice.category}`);
    for (const required of choice.requiresChoiceIds) if (!current.selectedChoiceIds.includes(required)) reasons.push(`missing-prerequisite:${required}`);
    for (const excluded of choice.excludesChoiceIds) if (current.selectedChoiceIds.includes(excluded)) reasons.push(`excluded-by:${excluded}`);
  }
  return freeze({ choiceId: choice.id, upgradeId: choice.upgradeId, selected, status: selected ? 'selected' : reasons.length ? 'locked' : 'available', reasons: [...new Set(reasons)].sort(), cost: choice.cost });
}

export function selectModernizationChoice({ catalog, state, choiceId, context: campaign = {} }) {
  const result = evaluateModernizationChoice({ catalog, state, choiceId, context: campaign });
  if (result.selected) return createModernizationState(state, catalog);
  if (result.reasons.length) throw new Error(`Cannot select ${result.choiceId}: ${result.reasons.join(', ')}`);
  const current = createModernizationState(state, catalog);
  return createModernizationState({ earnedPoints: current.earnedPoints, availablePoints: current.availablePoints - result.cost, selectedChoiceIds: [...current.selectedChoiceIds, result.choiceId] }, catalog);
}

export function resolveModernizationRefundPolicy(catalog, campaign = {}) {
  assertCatalog(catalog);
  const completed = context(campaign).completedOperationIds.length;
  const policy = catalog.policy.refund;
  if (policy.lockedAfterCompletedOperations !== null && completed >= policy.lockedAfterCompletedOperations) return Object.freeze({ mode: 'locked', ratio: 0, completedOperations: completed });
  if (completed <= policy.freeThroughCompletedOperations) return Object.freeze({ mode: 'full', ratio: 1, completedOperations: completed });
  return Object.freeze({ mode: 'partial', ratio: policy.partialRatio, completedOperations: completed });
}

function removalSet(catalog, selected, root) {
  const removed = new Set([root]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const choiceId of selected) if (!removed.has(choiceId) && catalog.byId[choiceId].requiresChoiceIds.some((required) => removed.has(required))) {
      removed.add(choiceId); changed = true;
    }
  }
  return [...removed].sort();
}

export function refundModernizationChoice({ catalog, state, choiceId, context: campaign = {}, cascade = false }) {
  const current = createModernizationState(state, catalog);
  const choice = id(choiceId, 'Refund choice ID');
  if (!current.selectedChoiceIds.includes(choice)) throw new Error(`${choice} is not selected.`);
  const policy = resolveModernizationRefundPolicy(catalog, campaign);
  if (policy.mode === 'locked') throw new Error('Modernization refunds are locked.');
  const removedChoiceIds = removalSet(catalog, current.selectedChoiceIds, choice);
  if (!cascade && removedChoiceIds.length > 1) throw new Error(`${choice} has selected dependents: ${removedChoiceIds.filter((value) => value !== choice).join(', ')}`);
  const removedCost = cost(catalog, removedChoiceIds);
  const refundedPoints = Math.floor(removedCost * policy.ratio);
  const next = current.selectedChoiceIds.filter((value) => !removedChoiceIds.includes(value));
  return freeze({ state: createModernizationState({ earnedPoints: current.earnedPoints, availablePoints: current.availablePoints + refundedPoints, selectedChoiceIds: next }, catalog), removedChoiceIds, removedCost, refundedPoints, forfeitedPoints: removedCost - refundedPoints, refundPolicy: policy });
}

export function respecModernizationChoices({ catalog, state, context: campaign = {} }) {
  const current = createModernizationState(state, catalog);
  const policy = resolveModernizationRefundPolicy(catalog, campaign);
  if (policy.mode === 'locked') throw new Error('Modernization respec is locked.');
  const gross = Math.floor(current.activeCost * policy.ratio);
  const fee = Math.min(catalog.policy.refund.respecFee, current.availablePoints + gross);
  return freeze({ state: createModernizationState({ earnedPoints: current.earnedPoints, availablePoints: current.availablePoints + gross - fee, selectedChoiceIds: [] }, catalog), removedChoiceIds: current.selectedChoiceIds, refundedPoints: gross - fee, fee, forfeitedPoints: current.activeCost - gross + fee, refundPolicy: policy });
}

export function activeModernizationUpgradeIds(state, catalog = createModernizationCatalog()) {
  return Object.freeze(createModernizationState(state, catalog).selectedChoiceIds.map((choiceId) => catalog.byId[choiceId].upgradeId).sort());
}

const snapshot = (state, catalog) => {
  const current = createModernizationState(state, catalog);
  return freeze({ version: 1, earnedPoints: current.earnedPoints, availablePoints: current.availablePoints, selectedChoiceIds: current.selectedChoiceIds });
};
export function readModernizationFromCampaignProfile(profile, catalog = createModernizationCatalog()) {
  const saved = validateCampaignProfile(profile).choices[CAMPAIGN_MODERNIZATION_CHOICE_ID];
  if (saved === undefined) return createModernizationState({}, catalog);
  plain(saved, 'Persisted modernization state');
  if (saved.version !== 1) throw new RangeError(`Unsupported campaign modernization version: ${saved.version}`);
  return createModernizationState(saved, catalog);
}
export function writeModernizationToCampaignProfile(profile, state, catalog = createModernizationCatalog()) {
  let next = setCampaignChoice(validateCampaignProfile(profile), CAMPAIGN_MODERNIZATION_CHOICE_ID, snapshot(state, catalog));
  for (const upgradeId of activeModernizationUpgradeIds(state, catalog)) next = unlockCampaignUpgrade(next, upgradeId);
  return next;
}
export const serializeModernizationState = (state, catalog = createModernizationCatalog()) => JSON.stringify(snapshot(state, catalog));
export function deserializeModernizationState(serialized, catalog = createModernizationCatalog()) {
  if (typeof serialized !== 'string' || !serialized.trim()) throw new TypeError('Serialized modernization state must be non-empty JSON.');
  let saved;
  try { saved = JSON.parse(serialized); } catch (error) { throw new SyntaxError(`Modernization JSON is invalid: ${error.message}`); }
  plain(saved, 'Serialized modernization state');
  if (saved.version !== 1) throw new RangeError(`Unsupported campaign modernization version: ${saved.version}`);
  return createModernizationState(saved, catalog);
}

export function createModernizationPresentation({ catalog, state, context: campaign = {} }) {
  const current = createModernizationState(state, catalog);
  const refundPolicy = resolveModernizationRefundPolicy(catalog, campaign);
  return freeze({
    version: 1,
    budget: { earnedPoints: current.earnedPoints, availablePoints: current.availablePoints, activeCost: current.activeCost, sunkPoints: current.sunkPoints, pointCap: catalog.policy.maxEarnedPoints, selectionCount: current.selectedChoiceIds.length, selectionCap: catalog.policy.maxSelectedChoices },
    refundPolicy,
    activeUpgradeIds: activeModernizationUpgradeIds(current, catalog),
    choices: catalog.choices.map((choice) => {
      const evaluation = evaluateModernizationChoice({ catalog, state: current, choiceId: choice.id, context: campaign });
      return Object.freeze({ ...choice, selected: evaluation.selected, status: evaluation.status, reasons: evaluation.reasons, refundValue: evaluation.selected && refundPolicy.mode !== 'locked' ? Math.floor(choice.cost * refundPolicy.ratio) : 0 });
    }),
  });
}
