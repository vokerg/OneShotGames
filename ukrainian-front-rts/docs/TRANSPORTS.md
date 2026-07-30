# Transport embark and disembark

## Purpose

UFR-026 adds deterministic squad transport without moving transport rules into input, rendering, or pathfinding. `src/systems/transport-system.js` owns cargo capacity, embark eligibility, passenger state, safe disembark placement, and transport-destruction casualties. `src/input/transport-input.js` only translates configured input and presents command results.

The current Ukrainian Bradley and Russian BMP-3 use the compatibility rule for `vehicleClass: 'ifv'`: four squad slots. Future roster entries may provide the content-schema extension fields `transportCapacity`, `transportSlots`, or `transportable`; the versioned content schema already permits extensions.

## Player controls

1. Select one or more nearby friendly infantry, engineer, medic, or command squads.
2. Right-click a friendly IFV to embark them.
3. Select the loaded IFV.
4. Press **E** to disembark all cargo around the vehicle.

`E` is the named `disembark` action in `src/input/action-map.js`, so key-binding overrides may remove or remap it.

## Cargo ownership

Embarked passengers are removed from `game.units` and stored as complete entity records in `transport.passengers`, sorted by stable unit ID. This makes them absent from:

- movement and collision;
- target acquisition and selection;
- rendering and hit testing;
- ordinary unit updates.

Population remains reserved while passengers are aboard. Health, cooldown, buffs, kills, and other entity fields remain on the stored passenger record. Embarking clears active and queued orders, selection, incoming projectiles, and hostile target references so removed passengers cannot remain as ghost targets.

Nested transports, air units, armored vehicles, destroyed units, enemies, and units marked `transportable: false` cannot embark. The command is atomic: if any requested passenger is invalid, out of range, or exceeds remaining capacity, none embark.

## Disembark placement

Disembark is also atomic. The system asks the authoritative navigation grid for passability and searches deterministic rings around the transport:

- passengers are processed by stable unit ID;
- candidate angles and ring radii use a fixed order;
- world bounds are respected;
- active units, buildings, resource nodes, and already planned passengers are avoided;
- movement-layer passability is queried through `worldToCell()` and `isPassable()`.

If every requested passenger cannot receive a safe position, all remain aboard and the player receives `No safe disembark position is available near the transport.` No partial deployment occurs.

## Destruction policy

The initial policy is `catastrophic-loss`: when a transport reaches zero hit points, every embarked passenger is lost before ordinary destroyed-entity cleanup. Ukrainian passenger population is released exactly once. This explicit deterministic rule can later be replaced by UFR-044 disabled/wreck and crew-bailout mechanics; UFR-026 does not invent survivor randomness or wreck behavior ahead of that task.

## Controller composition

`createTransportController()` is installed in `src/main.js` after queued-order wrapping and before transport input. It:

- initializes cargo arrays on newly created transports;
- intercepts right-click orders targeting a friendly transport;
- exposes `game.disembarkSelected()` and `game.transportSnapshot()`;
- resolves cargo casualties before the existing `removeDestroyedEntities()` implementation.

`installTransportInput()` wraps the resulting command boundary for embark feedback and listens for the named disembark action. Disposal is the exact reverse order so all original methods are restored.

PR #44 owns production controller integration in `src/main.js`; the additive transport installation and teardown ordering was documented on that PR before this shared composition edit. No production queue or simulation-phase code is changed here.

## Verification

Focused automated commands:

```bash
node --check src/systems/transport-system.js
node --check src/input/transport-input.js
node --check src/input/action-map.js
node --check src/main.js
node --check tests/navigation/transport-system.test.mjs
node --check tests/input/transport-input.test.mjs
node --test tests/navigation/transport-system.test.mjs tests/input/transport-input.test.mjs
```

Manual browser checklist:

1. Start each mission and field a Bradley IFV plus infantry/engineer/medic squads.
2. Right-click the IFV with nearby squads selected; confirm feedback and that the IFV becomes selected.
3. Attempt enemy, armored, distant, and over-capacity embark commands; confirm reason-specific rejection and no partial mutation.
4. Press E in open ground; confirm every passenger appears in stable non-overlapping positions.
5. Surround an IFV with structures/units or place it beside blocked terrain; confirm blocked disembark leaves all cargo aboard.
6. Destroy a loaded IFV; confirm cargo is lost and command population is recalculated once.
7. Verify ordinary move, attack, queued orders, construction, production, pathfinding, and air-unit behavior remain unchanged.
