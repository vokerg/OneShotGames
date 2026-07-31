# Fields of Resolve — RTS parity audit

## Purpose

This document defines what still separates `ukrainian-front-rts` from the completeness, clarity, pacing, and production quality expected of a polished classic RTS. “Warcraft II quality” is used as a quality bar, not as a request to reproduce copyrighted assets, maps, fiction, UI, code, or exact mechanics.

The permanent executable backlog is `../TASKS.md`. The temporary integration-recovery priority is defined in `INTEGRATION_RECOVERY_PLAN.md`.

## Audit status — July 31, 2026

The project has made substantial architectural and subsystem progress. The original queue direction remains sound, but execution has drifted toward isolated contract breadth faster than assembled-runtime verification and playable release-gate closure.

The immediate project risk is no longer absence of foundational systems. It is the gap between:

- permanent task markers and focused subsystem tests;
- actual runtime composition;
- browser/player verification;
- complete economy-to-victory and campaign loops.

The active recovery program is tracked by:

- issue #109 — authoritative CI, integrated verification, and honest DONE semantics;
- issue #110 — stale UFR-022/UFR-071 critical-path recovery;
- issue #111 — explicit simulation ownership and deterministic application composition;
- issue #112 — active runtime content, dependency contracts, and fictional framing.

## Current baseline

### Credible assembled foundations

The current repository contains:

- a dependency-free browser runtime;
- fixed-step simulation and seeded randomness;
- explicit core simulation phases;
- a headless simulation harness;
- task, architecture, schema, content, technology, and deterministic verification tools;
- named actions, control groups, camera controls, queued orders, and tactical commands;
- navigation grids, deterministic A*, waypoint following, collision, formations, terrain modifiers, transports, and stuck recovery;
- combat contracts for damage classes, projectiles, sight, cover, suppression, target policy, artillery, drones/EW, air defense, smoke, abilities, repair, destruction, veterancy, stances, garrisons, engineering, and readability;
- worker gathering, drop-offs, extraction policy, construction placement/progress, production/research queues, rally/exit behavior, capacity, defenses, building lifecycle, and economy HUD work;
- faction doctrine and technology-tree contracts;
- campaign state, saves, scripting, objectives, authored-map format, checkpoints, modernization, briefing/debrief, and narrative contracts;
- early art, audio, and semantic-UI architecture.

This is materially beyond the original prototype baseline.

### What is actually player-visible

A meaningful subset is integrated into the active browser application, including movement, commands, economy, construction, production, research, capacity, stances, veterancy, transports, and combat-readability adapters.

However, many merged modules remain contract-only or partially integrated. Examples include parts of the complete faction roster, AI planning, authored maps, campaign presentation, checkpoints, modernization, narrative presentation, centralized audio, and semantic UI architecture.

Nominal task completion must therefore not be treated as equivalent to release-gate completion.

## Immediate recovery findings

### 1. Main lacks authoritative assembled verification

Focused tests and reconstructed fixtures exist, but the latest assembled `main` does not have required CI evidence covering the full verifier and browser startup.

**Required response:** issue #109.

### 2. Critical path is blocked by stale branches

UFR-022 and UFR-071 have old branches that no longer represent current-main integration state. Their work blocks navigation closure, tactical AI, faction completion, skirmish, art, and campaign dependencies.

**Required response:** issue #110.

### 3. Documented simulation ownership and actual runtime order have diverged

Some controllers wrap authoritative `Game` methods and create behavior before or after the declared simulation phases. `src/main.js` manually installs and disposes a growing adapter graph.

**Required response:** issue #111.

### 4. Active runtime content is behind canonical contracts

The browser still consumes prototype-era configuration while newer faction/content contracts exist separately. Real public figures also remain directly controllable combat heroes despite the fictionalized product framing.

**Required response:** issue #112.

### 5. Contract tests have not always tested dependency compatibility

The UFR-073/UFR-074 audit found locally passing implementations with incompatible producers, prerequisites, resources, public adapter fields, clamps, and ownership.

**Required response:** issues #109 and #112; dependency-contract execution becomes part of normal acceptance.

## Remaining product gaps

### Gate A — stable RTS foundation

**Status: provisionally implemented, not closed.**

Most control and movement systems exist. Closure is blocked by UFR-022 recovery, navigation torture scenarios, the 150-unit integration/performance gate, and authoritative assembled verification.

Critical path:

```text
UFR-022 → UFR-029 → UFR-030
```

### Gate B1 — complete combat model

**Status: broad contract coverage, provisional runtime coverage.**

The combat model has substantial policy and integration work. The combat integration gate must be rerun in the assembled checkout through issue #109 before it can be treated as proven.

### Gate B2 — economy, construction, production, and technology

**Status: substantial runtime integration, incomplete gate.**

The primary economy systems are live enough to form a serious prototype loop. Remaining major work is opening/balance policy and complete recovery scenarios:

```text
UFR-066 → UFR-068
```

### Gate B3 — factions, AI, and skirmish

