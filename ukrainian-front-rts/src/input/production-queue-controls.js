function refundedText(result) {
  const entries = Object.entries(result?.refunded || {});
  return entries.length
    ? entries.map(([resource, amount]) => `${amount} ${resource}`).join(' · ')
    : 'no resources';
}

export function installProductionQueueControls({ game, ui } = {}) {
  if (!game || typeof game.cancelProduction !== 'function' || typeof game.moveProduction !== 'function') {
    throw new TypeError('Production queue controls require the production queue game commands.');
  }
  if (!ui || typeof ui.appendProduction !== 'function' || typeof ui.commandButton !== 'function') {
    throw new TypeError('Production queue controls require a compatible UI.');
  }

  const originalAppendProduction = ui.appendProduction.bind(ui);
  const originalBuildingStatus = ui.buildingStatus.bind(ui);

  ui.appendProduction = (building) => {
    originalAppendProduction(building);
    const queue = building.queue || [];
    if (!queue.length) return;

    ui.commandButton({
      title: building.productionPaused ? 'Resume Queue' : 'Pause Queue',
      description: building.productionPaused
        ? 'Continue deterministic production progress.'
        : 'Freeze the active item without losing progress.',
      className: 'production-command',
      onClick: () => {
        if (game.setProductionPaused(!building.productionPaused)) {
          ui.toast(building.productionPaused ? 'Production queue paused.' : 'Production queue resumed.');
        } else ui.toast(game.lastError);
        ui.refresh();
      },
    });

    ui.commandButton({
      title: `Repeat: ${building.productionRepeat ? 'ON' : 'OFF'}`,
      description: building.productionRepeat
        ? 'Disable automatic re-queueing of the selected production type.'
        : 'Repeat the current production type when resources and capacity allow.',
      className: 'production-command',
      onClick: () => {
        if (game.setProductionRepeat(!building.productionRepeat)) {
          ui.toast(`Repeat production ${building.productionRepeat ? 'enabled' : 'disabled'}.`);
        } else ui.toast(game.lastError);
        ui.refresh();
      },
    });

    ui.commandButton({
      title: 'Cancel Current',
      description: 'Refund unspent work and release reserved command capacity.',
      className: 'production-command',
      onClick: () => {
        if (game.cancelProduction(0)) {
          ui.toast(`Production cancelled; refunded ${refundedText(game.lastProductionResult)}.`);
        } else ui.toast(game.lastError);
        ui.refresh();
      },
    });

    if (queue.length > 1) {
      ui.commandButton({
        title: 'Promote Next',
        description: 'Move the second queued item to the active position.',
        className: 'production-command',
        onClick: () => {
          if (game.moveProduction(1, 0)) ui.toast('Next production item promoted.');
          else ui.toast(game.lastError);
          ui.refresh();
        },
      });
      ui.commandButton({
        title: 'Send Current Back',
        description: 'Move the active item to the end without losing progress.',
        className: 'production-command',
        onClick: () => {
          if (game.moveProduction(0, queue.length - 1)) ui.toast('Current production item moved to the back.');
          else ui.toast(game.lastError);
          ui.refresh();
        },
      });
    }
  };

  ui.buildingStatus = (building) => {
    const base = originalBuildingStatus(building);
    if (!(building.queue || []).length) {
      if (building.productionRepeat && building.productionRepeatBlocked) {
        return `${base} · Repeat waiting: ${building.productionRepeatBlocked}`;
      }
      return base;
    }
    const modes = [];
    if (building.productionPaused) modes.push('PAUSED');
    if (building.productionRepeat) modes.push('REPEAT');
    if (building.productionRepeatBlocked) modes.push(`repeat waiting: ${building.productionRepeatBlocked}`);
    return modes.length ? `${base} · ${modes.join(' · ')}` : base;
  };

  return () => {
    ui.appendProduction = originalAppendProduction;
    ui.buildingStatus = originalBuildingStatus;
  };
}
