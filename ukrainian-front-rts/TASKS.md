# Fields of Resolve — implementation queue

This queue is the full implementation program for moving `ukrainian-front-rts` from its current prototype to a polished classic-RTS-quality release. Task IDs are permanent. Do not renumber or reuse them.

Task state is derived using `AGENTS.md` and `docs/FEATURE_CONVEYOR.md`; this file is not a shared status board.

Priority:

- **P0** — foundation or blocker for most later work;
- **P1** — required for the intended single-player release;
- **P2** — release polish, scale, or advanced production capability;
- **P3** — optional post-release expansion.

Parallel values:

- **YES** — may run concurrently once dependencies are DONE;
- **LIMITED** — may run concurrently only while respecting the named hotspot or ownership boundary;
- **NO** — integration gate; run after dependencies and avoid concurrent work in the same gate.

## Gate A — stable RTS foundation

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-001 | P0 | design | `docs/` | Freeze product pillars, quality bar, supported platforms, match length, campaign length, and explicit non-goals; every later design task can cite one approved document. | — | YES — documentation-only. |
| UFR-002 | P0 | tooling | `scripts/`, `verify.sh` | Add a task-queue validator that checks unique IDs, valid dependencies, monotonic IDs, required fields, and explicit parallel text. | — | YES — isolated tooling. |
| UFR-003 | P0 | architecture | `src/config.js` | Define versioned schemas for units, buildings, abilities, upgrades, missions, maps, factions, and AI profiles; document required/default fields. | UFR-001 | LIMITED — owns content schema; coordinate all `config.js` edits. |
| UFR-004 | P0 | architecture | `src/game.js`, `src/core/` | Introduce a seeded random service; all simulation randomness uses it and identical seeds reproduce entity placement, waves, and combat rolls. | UFR-003 | LIMITED — owns random calls in simulation hotspots. |
| UFR-005 | P0 | tooling | `tests/`, `scripts/` | Add dependency-free unit-test runner conventions and first tests for pure math, costs, prerequisites, and objective evaluation. | UFR-003 | YES — new test paths. |
| UFR-006 | P0 | tooling | `tests/sim/`, `src/app/` | Build a headless simulation harness that can start a scenario, issue commands, advance fixed ticks, and assert state without DOM or canvas. | UFR-004, UFR-005 | LIMITED — coordinate `Game` construction boundary. |
| UFR-007 | P0 | architecture | `src/game.js`, `src/systems/` | Replace implicit update coupling with documented fixed-step simulation phases; frame-rate changes no longer alter outcomes. | UFR-004, UFR-006 | NO — core integration gate. |
| UFR-008 | P0 | tooling | `scripts/verify-architecture.mjs` | Expand architecture verification for new layer boundaries, forbidden imports, direct DOM access, direct audio calls, and schema ownership. | UFR-003, UFR-007 | YES — tooling after contracts stabilize. |
| UFR-009 | P0 | tooling | `scripts/`, content files | Add content validation with actionable errors for missing references, invalid costs, circular prerequisites, impossible objectives, and duplicate hotkeys. | UFR-003 | YES — separate validator module. |
| UFR-010 | P0 | architecture | `src/core/events.js`, systems | Add a typed-enough domain event stream for shots, impacts, deaths, production, research, objectives, alerts, audio, telemetry, and replay recording. | UFR-007 | LIMITED — event contract; consumers may proceed after merge. |
| UFR-011 | P0 | tooling | `verify.sh`, CI config if allowed | Make one verification command run syntax, architecture, queue, content, and unit/simulation tests with non-zero failure behavior. | UFR-002, UFR-005, UFR-008, UFR-009 | NO — verification integration gate. |
| UFR-012 | P0 | documentation | `docs/ARCHITECTURE.md`, `docs/CHANGE_GUIDE.md` | Update ownership diagrams, fixed-step lifecycle, schemas, test layers, event flow, and extension recipes to match merged foundation. | UFR-003 through UFR-011 | NO — Gate A documentation closure. |
| UFR-013 | P0 | input | `src/input/battlefield-input.js` | Introduce named actions and a configurable key-binding map; remove gameplay logic tied directly to literal keys. | UFR-003 | LIMITED — owns input adapter. |
| UFR-014 | P1 | input | selection system | Add numbered control groups with assign, recall, add-to-group, double-tap camera focus, and deterministic membership cleanup. | UFR-013 | YES — focused control-group module. |
| UFR-015 | P1 | input | selection system, UI | Add unit-type subgroup cycling, select-all-of-type-on-screen, and stable mixed-selection primary entity rules. | UFR-013 | LIMITED — coordinate selection/UI API. |
| UFR-016 | P1 | input | camera/input | Add camera bookmarks, edge scroll, middle-drag pan, focus-selected, and settings toggles without breaking WASD or minimap navigation. | UFR-013 | YES — camera-focused files. |
| UFR-017 | P1 | input | command system | Add queued orders with Shift, waypoint visualization, order replacement rules, and deterministic queue execution. | UFR-007, UFR-013 | LIMITED — owns order representation in `game.js`. |
| UFR-018 | P0 | navigation | new `src/navigation/` | Define tile passability, movement layers, terrain costs, building footprints, bridge cells, and dynamic blockers from map data. | UFR-003, UFR-007 | LIMITED — navigation schema owner. |
| UFR-019 | P0 | navigation | `src/navigation/` | Implement deterministic A* pathfinding with bounded search, diagonal policy, terrain cost, and test fixtures for corridors and blocked goals. | UFR-018 | YES — isolated pathfinder. |
| UFR-020 | P0 | navigation | `src/navigation/`, `Game` delegate | Integrate path requests and waypoint following for ground units; orders route around buildings and impassable terrain. | UFR-019 | LIMITED — owns movement integration. |
| UFR-021 | P0 | navigation | unit movement | Add footprint-aware collision, soft separation, and deterministic overlap resolution for infantry and vehicles. | UFR-020 | LIMITED — movement hotspot. |
| UFR-022 | P1 | navigation | path service | Add path caching, invalidation when structures change, bounded repath frequency, and performance counters. | UFR-020, UFR-021 | YES — navigation service internals. |
| UFR-023 | P1 | navigation | movement/commands | Preserve formations through paths using group anchors, slot assignment, compression at choke points, and re-forming after obstacles. | UFR-017, UFR-021 | LIMITED — group movement owner. |
| UFR-024 | P1 | navigation | movement | Add stuck detection, local detours, unreachable-goal feedback, and safe order cancellation; no unit remains indefinitely oscillating. | UFR-020, UFR-021 | YES — focused recovery policy. |
| UFR-025 | P1 | navigation | map/movement | Add roads, mud, rubble, water, bridges, and shelterbelt movement modifiers with clear visual cursor feedback. | UFR-018, UFR-020 | LIMITED — coordinate map schema and renderer. |
| UFR-026 | P1 | navigation | transport/movement | Support embark, transport capacity, disembark placement, blocked exit handling, and destruction casualties policy. | UFR-021, UFR-003 | LIMITED — new transport subsystem; coordinate roster. |
| UFR-027 | P1 | input | commands/navigation | Add patrol, guard, follow, hold-position, and return-for-repair commands with command-card and hotkey coverage. | UFR-017, UFR-020 | LIMITED — command representation hotspot. |
| UFR-028 | P1 | input | targeting | Add explicit attack-ground/force-fire command and cursor mode with range/passability validation. | UFR-013, UFR-017 | YES — focused targeting command. |
| UFR-029 | P2 | navigation | scenario tests | Create navigation torture maps covering bridges, base gates, dense groups, transports, destruction, and dynamic construction. | UFR-020 through UFR-028 | YES — test content only. |
| UFR-030 | P1 | navigation | integrated runtime | Complete Gate A movement playtest and performance budget: 150 mixed units navigate authored chokepoints without deadlock or frame-budget breach. | UFR-018 through UFR-029 | NO — navigation integration gate. |

