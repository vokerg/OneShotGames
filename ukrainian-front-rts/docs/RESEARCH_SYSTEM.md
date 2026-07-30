# Timed research queue system

`src/systems/research-system.js` owns deterministic research queue policy. It consumes the UFR-060 technology graph fields and composes with UFR-058 production queues without mutating `Game`, buildings, player resources, production queues, UI, renderer, save data, or stat modifiers.

## Profiles and state

`createResearchProfile()` normalizes one researchable technology:

- stable technology ID and label;
- positive duration;
- non-negative resource cost;
- prerequisite technology IDs;
- optional faction restrictions;
- mission locks;
- optional mutually exclusive group.

`createResearchState()` creates an immutable, versioned state with stable monotonic item IDs, completed technologies, chosen exclusive groups, per-facility queues, manually paused facilities, maximum queue length, and one contention policy. Multiple facilities advance in stable facility-ID order; items retain insertion order inside each facility.

The state remains reference-free and suitable for later save/replay serialization. The save owner decides where it is stored and how migrations are applied.

## Enqueue validation and payment

`enqueueResearch()` validates:

- a known facility ID;
- queue capacity;
- already-completed or already-queued technology;
- all prerequisites completed;
- faction access;
- mission `availableTech`, `lockedTech`, and profile mission-lock rules;
- mutually exclusive choices, including choices completed before state creation;
- available resources.

Successful enqueue returns a new state plus an immutable `payment` record. The function does not subtract resources; the authoritative economy boundary applies payment atomically with the returned state. Failed requests return the original state and a reason-specific result.

## Production contention

The state supports three explicit policies:

- `production-priority`: research at a facility pauses while that facility has active production;
- `research-priority`: research advances and reports the facility in `blockedProductionFacilityIds` for the production owner to honor;
- `independent`: production and research advance concurrently.

`tickResearch()` receives `productionActiveByFacility` as an object or `Map`. It returns both paused-research and blocked-production facility lists. The research system never edits a production queue, so UFR-059 production-exit and rally behavior remains independent.

Manual pause is facility-specific and takes precedence over contention. Paused state is persistent, so a later queue at the same facility remains paused until explicitly resumed.

## Timing and completion events

`tickResearch(state, stepSeconds, context)` consumes positive fixed-step time. A large step may complete multiple queued technologies deterministically. Completion:

- removes the item;
- adds the technology ID to the sorted completed set;
- records its exclusive-group choice;
- emits an immutable `economy.research` domain event with item, technology, label, facility, and caller-supplied simulation tick.

The event stream owner may publish these returned event records through `DomainEventStream`; this module does not require or mutate a live event stream.

## Cancellation and refunds

`cancelResearch()` accepts a queue index or stable research item ID. Unstarted items return a full refund. Started items return a proportional refund based on remaining time, rounded down per resource to deterministic integer values. The function returns the refund record but does not credit player resources.

Cancelling the active item promotes the next queued item without consuming time. Cancelling the final item removes the facility queue while preserving the facility's explicit pause setting.

## Progress presentation

`researchProgressSnapshot()` returns immutable UI-safe data:

- contention policy and completed technology IDs;
- stable facility ordering;
- current and queued items;
- elapsed, remaining, duration, and normalized progress;
- cost and started state;
- manual or production-contention pause reason;
- whether current research blocks production.

Later economy UI tasks may consume this snapshot for progress bars, cancellation controls, prerequisite explanations, and global queue views. They must invoke the research command boundary rather than editing queue state.

## Ownership boundaries

- UFR-060 owns technology graph structure, prerequisites, faction restrictions, mission locks, exclusive groups, and reachability validation.
- UFR-061 owns research queue timing, cancellation/refund calculation, contention policy, progress snapshots, and completion records.
- UFR-058 owns unit-production queue mutation and resource/population reservation behavior.
- UFR-059 owns production exits, rally queues, and produced-unit acknowledgement.
- UFR-062 owns applying completed upgrades to entity statistics, abilities, visuals, and saves.
- Economy composition owns atomic resource debit/credit and deciding which structures are research facilities.
- UI, AI, campaign, save, replay, audio, and telemetry owners consume the public state and events without duplicating queue rules.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/research-system.js
node --test tests/economy/research-system.test.mjs
bash verify.sh
```

The focused suite covers immutable profile/state validation, deterministic payment records, prerequisites, faction and mission restrictions, affordability, duplicate and exclusive choices, stable multi-facility queues, all three production-contention policies, multi-item completion and typed events, full and proportional refunds, manual pause/resume, and UI-safe progress snapshots.
