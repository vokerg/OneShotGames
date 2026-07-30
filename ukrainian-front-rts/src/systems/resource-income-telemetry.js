export const RESOURCE_INCOME_WINDOW_SECONDS = 60;
export const RESOURCE_INCOME_KINDS = Object.freeze(['metal', 'fuel', 'intel']);

function resourceSnapshot(player = {}) {
  return Object.fromEntries(RESOURCE_INCOME_KINDS.map((resource) => [resource, Number(player[resource]) || 0]));
}

function reset(game) {
  game.resourceIncomeTelemetry = {
    missionStartedAt: Number(game.time) || 0,
    events: [],
  };
}

function prune(game, now = Number(game.time) || 0) {
  const state = game.resourceIncomeTelemetry;
  const threshold = now - RESOURCE_INCOME_WINDOW_SECONDS;
  state.events = state.events.filter((event) => event.time > threshold);
}

function recordPositiveDeltas(game, before, after) {
  const now = Number(game.time) || 0;
  for (const resource of RESOURCE_INCOME_KINDS) {
    const amount = Math.max(0, after[resource] - before[resource]);
    if (amount > 0) game.resourceIncomeTelemetry.events.push(Object.freeze({ time: now, resource, amount }));
  }
  prune(game, now);
}

export function resourceIncomeRates(game) {
  if (!game.resourceIncomeTelemetry) reset(game);
  prune(game);
  const totals = Object.fromEntries(RESOURCE_INCOME_KINDS.map((resource) => [resource, 0]));
  for (const event of game.resourceIncomeTelemetry.events) totals[event.resource] += event.amount;
  return Object.freeze(totals);
}

export function createResourceIncomeTelemetryController(game) {
  if (!game || typeof game.start !== 'function' || typeof game.updateWorker !== 'function') {
    throw new TypeError('Resource income telemetry requires game.start() and game.updateWorker().');
  }
  const originalStart = game.start.bind(game);
  const originalUpdateWorker = game.updateWorker.bind(game);
  const previousRates = game.resourceIncomeRates;
  const previousTelemetry = game.resourceIncomeTelemetry;

  game.start = (...args) => {
    const result = originalStart(...args);
    reset(game);
    return result;
  };
  game.updateWorker = (...args) => {
    if (!game.resourceIncomeTelemetry) reset(game);
    const before = resourceSnapshot(game.player);
    const result = originalUpdateWorker(...args);
    recordPositiveDeltas(game, before, resourceSnapshot(game.player));
    return result;
  };
  game.resourceIncomeRates = () => resourceIncomeRates(game);
  if (game.player) reset(game);

  return () => {
    game.start = originalStart;
    game.updateWorker = originalUpdateWorker;
    if (previousRates === undefined) delete game.resourceIncomeRates;
    else game.resourceIncomeRates = previousRates;
    if (previousTelemetry === undefined) delete game.resourceIncomeTelemetry;
    else game.resourceIncomeTelemetry = previousTelemetry;
  };
}