## Gate B1 — complete combat model

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-031 | P0 | combat | content schema, combat system | Define damage, armor, target-domain, penetration, splash, and resistance classes with a documented counter matrix. | UFR-003, UFR-007 | LIMITED — combat schema owner. |
| UFR-032 | P0 | combat | projectile system | Add accuracy, dispersion, travel profile, impact type, misses, and deterministic hit resolution per weapon family. | UFR-004, UFR-031 | LIMITED — projectile hotspot. |
| UFR-033 | P0 | combat | sight system | Implement line-of-sight occlusion by terrain, buildings, smoke, and elevation; fog uses the same authoritative visibility result. | UFR-018, UFR-031 | LIMITED — visibility owner. |
| UFR-034 | P1 | combat | map/combat | Add cover and concealment values for terrain and fortifications, with accuracy/damage effects and visible state feedback. | UFR-033 | YES — focused modifier system. |
| UFR-035 | P1 | combat | status system | Add suppression and morale accumulation, thresholds, recovery, pinned behavior, and command aura interaction. | UFR-031, UFR-010 | LIMITED — new status subsystem. |
| UFR-036 | P1 | combat | targeting AI | Add configurable target priorities, threat scoring, retaliation, leash distance, and no-chase stances. | UFR-031, UFR-033 | YES — focused target policy. |
| UFR-037 | P1 | combat | artillery system | Add minimum range, setup/pack state, spotting requirement, scatter, salvos, counter-battery signature, and ammunition cadence. | UFR-032, UFR-033 | LIMITED — artillery owner. |
| UFR-038 | P1 | combat | drone/EW system | Add drone launch/recovery, loiter duration, link range, jamming, interception, and strike counterplay. | UFR-031, UFR-033 | LIMITED — drone mechanics owner. |
| UFR-039 | P1 | combat | air-defense system | Add detection, engagement envelopes, reload, missile travel, overkill prevention, and air-target priority. | UFR-031, UFR-038 | YES — focused anti-air system. |
| UFR-040 | P1 | combat | effects/status | Make smoke affect sight and accuracy consistently; support deployable smoke, duration, stacking, drift policy, and AI use. | UFR-032, UFR-033 | LIMITED — smoke state shared with renderer. |
| UFR-041 | P1 | combat | ability system/input | Add point, unit, area, direction, self, toggle, and channel targeting modes with telegraphs, cancel, range checks, and cooldown validation. | UFR-013, UFR-031 | LIMITED — ability contract owner. |
| UFR-042 | P1 | combat | area damage policy | Define splash falloff, friendly fire, building damage, minimum damage, and effect ownership; test edge cases deterministically. | UFR-031, UFR-032 | YES — focused damage policy. |
| UFR-043 | P1 | combat | repair system | Add repair orders, repair resource cost, multiple repairers, field-repair limits, repair facility behavior, and AI support. | UFR-017, UFR-031 | LIMITED — economy/combat boundary. |
| UFR-044 | P1 | combat | destruction system | Add disabled/damaged thresholds, burning state, crew bailout policy, wreck entities, salvage value, and obstruction cleanup. | UFR-031, UFR-043 | LIMITED — entity lifecycle hotspot. |
| UFR-045 | P1 | combat | progression | Add veterancy XP, rank thresholds, bounded bonuses, UI indicators, serialization, and campaign persistence hooks. | UFR-010, UFR-031 | YES — new progression module. |
| UFR-046 | P1 | combat | stance system | Add return-fire, hold-fire, fire-at-will, aggressive, defensive, and hold-position interactions with explicit acquisition rules. | UFR-036, UFR-027 | LIMITED — order/target policy hotspot. |
| UFR-047 | P1 | combat | infantry mechanics | Add garrison, dismount, trench/foxhole occupancy, entry/exit rules, building clearing, and destruction evacuation. | UFR-026, UFR-034 | LIMITED — navigation/combat integration. |
| UFR-048 | P1 | combat | engineer mechanics | Add mines, mine detection, obstacle construction, breaching, demolition charges, and clearance feedback. | UFR-034, UFR-041 | LIMITED — engineer ability family. |
| UFR-049 | P1 | ui/combat | HUD/effects | Add combat readability layer: range rings, target lines, incoming alerts, suppression/morale, armor feedback, miss/deflect cues, and damage numbers toggle. | UFR-031 through UFR-048 | LIMITED — coordinate `ui.js`/renderer ownership. |
| UFR-050 | P1 | combat | scenario tests | Complete combat integration scenarios for every counter class, cover type, status, ability mode, and destruction path; no unresolved P0 combat defect. | UFR-031 through UFR-049 | NO — combat integration gate. |

