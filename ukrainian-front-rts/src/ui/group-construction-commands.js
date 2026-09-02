import { ABILITIES, BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';

const BUILD_ACTIONS = Object.freeze({
  buildDepot: 'depot',
  buildBarracks: 'barracks',
  buildWorkshop: 'workshop',
});

const INCOMPATIBLE_SELECTION_REASON = 'Select only compatible Ukrainian engineers to construct this structure.';

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

    const builders = units.filter(isConstructionWorker);
    if (!builders.length) return result;

    const abilityIds = sharedConstructionAbilityIds(builders);
    if (!abilityIds.length) return result;

    const compatibleSelection = selectedEntities.length === units.length && builders.length === units.length;
    const builderSummary = this.selectionSummary(builders);

    for (const abilityId of abilityIds) {
      const ability = ABILITIES[abilityId];
      const buildType = BUILD_ACTIONS[abilityId];
      if (!ability || !buildType || !BUILDING_TYPES[buildType]) continue;
      this.commandButton({
        id: `group-${abilityId}`,
        title: ability.name,
        description: compatibleSelection
          ? ability.desc
          : `${ability.desc} ${INCOMPATIBLE_SELECTION_REASON}`,
        meta: `${builderSummary} · ${this.formatCost(BUILDING_TYPES[buildType].cost)}`,
        className: 'build-command',
        disabled: !compatibleSelection,
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
