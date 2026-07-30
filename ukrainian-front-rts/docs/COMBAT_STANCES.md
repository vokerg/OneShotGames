# Combat stances

## Purpose

UFR-046 adds explicit rules of engagement for Ukrainian combat units without replacing target scoring, attack orders, tactical commands, or navigation. Stance state is authoritative and deterministic; the command card only invokes the public stance boundary.

## Stances

- **Return Fire** remembers the most recent projectile attacker for eight simulation seconds and engages that attacker only while it is inside weapon range.
- **Hold Fire** disables automatic acquisition. Explicit attack and attack-move orders remain valid.
- **Fire at Will** automatically engages hostile targets already inside weapon range but does not pursue them.
- **Defensive** acquires contacts inside normal sight and may pursue while the target remains inside a short leash anchored where the stance was selected.
- **Aggressive** expands acquisition to 160% of normal sight and uses a wider pursuit leash.
- **Hold Position** reuses the UFR-027 hold-position command, cancelling movement and queued orders while retaining local weapon response.

Changing away from Hold Position removes only the tactical hold state. Patrol, guard, follow, return-for-repair, explicit attack, and attack-move orders otherwise remain command owners and suppress idle stance acquisition while active.

## Deterministic acquisition

`src/systems/stance-system.js` consumes the UFR-036 target policy. Candidate descriptors include domain, distance, threat, damage potential, health pressure, and retaliation identity. Equal target scores use stable entity IDs.

Each stance selection records an immutable origin point. Defensive and aggressive pursuit evaluate the chosen target against that origin and their bounded leash. Fire-at-will, return-fire, and hold-position targets must already be in weapon range, so they never create chase movement.

Idle stance intent is projected as a transient attack order immediately before the existing fixed-step update and removed immediately afterward. Explicit or tactical orders are never replaced by a stance projection.

## Retaliation ownership

A successful projectile impact records the source unit ID and simulation time on the target before damage is applied. Misses, friendly sources, invalid sources, and same-team impacts do not create retaliation state. The state is reference-free and expires by simulation time, not wall-clock time.

## Compatibility

- `toggleAutoFire()` remains available. It maps the legacy toggle to Hold Fire and Fire at Will.
- New units default to Fire at Will.
- Mission restart initializes missing stance state without replacing authored stance values.
- Presentation reads `game.combatStanceSnapshot(unit)` and changes state only through `game.setSelectedCombatStance(stance)`.
- The controller installs before UFR-027 tactical commands so tactical preparation runs first and stance projection runs only after tactical orders have been established.

## Browser checklist

1. Select armed Ukrainian units and confirm six stance buttons appear.
2. Verify Hold Fire prevents idle firing but an explicit right-click attack still works.
3. Let an enemy hit a Return Fire unit and confirm it fires back only when the attacker is in range.
4. Confirm Fire at Will fires locally without chasing.
5. Confirm Defensive pursues nearby contacts but returns to inactivity outside its leash.
6. Confirm Aggressive acquires farther contacts and pursues farther than Defensive.
7. Confirm Hold Position cancels movement and queued orders while allowing local fire.
8. Switch away from Hold Position and verify patrol, guard, follow, and ordinary movement can be issued normally.
9. Verify attack-move, force-fire, transport, gathering, production, minimap navigation, WASD, and construction placement remain functional.
10. Restart a mission and verify units return to Fire at Will unless future authored content supplies another stance.

## Verification

Focused commands:

```bash
node --check src/core/stance-contract.js
node --check src/systems/stance-system.js
node --check src/ui/stance-command-card.js
node --check src/systems/projectile-system.js
node --check src/main.js
node --check tests/systems/stance-system.test.mjs
node --check tests/ui/stance-command-card.test.mjs
node --test tests/systems/stance-system.test.mjs tests/ui/stance-command-card.test.mjs
```
