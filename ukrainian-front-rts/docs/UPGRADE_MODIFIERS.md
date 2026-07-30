# Deterministic upgrade modifier application

`src/systems/upgrade-modifier-system.js` owns the versioned, browser-independent contract for applying completed upgrades to entity statistics, ability parameters, visual descriptors, and save-safe upgrade state.

The module replaces ad hoc field-by-field mutation with immutable definitions and a single deterministic resolution path. It does not mutate `Game`, entities, UI, renderer objects, research queues, campaign saves, or authored content. Integration owners consume returned profiles and patches at their authoritative boundaries.

## Modifier definitions

`createUpgradeDefinition()` normalizes one upgrade into:

- a stable upgrade ID and numeric priority;
- data-only target filters for faction, unit type, archetype, vehicle class, tags, and required abilities;
- numeric entity-stat modifiers;
- numeric ability-parameter modifiers;
- additive visual tokens and deterministic visual-variant slots.

Definitions and every nested value are frozen. Duplicate definition IDs, unsupported operations, negative multipliers, non-finite values, malformed filters, class instances, and browser objects fail closed.

## Numeric ordering

The contract supports two numeric operations:

1. `add`
2. `multiply`

For every entity or ability field, **all additions are applied before all multipliers**. Within each operation phase, ordering is:

1. ascending upgrade priority;
2. stable upgrade ID;
3. modifier declaration index.

This order is independent of the input array order. The resolver records provenance for every final numeric field so debug UI, saves, and tests can explain which upgrades contributed.

An additive modifier may introduce a new numeric field from zero. A multiplier requires an existing finite base value; missing-base multiplication throws rather than silently producing an invalid statistic.

## Target matching

`upgradeAppliesTo()` evaluates only reference-free descriptors. Every declared target dimension must match:

- empty filter arrays mean unrestricted;
- scalar identity filters match exactly;
- all required tags must be present;
- all required abilities must be present.

The module never reads `UNIT_TYPES`, faction globals, live entity collections, or renderer state. The caller supplies the canonical descriptor derived from its content owner.

## Entity, ability, and visual resolution

`resolveUpgradeApplication()` receives:

- base entity statistics;
- base ability profiles keyed by ability ID;
- a base visual descriptor;
- an entity descriptor;
- upgrade definitions;
- versioned active-upgrade state.

It returns one frozen, reference-free result containing:

- active and actually applied upgrade IDs;
- resolved statistics;
- resolved ability profiles;
- visual tokens and variant slots;
- per-field modifier provenance.

Ability modifiers use the same additive-then-multiplicative rule as entity stats. Targeting an unknown ability fails closed, which prevents content drift from silently disabling an upgrade.

Visual tokens are unioned and sorted. Visual variants use the canonical definition order; the later applicable definition wins a shared slot and its provenance is retained. Renderers may consume these descriptors but must not reinterpret upgrade rules.

## Existing and newly created entities

`createNewEntityUpgradePatch()` creates the canonical profile for a newly spawned entity. When an HP statistic exists, new entities start at the resolved maximum.

`reconcileExistingEntityUpgrades()` applies the same resolved profile to an existing entity and supports three explicit health policies:

- `preserve-ratio` — preserve current-health percentage;
- `preserve-deficit` — preserve absolute missing health;
- `clamp-current` — keep current health, capped by the new maximum.

The returned patch contains the same stats, abilities, visual descriptor, and applied IDs as the new-entity path. The caller performs the authoritative mutation atomically. Veterancy and status owners may compose after this baseline profile rather than modifying upgrade definitions.

## Save compatibility

`createUpgradeSaveSnapshot()` serializes only:

- `schemaVersion`;
- sorted active upgrade IDs.

`restoreUpgradeSaveSnapshot()` rejects unsupported versions and can validate every saved ID against the current known-upgrade registry. Definitions remain content-owned and are re-resolved after load, so saves never embed mutable entity, DOM, UI, renderer, or function references.

Future incompatible snapshot changes require a version increment and explicit migration in the save owner. Renaming or removing an upgrade ID is a save-compatibility decision.

## Ownership boundaries

- UFR-060 owns technology graph prerequisites, restrictions, mission locks, exclusivity, and reachability.
- UFR-061 owns timed research queues, contention, cancellation, refunds, and completion events.
- UFR-062 owns modifier ordering, target matching, profile resolution, existing/new entity parity, ability modifiers, visual descriptors, and upgrade save snapshots.
- UFR-045 veterancy composes bounded rank modifiers after the upgrade baseline.
- UFR-067 and later UI work consume progress and provenance without changing modifier outcomes.
- Renderer/art owners consume visual tokens and variants only.
- Campaign/save owners persist the versioned snapshot and coordinate migrations.
- Faction and balance tasks author concrete upgrade definitions and values.

Live `Game` composition should replace the current ad hoc `Game.unitStats()` loop with this contract only after active order/UI/construction hotspot branches merge. That composition must install the upgrade baseline before veterancy so both existing and newly produced units use one deterministic order.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/systems/upgrade-modifier-system.js
node --test tests/economy/upgrade-modifier-system.test.mjs
bash verify.sh
```

The focused suite covers normalization, target filters, additive/multiplicative ordering, stable visual conflict resolution, ability parameters, missing fields, existing/new entity parity, all health policies, immutability, save round trips, unknown IDs, future versions, and duplicate definitions.
