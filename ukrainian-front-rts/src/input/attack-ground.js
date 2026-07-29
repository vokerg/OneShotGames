import { WORLD } from '../config.js';
import { appendOrder, replaceOrders } from './queued-orders.js';

export const ATTACK_GROUND_ORDER = 'attackGround';

export function isValidGroundPoint(x, y, world = WORLD) {
  return Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= world.w && y <= world.h;
}

export function combatCapableUnits(game) {
  return game.selectedUnits().filter((unit) => {
    const stats = game.unitStats(unit.type);
    return Number(stats.damage) > 0 && Number(stats.range) > 0;
  });
}

export function createAttackGroundOrder(x, y) {
  return Object.freeze({ kind: ATTACK_GROUND_ORDER, x, y });
}

export function issueAttackGround(game, x, y, { append = false } = {}) {
  if (game.gameOver) return { accepted: false, reason: 'The battle has ended.' };
  if (!isValidGroundPoint(x, y)) return { accepted: false, reason: 'Target point is outside the battlefield.' };
  const units = combatCapableUnits(game);
  if (!units.length) return { accepted: false, reason: 'Select at least one armed Ukrainian unit.' };
  for (const unit of units) {
    const order = createAttackGroundOrder(x, y);
    if (append) appendOrder(unit, order);
    else replaceOrders(unit, order);
  }
  game.mouse.attackMove = false;
  return { accepted: true, count: units.length };
}

export function updateAttackGroundUnit(game, unit, dt) {
  const order = unit.order;
  if (order?.kind !== ATTACK_GROUND_ORDER) return false;
  const stats = unit.team === 'ua' ? game.unitStats(unit.type) : null;
  if (!stats?.damage || !stats.range) {
    unit.order = null;
    return true;
  }
  const dx = order.x - unit.x;
  const dy = order.y - unit.y;
  const distance = Math.hypot(dx, dy);
  if (distance > stats.range) {
    game.move(unit, order.x, order.y, dt);
    return false;
  }
  unit.angle = Math.atan2(dy, dx);
  if (unit.cool > 0) return false;
  unit.cool = stats.rate;
  game.effects.push({ kind: 'blast', x: order.x, y: order.y, radius: 45, life: 0.45, max: 0.45 });
  unit.order = null;
  unit.target = null;
  return true;
}

export function createAttackGroundController(game) {
  let armed = false;
  const originalUpdateUnit = game.updateUnit.bind(game);
  game.updateUnit = (unit, dt) => {
    originalUpdateUnit(unit, dt);
    updateAttackGroundUnit(game, unit, dt);
  };
  game.armAttackGround = () => {
    if (!combatCapableUnits(game).length) return false;
    armed = true;
    game.pendingBuild = null;
    game.mouse.attackMove = false;
    return true;
  };
  game.cancelAttackGround = () => {
    const changed = armed;
    armed = false;
    return changed;
  };
  game.isAttackGroundArmed = () => armed;
  game.issueAttackGround = (x, y, options) => {
    const result = issueAttackGround(game, x, y, options);
    if (result.accepted) armed = false;
    return result;
  };
  return () => {
    game.updateUnit = originalUpdateUnit;
    delete game.armAttackGround;
    delete game.cancelAttackGround;
    delete game.isAttackGroundArmed;
    delete game.issueAttackGround;
  };
}

export function installAttackGroundInput({ game, canvas, ui, windowTarget = window, key = 'f' }) {
  const onKeyDown = (event) => {
    if (String(event.key).toLowerCase() === key) {
      event.preventDefault();
      if (!event.repeat && game.armAttackGround()) ui.toast('Force-fire: left-click a battlefield point.');
      else if (!event.repeat) ui.toast('Select at least one armed Ukrainian unit.');
    } else if (event.key === 'Escape' && game.cancelAttackGround()) {
      event.preventDefault();
      ui.toast('Force-fire targeting cancelled.');
    }
  };
  const onMouseDown = (event) => {
    if (event.button !== 0 || !game.isAttackGroundArmed()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = game.worldPos(event.clientX, event.clientY);
    const result = game.issueAttackGround(point.x, point.y, { append: event.shiftKey });
    ui.toast(result.accepted ? `Force-fire order issued to ${result.count} unit${result.count === 1 ? '' : 's'}.` : result.reason);
    ui.refresh();
  };
  windowTarget.addEventListener('keydown', onKeyDown, true);
  canvas.addEventListener('mousedown', onMouseDown, true);
  return () => {
    windowTarget.removeEventListener('keydown', onKeyDown, true);
    canvas.removeEventListener('mousedown', onMouseDown, true);
  };
}
