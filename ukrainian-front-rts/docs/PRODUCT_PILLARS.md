# Fields of Resolve — product pillars and release scope

## Status and use

This document is the approved product contract for the single-player release. Later design, implementation, balance, content, art, audio, UI, and release tasks should cite the relevant section when making a scope or tradeoff decision.

The targets below are planning constraints, not promises of documentary accuracy. Fields of Resolve is stylized historical fiction built from original code and assets.

## Product statement

Fields of Resolve is a dependency-free, browser-native real-time strategy game for desktop players. It combines the immediate control clarity, information density, strong silhouettes, decisive counterplay, and authored campaign pacing associated with polished mid-1990s RTS games with an original fictionalized Ukrainian-war setting and modern usability expectations.

“Classic RTS quality” is the quality bar. It does not authorize copying Warcraft II or any other commercial game's assets, maps, writing, interface layout, source code, audio, or exact rules.

## Audience and experience promise

The primary audience is desktop strategy players who value readable battlefield decisions, compact sessions, authored single-player missions, and controls that are quick to learn but support deliberate tactical play.

A first-time player should understand selection, movement, combat, gathering, construction, and production through play rather than external documentation. An experienced RTS player should find predictable commands, useful hotkeys, control groups, readable counters, and enough strategic variation to replay missions or skirmishes.

## Product pillars

### 1. Immediate, trustworthy command

Player intent must translate into visible, deterministic action. Selection, orders, construction, production, abilities, camera movement, and cancellation use consistent rules and provide prompt feedback. Input convenience never overrides simulation authority.

Decision test: prefer the option that makes the same command produce the same understandable result and exposes failure instead of silently ignoring it.

### 2. Readability before spectacle

Faction, unit role, health, selection, range, terrain, objectives, threats, and effects must remain legible at ordinary play zoom. Original art should use strong silhouettes, restrained animation, clear value grouping, and faction cues. Effects may enrich a battle but must not conceal the information needed to command it.

Decision test: if a visual improvement reduces recognition at low zoom, in motion, or in grayscale, revise it before production.

### 3. Tactical terrain and explicit counters

Roads, settlements, shelterbelts, rivers, bridges, elevation, cover, sight lines, obstacles, and unit roles should change decisions. Infantry, armor, reconnaissance, drones, artillery, air defense, engineering, logistics, and command capabilities need stated strengths, weaknesses, and counterplay rather than a single best army composition.

Decision test: a new mechanic needs player feedback, AI use, data ownership, serialization implications, and appropriate verification—not only a combat bonus.

### 4. Complete economy-to-victory loop

Gathering, expansion, construction, production, research, reinforcement, repair, force preservation, objectives, and victory or defeat must form one coherent match loop. The opposing AI must participate in that loop rather than exist only as timed waves in the release-quality skirmish mode.

Decision test: prioritize closing incomplete loops over adding isolated roster breadth or presentation polish.

### 5. Authored campaign with meaningful variation

The single-player campaign is the lead mode. Missions need distinct geography, starts, objectives, encounter pacing, scripted events, briefings, debriefings, and progression. Scenarios may be inspired by broad themes, but named characters, dialogue, and outcomes remain clearly fictionalized.

Decision test: campaign content should create a new decision or pacing shape, not merely change enemy counts on the same battlefield.

### 6. Original, traceable production

Code, visual assets, audio, text, fonts, and reference inputs must have clear origin and licensing records. Procedural prototypes are valid production stepping stones; stable designs graduate to authored, optimized assets only after gameplay readability is proven.

Decision test: an asset without usable provenance or a repeatable export path is not release-ready.

### 7. Browser-native resilience

The game should start quickly from static hosting, remain dependency-light, preserve deterministic simulation boundaries, and degrade clearly when a platform capability is unavailable. Architecture favors data-driven content, focused systems, versioned persistence, and verification that can run without proprietary services.

Decision test: adopt a dependency only when it measurably improves the shipped experience or verification and its runtime, maintenance, licensing, offline, and packaging cost is documented.

## Supported release platforms

### Required

- Desktop-class current stable Chrome, Firefox, Edge, and Safari where platform APIs permit.
- Keyboard and mouse as the primary control scheme.
- Static HTTPS hosting and local development through the repository's run script.
- Common desktop viewports from 1280 × 720 upward, including high-DPI displays and browser resizing without loss of game state.
- English and Ukrainian player-facing text by release, with the localization system designed for additional languages.

