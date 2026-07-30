# Garrison and infantry occupancy system

`src/combat/garrison-system.js` owns the deterministic policy for infantry occupying buildings, trenches, and foxholes. The module is browser-independent and does not mutate `Game`, transport, renderer, navigation, or UI objects. Callers apply the returned state and transition records at their authoritative integration boundary.

## Occupancy state

- `createGarrisonState` creates an immutable host state with a stable host ID, kind, controlling team, position, capacity, occupant records, and destruction state.
- Building, trench, and foxhole profiles define default capacity, entry/exit ranges, cover terrain, clearing defense, and destruction-survival policy.
- `garrisonSnapshot` exposes renderer/UI-safe capacity, occupant IDs, control, terrain, destruction, and contest metadata.
- Occupants use stable IDs and deterministic entry sequence. Slot costs allow later roster data to represent teams or unusually large infantry elements without changing the policy.

## Entry and dismount

`canEnterGarrison` validates that a unit is living garrison-capable infantry, belongs to the controlling team, is within entry range, is not already inside, and fits available capacity. Hostile occupancy blocks normal entry until cleared.

`enterGarrison` is atomic: if any requested unit fails, the original state is returned unchanged. Successful entry returns unit transitions that remove occupants from the physical world and mark their host. When `dismountFromTransportId` is supplied, the result also contains a transport transition listing passenger IDs to remove and unit transitions that clear `embarkedIn`. The transport system remains the owner of its passenger collection and applies that transition explicitly.

## Exit placement

`planGarrisonExit` consumes caller-provided candidate positions. Candidates must be passable, unblocked, safe, and within the host's exit range. Sorting is deterministic by priority, preferred-point distance, host distance, stable candidate ID, and coordinates.

Exit is all-or-nothing. If every requested occupant cannot receive a safe position, `exitGarrison` returns `exit-blocked` and does not change occupancy. Successful exit returns immutable placement and world-restoration transitions.

## Building clearing

`resolveGarrisonClearance` accepts hostile living infantry and an injected deterministic random source. Attackers and defenders are processed in stable ID order. Clearing power, breach bonus, host-kind defense, and occupant defense determine bounded elimination probability. Failed attacks may produce deterministic attacker casualties. When the final defender is removed, control transfers to the clearing team by default.

The function emits casualty IDs and exchange records; it does not mutate unit hit points, remove entities, or create effects.

## Destruction evacuation

`resolveGarrisonDestruction` resolves each occupant's survival using the host-kind policy and an injected deterministic random source. Survivors then require caller-provided safe exit candidates. A survivor without a valid placement becomes a casualty. The host is marked destroyed, occupancy is emptied, and survivor placement transitions are returned for the authoritative lifecycle owner.

UFR-044 remains the owner of the general damaged/burning/wreck lifecycle. It may call this policy when a garrison-capable host crosses its destruction boundary.

## Integration boundaries

- UFR-026 transport code owns passenger mutation and disembark placement; this module only emits compatible transport transitions.
- UFR-034 cover/concealment code consumes the snapshot's `building` or `trench` terrain classification.
- Active navigation and command tasks own path requests, entry movement, cursor modes, and command-card actions.
- Renderer/UI tasks may consume snapshots and reason-specific results but must not change occupancy, casualty, or placement outcomes.
- Faction/content tasks own which entities are garrison-capable, capacities, slot costs, and clearing abilities.
