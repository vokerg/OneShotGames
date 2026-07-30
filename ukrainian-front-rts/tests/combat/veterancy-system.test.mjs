import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VETERANCY_RANKS,
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
} from '../../src/core/veterancy.js';
import { createVeterancyController, processVeterancyDeaths } from '../../src/systems/veterancy-system.js';
import { installVeterancyIndicator } from '../../src/ui/veterancy-indicator.js';
import { updateProjectiles } from '../../src/systems/projectile-system.js';

function unit(id, team = 'ua', overrides = {}) {
  return {
    id,
    type: overrides.type ?? 'infantry',
    team,
    hp: overrides.hp ?? 100,
    maxHp: overrides.maxHp ?? 100,
    kills: overrides.kills ?? 0,
    veterancy: overrides.veterancy ?? createVeterancyState(),
    ...overrides,
  };
}

test('rank thresholds are exact and deterministic', () => {
  assert.equal(createVeterancyState({ xp: 79 }).rank, 0);
  assert.equal(createVeterancyState({ xp: 80 }).rank, 1);
  assert.equal(createVeterancyState({ xp: 220 }).rank, 2);
  assert.equal(createVeterancyState({ xp: 480 }).rank, 3);
});

test('awards accumulate XP and report multi-rank promotion', () => {
  const actor = unit(1);
  const award = awardVeterancyXp(actor, 230);
  assert.equal(actor.veterancy.xp, 230);
  assert.equal(actor.veterancy.rank, 2);
  assert.equal(award.rankChanged, true);
  assert.equal(award.ranksGained, 2);
});

test('rank bonuses affect combat stats and remain within policy bounds', () => {
  const stats = applyVeterancyModifiers(
    { damage: 100, rate: 10, sight: 500, speed: 90 },
    createVeterancyState({ xp: 9999 }),
  );
  assert.ok(Math.abs(stats.damage - 112) < 1e-9);
  assert.ok(Math.abs(stats.rate - 9) < 1e-9);
  assert.ok(Math.abs(stats.sight - 535) < 1e-9);
  assert.equal(stats.speed, 90);
});

test('defeat XP uses explicit values or bounded deterministic fallback', () => {
  assert.equal(defeatVeterancyValue({ veterancyXpValue: 77.6 }), 78);
  assert.equal(defeatVeterancyValue({ maxHp: 50 }), 10);
  assert.equal(defeatVeterancyValue({ maxHp: 5000, hero: true, entityKind: 'building' }), 240);
});

test('damage attribution awards enemy kill XP exactly once', () => {
  const source = unit(1, 'ua');
  const target = unit(2, 'ru', { hp: 0, veterancyXpValue: 90 });
  recordDamageSource(target, source);
  const game = { units: [source, target], buildings: [], veterancyEvents: [] };
  const first = processVeterancyDeaths(game);
  const second = processVeterancyDeaths(game);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
  assert.equal(source.veterancy.xp, 90);
  assert.equal(source.veterancy.rank, 1);
  assert.equal(source.kills, 1);
});

test('projectile impact records the authoritative damage source before lethal damage', () => {
  const source = unit(1, 'ua');
  const target = unit(2, 'ru', { x: 10, y: 10, hp: 10, maxHp: 100, veterancyXpValue: 40 });
  const game = {
    units: [source, target],
    buildings: [],
    projectiles: [{
      x: 10,
      y: 10,
      aimX: 10,
      aimY: 10,
      target,
      source,
      speed: 100,
      damage: 20,
      life: 1,
      hit: true,
    }],
    effects: [],
  };
  updateProjectiles(game, 0.1);
  assert.equal(target.lastDamageSourceId, source.id);
  assert.ok(target.hp <= 0);
  processVeterancyDeaths(game);
  assert.equal(source.veterancy.xp, 40);
});

test('friendly fire and missing sources do not award progression', () => {
  const source = unit(1, 'ua');
  const friendly = unit(2, 'ua', { hp: 0, lastDamageSourceId: 1 });
  const unknown = unit(3, 'ru', { hp: 0, lastDamageSourceId: 99 });
  const events = processVeterancyDeaths({ units: [source, friendly, unknown], buildings: [] });
  assert.equal(events.length, 0);
  assert.equal(source.veterancy.xp, 0);
  assert.equal(source.kills, 0);
});

test('multiple deaths resolve in stable target-id order', () => {
  const source = unit(1, 'ua');
  const high = unit(8, 'ru', { hp: 0, veterancyXpValue: 20, lastDamageSourceId: 1 });
  const low = unit(3, 'ru', { hp: 0, veterancyXpValue: 30, lastDamageSourceId: 1 });
  const events = processVeterancyDeaths({ units: [source, high, low], buildings: [] });
  assert.deepEqual(events.map((event) => event.targetId), [3, 8]);
  assert.equal(source.veterancy.xp, 50);
});

