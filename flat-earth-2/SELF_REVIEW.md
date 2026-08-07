# Self-review — v1.0 campaign expansion

This file records the third review pass requested after the original v0.9 prototype.

## Verdict on v0.9

The prototype worked as a proof of concept, but it was not large enough to qualify as a serious investigation campaign.

Main problems found:

1. **Too short / too linear.** 25 scenes and one real free-input puzzle made the optimal route obvious and fast.
2. **The conspiracy was mostly exposition.** HORIZON was explained late by KESTREL instead of reconstructed by the player.
3. **Evidence UI leaked spoilers.** The evidence modal displayed summaries for evidence not yet discovered.
4. **Save robustness was weak.** A malformed persisted shape could poison arrays/counters, and `localStorage.setItem` could throw.
5. **Verifier was shallow.** It checked missing references, but did not test requirement combinations or strong-ending reachability.
6. **Progression stats were under-balanced.** After expanding content, old ending thresholds became trivial and had to be recalibrated.
7. **Flat-Earth content was too narrow.** The first version leaned heavily on one southern flight and one astronomy clue.
8. **Replay value was low.** Four endings existed, but there was little persistent meta-progress or meaningful route diversity.

## Changes made

### Campaign depth

- 25 → 76 scenes.
- 1 → 10 free-input puzzles.
- Added 14 multi-step quizzes.
- Added four reorderable investigation tracks and three mandatory deep labs.
- Added 10 claim cards and 12 evidence categories.
- 4 → 6 endings.
- Added cross-evidence puzzles: a model/observation matrix, a hexadecimal RELAY transform, and a four-source THE VAULT key that forces recall across earlier investigation threads.

### HORIZON reconstruction

The player now reconstructs HORIZON from several independent fictional layers:

- contradictory rescue models in MODEL ROOM;
- RED TEAM A/B material;
- a six-phase manipulation pipeline;
- physical HZ67 packets;
- RELAY-19 entry through technical, social or model reasoning;
- a network graph of PROPONENT / DEBUNK / LEAK / RESCUE / RIDICULE nodes;
- a fictional contractor chain;
- adversarial interview of KESTREL;
- selective extraction from THE VAULT;
- final red-team audit of the player's own preferred theory.

The key narrative answer is not “the Earth is secretly flat”. HORIZON's target is epistemic fragmentation: keeping communities attached to mutually incompatible explanations by continually supplying replacement hypotheses and authority bait.

### Real claim coverage

Added dedicated material for southern routes, Antarctica, 24-hour sunlight, southern celestial motion, household-vs-large-scale Coriolis, shadow geometry, local-Sun perspective, angular size, atmospheric refraction and long-distance water/laser methodology.

### Engine hardening

- save schema validation;
- unknown evidence/claim IDs removed on load;
- broken numeric fields clamped;
- malformed quiz progress repaired;
- quiz progress survives reload;
- failed storage writes no longer crash the session;
- evidence/claim descriptions remain hidden until discovered;
- repeated wrong free-input attempts raise risk and reveal hints;
- interaction lock prevents most double-submit/double-click transitions;
- meta-profile tracks endings and best run separately.

### Balance

A full careful simulated path ends around:

- `МЕТОД = 94`;
- `ДОВЕРИЕ = 17`;
- `РИСК = 0`;
- 12/12 evidence;
- 10/10 claims.

Old strong-ending thresholds were therefore rejected as too low.

Current gates:

- canonical **Open Protocol**: method ≥55, evidence ≥9, trust ≥8, risk ≤16;
- hidden **Double-Blind Protocol**: method ≥80, 12/12 evidence, 10/10 claims, trust ≥15, risk ≤3, plus five structural flags from full investigation.

A simulated medium-careful dossier still qualifies for the canonical ending; a noisy sensationalist profile does not.

## Automated review

`verify_campaign.js` now checks:

- all node/choice/puzzle/quiz references;
- effect registries and requirement flags;
- minimum campaign size and text volume;
- 76/76 static graph reachability;
- all 8 intro-completion states;
- all 16 Sydney-track combinations;
- all 8 deep-lab combinations;
- baseline final exits for weak states;
- a deterministic gold-path simulation through the same `logic-v2.js` used by the browser;
- secret-ending reachability;
- balance sentinels for medium and noisy profiles.

`test_logic.js` separately covers damaged save sanitization, effect clamping, requirement logic, text/numeric puzzle matching and quiz outcomes.

During this review a one-off **headless Chromium DOM E2E** was also run without changing the project dependency model. It clicked the complete gold path through the real browser UI, verified hidden evidence spoilers remain hidden, rebuilt the page after question 1 of the LOCKER quiz from persisted storage, continued from question 2, selected the secret ending with the keyboard, and completed with zero browser `pageerror` events.

## Remaining limitations

- The repository intentionally has no committed headless-browser dependency. The review environment ran a Chromium DOM E2E, but the checked-in default verification remains dependency-free and focuses on story/engine/DOM contracts rather than pixel-level rendering.
- Procedural SVG art is intentionally atmospheric rather than a simulation.
- Most branches eventually reconverge because this is a authored campaign, not a generative RPG. Replay value comes from order, evidence quality, role hints, relay route, risk/trust outcomes and endings rather than completely separate 70-scene storylines.
- Exact playtime cannot be guaranteed. The content target is a deliberate 50–85 minute first investigation; fast readers who already know answers can finish faster.

## Current review result

The v1.0 structure is now large enough to function as the intended serious terminal investigation. The strongest improvement is not raw text volume but that the player must repeatedly **classify evidence, test models and red-team the conspiracy itself** instead of merely reading a reveal.
