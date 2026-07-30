import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';
import { TACTICAL_COMMAND_KINDS } from '../core/tactical-command-contract.js';

const COMMANDS = Object.freeze([
  Object.freeze({
    kind: TACTICAL_COMMAND_KINDS.PATROL,
    title: 'Patrol',
    description: 'Cycle between this position and a chosen point, engaging contacts en route.',
    key: 'P',
  }),
  Object.freeze({
    kind: TACTICAL_COMMAND_KINDS.GUARD,
    title: 'Guard',
    description: 'Protect a friendly unit or structure and return to its perimeter.',
    key: 'G',
  }),
  Object.freeze({
    kind: TACTICAL_COMMAND_KINDS.FOLLOW,
    title: 'Follow',
    description: 'Maintain a stable escort position around another friendly unit.',
    key: 'Y',
  }),
]);

function runtimeStats(game, unit) {
  if (unit?.team === TEAM.UA && typeof game?.unitStats === 'function') return game.unitStats(unit.type);
  return UNIT_TYPES[unit?.type] ?? null;
}

function isDamagedVehicle(game, unit) {
  const stats = runtimeStats(game, unit);
  return Boolean(unit && unit.hp < unit.maxHp && (stats?.armor || stats?.vehicleClass));
}

function operationalRepairFacilities(game) {
  return (game.buildings || [])
    .filter((building) => {
      const configured = building.repairFacility ?? BUILDING_TYPES[building.type]?.repairFacility;
      return (
        building.team === TEAM.UA &&
        building.hp > 0 &&
        !building.underConstruction &&
        (configured === true || building.type === 'workshop')
      );
    })
    .map((building) => building.id)
    .sort((left, right) => left - right);
}

function tacticalSignature(game, entities) {
  const unitState = entities
    .filter((entity) => UNIT_TYPES[entity.type])
    .map((unit) => {
      const command = unit.tacticalCommand;
      return [
        unit.id,
        isDamagedVehicle(game, unit) ? 1 : 0,
        command?.kind || '-',
        command?.targetId ?? '-',
        command?.facilityId ?? '-',
        command?.status || '-',
        command?.leg || '-',
      ].join(':');
    })
    .join('|');
  return [
    game.pendingTacticalCommand?.kind || '-',
    unitState,
    operationalRepairFacilities(game).join(','),
  ].join('::');
}

function consumeCommandMessage(game, fallback) {
  const message = game.lastCommandMessage || game.lastError || fallback;
  game.lastCommandMessage = '';
  return message;
}

export function installTacticalCommandCard(ui) {
  if (!ui?.g || typeof ui.appendUnitCommands !== 'function' || typeof ui.commandStateSignature !== 'function') {
    throw new TypeError('Tactical command card requires a UI instance with unit command hooks.');
  }
  if (typeof ui.commandButton !== 'function' || typeof ui.toast !== 'function') {
    throw new TypeError('Tactical command card requires UI commandButton() and toast().');
  }

  const originalAppendUnitCommands = ui.appendUnitCommands;
  const originalCommandStateSignature = ui.commandStateSignature;

  const notify = (fallback) => {
    ui.toast(consumeCommandMessage(ui.g, fallback));
    ui.refresh?.();
  };

  ui.commandStateSignature = function commandStateSignatureWithTacticalCommands(entities) {
    return `${originalCommandStateSignature.call(this, entities)}::${tacticalSignature(this.g, entities)}`;
  };

  ui.appendUnitCommands = function appendUnitCommandsWithTacticalCommands(units) {
    originalAppendUnitCommands.call(this, units);
    const playerUnits = units.filter((unit) => unit.team === TEAM.UA);
    if (!playerUnits.length || typeof this.g.armTacticalCommand !== 'function') return;

    const pendingKind = this.g.pendingTacticalCommand?.kind;
    const armedCount = playerUnits.filter((unit) => Number(runtimeStats(this.g, unit)?.damage) > 0).length;
    const damagedVehicleCount = playerUnits.filter((unit) => isDamagedVehicle(this.g, unit)).length;
    const repairFacilityCount = operationalRepairFacilities(this.g).length;

    for (const command of COMMANDS) {
      const disabled = command.kind === TACTICAL_COMMAND_KINDS.GUARD && armedCount === 0;
      this.commandButton({
        title: `${pendingKind === command.kind ? '✓ ' : ''}${command.title}`,
        description: command.description,
        meta: command.key,
        className: `command ${pendingKind === command.kind ? 'stance-on' : ''}`,
        disabled,
        onClick: () => {
          if (this.g.armTacticalCommand(command.kind)) {
            notify(`${command.title} armed: right-click a valid target.`);
          } else {
            notify(`${command.title} is unavailable.`);
          }
        },
      });
    }

    this.commandButton({
      title: 'Hold Position',
      description: 'Cancel movement and chasing while retaining local weapon response.',
      meta: 'H',
      className: 'command',
      onClick: () => {
        this.g.holdSelected();
        notify('Hold-position order issued.');
      },
    });

    this.commandButton({
      title: 'Return for Repair',
      description: 'Send damaged vehicles to the nearest operational repair workshop.',
      meta: 'R',
      className: 'command',
      disabled: damagedVehicleCount === 0 || repairFacilityCount === 0,
      onClick: () => {
        this.g.returnSelectedForRepair();
        notify('Return-for-repair order issued.');
      },
    });
  };

  return () => {
    ui.appendUnitCommands = originalAppendUnitCommands;
    ui.commandStateSignature = originalCommandStateSignature;
  };
}