test('mission roster snapshots are versioned, sorted, and restorable', () => {
  const units = [unit(20, 'ua', { veterancy: createVeterancyState({ xp: 220 }) }), unit(3)];
  const snapshot = serializeVeterancyRoster(units);
  assert.equal(snapshot.version, 1);
  assert.deepEqual(snapshot.units.map((entry) => entry.key), ['20', '3']);
  const restored = [unit(3), unit(20)];
  const result = restoreVeterancyRoster(restored, snapshot);
  assert.equal(result.applied, 2);
  assert.equal(restored.find((entry) => entry.id === 20).veterancy.rank, 2);
});

test('campaign hooks persist by stable campaign identity across replacement units', () => {
  const original = [unit(1, 'ua', { campaignId: 'alpha', veterancy: createVeterancyState({ xp: 480 }) }), unit(2)];
  const snapshot = createCampaignVeterancySnapshot(original);
  assert.equal(snapshot.units.length, 1);
  const replacements = [unit(77, 'ua', { campaignId: 'alpha' })];
  const result = applyCampaignVeterancySnapshot(replacements, snapshot);
  assert.equal(result.applied, 1);
  assert.equal(replacements[0].veterancy.rank, 3);
});

test('presentation exposes bounded progress and maximum-rank state', () => {
  const veteran = veterancyPresentation(createVeterancyState({ xp: 350 }));
  assert.equal(veteran.label, VETERANCY_RANKS[2].label);
  assert.ok(veteran.progress > 0 && veteran.progress < 1);
  assert.equal(veteran.xpToNext, 130);
  const elite = veterancyPresentation(createVeterancyState({ xp: 900 }));
  assert.equal(elite.nextThreshold, null);
  assert.equal(elite.progress, 1);
});

test('runtime controller initializes units, applies active-unit bonuses, and exposes save hooks', () => {
  const game = {
    units: [],
    buildings: [],
    selected: [],
    start() { this.units = []; this.buildings = []; },
    addUnit(type, team) {
      const created = unit(this.units.length + 1, team, { type });
      this.units.push(created);
      return created;
    },
    addBuilding(type, team) {
      const created = { id: 100 + this.buildings.length, type, team, hp: 500, maxHp: 500 };
      this.buildings.push(created);
      return created;
    },
    unitStats() { return { damage: 100, rate: 10, sight: 500 }; },
    updateUnit(actor) { actor.observedStats = this.unitStats(actor.type); },
    useAbility() { return true; },
    removeDestroyedEntities() {
      this.units = this.units.filter((entry) => entry.hp > 0);
      this.buildings = this.buildings.filter((entry) => entry.hp > 0);
    },
    selectedUnits() { return this.selected; },
    selectedEntities() { return this.selected; },
  };
  const dispose = createVeterancyController(game);
  const actor = game.addUnit('infantry', 'ua');
  awardVeterancyXp(actor, 480);
  game.updateUnit(actor, 0.1);
  assert.ok(Math.abs(actor.observedStats.damage - 112) < 1e-9);
  assert.equal(game.serializeVeterancy().units.length, 1);
  assert.equal(game.veterancyPresentation(actor).label, 'Elite');
  dispose();
  assert.equal(game.serializeVeterancy, undefined);
});

test('UI adapter appends single and mixed-selection veterancy indicators', () => {
  const rookie = unit(1);
  const veteran = unit(2, 'ua', { veterancy: createVeterancyState({ xp: 220 }) });
  const game = {
    selection: [veteran],
    selectedEntities() { return this.selection; },
    unitStatsForEntity() { return { damage: 107, sight: 520 }; },
  };
  const ui = {
    e: { stats: { textContent: '' } },
    refresh() { this.e.stats.textContent = 'Combat strength 100/100 · Firepower 100 · Observation 500'; },
  };
  const dispose = installVeterancyIndicator({ game, ui });
  ui.refresh();
  assert.match(ui.e.stats.textContent, /Firepower 107/);
  assert.match(ui.e.stats.textContent, /Observation 520/);
  assert.match(ui.e.stats.textContent, /III Veteran · 220\/480 XP/);
  game.selection = [rookie, veteran];
  ui.refresh();
  assert.match(ui.e.stats.textContent, /Veterancy 1\/2 experienced · Highest Veteran/);
  dispose();
});

test('unsupported snapshot versions fail closed', () => {
  assert.throws(
    () => restoreVeterancyRoster([unit(1)], { version: 99, scope: 'mission', units: [] }),
    /Unsupported veterancy roster version/,
  );
});
