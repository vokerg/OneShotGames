import { TEAM, UNIT_TYPES } from '../config.js';
import {
  applyCampaignVeterancySnapshot,
  applyVeterancyModifiers,
  awardVeterancyXp,
  createCampaignVeterancySnapshot,
  createVeterancyState,
  defeatVeterancyValue,
  recordDamageSource,
  restoreVeterancyRoster,
  serializeVeterancyRoster,
  veterancyPresentation,
} from '../core/veterancy.js';

function allDamageableEntities(game) {
  return [...(game.units || []), ...(game.buildings || [])];
}

function initializeUnit(unit, stats = {}) {
  unit.entityKind = 'unit';
  unit.veterancy = createVeterancyState(unit.veterancy);
  unit.veterancyXpValue = defeatVeterancyValue({
    maxHp: unit.maxHp,
    pop: stats.pop,
    hero: stats.hero,
    entityKind: 'unit',
  });
  return unit;
}

function initializeBuilding(building) {
  building.entityKind = 'building';
  building.veterancyXpValue = defeatVeterancyValue({
    maxHp: building.maxHp,
    entityKind: 'building',
  });
  return building;
}

export function processVeterancyDeaths(game) {
  if (!game || !Array.isArray(game.units) || !Array.isArray(game.buildings)) {
    throw new TypeError('Veterancy death processing requires game unit and building arrays.');
  }
  const sources = new Map(game.units.map((unit) => [unit.id, unit]));
  const events = [];
  for (const target of allDamageableEntities(game).filter((entity) => entity.hp <= 0).sort((a, b) => a.id - b.id)) {
    if (target.veterancyAwarded) continue;
    target.veterancyAwarded = true;
    const source = sources.get(target.lastDamageSourceId);
    if (!source || source.team === target.team || !source.veterancy) continue;
    const xp = defeatVeterancyValue(target);
    const award = awardVeterancyXp(source, xp);
    source.kills = Math.max(0, Number(source.kills) || 0) + 1;
    const event = Object.freeze({
      sourceId: source.id,
      targetId: target.id,
      xp,
      rankChanged: award.rankChanged,
      rank: award.next.rank,
    });
    events.push(event);
  }
  if (events.length) {
    if (!Array.isArray(game.veterancyEvents)) game.veterancyEvents = [];
    game.veterancyEvents.push(...events);
  }
  return Object.freeze(events);
}

function withActiveUnit(state, unit, callback) {
  const previous = state.activeUnit;
  state.activeUnit = unit;
  try {
    return callback();
  } finally {
    state.activeUnit = previous;
  }
}

export function createVeterancyController(game) {
  if (!game || typeof game.addUnit !== 'function' || typeof game.removeDestroyedEntities !== 'function') {
    throw new TypeError('Veterancy integration requires a game-compatible object.');
  }

  const original = {
    start: game.start.bind(game),
    addUnit: game.addUnit.bind(game),
    addBuilding: game.addBuilding.bind(game),
    unitStats: game.unitStats.bind(game),
    updateUnit: game.updateUnit.bind(game),
    useAbility: game.useAbility.bind(game),
    removeDestroyedEntities: game.removeDestroyedEntities.bind(game),
  };
  const state = { activeUnit: null };

  game.start = (...args) => {
    game.veterancyEvents = [];
    return original.start(...args);
  };
  game.addUnit = (...args) => {
    const unit = original.addUnit(...args);
    return initializeUnit(unit, UNIT_TYPES[unit.type] || {});
  };
  game.addBuilding = (...args) => initializeBuilding(original.addBuilding(...args));
  game.unitStats = (type, unit = state.activeUnit) => {
    const base = unit?.team === TEAM.RU ? { ...UNIT_TYPES[type] } : original.unitStats(type);
    return unit ? applyVeterancyModifiers(base, unit.veterancy) : base;
  };
  game.updateUnit = (unit, dt) => withActiveUnit(state, unit, () => original.updateUnit(unit, dt));
  game.useAbility = (...args) => {
    const source = game.selectedUnits?.()[0] ?? null;
    const before = new Map(allDamageableEntities(game).map((entity) => [entity.id, entity.hp]));
    const accepted = original.useAbility(...args);
    if (accepted && source) {
      for (const target of allDamageableEntities(game)) {
        if (target.hp < (before.get(target.id) ?? target.hp)) recordDamageSource(target, source);
      }
    }
    return accepted;
  };
  game.removeDestroyedEntities = () => {
    processVeterancyDeaths(game);
    return original.removeDestroyedEntities();
  };

  game.unitStatsForEntity = (unit) => game.unitStats(unit.type, unit);
  game.veterancyPresentation = (unit) => veterancyPresentation(unit?.veterancy);
  game.serializeVeterancy = () => serializeVeterancyRoster(game.units);
  game.restoreVeterancy = (snapshot) => restoreVeterancyRoster(game.units, snapshot);
  game.serializeCampaignVeterancy = () => createCampaignVeterancySnapshot(game.units);
  game.restoreCampaignVeterancy = (snapshot) => applyCampaignVeterancySnapshot(game.units, snapshot);

  return () => {
    game.start = original.start;
    game.addUnit = original.addUnit;
    game.addBuilding = original.addBuilding;
    game.unitStats = original.unitStats;
    game.updateUnit = original.updateUnit;
    game.useAbility = original.useAbility;
    game.removeDestroyedEntities = original.removeDestroyedEntities;
    delete game.unitStatsForEntity;
    delete game.veterancyPresentation;
    delete game.serializeVeterancy;
    delete game.restoreVeterancy;
    delete game.serializeCampaignVeterancy;
    delete game.restoreCampaignVeterancy;
  };
}