## Gate B2 — economy, construction, production, and technology

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-051 | P0 | economy | worker/order system | Add explicit gather commands, resource-type assignment, nearest valid drop-off, depletion retargeting, and player-controlled reassignment. | UFR-017, UFR-020 | LIMITED — worker order hotspot. |
| UFR-052 | P1 | economy | UI/input | Add idle-worker button/hotkey, worker task counts, carried-resource display, and selection by task/resource type. | UFR-051 | YES — UI-focused after worker API. |
| UFR-053 | P1 | economy | building schema | Add resource drop-off capabilities to eligible structures and deterministic drop-off selection by travel cost. | UFR-003, UFR-051 | LIMITED — content schema/economy boundary. |
| UFR-054 | P1 | economy | resource system | Define extraction rates, carry capacities, depletion, salvage bursts, optional regeneration, and mission overrides in data. | UFR-003, UFR-051 | YES — focused resource policy. |
| UFR-055 | P0 | economy | construction placement | Add tile/footprint placement, rotation where supported, terrain flattening policy, path-block preview, and reason-specific invalid feedback. | UFR-018, UFR-020 | LIMITED — construction/navigation hotspot. |
| UFR-056 | P1 | economy | construction system | Add multiple builders, diminishing returns, pause/resume, builder death handling, cancellation, and proportional refund. | UFR-055 | LIMITED — construction owner. |
| UFR-057 | P1 | economy | building lifecycle | Add repairable construction stages, capture eligibility, sell/scuttle action, rubble/wreck transition, and capacity recalculation. | UFR-043, UFR-044, UFR-056 | LIMITED — building lifecycle hotspot. |
| UFR-058 | P0 | economy | production queues | Add queue cancel, reorder, repeat, pause, full/partial refunds, reserved capacity rules, and deterministic completion. | UFR-007, UFR-003 | LIMITED — production owner in `game.js`. |
| UFR-059 | P1 | economy | production exits | Add rally points, waypoint rally queues, blocked-exit resolution, spawn-side selection, and newly produced unit acknowledgement. | UFR-020, UFR-058 | LIMITED — navigation/production integration. |
| UFR-060 | P0 | economy | tech schema | Add building prerequisites, mutually exclusive choices, faction restrictions, mission locks, and validation of tech graph reachability. | UFR-003, UFR-009 | LIMITED — tech schema owner. |
| UFR-061 | P1 | economy | research system | Add timed research queues, cancellation/refund, production contention policy, progress UI state, and completion events. | UFR-058, UFR-060 | LIMITED — queue/research boundary. |
| UFR-062 | P1 | economy | upgrade application | Replace ad hoc stat mutation with modifiers that handle additive/multiplicative order, existing/new units, abilities, visuals, and saves. | UFR-031, UFR-060 | LIMITED — stats contract owner. |
| UFR-063 | P1 | economy | command capacity | Define capacity sources, reserved versus fielded cost, over-cap behavior after structure loss, warnings, and AI response. | UFR-058, UFR-060 | YES — focused capacity policy. |
| UFR-064 | P1 | economy | defenses | Add buildable trenches, sandbags, checkpoints, anti-vehicle obstacles, mines, observation posts, and at least one active defense. | UFR-034, UFR-048, UFR-055 | LIMITED — content plus placement. |
| UFR-065 | P1 | economy | neutral structures | Add capturable civilian/industrial/logistics sites, capture progress, contesting, ownership effects, and mission scripting hooks. | UFR-057, UFR-010 | YES — focused capture system. |
| UFR-066 | P1 | economy | balance data | Establish opening economy, expansion timing, unit affordability, research opportunity cost, depletion curves, and comeback constraints. | UFR-051 through UFR-065 | LIMITED — balance data; avoid concurrent `config.js` number edits. |
| UFR-067 | P1 | ui/economy | HUD | Add production/research overview, queue manipulation, rally indicators, prerequisite explanations, resource income rates, and capacity forecasting. | UFR-052, UFR-058 through UFR-063 | LIMITED — UI hotspot. |
| UFR-068 | P1 | economy | scenario tests | Complete economy integration scenarios from first worker order through expansion, tech, army production, base loss, repair, and recovery. | UFR-051 through UFR-067 | NO — economy integration gate. |