Browser support is validated by the release browser-QA task; this document defines the intended support set rather than pre-approving exceptions.

### Best effort, not release-blocking

- Linux desktop browsers outside the explicitly tested matrix.
- Trackpads and alternative pointing devices that expose standard pointer and wheel events.
- Offline/PWA packaging if it does not compromise the static-hosting baseline.

### Not supported for the initial single-player release

- Touch-only phones or tablets.
- Gamepad-only play.
- Native desktop or mobile application packages.
- Legacy browsers or browsers without required canvas, module, audio, and storage capabilities.

## Session and content targets

### Match length

- Tutorial or focused teaching scenario: 10–20 minutes for a first successful completion.
- Standard campaign operation: 25–45 minutes on normal difficulty.
- Long campaign finale or major set-piece: up to 60 minutes, with checkpoint support before this target is used.
- Standard skirmish: designed around a 20–40 minute normal-difficulty match, with map and setup choices allowed to vary the result.

Pacing should produce the first meaningful tactical or economy decision within two minutes and avoid mandatory passive buildup longer than three minutes. These are design targets to be measured in playtests and telemetry, not hard time limits that terminate a match.

### Campaign length

The release campaign targets:

- one integrated tutorial operation;
- at least eight substantial authored operations after the tutorial;
- approximately 6–9 hours for a first normal-difficulty playthrough;
- briefings, debriefings, progression, save/load, checkpoints, scoring, and explicit completion state across the campaign.

Optional branches, challenge objectives, and replay value may extend playtime, but are not substitutes for the authored operation count.

## Quality bar

Release quality means the complete experience meets all of these conditions:

- commands are responsive, consistent, and visibly acknowledged;
- the simulation is deterministic for the same seed and command stream;
- every core faction role has readable purpose and counterplay;
- campaign and skirmish can complete the full economy-to-victory loop;
- all shipped missions have distinct authored identity and complete start-to-end presentation;
- required unit, building, terrain, effect, UI, and audio states have coherent original coverage;
- settings, saves, localization, accessibility, scaling, and error handling work as ordinary product features;
- content, saves, assets, and releases pass their automated validation and provenance gates;
- no known P0 or P1 defects remain at release sign-off.

A feature-complete prototype is not release quality if major feedback, AI, persistence, content, accessibility, provenance, or verification paths are absent.

## Explicit non-goals

The initial single-player release will not:

- recreate Warcraft II or another commercial RTS, including its assets, maps, fiction, interface, audio, code, or exact mechanics;
- claim documentary or simulation-grade historical accuracy;
- include multiplayer, networking, matchmaking, chat, accounts, servers, anti-cheat, moderation, or live-service systems unless the post-release multiplayer decision task explicitly approves them;
- support touch-first mobile play, consoles, gamepad-only control, VR, or native application stores;
- provide a general-purpose map editor, mod SDK, scripting IDE, or user-generated-content marketplace;
- use photorealistic violence, gore, or spectacle that compromises battlefield readability;
- require an online account, telemetry containing personal data, or a backend service for the core campaign and skirmish experience;
- introduce monetization, advertising, downloadable-content storefronts, loot boxes, or recurring engagement mechanics;
- present invented dialogue or events involving public figures as factual reporting;
- expand roster size, campaign length, or graphical complexity at the expense of completing and verifying the core release loop.

These exclusions prevent accidental scope growth. A future proposal may revisit one only through an explicit architecture or product decision with its cost, dependencies, safety, and release impact documented.

## Priority rules for later tasks

When two valid approaches conflict, use this order:

1. Player comprehension and control reliability.
2. Deterministic simulation and architectural ownership.
3. Completion of the campaign/skirmish loop.
4. Accessibility, compatibility, and recoverability.
5. Originality, provenance, and sustainable production.
6. Performance within the release budgets.
7. Additional content breadth and cosmetic polish.

No priority permits copied assets, misleading historical claims, hidden personal-data collection, or bypassing a release gate.

## Change control

Changes to the product pillars, required platforms, session targets, campaign target, or explicit non-goals require a dedicated product-scope task or maintainer-approved PR. Implementation PRs may clarify wording but must not silently broaden the contract.

Related documents:

- `RTS_PARITY_AUDIT.md` maps product gaps to quality gates.
- `../TASKS.md` is the executable dependency-aware queue.
- `FEATURE_CONVEYOR.md` defines task claiming and completion.
- `ARCHITECTURE.md` defines technical ownership and dependency direction.
