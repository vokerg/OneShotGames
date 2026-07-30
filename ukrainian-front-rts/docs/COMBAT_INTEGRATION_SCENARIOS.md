# Combat integration scenarios

UFR-050 is the Gate B1 integration contract. It does not create another combat engine. The scenario suite imports the public policies and state machines delivered by UFR-031 through UFR-049 and asserts that their outputs compose deterministically.

## Coverage map

| Scenario | Contracts exercised | Observable acceptance |
| --- | --- | --- |
| Counter matrix | UFR-031 | Every damage, armor, resistance, target-domain, and splash class is valid; every armor class has at least one effective counter. |
| Cover and concealment | UFR-034 | None, light, heavy, and fortified cover are monotonically protective; partial and dense concealment affect accuracy without changing damage. |
| Visibility under smoke | UFR-032, UFR-033, UFR-036, UFR-040 | Authoritative sight hides smoke-obscured targets, target policy rejects them, and projectile resolution consumes the same smoke effect deterministically. |
| Suppression and morale | UFR-010, UFR-035 | Steady, shaken, pinned, and broken states are reached at exact thresholds; order restrictions, command support, recovery, and alert events remain consistent. |
| Ability targeting | UFR-041 | Point, unit, area, direction, self, toggle, and channel modes acquire, validate, activate, cancel, or complete through one targeting contract. |
| Area damage | UFR-042 | Falloff, friendly fire, structure scaling, stable target order, and presentation-only effect descriptors compose without live references. |
| Reconnaissance-strike/air-defense chain | UFR-037, UFR-038, UFR-039 | A launched drone enables observed artillery; unspotted fire is rejected; air defense detects, prioritizes, launches, reserves damage, and resolves deterministic interception. |
| Repair and destruction | UFR-043, UFR-044 | Repair is bounded before destruction; direct and burning destruction create wrecks; salvage, wreck damage, and manual clearance terminate in valid obstruction states. |
| Kill attribution and stances | UFR-032, UFR-036, UFR-045, UFR-046 | Projectile damage preserves source attribution, XP is awarded exactly once, and return-fire retaliation selects the remembered attacker deterministically. |
| Garrison demolition | UFR-041, UFR-047, UFR-048 | Engineer demolition targets an occupied position and deterministic destruction evacuation reports survivors and casualties. |
| Combat readability | UFR-049 | Range rings, target lines, status cues, and damage cues are stable, immutable, ordered presentation snapshots. |

## Determinism rules

- Random outcomes use injected, finite sequences rather than ambient randomness.
- Entity and target ordering is asserted by stable IDs.
- Scenario outputs are reference-free where the owning contract promises snapshots or events.
- The suite does not mutate source contract constants or introduce cross-system hidden bonuses.
- A failing scenario identifies the owning UFR task and should be fixed at that public boundary rather than patched inside the integration test.

## Completion gate

UFR-050 is complete only when:

1. the focused integration suite passes with identical results on repeated runs;
2. every required category in the task row is represented;
3. any newly exposed P0 combat defect is fixed or explicitly prevents completion;
4. repository verification is run where the execution environment permits it;
5. the branch-local claim is replaced with completion evidence only after those conditions hold.