## Gate B3 — factions, roster, AI, and skirmish

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-069 | P1 | faction | `docs/`, faction data | Write faction doctrine bible covering strategic identity, economy rhythm, reconnaissance, fires, mobility, durability, command, and counterplay without simple palette mirroring. | UFR-001, UFR-031, UFR-060 | YES — design-first. |
| UFR-070 | P1 | faction | tech/roster schemas | Define complete faction tech trees, production structures, roster slots, prerequisites, unique mechanics, and counter matrix. | UFR-069 | LIMITED — schema and balance ownership. |
| UFR-071 | P1 | faction | UA infantry data/systems | Complete Ukrainian infantry branch: engineers, line infantry, anti-armor, reconnaissance, medical, air-defense, and command support with distinct roles. | UFR-070 | LIMITED — UA infantry files/data only. |
| UFR-072 | P1 | faction | UA vehicle data/systems | Complete Ukrainian mobility/armor branch: transports, IFVs, tanks, recovery, engineering, and protected mobility with explicit counters. | UFR-070, UFR-026, UFR-043 | LIMITED — UA vehicle family. |
| UFR-073 | P1 | faction | UA drone/EW data | Complete Ukrainian UAS/EW branch: reconnaissance, FPV strike, relay, jamming, counter-UAS, and targeting support. | UFR-070, UFR-038, UFR-039 | LIMITED — UA drone family. |
| UFR-074 | P1 | faction | UA fires data | Complete Ukrainian mortar/artillery/rocket/air-defense branch with spotting, ammunition, setup, and counter-battery distinctions. | UFR-070, UFR-037, UFR-039 | LIMITED — UA fires family. |
| UFR-075 | P1 | faction | RU infantry data/systems | Complete Russian infantry branch with distinct manpower, assault, reconnaissance, engineering, medical, and anti-armor doctrine. | UFR-070 | LIMITED — RU infantry family. |
| UFR-076 | P1 | faction | RU vehicle data/systems | Complete Russian mobility/armor branch with distinct cost, protection, firepower, repair, and massing tradeoffs. | UFR-070, UFR-026, UFR-043 | LIMITED — RU vehicle family. |
| UFR-077 | P1 | faction | RU drone/fires data | Complete Russian UAS/EW/fires/air-defense branch with distinct reconnaissance-strike and artillery doctrine. | UFR-070, UFR-037 through UFR-039 | LIMITED — RU fires family. |
| UFR-078 | P1 | faction | shared support systems | Add logistics, resupply, transport, command, recovery, bridging, and off-map support units/mechanics shared or asymmetrically implemented. | UFR-070, UFR-026, UFR-062 | LIMITED — support subsystem owner. |
| UFR-079 | P0 | ai | new `src/ai/` | Define AI blackboard, goals, budgets, scouting knowledge, doctrine profile, deterministic decision cadence, and debug inspection. | UFR-007, UFR-010, UFR-070 | LIMITED — AI architecture owner. |
| UFR-080 | P1 | ai | economy AI | Implement worker allocation, expansion, construction, repair, capacity, production, and research planning that can recover from losses. | UFR-068, UFR-079 | YES — economy planner module. |
| UFR-081 | P1 | ai | tactical AI | Implement scouting, threat response, force assembly, attack routes, target selection, retreat, reinforcement, flanking, and defensive posture. | UFR-030, UFR-050, UFR-079 | LIMITED — tactical planner; consumes navigation/combat APIs. |
| UFR-082 | P1 | ai/balance | AI profiles | Add difficulty profiles by information, reaction delay, planning quality, risk tolerance, and economy efficiency—never hidden stat cheats by default. | UFR-080, UFR-081 | YES — profile/data task. |
| UFR-083 | P1 | campaign/ai | skirmish framework | Add skirmish setup, authored map selection, faction/AI/difficulty settings, start positions, victory conditions, result screen, and at least three balanced maps. | UFR-070 through UFR-082 | NO — Gate B skirmish integration. |

