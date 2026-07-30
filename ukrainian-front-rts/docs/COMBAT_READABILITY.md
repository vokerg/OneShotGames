# Combat readability presentation

UFR-049 adds a deterministic presentation layer over authoritative combat state. `src/ui/combat-readability.js` owns immutable semantic snapshots; the runtime, renderer, and HUD adapters consume those snapshots without deciding hits, damage, visibility, suppression, morale, penetration, targeting, or orders.

## Semantic contract

The versioned state stores the damage-number preference, a bounded transient-cue queue, and a monotonic cue sequence. Supported cue families are incoming threats, status changes, armor outcomes, impacts, and optional damage values.

Cue records contain stable source/target IDs, world positions, creation ticks, bounded durations, severity, optional text/value, and hit/miss/deflect/penetrate outcomes. They contain no DOM, canvas, audio, or mutable entity references.

Determinism rules:

- cue IDs derive from family and sequence unless explicitly authored;
- stable deduplication replaces repeated incoming or status alerts;
- expiration occurs on exact simulation ticks;
- overflow retains the newest cues;
- snapshot order is severity, family, creation tick, then sequence;
- range rings and target lines are sorted by stable entity ID.

## Authoritative event adaptation

`src/ui/combat-readability-runtime.js` consumes the UFR-010 domain-event stream.

- A shot event is emitted only after `Game.shoot()` creates its projectile.
- An impact event is emitted by `projectile-system.js` only after hit resolution and damage application.
- Displayed damage is capped to HP actually removed.
- Explicit or inferred hit, miss, deflect, and penetration outcomes become semantic impact/armor cues.
- UFR-035 `unit-status` alerts become suppression/morale cues at the authoritative entity position.
- Existing shared event streams are preserved and are never drained by this presentation controller.

Gameplay remains valid when no presentation consumer is installed.

## Selection overlays

Selected armed units expose maximum weapon range. Minimum range is read from stat metadata or the UFR-037 artillery configuration. Selected explicit, point, or acquired targets expose source-to-target command lines.

`src/render/combat-readability-overlay.js` draws:

- maximum and minimum range rings;
- target lines;
- incoming-fire arcs;
- status, armor, hit/miss, and damage labels.

The overlay runs after the existing base renderer and restores the original renderer method exactly when disposed.

## HUD and preference

`src/ui/combat-readability-feedback.js` adds a Damage Numbers ON/OFF command for armed selections and announces each incoming cue once through the existing toast surface.

The preference is stored at `fields-of-resolve:combat-readability` with schema version `1`. Missing, corrupt, or unavailable storage safely defaults to damage numbers enabled. Disabling the preference immediately removes queued damage values and suppresses new ones without changing combat telemetry.

## Ownership boundaries

- UFR-031 through UFR-048 own combat mechanics and authoritative results.
- UFR-049 owns semantic combat presentation, event adaptation, overlays, incoming feedback, and the damage-number preference.
- UFR-133 owns general HUD regions, screen/modal architecture, focus, and refresh policy.
- Later art/audio tasks may replace visual styling or add sound, but must consume these semantic facts rather than recreate combat logic.

## Verification

Run from `ukrainian-front-rts/`:

```bash
node --check src/ui/combat-readability.js
node --check src/ui/combat-readability-runtime.js
node --check src/ui/combat-readability-feedback.js
node --check src/render/combat-readability-overlay.js
node --check src/systems/projectile-system.js
node --check src/main.js
node --test \
  tests/ui/combat-readability.test.mjs \
  tests/ui/combat-readability-runtime.test.mjs \
  tests/ui/combat-readability-overlay.test.mjs \
  tests/ui/combat-readability-feedback.test.mjs \
  tests/combat/projectile-readability-events.test.mjs
bash verify.sh
```

Focused connector reconstruction: **26 tests passed, 0 failed**. The original semantic-contract suite contributed nine tests; the final event/runtime/renderer/HUD integration contributed seventeen. Native full-repository verification, `./run.sh`, and interactive browser playtesting were unavailable because the connector environment cannot obtain a complete checkout.