**Status: content and architecture ahead of playable opponent behavior.**

Faction contracts are broad, but UFR-071 must be recovered and runtime content reconciled. AI currently lacks the economy and tactical implementation required for a full RTS opponent.

Critical path:

```text
UFR-030 + UFR-050 + UFR-079 → UFR-081
UFR-068 + UFR-079 → UFR-080
UFR-080 + UFR-081 → UFR-082 → UFR-083
```

### Gate C — campaign-complete alpha

**Status: infrastructure-rich, authored-campaign poor.**

Campaign contracts for state, saves, scripting, objectives, maps, flow, checkpoints, modernization, and narrative exist. The tutorial and authored operation sequence should not accelerate until skirmish/economy/navigation integration is stable and issue #112 resolves active content/framing.

### Gate D — production audiovisual and interface beta

**Status: early architecture and standards only.**

The art bible, audio mixer contract, and semantic UI architecture are useful foundations. Production asset families, runtime audio mapping, HUD migration, accessibility, localization, and visual/audio integration remain largely ahead.

Do not prioritize later Gate D breadth while the P0 recovery override is active.

### Gate E — release candidate

**Status: not started as an assembled release program.**

Release-level browser compatibility, performance, replay, save migration, crash diagnostics, provenance, packaging, and sign-off remain future work.

## Target product definition

A release candidate should provide:

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

## Recovery quality gate

The recovery gate temporarily precedes ordinary Gates A–E.

Pass criteria:

- latest `main` passes required `bash verify.sh` CI;
- browser startup and mission-start smoke pass;
- completion markers expose actual evidence level;
- UFR-022 and UFR-071 are recovered from current `main`;
- stale claims are closed or superseded accurately;
- the authoritative simulation order is explicit and contains no hidden controller phases;
- application installation/disposal is deterministic and failure-safe;
- merged-but-unwired high-impact contracts have named integration owners;
- no unresolved P0 defect is found by the assembled baseline.

See `INTEGRATION_RECOVERY_PLAN.md` for sequencing and exit rules.

## Permanent quality gates

### Gate A — stable RTS foundation

Required: UFR-001 through UFR-030.

Pass criteria:

- deterministic simulation inputs and random streams;
- repeatable headless scenarios;
- action mapping and control groups;
- footprint-aware navigation, collision, formations, and stuck recovery;
- no architecture regression from new systems;
- assembled integration and browser checks pass.

### Gate B — complete core match loop

Required: UFR-031 through UFR-083.

Pass criteria:

- counter-based combat with line of sight, cover, suppression, repair, and targeted abilities;
- manageable economy, construction, production, research, rally points, and defenses;
- distinct faction doctrines and a full runtime-integrated playable roster;
- skirmish AI completes an economy-to-victory loop;
- combat/economy/faction contracts are exercised through their runtime owners.

### Gate C — campaign-complete alpha

Required: UFR-084 through UFR-105.

Pass criteria:

- tutorial and at least eight authored missions;
- campaign progression, save/load, checkpoint, briefing, debriefing, and scoring;
- objective variety and mission-specific scripting;
- complete content review for fictional framing and sensitivity;
- no real public figure is used as a directly controllable combat hero.

### Gate D — production audiovisual beta

Required: UFR-106 through UFR-145.

Pass criteria:

- atlas-backed production sprites and terrain;
- complete combat/environment/UI effect set;
- central audio system, effects, ambience, score, acknowledgements, subtitles, and options;
- full HUD, settings, accessibility, localization, and post-mission UX.

### Gate E — release candidate

Required: UFR-146 through UFR-160.

Pass criteria:

- automated test pyramid and deterministic replay verification;
- performance, compatibility, save migration, asset provenance, packaging, and release gates;
- no P0/P1 defects in the release checklist.

### Gate F — optional multiplayer expansion

Required only if multiplayer is approved: UFR-161 through UFR-168.

Multiplayer remains isolated behind an architecture decision and must not destabilize the single-player release path.

## Scope controls

- Do not copy Warcraft II assets, text, maps, sounds, music, UI layouts, story, or source code.
- Use classic RTS design principles as references: responsiveness, legibility, counter structure, economy rhythm, campaign pacing, and production completeness.
- Keep the dependency-free goal unless a task explicitly changes that decision and documents the cost.
- Prefer data-driven systems that support campaign, skirmish, tests, and future editors.
- Treat real people and events as stylized fiction. Do not use real public figures as directly controllable combat heroes; add content notes and avoid defamatory invented factual claims.
- Do not add a mechanic without player feedback, AI support, serialization support, and test coverage appropriate to its release gate.
- Prefer closing incomplete playable loops over adding isolated contract or content breadth.

## Audit maintenance

Update this audit when a merged task or recovery issue materially changes the assessed baseline or release gates.

Do not use this file as a claim board. Permanent task state is resolved through `TASKS.md`, open PRs, and completion markers. Recovery priority is resolved through `INTEGRATION_RECOVERY_PLAN.md` and its linked issues.