## Gate C — campaign-complete alpha

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-084 | P0 | campaign | new campaign state module | Add campaign profile, operation unlocks, difficulty, persistent choices, mission results, upgrades, medals, and versioned serialization. | UFR-003, UFR-010 | LIMITED — campaign schema owner. |
| UFR-085 | P0 | campaign | save service | Add save/load/continue, slots, autosave, schema version, corruption handling, and deterministic restoration of campaign and mission state. | UFR-004, UFR-084 | LIMITED — serialization owner. |
| UFR-086 | P0 | campaign | mission scripting | Build a data-driven trigger/action system for timers, regions, entities, resources, objectives, dialogue, reinforcements, camera, weather, and victory/defeat. | UFR-003, UFR-010, UFR-084 | LIMITED — scripting contract owner. |
| UFR-087 | P1 | campaign | objective system | Add objective library: build, gather, capture, escort, defend, survive, destroy, disable, rescue, recon, extract, optional, hidden, timed, and fail-state variants. | UFR-086 | YES — objective modules by type. |
| UFR-088 | P1 | campaign | map format/loader | Create authored map format for terrain, heights, passability, roads, water, bridges, props, resources, starts, regions, triggers, and metadata. | UFR-018, UFR-086 | LIMITED — map schema owner. |
| UFR-089 | P1 | campaign | briefing/debrief UI | Add mission briefing, map preview, forces/intel, objectives, difficulty notes, loading transition, debrief, medals, losses, timeline, and next-operation flow. | UFR-084, UFR-086 | LIMITED — campaign UI owner. |
| UFR-090 | P1 | campaign | checkpoints | Add mission checkpoints, restart-from-checkpoint, trigger-safe restore, opt-out per mission, and clear save compatibility rules. | UFR-085, UFR-086 | LIMITED — save/scripting integration. |
| UFR-091 | P1 | campaign | progression | Add persistent modernization choices, unlock presentation, refund/respec policy, and campaign balance constraints. | UFR-062, UFR-084 | YES — progression module/data. |
| UFR-092 | P1 | campaign | narrative presentation | Add dialogue/subtitle queue, portraits, speaker metadata, interruption policy, camera cues, skip/log, and fictional-content notes. | UFR-086 | LIMITED — UI/event integration. |
| UFR-093 | P1 | campaign | tutorial | Build interactive tutorial/prologue covering selection, movement, gathering, construction, production, combat, abilities, minimap, saves, and accessibility prompts. | UFR-013 through UFR-017, UFR-068, UFR-086 | LIMITED — one mission/content branch. |
| UFR-094 | P1 | campaign | mission 1 map/scripts | Rebuild Donbas operation as a unique authored map with crossing defense, economy onboarding, optional rescue, escalation, checkpoints, and authored AI. | UFR-083, UFR-086 through UFR-090 | YES — mission branch; max three concurrent. |
| UFR-095 | P1 | campaign | mission 2 map/scripts | Rebuild Zaporizhzhia operation around reconnaissance-strike, artillery suppression, EW counterplay, optional target intelligence, and multiple approaches. | UFR-083, UFR-086 through UFR-090 | YES — mission branch; max three concurrent. |
| UFR-096 | P1 | campaign | mission 3 map/scripts | Rebuild Lower Dnipro operation around bridgehead sustainment, river logistics, night visibility, wave choices, counterattack, and command decisions. | UFR-083, UFR-086 through UFR-090 | YES — mission branch; max three concurrent. |
| UFR-097 | P1 | campaign | mission 4 | Add an authored urban-defense/evacuation operation with civilians abstracted safely, garrisons, routes, optional objectives, and limited collateral rules. | UFR-087 through UFR-092 | YES — mission branch; max three concurrent. |
| UFR-098 | P1 | campaign | mission 5 | Add an authored breach operation using mines, obstacles, engineers, reconnaissance, deception, and timed exploitation. | UFR-087 through UFR-092 | YES — mission branch; max three concurrent. |
| UFR-099 | P1 | campaign | mission 6 | Add an authored deep-strike/logistics operation involving depots, air defense, drones, artillery, extraction, and branching target choices. | UFR-087 through UFR-092 | YES — mission branch; max three concurrent. |
| UFR-100 | P1 | campaign | mission 7 | Add an authored defensive withdrawal operation with delaying positions, salvage decisions, rear guards, checkpoints, and force preservation scoring. | UFR-087 through UFR-092 | YES — mission branch; max three concurrent. |
| UFR-101 | P1 | campaign | mission 8 | Add an authored combined-arms offensive with multiple sectors, allied AI, reserves, counterattacks, and persistent-force consequences. | UFR-087 through UFR-092 | YES — mission branch; max three concurrent. |
| UFR-102 | P1 | campaign | finale | Add campaign finale with multi-stage objectives, prior-choice callbacks, full roster use, adaptive AI, final debrief, and credits transition. | UFR-094 through UFR-101 | NO — finale integration. |
| UFR-103 | P1 | campaign/balance | campaign difficulty | Tune all campaign difficulty profiles, checkpoints, starting resources, reinforcement pacing, objective timers, and recovery windows using repeatable playtest scripts. | UFR-093 through UFR-102 | LIMITED — owns campaign balance data. |
| UFR-104 | P1 | content | all campaign copy/data | Review fictional framing, names, public-figure treatment, claims, terminology, content notes, and sensitive scenarios; remove documentary-sounding unsupported assertions. | UFR-092 through UFR-102 | YES — content review can parallel final balance. |
| UFR-105 | P1 | campaign | complete alpha | Run full campaign start-to-finish on all difficulties, verify saves/checkpoints/progression, close P0/P1 blockers, and publish alpha test report. | UFR-084 through UFR-104 | NO — Gate C integration gate. |

