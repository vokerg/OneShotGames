import { BUILDING_TYPES, TEAM, UNIT_TYPES } from '../config.js';
import { TACTICAL_COMMAND_KINDS } from '../core/tactical-command-contract.js';
import { createCommandCardIcon } from './command-card-icons.js';
import { installProductionCommandCard } from './command-card.js';

export const RELEASE_UI_STYLESHEET = 'release-ui.css';

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

function installReleaseUiStylesheet(documentTarget) {
  if (!documentTarget?.head || typeof documentTarget.createElement !== 'function') return () => {};
  const existing = documentTarget.querySelector?.('link[data-release-ui-styles="true"]');
  if (existing) return () => {};
  const link = documentTarget.createElement('link');
  link.rel = 'stylesheet';
  link.href = RELEASE_UI_STYLESHEET;
  link.dataset.releaseUiStyles = 'true';
  documentTarget.head.append(link);
  return () => link.remove?.();
}

function decorateCommandCard(root, documentTarget) {
  if (!root?.querySelectorAll || !documentTarget?.createElementNS) return;
  for (const button of root.querySelectorAll('.commandCardAction')) {
    if (button.querySelector?.('.commandCardIcon')) continue;
    const title = button.querySelector?.('.commandTitle')?.textContent || '';
    const description = button.querySelector?.('.commandDescription')?.textContent || '';
    const disabledReasonNode = button.querySelector?.('.commandDisabledReason');
    const disabledReason = disabledReasonNode?.dataset?.fullReason || disabledReasonNode?.textContent || '';
    const icon = createCommandCardIcon(documentTarget, {
      id: button.dataset?.commandId || '',
      title,
      group: button.dataset?.commandGroup || '',
    });
    if (icon) {
      button.prepend(icon);
      button.dataset.iconKey = icon.dataset.iconKey || '';
      button.dataset.iconStatus = icon.dataset.iconStatus || 'fallback';
    }
    if (disabledReasonNode && disabledReason) {
      disabledReasonNode.dataset.fullReason = disabledReason;
      disabledReasonNode.textContent = 'Blocked';
    }
    const tooltip = [title, description, disabledReason].filter(Boolean).join('\n');
    if (tooltip) {
      button.title = tooltip;
      button.dataset.tooltip = tooltip;
    }
  }
}

export function installTacticalCommandCard(ui) {
  if (!ui?.g || typeof ui.appendUnitCommands !== 'function' || typeof ui.commandStateSignature !== 'function') {
    throw new TypeError('Tactical command card requires a UI instance with unit command hooks.');
  }
  if (typeof ui.commandButton !== 'function' || typeof ui.toast !== 'function') {
    throw new TypeError('Tactical command card requires UI commandButton() and toast().');
  }

  const documentTarget = ui.e?.abilities?.ownerDocument || globalThis.document;
  let disposeCommandCard = () => {};
  if (ui?.e?.abilities) {
    const disposeProductionCommandCard = installProductionCommandCard(ui);
    disposeCommandCard = disposeProductionCommandCard;
  }
  const disposeReleaseUiStylesheet = installReleaseUiStylesheet(documentTarget);
  const productionRefresh = ui.refresh;
  const releaseRefresh = function refreshWithReleaseCommandPresentation(...args) {
    const result = productionRefresh.apply(this, args);
    decorateCommandCard(this.e?.abilities, documentTarget);
    return result;
  };
  ui.refresh = releaseRefresh;

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

    if (typeof this.g.armAttackGround === 'function') {
      this.commandButton({
        id: 'attack-ground',
        title: 'Attack Ground',
        description: 'Force-fire a battlefield point without requiring a visible target.',
        meta: 'F',
        hotkey: 'F',
        group: 'targeting',
        className: `command ${this.g.isAttackGroundArmed?.() ? 'stance-on' : ''}`,
        disabled: armedCount === 0,
        disabledReason: armedCount === 0 ? 'Select at least one armed Ukrainian unit.' : '',
        targeting: Boolean(this.g.isAttackGroundArmed?.()),
        onClick: () => {
          if (this.g.armAttackGround()) notify('Force-fire armed: left-click a battlefield point.');
          else notify('Select at least one armed Ukrainian unit.');
        },
      });
    }

    for (const command of COMMANDS) {
      const disabled = command.kind === TACTICAL_COMMAND_KINDS.GUARD && armedCount === 0;
      this.commandButton({
        id: command.kind,
        title: `${pendingKind === command.kind ? '✓ ' : ''}${command.title}`,
        description: command.description,
        meta: command.key,
        hotkey: command.key,
        group: 'targeting',
        className: `command ${pendingKind === command.kind ? 'stance-on' : ''}`,
        disabled,
        disabledReason: disabled ? 'Select at least one armed Ukrainian unit to guard another entity.' : '',
        targeting: pendingKind === command.kind,
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
      id: 'hold-position-order',
      title: 'Hold Position',
      description: 'Cancel movement and chasing while retaining local weapon response.',
      meta: 'H',
      hotkey: 'H',
      group: 'order',
      className: 'command',
      onClick: () => {
        this.g.holdSelected();
        notify('Hold-position order issued.');
      },
    });

    const repairDisabledReason = damagedVehicleCount === 0
      ? 'Select at least one damaged vehicle.'
      : repairFacilityCount === 0
        ? 'No operational repair workshop is available.'
        : '';
    this.commandButton({
      id: 'return-for-repair',
      title: 'Return for Repair',
      description: 'Send damaged vehicles to the nearest operational repair workshop.',
      meta: 'R',
      hotkey: 'R',
      group: 'order',
      className: 'command',
      disabled: Boolean(repairDisabledReason),
      disabledReason: repairDisabledReason,
      onClick: () => {
        this.g.returnSelectedForRepair();
        notify('Return-for-repair order issued.');
      },
    });
  };

  decorateCommandCard(ui.e?.abilities, documentTarget);

  return () => {
    ui.appendUnitCommands = originalAppendUnitCommands;
    ui.commandStateSignature = originalCommandStateSignature;
    if (ui.refresh === releaseRefresh) ui.refresh = productionRefresh;
    disposeReleaseUiStylesheet();
    disposeCommandCard();
  };
}
