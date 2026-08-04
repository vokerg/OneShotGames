# Biome ambience ownership

UFR-128 owns the browser-independent ambience presentation contract in `src/audio/biome-ambience.js`.

The contract provides deterministic eight-second mono loops for three terrain biomes (`donbas`, `zaporizhzhia`, and `kherson`), day/night periods, clear/wind/rain weather, and calm/tense/battle intensity. Every descriptor routes to the `ambience` mixer bus and records CC0-1.0 provenance for repository-owned synthesis.

## Boundaries

- Simulation and mission systems own biome, weather, time-of-day, and battle-intensity state.
- A later shared audio lifecycle may resolve that state through `resolveAmbience()`, synthesize or cache the selected loop, and crossfade through the UFR-124 mixer.
- This module does not read game state, browser APIs, DOM state, maps, or the renderer.
- It does not own adaptive music, combat/UI sound effects, voice, settings UI, or autoplay-unlock behavior.
- Invalid presentation inputs fail closed to `ambience.donbas.day.clear.calm` with a stable reason rather than throwing through a runtime adapter.

## Verification

`tests/audio/biome-ambience.test.mjs` covers complete matrix coverage, immutability, deterministic reproduction, bounded peaks, meaningful variation, provenance, and fallback behavior. `scripts/verify-biome-ambience.mjs` is part of the authoritative verifier and checks all 54 descriptors plus the highest-energy rain and battle loops.

The task reaches `CONTRACT_COMPLETE` when those checks pass in CI. It does not claim `RUNTIME_INTEGRATED` until the assembled application installs a shared ambience lifecycle and supplies live biome/weather/period/intensity producers, or `PLAYER_VERIFIED` until audible browser review covers transitions, looping, mix balance, pause/resume, mute, and background-tab behavior.
