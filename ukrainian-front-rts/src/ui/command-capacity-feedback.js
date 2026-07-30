function capacityLabel(snapshot) {
  return `Command capacity ${snapshot.used} of ${snapshot.capacity}. Fielded ${snapshot.fielded}; reserved ${snapshot.reserved}; available ${snapshot.available}.`;
}

export function installCommandCapacityFeedback({ game, ui }) {
  if (!game || typeof game.commandCapacitySnapshot !== 'function') {
    throw new TypeError('Command capacity feedback requires an installed command-capacity controller.');
  }
  if (!ui || typeof ui.refresh !== 'function' || typeof ui.toast !== 'function') {
    throw new TypeError('Command capacity feedback requires UI refresh and toast methods.');
  }

  const originalRefresh = ui.refresh.bind(ui);
  let previousState = null;

  ui.refresh = (...args) => {
    const result = originalRefresh(...args);
    const snapshot = game.commandCapacitySnapshot();
    const element = ui.e?.pop;
    if (!snapshot || !element) return result;

    const warningSuffix = snapshot.state === 'full' || snapshot.state === 'over' ? ' ⚠' : '';
    element.textContent = `${snapshot.used}/${snapshot.capacity}${warningSuffix}`;
    element.title = capacityLabel(snapshot);
    element.setAttribute?.('aria-label', capacityLabel(snapshot));
    element.classList?.toggle('capacity-warning', snapshot.state === 'near' || snapshot.state === 'full');
    element.classList?.toggle('over-cap', snapshot.state === 'over');

    if (previousState != null && snapshot.state !== previousState) {
      if (snapshot.warning && (snapshot.state === 'full' || snapshot.state === 'over')) {
        ui.toast(snapshot.warning.message);
      } else if (
        previousState === 'over' &&
        snapshot.state !== 'over'
      ) {
        ui.toast('Command capacity restored. New unit reservations are available again.');
      }
    }
    previousState = snapshot.state;
    return result;
  };

  return () => {
    ui.refresh = originalRefresh;
  };
}
