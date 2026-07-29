# Fields of Resolve — RTS parity audit

## Purpose

This document defines what still separates `ukrainian-front-rts` from the completeness, clarity, pacing, and production quality expected of a polished classic RTS. “Warcraft II quality” is used as a quality bar, not as a request to reproduce copyrighted assets, maps, fiction, UI, code, or exact mechanics.

The corresponding executable backlog is `../TASKS.md`. Task IDs in this document are stable references into that queue.

## Current baseline

The project already has a credible prototype foundation:

- a dependency-free browser runtime with separated composition, input, simulation, systems, rendering, and UI modules;
- three missions with objectives, enemy assault timing, explicit victory/defeat, and endgame reports;
- Ukraine and Russia rosters covering engineer, infantry, drone, medic, IFV, tank, artillery, and command heroes;
- resource recovery, three resources, command capacity, building placement, construction, production queues, and upgrades;
- selection, formation destinations, move, attack, attack-move, stop, auto-fire, minimap navigation, fog, active abilities, healing, buffs, and projectiles;
- procedural unit, building, terrain, portrait, and effect rendering plus an art laboratory;
- a small syntax and architecture verifier.

This is enough to demonstrate the concept. It is not yet enough to sustain a complete campaign, a skirmish match, serious balance work, a production asset pipeline, or a release-quality player experience.

## Highest-impact gaps found in the implementation

### 1. The missions are variants of one hard-coded battlefield

`Game.start` currently creates one terrain field, one road, one resource layout, one set of bases, and one initial roster, then swaps mission data, heroes, objectives, and wave timing. The three operations therefore lack authored geography, mission-specific encounter structure, scripted events, alternate starts, reinforcements, checkpoints, and scenario identity.

**Required response:** data-driven maps, scenario scripting, campaign state, objective libraries, mission-specific AI, authored mission rebuilds, and a longer campaign. See UFR-084 through UFR-105.

### 2. Movement is direct steering, not RTS navigation

Units move in straight lines toward destinations. There is no navigation grid, path search, footprint-aware blocking, local avoidance, choke-point handling, formation preservation, stuck recovery, passability, bridge logic, or terrain movement cost.

This prevents meaningful base layouts, defensive lines, bridges, urban obstacles, mines, and tactical terrain.

**Required response:** UFR-018 through UFR-030.

### 3. Combat lacks a complete counter and terrain model

Current combat is mostly hit points, range, damage, reload, sight, nearest-target acquisition, and simple projectile travel. It lacks damage/armor classes, accuracy, evasion, line-of-sight occlusion, elevation, cover, suppression, morale, target priorities, minimum ranges, meaningful ammunition/spotting rules, area-damage policy, friendly fire policy, damage states, wrecks, veterancy, and consistent ability targeting.

**Required response:** UFR-031 through UFR-050.

### 4. Economy and production are prototype-level

Engineers automatically choose nearby resources. Production has a short fixed queue, but no cancel/reorder/refund, rally point, exit blocking, tech prerequisites, research time, build grid, builder cooperation, repair economics, multiple drop-off behavior, neutral capture, defenses, or robust resource assignment UI.

**Required response:** UFR-051 through UFR-068.

### 5. The opposing side is a wave spawner, not an RTS opponent

Russian forces do not scout, gather, build, expand, research, compose armies, defend, retreat, flank, raid, or react to the player. There is no skirmish mode or authored AI doctrine.

**Required response:** UFR-075 through UFR-083.

### 6. Faction identity is visually stronger than mechanically distinct

The current roster is intentionally mirrored. That is useful for a first balance pass, but it does not yet create strategic faction identity, distinct production choices, reconnaissance warfare, electronic warfare, air defense, logistics, transport, river-crossing play, specialized counters, or meaningful doctrine.

**Required response:** UFR-069 through UFR-074 and the faction/roster work in UFR-071 through UFR-077.

### 7. Campaign persistence and player learning are absent

There is no campaign map, unlock state, save/load, checkpoints, tutorial, difficulty selection, briefing/debriefing sequence, persistent modernization, medals, branching choice, mission scoring, or narrative presentation system.

**Required response:** UFR-084 through UFR-105 and UFR-132 through UFR-140.

### 8. Visuals are an advanced prototype, not a shippable asset set

The procedural art pass establishes silhouettes and palette language, but units do not yet have complete directional sprite sets and production animation coverage for idle, movement, attack, ability, hit, damaged, death, and wreck states. Terrain is not an authored tile set with transitions, cliffs, water, bridges, roads, structures, destructibles, seasonal variants, and mission illustrations. Asset provenance and repeatable export/packing are not yet automated.

**Required response:** UFR-106 through UFR-123.

### 9. Audio is effectively a missing product layer

There is no central audio engine, mixer, spatial policy, event taxonomy, unit acknowledgements, combat effects, UI sounds, ambient beds, adaptive score, voice pipeline, subtitles, or audio options.

**Required response:** UFR-124 through UFR-132.

### 10. The interface communicates state but lacks mature RTS ergonomics

