import { DONBAS_CROSSING_OPERATION } from './donbas-crossing-operation.js';
import { ZAPORIZHZHIA_RECON_STRIKE_OPERATION } from './zaporizhzhia-recon-strike-operation.js';
import { LOWER_DNIPRO_OPERATION } from './lower-dnipro-bridgehead-operation.js';
import { URBAN_DEFENSE_OPERATION } from './urban-defense-operation.js';
import { BREACH_OPERATION } from './breach-operation.js';
import { DEEP_STRIKE_OPERATION } from './deep-strike-logistics-operation.js';
import { DEFENSIVE_WITHDRAWAL_OPERATION } from './defensive-withdrawal-operation.js';
import { COMBINED_ARMS_OPERATION } from './combined-arms-offensive-operation.js';
import { CAMPAIGN_FINALE_OPERATION } from './finale-operation.js';

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

export const CAMPAIGN_OPERATION_SEQUENCE = deepFreeze([
  DONBAS_CROSSING_OPERATION,
  ZAPORIZHZHIA_RECON_STRIKE_OPERATION,
  LOWER_DNIPRO_OPERATION,
  URBAN_DEFENSE_OPERATION,
  BREACH_OPERATION,
  DEEP_STRIKE_OPERATION,
  DEFENSIVE_WITHDRAWAL_OPERATION,
  COMBINED_ARMS_OPERATION,
  CAMPAIGN_FINALE_OPERATION,
]);

export const CAMPAIGN_OPERATION_IDS = Object.freeze(CAMPAIGN_OPERATION_SEQUENCE.map((operation) => operation.id));

const OPERATION_INDEX = new Map(CAMPAIGN_OPERATION_SEQUENCE.map((operation, index) => [operation.id, index]));
if (OPERATION_INDEX.size !== CAMPAIGN_OPERATION_SEQUENCE.length) throw new Error('Campaign operation IDs must be unique.');

export function getCampaignOperation(operationId) {
  const index = OPERATION_INDEX.get(operationId);
  if (index === undefined) throw new RangeError(`Unknown campaign operation: ${operationId}`);
  return CAMPAIGN_OPERATION_SEQUENCE[index];
}

export function getNextCampaignOperation(operationId) {
  const index = OPERATION_INDEX.get(operationId);
  if (index === undefined) throw new RangeError(`Unknown campaign operation: ${operationId}`);
  return CAMPAIGN_OPERATION_SEQUENCE[index + 1] ?? null;
}

export function campaignOperationSummary() {
  return deepFreeze(CAMPAIGN_OPERATION_SEQUENCE.map((operation, index) => ({
    order: index + 1,
    id: operation.id,
    title: operation.title ?? operation.mission?.title ?? operation.briefing?.title ?? operation.id,
    finale: index === CAMPAIGN_OPERATION_SEQUENCE.length - 1,
  })));
}