# Gameplay and Static-Art Polish Pass

## Purpose

This pass addresses the first usability and game-feel failures encountered during ordinary mission play. The north star is not asset imitation; it is the clarity, responsiveness, command density, readable silhouettes, and deliberate pacing associated with polished mid-1990s RTS games.

## Combat stances

Every combat-capable unit now starts with `autoFire: true`.

- An idle unit with auto-fire enabled acquires the nearest hostile entity inside its sight radius.
- Explicit attack orders always take precedence.
- Attack-move units acquire and pursue contacts while advancing.
- Ordinary move, gather, return, and construction orders are not interrupted by autonomous acquisition.
- Auto-fire can be toggled for a single unit or a multi-selection from the command card or with `T`.
- `X` clears current orders and targets; `Q` arms attack-move.

This keeps default behavior useful without causing engineers to abandon logistics work or ordinary move orders to become accidental attack-moves.

## Production and construction

Production buildings now declare their supported roster in `BUILDING_TYPES`.

- Command Post: engineers and mission-specific trainable heroes
- Infantry Assembly Area: infantry and CASEVAC
- Repair and Recovery Point: drone, IFV, tank, artillery, and upgrades

Production validates ownership, facility type, construction state, queue capacity, resources, command capacity, and duplicate heroes. The UI reports successful queueing and displays current progress plus the complete queue.

Engineers can construct all three player-buildable structures. Construction is now a two-step command:

1. choose a structure from the engineer command card;
2. place it on valid battlefield ground.

The placement preview reports valid and blocked sites. Structures avoid map edges, other structures, and resource sites. Capacity and production activate only after the engineer completes construction.

## Enemy-wave pacing

The previous global timing spawned the first attack after 12 seconds and repeated attacks every 12–17 seconds. Mission-specific wave plans replace that hard-coded loop.

| Mission | First assault | Interval | Active wave-unit cap | Planned waves |
| --- | ---: | ---: | ---: | ---: |
| Donbas | 70s | 46s | 7 | 7 |
| Zaporizhzhia | 58s | 42s | 9 | 7 |
| Kherson | 45s | 36s | 12 | 6 |

Wave composition escalates deliberately by mission. Spawning pauses temporarily when too many wave units remain alive, preventing reinforcement stacking from turning a recoverable battle into an irreversible stream. The top bar exposes the next assault timer and planned wave number.

## Endgame rules

Victory occurs when all three mission objectives are complete.

Defeat occurs when the player has no surviving Ukrainian units and no surviving Ukrainian structures. Losing only the headquarters no longer silently freezes the mission or produces an ambiguous state.

Both outcomes display an after-action report with mission time, assault progress, recovered materiel, and objective completion. The player can retry the mission or return to operation selection.

## Visual pass

The dedicated `environment-art-pass.js` layer now owns high-detail static structures, resource sites, engineer differentiation, construction scaffolding, and placement previews without coupling those visuals to simulation rules.

Building goals:

- unique roofline and footprint for every facility;
- strong faction accents without relying on palette alone;
- readable entrances, production bays, antennae, cranes, stores, and sandbags;
- construction scaffolding and progress feedback;
- silhouettes that survive low zoom and fog-edge conditions.

Resource-site goals:

- metal reads as a salvage operation with scrap stacks and lifting equipment;
- fuel reads as storage tanks, pump equipment, and hazard markings;
- intelligence reads as a relay site with mast, dish, generator, and cases;
- depletion remains visually legible.

Engineer goals:

- wider body and backpack silhouette than infantry;
- hard hat, high-visibility vest, tool shaft, and tool head;
- retained faction markings and palette language.

## Validation checklist

Run:

```bash
bash verify.sh
```

Then browser-test every mission:

1. leave infantry idle near an enemy and confirm autonomous engagement;
2. toggle auto-fire off and on for single and multiple selections;
3. queue units from every production facility and observe queue progress;
4. place and complete depot, barracks, and workshop construction;
5. confirm invalid placement feedback and cancellation;
6. observe first-wave delays and active-unit wave throttling;
7. trigger victory and total-force-elimination defeat;
8. inspect buildings, resource sites, engineers, and placement ghosts at low, standard, and close zoom;
9. inspect the same scenes in grayscale and across all mission terrain palettes.
