import { ABILITIES, BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';

const BUILD_ACTIONS = Object.freeze({
  buildDepot: 'depot',
  buildBarracks: 'barracks',
  buildWorkshop: 'workshop',
});

export function commonConstructionAbilityIds(entities) {
  if (!Array.isArray(entities) || entities.length < 2) return Object.freeze([]);
  if (entities.some((entity) => {
    const stats = UNIT_TYPES[entity?.type];
    return entity?.team !== TEAM.UA || !stats?.worker;
  })) {
    return Object.freeze([]);
  }

  return Object.freeze(
    Object.keys(BUILD_ACTIONS).filter((abilityId) =>
      entities.every((entity) => (UNIT_TYPES[entity.type].abilities || []).includes(abilityId)),
    ),
  );
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
    if (selectedEntities.length !== units.length) return result;

    const abilityIds = commonConstructionAbilityIds(units);
    if (!abilityIds.length) return result;
    const builderSummary = this.selectionSummary(units);

    for (const abilityId of abilityIds) {
      const ability = ABILITIES[abilityId];
      const buildType = BUILD_ACTIONS[abilityId];
      if (!ability || !buildType || !BUILDING_TYPES[buildType]) continue;
      this.commandButton({
        id: `group-${abilityId}`,
        title: ability.name,
        description: ability.desc,
        meta: `${builderSummary} · ${this.formatCost(BUILDING_TYPES[buildType].cost)}`,
        className: 'build-command',
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