The command panel is useful, but the game still needs configurable hotkeys, control groups, subgroup selection, idle-worker selection, production tabs, queue manipulation, rally points, tech tree presentation, tactical alerts, minimap pings, pause/settings/save flows, richer tooltips, accessibility, resolution scaling, localization, and post-mission analytics.

**Required response:** UFR-013 through UFR-017 and UFR-133 through UFR-145.

### 11. Quality engineering is too small for a growing RTS

The verifier checks syntax and architecture boundaries, but there is no unit/integration/browser test suite, deterministic random seed, simulation harness, replay format, content schema validator, balance simulator, visual regression set, performance budget, save migration suite, crash diagnostics, or release pipeline.

**Required response:** UFR-001 through UFR-012 and UFR-146 through UFR-160.

## Target product definition

A release candidate should provide the following player-visible experience:

1. **Immediate control clarity.** Selection, movement, attack, production, construction, abilities, and camera controls respond consistently and have visible/audio acknowledgement.
2. **Tactical terrain.** Roads, shelterbelts, settlements, rivers, bridges, obstacles, cover, sight lines, and elevation affect decisions.
3. **Readable counters.** Infantry, armor, drones, artillery, air defense, engineering, reconnaissance, logistics, and command units have explicit strengths, weaknesses, and counterplay.
4. **Complete economy loop.** Workers can be assigned and managed; bases can expand; queues, rally points, prerequisites, research, repair, and defenses work predictably.
5. **Real opponent behavior.** AI gathers information, develops an economy, builds a force, chooses objectives, defends, retreats, and attacks according to doctrine and difficulty.
6. **Authored campaign.** A tutorial plus at least eight substantial operations use distinct maps, triggers, objectives, pacing, briefings, debriefings, and progression.
7. **Production art and sound.** Every unit, building, terrain family, effect, UI action, and major mission beat has coherent original visual and audio coverage.
8. **Usable interface.** Control groups, hotkeys, queue management, minimap alerts, tooltips, settings, saves, scaling, localization, and accessibility meet ordinary desktop expectations.
9. **Balance confidence.** Matchups and mission difficulty are supported by deterministic tests, telemetry, batch simulations, and repeatable playtest scenarios.
10. **Release discipline.** Versioned saves, browser compatibility, performance budgets, source manifests, licensing records, changelogs, and release checklists exist.

## Quality gates

### Gate A — Stable RTS foundation

Required: UFR-001 through UFR-030.

Pass criteria:

- deterministic simulation inputs and random streams;
- repeatable headless scenarios;
- action mapping and control groups;
- footprint-aware navigation, collision, formations, and stuck recovery;
- no architecture regression from new systems.

### Gate B — Complete core match loop

Required: UFR-031 through UFR-083.

Pass criteria:

- counter-based combat with line of sight, cover, suppression, repair, and targeted abilities;
- manageable economy, construction, production, research, rally points, and defenses;
- distinct faction doctrines and a full playable roster;
- skirmish AI that can complete an economy-to-victory loop.

### Gate C — Campaign-complete alpha

Required: UFR-084 through UFR-105.

Pass criteria:

- tutorial and at least eight authored missions;
- campaign progression, save/load, checkpoint, briefing, debriefing, and scoring;
- objective variety and mission-specific scripting;
- complete content review for fictional framing and sensitivity.

### Gate D — Production audiovisual beta

Required: UFR-106 through UFR-145.

Pass criteria:

- atlas-backed production sprites and terrain;
- complete combat/environment/UI effect set;
- central audio system, effects, ambience, score, acknowledgements, subtitles, and options;
- full HUD, settings, accessibility, localization, and post-mission UX.

### Gate E — Release candidate

Required: UFR-146 through UFR-160.

Pass criteria:

- automated test pyramid and deterministic replay verification;
- performance, compatibility, save migration, asset provenance, packaging, and release gates;
- no P0/P1 defects in the release checklist.

### Gate F — Optional multiplayer expansion

Required only if multiplayer is approved: UFR-161 through UFR-168.

Multiplayer is deliberately isolated behind an architecture decision. It must not destabilize the single-player release path.

## Scope controls

- Do not copy Warcraft II assets, text, maps, sounds, music, UI layouts, story, or source code.
- Use classic RTS design principles as references: responsiveness, legibility, counter structure, economy rhythm, campaign pacing, and production completeness.
- Keep the current dependency-free goal unless a task explicitly changes that decision and documents the cost.
- Prefer data-driven systems that can support campaign, skirmish, tests, and future editors.
- Treat real people and events as stylized fiction. Add content notes, avoid defamatory invented factual claims, and separate dramatic scenario text from historical documentation.
- Do not add a new mechanic without player feedback, AI support, serialization support, and test coverage appropriate to its release gate.

## Audit maintenance

Update this audit only when a merged task materially changes the assessed baseline or release gates. Do not use this file as a claim board; task state is resolved through `TASKS.md`, open PRs, and completion markers as defined in `FEATURE_CONVEYOR.md`.
