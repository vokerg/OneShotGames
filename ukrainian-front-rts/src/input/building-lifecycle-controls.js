export function installBuildingLifecycleControls({ game, ui } = {}) {
  for (const method of ['sellBuilding', 'scuttleBuilding', 'buildingLifecycleSnapshot']) {
    if (typeof game?.[method] !== 'function') throw new TypeError(`Building lifecycle controls require game.${method}().`);
  }
  if (!ui || typeof ui.appendProduction !== 'function' || typeof ui.commandButton !== 'function') {
    throw new TypeError('Building lifecycle controls require a compatible UI.');
  }
  const originalAppendProduction = ui.appendProduction;
  ui.appendProduction = (building) => {
    originalAppendProduction.call(ui, building);
    if (building.team !== 0) return;
    const snapshot = game.buildingLifecycleSnapshot(building);
    ui.commandButton({
      title: 'Sell Structure',
      description: 'Remove this completed empty structure for a partial integrity-scaled refund.',
      meta: snapshot?.sellable ? 'Refund resources' : 'Unavailable',
      className: 'building-lifecycle-command',
      disabled: !snapshot?.sellable,
      onClick: () => {
        const result = game.sellBuilding(building);
        ui.toast?.(result ? 'Structure sold.' : game.lastError);
        ui.refresh?.();
      },
    });
    ui.commandButton({
      title: 'Scuttle Structure',
      description: 'Destroy this structure immediately and leave a wreck/rubble obstruction.',
      meta: snapshot?.scuttleAvailable ? 'No refund' : 'Unavailable',
      className: 'building-lifecycle-command danger',
      disabled: !snapshot?.scuttleAvailable,
      onClick: () => {
        const result = game.scuttleBuilding(building);
        ui.toast?.(result ? 'Structure scuttled.' : game.lastError);
        ui.refresh?.();
      },
    });
  };
  return () => {
    ui.appendProduction = originalAppendProduction;
  };
}
