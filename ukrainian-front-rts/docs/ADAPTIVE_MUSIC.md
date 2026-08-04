# Adaptive music

UFR-129 defines the original adaptive score contract for Fields of Resolve. It is a presentation-only audio family layered on the UFR-124 mixer and UFR-125 `music.state` event policy. It does not own campaign progression, mission outcomes, combat intensity, pause state, or UI navigation.

## Score states

The versioned catalog covers exactly eight states:

| State | Intended presentation signal |
| --- | --- |
| `menu` | Operations screen and non-mission navigation. |
| `briefing` | Mission briefing and loading flow. |
| `calm` | Battlefield intensity below 0.25. |
| `tension` | Battlefield intensity at or above 0.25. |
| `battle` | Battlefield intensity at or above 0.55. |
| `crisis` | Battlefield intensity at or above 0.82. |
| `victory` | Explicit victorious mission outcome. |
| `defeat` | Explicit defeat or withdrawal outcome. |

The battlefield thresholds are presentation policy, not simulation rules. A composition owner must derive the normalized `intensity` signal from read-only authoritative state and pass the current fixed tick into the director.

## Deterministic transitions

`chooseAdaptiveMusicState()` applies precedence in this order:

1. explicit victory, defeat, or withdrawal outcome; withdrawal uses the restrained defeat score;
2. operations/menu stage;
3. briefing/loading stage;
4. debrief fallback;
5. battlefield intensity with downward hysteresis.

Hysteresis prevents rapid oscillation: crisis holds to 0.72, battle to 0.45, and tension to 0.18. `createAdaptiveMusicDirector()` also requires 120 fixed ticks of dwell between ordinary battlefield changes. Stage changes and outcomes bypass dwell. Tick regression, malformed context, and playback failure are contained and do not commit a new director state. Stable updates reconcile the current tagged loop, so initial menu music starts and externally stopped playback can recover without changing score state.

## Original synthesis and looping

`src/audio/adaptive-music-synthesis.js` contains all source recipes. No recordings, sample libraries, model outputs, network requests, or third-party packages are used. Each state renders a four-second mono 16-bit PCM loop at 12 kHz with a 0.72 peak ceiling.

Tonal layers use integer cycles across the loop and every sample is multiplied by a periodic edge envelope. This keeps the first and final PCM samples effectively equal and prevents a discontinuity at the Web Audio loop boundary. The runtime synthesizes and decodes each state once; review WAVs can be emitted with:

```bash
node scripts/build-adaptive-music.mjs
```

Generated review files belong under `artifacts/adaptive-music/` and are not source-controlled duplicates of the recipes.

## Runtime boundary

`createAdaptiveMusicRuntime()`:

- validates `assets/audio/music/manifest.json`;
- synthesizes the eight declared banks and optionally verifies their SHA-256 digests;
- decodes through the shared UFR-124 mixer;
- resolves each state through an exact UFR-125 `music.state` map;
- replaces only voices tagged `adaptive-music` on the `music` bus;
- starts the selected buffer with `loop: true`;
- delegates global pause/resume to the mixer;
- permits preload retry after transient synthesis or decode failure;
- stops its tagged voice and releases decoded references on disposal.

The runtime does not create an `AudioContext`, bind autoplay gestures, mutate campaign/UI state, or dispose the shared mixer. It must be installed and torn down by a later composition owner.

## Failure and evidence limits

Unknown states, unavailable buffers, invalid gain/tick data, mixer inspection failures, decode failures, and playback exceptions return stable failure results rather than escaping into gameplay. Runtime digest checks are optional because synthesized floating-point output may differ across JavaScript engines; canonical hashes remain mandatory in the Node verifier.

UFR-129 reaches `CONTRACT_COMPLETE`. The assembled application does not yet construct the director, derive a live intensity signal, or audibly exercise transitions in a browser, so this task does not claim `RUNTIME_INTEGRATED` or `PLAYER_VERIFIED`.

## Verification

```bash
node --check src/audio/adaptive-music-synthesis.js
node --check src/audio/adaptive-music.js
node --test tests/audio/adaptive-music*.test.mjs
node scripts/verify-adaptive-music.mjs
node scripts/build-adaptive-music.mjs artifacts/adaptive-music
bash verify.sh
```

The focused suite covers full state/provenance coverage, PCM metadata, peak ceilings, canonical hashes, loop boundaries, thresholds, hysteresis, dwell, immediate stage/outcome transitions, withdrawal compatibility, tick regression, malformed context containment, initial/stable reconciliation, mixer routing, duplicate-start prevention, external voice-loss recovery, pause/resume, disposal, and transient preload recovery.
