import { veterancyPresentation } from '../core/veterancy.js';

function indicatorForUnit(unit) {
  const rank = veterancyPresentation(unit.veterancy);
  const progress = rank.nextThreshold === null
    ? `${Math.floor(rank.xp)} XP · maximum rank`
    : `${Math.floor(rank.xp)}/${rank.nextThreshold} XP`;
  return `${rank.badge} ${rank.label} · ${progress}`;
}

function reflectVeterancyStats(game, unit, text) {
  const stats = game.unitStatsForEntity?.(unit);
  if (!stats) return text;
  return text
    .replace(/Firepower \d+(?:\.\d+)?/, `Firepower ${Math.round(stats.damage)}`)
    .replace(/Observation \d+(?:\.\d+)?/, `Observation ${Math.round(stats.sight)}`);
}

export function installVeterancyIndicator({ game, ui }) {
  if (!game || !ui || typeof ui.refresh !== 'function' || !ui.e?.stats) {
    throw new TypeError('Veterancy indicator requires game state and a UI stats element.');
  }
  const originalRefresh = ui.refresh.bind(ui);
  ui.refresh = () => {
    const result = originalRefresh();
    const units = game.selectedEntities().filter((entity) => entity.veterancy);
    if (units.length === 1) {
      ui.e.stats.textContent = reflectVeterancyStats(game, units[0], ui.e.stats.textContent);
      ui.e.stats.textContent = `${ui.e.stats.textContent} · ${indicatorForUnit(units[0])}`;
    } else if (units.length > 1) {
      const ranked = units.map((unit) => veterancyPresentation(unit.veterancy));
      const experienced = ranked.filter((rank) => rank.rank > 0).length;
      const highest = ranked.sort((left, right) => right.rank - left.rank)[0];
      ui.e.stats.textContent = `${ui.e.stats.textContent} · Veterancy ${experienced}/${units.length} experienced · Highest ${highest.label}`;
    }
    return result;
  };
  return () => {
    ui.refresh = originalRefresh;
  };
}
