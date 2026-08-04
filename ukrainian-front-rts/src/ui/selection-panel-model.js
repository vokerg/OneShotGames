import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';
import { veterancyPresentation } from '../core/veterancy.js';

export const SELECTION_PANEL_MODEL_VERSION = 1;

const STATUS_SEVERITIES = Object.freeze({
  INFO: 'info',
  GOOD: 'good',
  WARNING: 'warning',
  DANGER: 'danger',
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function entityKey(entity) {
  if (entity?.id === undefined || entity?.id === null || entity.id === '') {
    throw new TypeError('Selection panel entities require stable IDs.');
  }
  return String(entity.id);
}

function compareKeys(left, right) {
  const leftKey = entityKey(left);
  const rightKey = entityKey(right);
  const leftNumber = Number(leftKey);
  const rightNumber = Number(rightKey);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function definitionFor(entity) {
  return UNIT_TYPES[entity?.type] ?? BUILDING_TYPES[entity?.type] ?? null;
}

function entityKind(entity) {
  if (UNIT_TYPES[entity?.type]) return 'unit';
  if (BUILDING_TYPES[entity?.type]) return 'building';
  return entity?.entityKind ?? 'unknown';
}

function displayName(entity) {
  const definition = definitionFor(entity);
  return definition?.short ?? definition?.name ?? entity?.name ?? entity?.type ?? `Entity ${entityKey(entity)}`;
}

function fullName(entity) {
  const definition = definitionFor(entity);
  return definition?.name ?? entity?.name ?? entity?.type ?? `Entity ${entityKey(entity)}`;
}

function healthPresentation(entity) {
  const current = Math.max(0, finite(entity?.hp));
  const maximum = Math.max(0, finite(entity?.maxHp, current));
  const ratio = maximum > 0 ? Math.max(0, Math.min(1, current / maximum)) : 0;
  const state = current <= 0
    ? 'destroyed'
    : ratio <= 0.25
      ? 'critical'
      : ratio <= 0.6
        ? 'damaged'
        : 'healthy';
  return Object.freeze({ current, maximum, ratio, percent: Math.round(ratio * 100), state });
}

function percentageStatus(value, id, label, { dangerBelow = null, warningBelow = null } = {}) {
  if (!Number.isFinite(value)) return null;
  const normalized = value <= 1 ? value * 100 : value;
  const percent = Math.max(0, Math.min(100, Math.round(normalized)));
  const severity = dangerBelow !== null && percent < dangerBelow
    ? STATUS_SEVERITIES.DANGER
    : warningBelow !== null && percent < warningBelow
      ? STATUS_SEVERITIES.WARNING
      : STATUS_SEVERITIES.INFO;
  return Object.freeze({ id, label: `${label} ${percent}%`, severity });
}

function statusPresentation(entity, health) {
  const statuses = [];
  if (health.state === 'critical') statuses.push({ id: 'critical', label: 'Critical', severity: STATUS_SEVERITIES.DANGER });
  else if (health.state === 'damaged') statuses.push({ id: 'damaged', label: 'Damaged', severity: STATUS_SEVERITIES.WARNING });
  else if (health.state === 'destroyed') statuses.push({ id: 'destroyed', label: 'Destroyed', severity: STATUS_SEVERITIES.DANGER });

  if (entity?.underConstruction) statuses.push({ id: 'construction', label: 'Constructing', severity: STATUS_SEVERITIES.INFO });
  if (entity?.disabled) statuses.push({ id: 'disabled', label: 'Disabled', severity: STATUS_SEVERITIES.DANGER });
  if (entity?.burning) statuses.push({ id: 'burning', label: 'Burning', severity: STATUS_SEVERITIES.DANGER });
  if (entity?.pinned) statuses.push({ id: 'pinned', label: 'Pinned', severity: STATUS_SEVERITIES.DANGER });
  if (entity?.suppressed) statuses.push({ id: 'suppressed', label: 'Suppressed', severity: STATUS_SEVERITIES.WARNING });
  if (entity?.embarkedIn !== undefined && entity.embarkedIn !== null) {
    statuses.push({ id: 'embarked', label: 'Embarked', severity: STATUS_SEVERITIES.INFO });
  }
  if (entity?.garrisonedIn !== undefined && entity.garrisonedIn !== null) {
    statuses.push({ id: 'garrisoned', label: 'Garrisoned', severity: STATUS_SEVERITIES.GOOD });
  }
  if (entity?.autoFire === false) statuses.push({ id: 'hold-fire', label: 'Hold fire', severity: STATUS_SEVERITIES.WARNING });

  const morale = percentageStatus(entity?.morale, 'morale', 'Morale', { dangerBelow: 25, warningBelow: 55 });
  if (morale) statuses.push(morale);
  const suppression = percentageStatus(entity?.suppression, 'suppression', 'Suppression');
  if (suppression && suppression.label !== 'Suppression 0%') statuses.push(suppression);

  return Object.freeze(statuses
    .map((status) => Object.freeze(status))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

function veterancyFor(entity) {
  if (!UNIT_TYPES[entity?.type] || entity?.veterancy === undefined || entity?.veterancy === null) return null;
  const rank = veterancyPresentation(entity.veterancy);
  return Object.freeze({
    rank: rank.rank,
    rankId: rank.rankId,
    label: rank.label,
    badge: rank.badge,
    xp: rank.xp,
    nextLabel: rank.nextLabel,
    progress: rank.progress,
  });
}

function contentRecord(record, source) {
  const health = healthPresentation(record);
  const definition = definitionFor(record);
  return deepFreeze({
    id: entityKey(record),
    type: record?.type ?? null,
    name: definition?.short ?? definition?.name ?? record?.name ?? record?.type ?? `Unit ${entityKey(record)}`,
    fullName: definition?.name ?? record?.name ?? record?.type ?? `Unit ${entityKey(record)}`,
    team: record?.team ?? null,
    source,
    slotCost: Number.isInteger(record?.slotCost) && record.slotCost > 0
      ? record.slotCost
      : Number.isInteger(record?.transportSlots) && record.transportSlots > 0
        ? record.transportSlots
        : Number.isInteger(definition?.transportSlots) && definition.transportSlots > 0
          ? definition.transportSlots
          : 1,
    health,
    veterancy: veterancyFor(record),
  });
}

function containerPresentation(entity) {
  const containers = [];
  if (Array.isArray(entity?.passengers)) {
    const contents = [...entity.passengers].sort(compareKeys).map((passenger) => contentRecord(passenger, 'transport'));
    const definition = definitionFor(entity);
    const capacity = Number.isInteger(definition?.transportCapacity)
      ? definition.transportCapacity
      : Number.isInteger(entity.transportCapacity)
        ? entity.transportCapacity
        : null;
    containers.push(deepFreeze({
      kind: 'transport',
      hostId: entityKey(entity),
      label: 'Transport cargo',
      capacity,
      used: contents.reduce((total, content) => total + content.slotCost, 0),
      contents,
    }));
  }

  const garrisonState = entity?.garrisonState ?? entity?.garrison ?? null;
  const occupants = Array.isArray(garrisonState?.occupants)
    ? garrisonState.occupants
    : Array.isArray(entity?.occupants)
      ? entity.occupants
      : null;
  if (occupants) {
    const contents = [...occupants].sort(compareKeys).map((occupant) => contentRecord(occupant, 'garrison'));
    const capacity = Number.isInteger(garrisonState?.capacity)
      ? garrisonState.capacity
      : Number.isInteger(entity?.garrisonCapacity)
        ? entity.garrisonCapacity
        : null;
    containers.push(deepFreeze({
      kind: 'garrison',
      hostId: entityKey(entity),
      label: 'Garrison occupants',
      capacity,
      used: contents.reduce((total, content) => total + content.slotCost, 0),
      contents,
    }));
  }
  return Object.freeze(containers);
}

function itemPresentation(entity, primaryId) {
  const health = healthPresentation(entity);
  return deepFreeze({
    id: entityKey(entity),
    rawId: entity.id,
    type: entity?.type ?? null,
    kind: entityKind(entity),
    name: displayName(entity),
    fullName: fullName(entity),
    team: entity?.team ?? null,
    friendly: entity?.team === TEAM.UA,
    primary: entityKey(entity) === primaryId,
    health,
    statuses: statusPresentation(entity, health),
    veterancy: veterancyFor(entity),
    containers: containerPresentation(entity),
  });
}

function subgroupPresentation(items, primaryId) {
  const units = items.filter((item) => item.kind === 'unit');
  const grouped = new Map();
  for (const item of units) {
    const group = grouped.get(item.type) ?? [];
    group.push(item);
    grouped.set(item.type, group);
  }
  return Object.freeze([...grouped.entries()]
    .map(([type, members]) => {
      const definition = UNIT_TYPES[type];
      return deepFreeze({
        id: type,
        label: definition?.short ?? definition?.name ?? type,
        count: members.length,
        unitIds: Object.freeze(members.map((member) => member.id)),
        containsPrimary: members.some((member) => member.id === primaryId),
      });
    })
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export function createSelectionPanelModel(game, entities = game?.selectedEntities?.() ?? []) {
  if (!game || !Array.isArray(entities)) throw new TypeError('Selection panel model requires game state and selected entities.');
  const selected = [...new Map(entities.map((entity) => [entityKey(entity), entity])).values()]
    .filter((entity) => finite(entity?.hp, 1) > 0)
    .sort(compareKeys);
  const selectedKeys = new Set(selected.map(entityKey));
  const requestedPrimary = game.primarySelectedId === undefined || game.primarySelectedId === null
    ? null
    : String(game.primarySelectedId);
  const primaryId = requestedPrimary && selectedKeys.has(requestedPrimary)
    ? requestedPrimary
    : selected.length
      ? entityKey(selected[0])
      : null;
  const ordered = primaryId === null
    ? selected
    : [...selected].sort((left, right) => {
      const leftPrimary = entityKey(left) === primaryId;
      const rightPrimary = entityKey(right) === primaryId;
      if (leftPrimary !== rightPrimary) return leftPrimary ? -1 : 1;
      return compareKeys(left, right);
    });
  const items = Object.freeze(ordered.map((entity) => itemPresentation(entity, primaryId)));
  const containers = Object.freeze(items.flatMap((item) => item.containers));
  return deepFreeze({
    version: SELECTION_PANEL_MODEL_VERSION,
    empty: items.length === 0,
    count: items.length,
    primaryId,
    items,
    subgroups: subgroupPresentation(items, primaryId),
    containers,
  });
}