## Gate D1 — production visual pipeline

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-106 | P1 | art | `docs/ART_PIPELINE.md` | Freeze art bible: logical resolution, camera, palette families, value hierarchy, outlines, faction accents, animation counts, terrain scale, UI density, and source-file rules. | UFR-001, UFR-070 | YES — documentation/art direction. |
| UFR-107 | P0 | art/tooling | new atlas loader/packer | Add versioned sprite-atlas schema, build script, nearest-neighbor loading, anchors, masks, animation ranges, fallback, and validation. | UFR-003, UFR-106 | LIMITED — atlas runtime owner. |
| UFR-108 | P1 | art/tooling | `art-src/`, scripts | Establish source asset directory, export naming, palette checks, transparent-padding checks, contact sheets, manifests, and reproducible packing. | UFR-107 | YES — pipeline files. |
| UFR-109 | P1 | art | unit animation template | Produce and integrate one gold-standard unit with eight directions and idle/move/attack/hit/damaged/death/wreck states; document timing and anchors. | UFR-107, UFR-108 | LIMITED — template unit and atlas contract. |
| UFR-110 | P1 | art | UA infantry atlas | Produce complete Ukrainian infantry/engineer/medical/anti-armor/recon/air-defense battlefield sprites, portraits, icons, and state coverage. | UFR-071, UFR-109 | LIMITED — UA infantry asset family. |
| UFR-111 | P1 | art | RU infantry atlas | Produce complete Russian infantry/engineer/medical/anti-armor/recon/air-defense battlefield sprites, portraits, icons, and state coverage. | UFR-075, UFR-109 | LIMITED — RU infantry asset family. |
| UFR-112 | P1 | art | UA vehicle atlas | Produce Ukrainian transport/IFV/tank/recovery/engineering vehicle directional, attack, damage, death, wreck, portrait, and icon sets. | UFR-072, UFR-109 | LIMITED — UA vehicle asset family. |
| UFR-113 | P1 | art | RU vehicle atlas | Produce Russian transport/IFV/tank/recovery/engineering vehicle directional, attack, damage, death, wreck, portrait, and icon sets. | UFR-076, UFR-109 | LIMITED — RU vehicle asset family. |
| UFR-114 | P1 | art | drone/fires atlas | Produce both factions’ drones, artillery, rockets, air defense, logistics, command, bridging, and support visual sets. | UFR-073, UFR-074, UFR-077, UFR-078, UFR-109 | LIMITED — split by non-overlapping families in separate PRs if needed. |
| UFR-115 | P1 | art | buildings atlas | Produce all faction buildings with construction stages, active production, damage stages, destruction/rubble, entrances, faction variants, and icons. | UFR-070, UFR-107 | LIMITED — building asset family. |
| UFR-116 | P1 | art | terrain renderer/data | Build authored terrain tile sets with autotiling for ground, roads, mud, water, banks, cliffs, bridges, settlement surfaces, fields, and biome palettes. | UFR-088, UFR-106, UFR-107 | LIMITED — terrain schema/renderer owner. |
| UFR-117 | P1 | art | props/destruction | Add shelterbelts, trees, walls, fences, houses, industrial props, craters, wreckage, destructible variants, seasonal details, and visibility-safe layering. | UFR-116 | YES — prop atlas separate from core terrain. |
| UFR-118 | P1 | art | effects renderer | Produce complete muzzle flash, tracer, shell, missile, drone, impact, explosion, smoke, fire, dust, repair, heal, capture, build, and weather effects. | UFR-032 through UFR-048, UFR-107 | LIMITED — effects atlas/renderer owner. |
| UFR-119 | P1 | art | portraits/icons | Produce coherent portraits, unit/building icons, ability icons, upgrade icons, objective icons, cursors, pings, and medals with source manifests. | UFR-070, UFR-091, UFR-106 | YES — UI asset family. |
| UFR-120 | P1 | art/ui | UI skin | Replace prototype styling with original production frames, panels, tabs, buttons, states, tooltips, scrollbars, overlays, and scalable nine-slice assets. | UFR-106, UFR-119 | LIMITED — `styles.css`/UI asset hotspot. |
| UFR-121 | P1 | art | campaign art | Add original operation illustrations, map overlays, briefing panels, debrief medals, loading art, ending panels, and credits visuals. | UFR-089, UFR-092, UFR-106 | YES — campaign art family. |
| UFR-122 | P1 | tooling/art | visual regression | Add deterministic screenshot scenes for every unit, building, terrain biome, effect family, UI screen, zoom, faction, grayscale, and color-vision mode. | UFR-107 through UFR-121 | YES — tooling and fixtures. |
| UFR-123 | P1 | art/performance | renderer | Meet visual performance and memory budgets on target browsers with atlas batching/culling, no smoothing artifacts, and no procedural fallback in release scenes. | UFR-107 through UFR-122 | NO — visual integration gate. |

## Gate D2 — audio and music

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-124 | P1 | audio | new audio service | Add centralized Web Audio mixer with master/music/SFX/voice/ambience buses, unlock handling, pooling, pause, mute, and safe failure. | UFR-010 | LIMITED — audio architecture owner. |
| UFR-125 | P1 | audio | event mapping | Define audio event taxonomy, priorities, cooldowns, concurrency limits, distance attenuation, faction variation, and missing-asset fallback. | UFR-010, UFR-124 | LIMITED — audio event contract. |
| UFR-126 | P1 | audio | combat SFX | Produce/integrate original or properly licensed weapon, impact, explosion, vehicle, drone, artillery, air-defense, destruction, repair, and construction sounds. | UFR-125, UFR-031 through UFR-048 | LIMITED — combat SFX family. |
| UFR-127 | P1 | audio | UI SFX | Produce/integrate selection, acknowledgement, command, queue, complete, error, alert, objective, victory, defeat, menu, save, and load sounds. | UFR-125, UFR-133 | YES — UI SFX family. |
| UFR-128 | P1 | audio | ambience | Add biome ambience, distant battle beds, wind, settlement/industrial layers, weather, day/night variation, and intensity-safe loops. | UFR-125, UFR-116 | YES — ambience family. |
| UFR-129 | P1 | audio | music | Add original/licensed adaptive score with menu, briefing, calm, tension, battle, crisis, victory, defeat, transition rules, and seamless looping. | UFR-124, UFR-125, UFR-089 | LIMITED — music system/assets. |
| UFR-130 | P1 | audio | voice | Add unit acknowledgements, alerts, campaign dialogue voice hooks, language variants, repetition control, subtitles, and opt-out; synthetic or recorded sources require provenance. | UFR-092, UFR-125 | LIMITED — voice pipeline. |
| UFR-131 | P1 | audio/ui | settings/accessibility | Add per-bus sliders, mute, background-tab behavior, dynamic-range mode, subtitle options, speaker labels, and hearing-accessible visual equivalents. | UFR-124 through UFR-130 | LIMITED — settings UI integration. |
| UFR-132 | P1 | audio | QA/provenance | Complete loudness/mix pass, clipping/concurrency tests, autoplay tests, source/license manifest, missing-file validation, and full campaign audio QA. | UFR-124 through UFR-131 | NO — audio integration gate. |

