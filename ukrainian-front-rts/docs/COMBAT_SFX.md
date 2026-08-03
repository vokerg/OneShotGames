# Combat SFX production

UFR-126 owns the original combat-SFX asset family and the audio-owned adapter that connects declared cue IDs to the UFR-125 event-map and UFR-124 mixer contracts. It does not own combat outcomes, event emission timing, UI sounds, ambience, music, voice, or settings.

## Asset families

The versioned catalog at `assets/audio/combat/manifest.json` contains one-shot cues for:

- rifle, machine-gun, and cannon fire;
- soft-ground and armor impacts;
- field explosions;
- vehicle-track movement and drone passes;
- artillery firing and air-defense launches;
- vehicle destruction;
- field repair and construction work.

Each entry records its stable cue and asset IDs, UFR-125 policy event, family, packed WAV bank, offset/duration, PCM format, peak, SHA-256, loop policy, and complete provenance.

## Original synthesis and provenance

All banks are generated from repository-owned deterministic synthesis recipes in `scripts/lib/combat-sfx-generator.mjs`. No recording, sample library, model output, or other external audio input is used. The outputs are three compact mono 16-bit PCM WAV banks at 12 kHz, normalized to a peak ceiling of 0.92, and released as `CC0-1.0` for redistribution with the game.

Regenerate assets:

```bash
node scripts/build-combat-sfx.mjs
```

Check that committed bytes and metadata are reproducible:

```bash
node scripts/build-combat-sfx.mjs --check
node scripts/verify-combat-sfx.mjs
```

## Integration boundary

`src/audio/combat-sfx-catalog.js` validates the manifest and creates an exact one-asset UFR-125 policy map for every cue. This preserves the shared event taxonomy without relying on hash collisions or adding asset-family IDs to the global event contract.

`src/audio/combat-sfx-runtime.js` owns presentation-only integration:

1. fetch each declared WAV bank relative to the catalog URL;
2. reject byte-length or SHA-256 drift;
3. decode each bank once through `audioMixer.decodeAudioData()`;
4. resolve cooldown, concurrency, attenuation, and availability through UFR-125;
5. admit against current mixer capacity;
6. play the cue slice through the `sfx` bus with a stable concurrency tag, offset, and duration.

`installCombatSfxDomainAdapter()` subscribes only to `audio.request`. The payload uses `{ cue, faction?, distance?, gain?, variantKey? }`; authoritative producers supply event tick and sequence through the domain stream. Playback success or failure never changes gameplay state.

UFR-126 does not install new simulation producers. Combat-system owners may emit a declared cue only after their authoritative mutation succeeds. A later assembled runtime task may compose a shared domain stream, mixer, and this adapter when the application owns that complete lifecycle.

## Failure behavior

Missing, corrupt, hash-mismatched, undecodable, locked, paused, out-of-range, cooldown-limited, concurrency-limited, or voice-limited audio fails closed with stable reasons. Asset failures are retained in the runtime snapshot and never throw through simulation or UI code.
