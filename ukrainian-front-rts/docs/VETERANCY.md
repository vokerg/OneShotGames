# Veterancy progression

`src/core/veterancy.js` owns the versioned, deterministic progression contract. `src/systems/veterancy-system.js` adapts that contract to the current game delegates, and `src/ui/veterancy-indicator.js` adds read-only selection feedback.

## XP and ranks

Enemy units and structures award XP to the unit credited with the final attributed damage. Awards are deterministic and bounded from 10 to 240 XP unless an entity supplies an explicit `veterancyXpValue`. Friendly fire, unattributed damage, and duplicate cleanup passes award nothing.

The initial rank ladder is:

| Rank | Threshold | Damage | Reload time | Sight |
| --- | ---: | ---: | ---: | ---: |
| Recruit | 0 | 100% | 100% | 100% |
| Trained | 80 | 103% | 98% | 102% |
| Veteran | 220 | 107% | 95% | 104% |
| Elite | 480 | 112% | 90% | 107% |

The policy hard-limits damage to 115%, reload time to no less than 85%, and sight to 110%. The current ladder stays below those limits. Movement speed, maximum HP, collision size, costs, and ability cooldowns are deliberately unchanged.

## Runtime ownership

The controller initializes every produced or mission-spawned unit with schema-version-1 veterancy state. It wraps the existing unit update delegate so individual combat stats are applied without changing `Game` ownership or rewriting navigation, queued orders, production, or abilities.

Projectile impact records a source unit ID before damage. The ability adapter compares authoritative HP before and after an accepted ability and records the selected acting unit for any damaged entity. Cleanup processes dead entities in ascending entity-ID order, awards each death once, increments the existing kill counter, and exposes immutable `game.veterancyEvents` records.

Future damage systems must call `recordDamageSource(target, source)` at their authoritative damage boundary to participate in progression.

## UI

A selected unit shows its rank badge, rank label, current XP, and next threshold. Mixed selections show the number of experienced units and the highest rank in the group. The adapter decorates the existing selection summary and does not own commands or simulation state.

## Serialization and campaign hooks

Mission snapshots use `game.serializeVeterancy()` and `game.restoreVeterancy(snapshot)`, keyed by runtime unit ID. The snapshot is JSON-compatible and versioned independently from the future save-slot schema.

Campaign persistence uses `game.serializeCampaignVeterancy()` and `game.restoreCampaignVeterancy(snapshot)`, keyed only by a stable `unit.campaignId`. Units without a campaign identity are omitted. UFR-085 remains responsible for embedding these snapshots in browser saves, migration, corruption handling, and restoration orchestration.

## Browser verification

1. Start each mission and select a unit; confirm `I Recruit` and `0/80 XP` appear without shifting command buttons.
2. Destroy enemy infantry and vehicles with the selected unit; confirm XP and rank feedback update and kills increment once.
3. Confirm Trained/Veteran/Elite units show higher firepower, faster reload, and increased observation, while movement and HP remain unchanged.
4. Select a mixed group and confirm experienced-count and highest-rank feedback.
5. Exercise attack-move, force-fire, abilities, queued orders, production, and mission restart; confirm selection, orders, and fresh-mission rank reset still work.
