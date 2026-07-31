# Neutral structures

UFR-065 defines the deterministic policy for capturable civilian, industrial, and logistics sites. The authoritative owner is `src/systems/neutral-structure-system.js`. It classifies neutral sites, delegates capture timing and ownership transfer to the UFR-057 building lifecycle, exposes bounded ownership effects, and adapts completed transitions to the central domain-event stream.

## Ownership boundary

The module does **not** implement a second capture engine. `beginNeutralStructureCapture()` and `advanceNeutralStructureCapture()` call the existing UFR-057 lifecycle functions, preserving their exact rules for capture duration, range, contesting, abandoned-progress decay, and threshold completion. The neutral wrapper adds only:

- a stable neutral-site definition and state identity;
- initial uncontrolled ownership (`ownerTeam: null`);
- civilian, industrial, and logistics classification;
- deterministic ownership-effect summaries;
- stable mission-script facts and flat variables;
- `economy.capture` domain-event adaptation.

The caller remains responsible for storing the returned immutable state and applying an ownership change to the live site entity through the normal authoritative simulation boundary.

## Site families

### Civilian coordination site

Represents a non-combat community coordination point. It may provide intelligence cadence, local awareness, and mission-script flags. Civilians are abstracted as site context; the contract does not create targetable civilian entities or reward harm.

### Industrial support site

Represents a workshop or industrial compound. While controlled, it may provide metal income and bounded production or repair multipliers. It does not mutate production queues or repair state itself.

### Logistics transfer site

Represents a transfer yard, depot, or route node. While controlled, it may provide fuel income, resupply throughput, and eligible drop-off resource types. Actual gather, drop-off, transport, and resupply execution stays with their existing owners.

Mission content may supply validated definitions with different values, tags, or metadata. Unknown effect keys are rejected rather than silently ignored.

## Capture flow

```text
uncontrolled or enemy-controlled site
  → beginNeutralStructureCapture
  → UFR-057 capturing state
  → progress / contested pause / abandoned decay
  → exact-threshold ownership transfer
  → ownership effect becomes active
  → optional economy.capture domain event
```

A site cannot start a second capture while one is active. Its current owner cannot recapture it, but an opposing team may recapture a completed site. Inputs and outputs are immutable, and stable unit IDs preserve deterministic ordering.

## Ownership effects

`neutralStructureEffectSnapshot()` describes one site. `aggregateNeutralStructureEffects()` combines controlled sites for one team in stable site-ID order:

- additive values: metal, fuel, intel, command capacity, and vision radius;
- multiplicative values: production, repair, and resupply rates;
- set values: drop-off resource types and mission-script flags.

The aggregate is a read-only policy result. Economy, repair, production, sight, and resource systems decide where in their existing authoritative phases those values are applied. This prevents the neutral-site module from becoming an alternate economy simulation.

## Mission scripting hooks

`neutralStructureScriptFacts()` exposes structured state for mission adapters:

- site and definition IDs;
- site family and authored mission tags;
- owner, controlled, contested, and capturing team;
- exact capture seconds and normalized progress;
- active script flags.

`neutralStructureScriptVariables()` exposes equivalent flat keys such as:

```text
neutral.<siteId>.owner
neutral.<siteId>.controlled
neutral.<siteId>.contested
neutral.<siteId>.captureTeam
neutral.<siteId>.captureProgress
```

A mission integration adapter may copy these values into UFR-086 variables or evaluate them directly. The UFR-086 trigger evaluator remains the scripting authority; this module does not alter trigger order or same-tick cascade rules.

## Domain events

`emitNeutralStructureDomainEvents()` maps local transition records into `DOMAIN_EVENT_TYPES.CAPTURE` (`economy.capture`). Payloads contain stable IDs, transition names, ownership, progress, and contest state. The event is emitted only after the corresponding neutral state transition has succeeded. UI, audio, telemetry, replay, and AI observation adapters remain read-only consumers.

## Verification

Run:

```bash
node --check src/core/events.js
node --check src/systems/neutral-structure-system.js
node --check tests/economy/neutral-structure-system.test.mjs
node --test tests/economy/neutral-structure-system.test.mjs
bash verify.sh
```

Browser playtesting becomes applicable when an authored map or mission creates neutral sites and a runtime adapter presents capture feedback. UFR-065 itself adds no DOM, renderer, input, or map content.