## Gate D3 — interface, accessibility, and localization

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-133 | P0 | ui | UI architecture | Define screen stack, HUD regions, modal rules, focus handling, refresh strategy, component ownership, and semantic state APIs. | UFR-010, UFR-013 | LIMITED — UI contract owner. |
| UFR-134 | P1 | ui | selection panel | Add subgroup tabs, unit grid, health/status overlays, primary selection, transport/garrison contents, veterancy, and direct unit selection from group. | UFR-015, UFR-045, UFR-133 | LIMITED — selection UI owner. |
| UFR-135 | P1 | ui | command card | Add consistent grid, hotkey labels, disabled reasons, targeting state, stance state, pages, build/production/ability grouping, and keyboard navigation. | UFR-013, UFR-041, UFR-133 | LIMITED — command-card hotspot. |
| UFR-136 | P1 | ui | minimap/alerts | Add terrain/fog fidelity, unit filters, attack/objective/production pings, camera viewport, alert queue, ping click, and ally/neutral markers. | UFR-033, UFR-086, UFR-133 | LIMITED — minimap renderer/UI. |
| UFR-137 | P1 | ui | economy/production panels | Add global queues, income rates, worker counts, prerequisites, research tree access, rally controls, cancellation/reorder, and completion navigation. | UFR-067, UFR-133 | LIMITED — economy UI owner. |
| UFR-138 | P1 | ui | tech tree | Add faction tech tree screen with dependencies, unlocks, costs, research time, current choices, campaign locks, and comparison tooltips. | UFR-060 through UFR-062, UFR-070, UFR-133 | YES — dedicated screen. |
| UFR-139 | P1 | ui | menus/settings | Add pause, resume, restart, save, load, settings, controls, accessibility, quit-to-operations, confirmation, and safe modal input capture. | UFR-085, UFR-131, UFR-133 | LIMITED — menu stack owner. |
| UFR-140 | P1 | ui | onboarding | Add contextual tutorial prompts, searchable help/encyclopedia, first-time hints, dismiss/reset, glossary, and control reference. | UFR-093, UFR-133 | YES — help content/system. |
| UFR-141 | P1 | ui/accessibility | UI/input/render | Add UI scale, text scale, color-vision presets, contrast mode, reduced motion, screen-flash reduction, cursor size, pause-on-focus-loss, and full key rebinding. | UFR-013, UFR-120, UFR-131, UFR-133 | LIMITED — settings and visual hotspots. |
| UFR-142 | P1 | ui | viewport/runtime | Support common desktop resolutions, fullscreen, browser zoom, high-DPI canvas, safe-area layout, minimum viewport messaging, and resize without state loss. | UFR-120, UFR-133 | LIMITED — `index.html`/styles/runtime. |
| UFR-143 | P1 | localization | content/UI | Externalize player-facing strings, pluralization, formatting, font coverage, layout expansion, fallback, and validation; ship English and Ukrainian. | UFR-003, UFR-133 | LIMITED — string/content schema owner. |
| UFR-144 | P1 | ui | notifications/log | Add non-spammy event feed, objective updates, under-attack alerts, production/research complete, saved-game notices, and retrievable message history. | UFR-010, UFR-133 | YES — notification component. |
| UFR-145 | P1 | ui | endgame/analytics | Add detailed victory/defeat report, losses, kills, economy, tech, objective timing, medals, score, replay/save actions, and campaign consequences. | UFR-084, UFR-089, UFR-133 | LIMITED — endgame UI/campaign data. |

