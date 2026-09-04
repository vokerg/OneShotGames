import { ABILITIES, BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';

const BUILD_ACTIONS = Object.freeze({
  buildDepot: 'depot',
  buildBarracks: 'barracks',
  buildWorkshop: 'workshop',
});

const INACTIVE_SUBGROUP_REASON = 'Make a compatible Ukrainian engineer subgroup active before constructing this structure.';
const NON_UNIT_SELECTION_REASON = 'Select only units before constructing with an engineer subgroup.';

function isConstructionWorker(entity) {
  const stats = UNIT_TYPES[entity?.type];
  return Boolean(
    entity?.team === TEAM.UA
      && entity.hp > 0
      && stats?.worker,
  );
}

function sharedConstructionAbilityIds(builders) {
  if (!builders.length) return Object.freeze([]);
  return Object.freeze(
    Object.keys(BUILD_ACTIONS).filter((abilityId) =>
      builders.every((entity) => (UNIT_TYPES[entity.type].abilities || []).includes(abilityId)),
    ),
  );
}

function primarySelectedUnit(game, units) {
  if (game?.primarySelectedId == null) return null;
  return units.find((unit) => unit.id === game.primarySelectedId) || null;
}

function constructionSubgroupContext(game, units, selectedEntities) {
  const workers = units.filter(isConstructionWorker);
  if (!workers.length) {
    return Object.freeze({ builders: Object.freeze([]), compatible: false, reason: '' });
  }

  const primary = primarySelectedUnit(game, units);
  if (primary && isConstructionWorker(primary)) {
    const builders = workers.filter((unit) => unit.type === primary.type);
    const compatible = selectedEntities.length === units.length;
    return Object.freeze({
      builders: Object.freeze(builders),
      compatible,
      reason: compatible ? '' : NON_UNIT_SELECTION_REASON,
    });
  }

  if (!primary && workers.length === units.length && selectedEntities.length === units.length) {
    return Object.freeze({
      builders: Object.freeze(workers),
      compatible: true,
      reason: '',
    });
  }

  return Object.freeze({
    builders: Object.freeze(workers),
    compatible: false,
    reason: INACTIVE_SUBGROUP_REASON,
  });
}

export function commonConstructionAbilityIds(entities) {
  if (!Array.isArray(entities) || entities.length < 2) return Object.freeze([]);
  if (entities.some((entity) => !isConstructionWorker(entity))) return Object.freeze([]);
  return sharedConstructionAbilityIds(entities);
}

export function installGroupConstructionCommands(ui) {
  for (const method of [
    'appendUnitCommands',
    'commandButton',
    'formatCost',
    'selectionSummary',
    't',
    'toast',
    'refresh',
  ]) {
    if (typeof ui?.[method] !== 'function') {
      throw new TypeError(`Group construction command installer requires ui.${method}().`);
    }
  }
  if (typeof ui?.g?.selectedEntities !== 'function' || typeof ui?.g?.useAbility !== 'function') {
    throw new TypeError('Group construction command installer requires game selection and ability commands.');
  }

  const originalAppendUnitCommands = ui.appendUnitCommands;

  ui.appendUnitCommands = function appendGroupConstructionCommands(units) {
    const result = originalAppendUnitCommands.call(this, units);
    const selectedEntities = this.g.selectedEntities();
    if (selectedEntities.length < 2) return result;

    const context = constructionSubgroupContext(this.g, units, selectedEntities);
    if (!context.builders.length) return result;

    const abilityIds = sharedConstructionAbilityIds(context.builders);
    if (!abilityIds.length) return result;
    const builderSummary = this.selectionSummary(context.builders);

    for (const abilityId of abilityIds) {
      const ability = ABILITIES[abilityId];
      const buildType = BUILD_ACTIONS[abilityId];
      if (!ability || !buildType || !BUILDING_TYPES[buildType]) continue;
      this.commandButton({
        id: `group-${abilityId}`,
        title: ability.name,
        description: context.compatible
          ? ability.desc
          : `${ability.desc} ${context.reason}`,
        meta: `${builderSummary} · ${this.formatCost(BUILDING_TYPES[buildType].cost)}`,
        className: 'build-command',
        disabled: !context.compatible,
        onClick: () => {
          if (this.g.useAbility(abilityId)) {
            this.toast(this.t(
              'runtime.commands.placeBuilding',
              { name: BUILDING_TYPES[buildType].name },
            ));
          } else {
            this.toast(this.g.lastError);
          }
          this.refresh();
        },
      });
    }
    return result;
  };

  return () => {
    ui.appendUnitCommands = originalAppendUnitCommands;
  };
}
