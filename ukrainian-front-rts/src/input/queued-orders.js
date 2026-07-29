const PLAYER_ORDER_KINDS = new Set(['move', 'attackMove', 'attack']);

function cloneOrder(order) {
  if (!order) return null;
  return { ...order };
}

function isPlayerOrder(order) {
  return Boolean(order && PLAYER_ORDER_KINDS.has(order.kind));
}

export function ensureOrderQueue(unit) {
  if (!Array.isArray(unit.orderQueue)) unit.orderQueue = [];
  return unit.orderQueue;
}

export function replaceOrders(unit, order) {
  const queue = ensureOrderQueue(unit);
  queue.splice(0, queue.length, cloneOrder(order));
  unit.order = queue[0] || null;
  unit.target = unit.order?.kind === 'attack' ? unit.order.target : null;
  return queue;
}

export function appendOrder(unit, order) {
  const queue = ensureOrderQueue(unit);
  if (!queue.length && isPlayerOrder(unit.order)) queue.push(cloneOrder(unit.order));
  queue.push(cloneOrder(order));
  if (!unit.order) unit.order = queue[0];
  return queue;
}

export function clearOrders(unit) {
  ensureOrderQueue(unit).length = 0;
  unit.order = null;
  unit.target = null;
}

export function advanceOrderQueue(unit, completedOrder) {
  const queue = ensureOrderQueue(unit);
  if (queue.length && (queue[0] === completedOrder || sameOrder(queue[0], completedOrder))) queue.shift();
  unit.order = queue[0] || null;
  unit.target = unit.order?.kind === 'attack' ? unit.order.target : null;
  return unit.order;
}

function sameOrder(a, b) {
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === 'attack') return a.target === b.target;
  return a.x === b.x && a.y === b.y;
}

export function queuedWaypoints(unit) {
  const queue = ensureOrderQueue(unit);
  return queue
    .map((order, index) => {
      if (order.kind === 'attack') {
        const target = order.target;
        if (!target || target.hp <= 0) return null;
        return { index, kind: order.kind, x: target.x, y: target.y, targetId: target.id };
      }
      if (Number.isFinite(order.x) && Number.isFinite(order.y)) {
        return { index, kind: order.kind, x: order.x, y: order.y };
      }
      return null;
    })
    .filter(Boolean);
}

export function createQueuedOrderController(game) {
  const originalIssue = game.issue.bind(game);
  const originalStopSelected = game.stopSelected.bind(game);
  const originalUpdateUnit = game.updateUnit.bind(game);

  game.issue = (x, y, target, { append = false } = {}) => {
    const units = game.selectedUnits();
    if (!units.length || game.gameOver) return false;
    const attackMove = game.mouse.attackMove;
    const accepted = originalIssue(x, y, target);
    if (!accepted) return false;
    for (const unit of units) {
      const issued = cloneOrder(unit.order);
      if (append) appendOrder(unit, issued);
      else replaceOrders(unit, issued);
    }
    game.mouse.attackMove = false;
    return true;
  };

  game.stopSelected = () => {
    const units = game.selectedUnits();
    const stopped = originalStopSelected();
    if (stopped) units.forEach(clearOrders);
    return stopped;
  };

  game.updateUnit = (unit, dt) => {
    const before = unit.order;
    originalUpdateUnit(unit, dt);
    if (!isPlayerOrder(before)) return;
    const queue = ensureOrderQueue(unit);
    if (!queue.length) return;
    const completed = unit.order == null || (before.kind === 'attack' && before.target?.hp <= 0);
    if (completed) advanceOrderQueue(unit, before);
  };

  game.queuedWaypoints = (unit) => queuedWaypoints(unit);

  return () => {
    game.issue = originalIssue;
    game.stopSelected = originalStopSelected;
    game.updateUnit = originalUpdateUnit;
    delete game.queuedWaypoints;
  };
}