## Gate E — quality, balance, packaging, and release

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-146 | P0 | tooling | tests | Build test pyramid covering pure logic, systems, headless scenarios, save round trips, content validation, and browser smoke flows. | UFR-011, UFR-030, UFR-050, UFR-068 | LIMITED — test owners may split by subsystem. |
| UFR-147 | P1 | tooling | replay system | Record seed, commands, choices, and version; replay deterministically, detect divergence, scrub debug timeline, and attach replay to defect reports. | UFR-004, UFR-007, UFR-010, UFR-146 | LIMITED — replay/serialization owner. |
| UFR-148 | P1 | balance | simulator/telemetry | Add batch combat and economy simulations, matchup reports, win/loss metrics, mission timing capture, and exportable balance snapshots without personal data. | UFR-006, UFR-050, UFR-068 | YES — tooling/data pipeline. |
| UFR-149 | P1 | balance | all balance data | Establish versioned balance baseline for counters, costs, build times, research, income, AI difficulty, maps, and campaign; publish rationale and test evidence. | UFR-066, UFR-082, UFR-103, UFR-148 | LIMITED — exclusive balance-number sweep. |
| UFR-150 | P1 | tooling | profiler/debug UI | Add FPS/frame-time, simulation time, render time, entity counts, path queue, AI cadence, audio voices, memory proxies, seed, and command debug overlay. | UFR-022, UFR-079, UFR-124 | YES — debug-only component. |
| UFR-151 | P1 | performance | runtime/systems/render | Define and meet budgets for startup, frame time, simulation tick, pathfinding, AI, atlas memory, audio voices, save size, and 200-unit stress scenarios. | UFR-123, UFR-132, UFR-146, UFR-150 | NO — performance integration gate. |
| UFR-152 | P1 | release | save migration | Add migration tests across every released save/campaign schema, unsupported-version messaging, backups, and no silent data loss. | UFR-085, UFR-146 | YES — isolated migration fixtures. |
| UFR-153 | P1 | release | asset/content manifests | Generate complete provenance manifest for visual, audio, font, text, and reference inputs; fail verification for missing license/source metadata. | UFR-108, UFR-132, UFR-143 | YES — manifest tooling. |
| UFR-154 | P1 | release | browser QA | Verify supported Chrome, Firefox, Edge, Safari where feasible; document keyboard, audio, canvas, storage, fullscreen, DPI, and performance exceptions. | UFR-142, UFR-151 | YES — QA matrix. |
| UFR-155 | P1 | release | packaging | Add version stamp, cache-busting, offline/static hosting package, optional PWA manifest/service worker, clean deploy output, and reproducible build instructions. | UFR-011, UFR-153 | LIMITED — packaging/config owner. |
| UFR-156 | P1 | release | diagnostics | Add user-visible fatal-error screen, safe reset/export-save option, debug report copy, assertion policy, and no unhandled promise errors in normal flows. | UFR-133, UFR-146 | YES — diagnostics module. |
| UFR-157 | P1 | documentation | `README`, docs | Write complete player manual, controls, campaign guide, skirmish guide, accessibility, troubleshooting, save location, credits, license, architecture, and contributor workflow. | UFR-105, UFR-123, UFR-132, UFR-145 | YES — documentation work. |
| UFR-158 | P1 | release | release automation | Add changelog/version workflow, release notes template, artifact verification, checksum/manifest, smoke test, and rollback instructions. | UFR-151 through UFR-157 | NO — release automation integration. |
| UFR-159 | P1 | QA | full product | Execute release-candidate test plan across campaign, skirmish, saves, replays, settings, localization, audio, accessibility, stress, and browser matrix; triage all defects. | UFR-105, UFR-123, UFR-132, UFR-145, UFR-158 | NO — release candidate QA gate. |
| UFR-160 | P1 | release | full product | Close all P0/P1 release defects, freeze schemas/assets/content, tag release candidate, publish known issues, and record sign-off against Gates A–E. | UFR-159 | NO — single-player release gate. |

## Gate F — optional multiplayer expansion

| ID | P | Lane | Entry point | Deliverable and acceptance | Depends | Parallel |
| --- | --- | --- | --- | --- | --- | --- |
| UFR-161 | P3 | multiplayer | architecture decision | Decide multiplayer scope, transport/server model, lockstep versus authoritative simulation, determinism risks, hosting cost, security, moderation, and explicit go/no-go. | UFR-160 | NO — mandatory decision gate before network code. |
| UFR-162 | P3 | multiplayer | simulation/network boundary | Implement deterministic command lockstep or approved alternative with turn buffering, latency simulation, pause/drop policy, and no single-player regression. | UFR-161, UFR-147 | LIMITED — network simulation owner. |
| UFR-163 | P3 | multiplayer | lobby/session | Add host/join, room code or LAN discovery, faction/map/settings selection, readiness, start synchronization, reconnect policy, and error handling. | UFR-162 | YES — session layer. |
| UFR-164 | P3 | multiplayer | synchronization | Add checksums, desync detection, diagnostic dumps, recovery or match termination policy, version compatibility, and replay capture. | UFR-162, UFR-147 | LIMITED — sync/debug owner. |
| UFR-165 | P3 | multiplayer | UI | Add multiplayer screens, connection state, latency, player status, pause/drop/reconnect messaging, chat decision, and accessible controls. | UFR-163, UFR-164 | YES — dedicated UI screens. |
| UFR-166 | P3 | multiplayer/balance | maps/data | Validate multiplayer starts, resources, victory conditions, faction matchups, map pool, settings, and no campaign-only mechanic leakage. | UFR-149, UFR-163 | LIMITED — multiplayer balance data. |
| UFR-167 | P3 | multiplayer | observer/replay | Add observer slots, fog perspective, timeline, speed controls, post-match replay, and no hidden-information leakage to players. | UFR-164, UFR-165 | YES — observer/replay layer. |
| UFR-168 | P3 | multiplayer/release | full network product | Run latency, reconnect, desync, compatibility, abuse, security, load, and usability tests; publish multiplayer beta only after all blocking defects close. | UFR-162 through UFR-167 | NO — multiplayer beta gate. |

## Queue extension rule

New tasks start at `UFR-169` and must include priority, lane, entry point, observable acceptance criteria, dependencies, and an explicit `YES`, `LIMITED`, or `NO` parallel rule. Existing task IDs and meanings remain stable; use a completion marker to record supersession rather than deleting or renumbering work.
