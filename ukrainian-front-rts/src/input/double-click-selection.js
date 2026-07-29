import { TEAM } from '../config.js';
import { selectAllOfTypeOnScreen } from './selection-subgroups.js';

export function installDoubleClickSelection({
  game,
  ui,
  canvas,
  windowTarget = window,
} = {}) {
  if (!game || typeof game.worldPos !== 'function' || typeof game.hit !== 'function') {
    throw new TypeError('Double-click selection requires a compatible game instance.');
  }
  if (!canvas?.addEventListener || !canvas?.removeEventListener) {
    throw new TypeError('Double-click selection requires a canvas event target.');
  }

  const onDoubleClick = (event) => {
    if (event.button !== 0 || game.gameOver) return;
    const world = game.worldPos(event.clientX, event.clientY);
    const source = game.hit(world.x, world.y);
    if (!source || source.team !== TEAM.UA || !game.units.includes(source)) return;

    const result = selectAllOfTypeOnScreen(game, source, {
      width: windowTarget.innerWidth,
      height: windowTarget.innerHeight,
    });
    game.mouse.down = false;
    game.mouse.drag = false;
    ui?.toast?.(`${result.count} matching unit${result.count === 1 ? '' : 's'} selected on screen.`);
    ui?.refresh?.();
  };

  canvas.addEventListener('dblclick', onDoubleClick);
  return () => canvas.removeEventListener('dblclick', onDoubleClick);
}
