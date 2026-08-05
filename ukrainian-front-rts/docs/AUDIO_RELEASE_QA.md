# Audio release QA and provenance gate

UFR-132 converts the merged audio lane into an enforceable release gate. The gate treats repository manifests and deterministic synthesis recipes as the source assets. Generated WAV banks and procedural ambience buffers are build/runtime outputs; they are not duplicated as committed binaries.

## Release inventory

| Family | Runtime bus | Source of truth | Minimum coverage | Peak ceiling | Redistribution |
| --- | --- | --- | ---: | ---: | --- |
| Combat effects | `sfx` | `assets/audio/combat/manifest.json` plus `scripts/build-combat-sfx.mjs` | 12 cues | 0.921 | CC0-1.0, allowed |
| Interface and mission effects | `sfx` | `assets/audio/ui/manifest.json` plus `scripts/build-ui-sfx.mjs` | 17 cues | 0.861 | CC0-1.0, allowed |
| Adaptive score | `music` | `assets/audio/music/manifest.json` plus `scripts/build-adaptive-music.mjs` | 8 states | 0.720 | CC0-1.0, permitted with recipe and manifest |
| Voice hooks and subtitles | `voice` | `assets/audio/voice/manifest.json` | 8 localized hook variants | no binary asset | CC0-1.0, metadata/subtitles redistributable |
| Biome ambience | `ambience` | `src/audio/biome-ambience.js` | 54 deterministic contexts | 0.860 | CC0-1.0, allowed |

The machine-readable ledger is `assets/audio/release-qa.json`. Every record must retain its creator, source, license, redistribution policy, generator, external-input list, and public-figure impersonation guard. The current release ledger permits no external samples, models, recordings, or network inputs.

## Automated quality controls

`scripts/verify-audio-release-qa.mjs` rebuilds all deterministic banks, compares manifests, verifies SHA-256 values and PCM16 structure, measures waveform peaks, synthesizes every ambience context, scans for undeclared committed media, detects missing or orphaned generated paths, and validates campaign music/ambience coverage.

The release ceiling is 0.95 full scale with at least 0.44 dB headroom. Family ceilings are intentionally stricter. A manifest value cannot substitute for waveform evidence: generated bank bytes are inspected during verification.

## Simultaneous playback budget

The mixer limit remains 32 voices. Release admission reserves:

| Bus | Voice budget |
| --- | ---: |
| Music | 2 |
| Sound effects | 20 |
| Voice | 4 |
| Ambience | 2 |

Four mixer slots remain unreserved for lifecycle and transition safety. Overflow is handled deterministically by priority, then oldest request, then stable ID. Rejections retain `bus-budget` or `global-budget` reasons; overload must not throw or reorder admitted voices based on producer iteration order.

## Campaign context matrix

| Context | Required score states | Required ambience coverage |
| --- | --- | --- |
| Menu | `menu` | none |
| Briefing | `briefing` | Donbas, Zaporizhzhia, Kherson |
| Calm battlefield | `calm` | Donbas, Zaporizhzhia, Kherson |
| Battlefield pressure | `tension`, `battle`, `crisis` | Donbas, Zaporizhzhia, Kherson |
| Victory debrief | `victory` | none |
| Defeat or withdrawal debrief | `defeat` | none |

## Browser lifecycle evidence

`scripts/browser-audio-release-smoke.mjs` loads the assembled application in Chromium and records the actual shared mixer lifecycle:

1. startup remains `locked` before user activation;
2. a trusted pointer gesture unlocks the context;
3. the `pause` background policy suspends audio when the document becomes hidden;
4. foreground restoration resumes the context;
5. no page exception, failed asset load, autoplay error, or mixer diagnostic error is accepted.

The workflow uploads `artifacts/audio-release-browser-smoke.json` with the lifecycle trace and mixer diagnostics.

## Verification

```bash
node --test tests/audio/audio-release-qa.test.mjs
node scripts/verify-audio-release-qa.mjs
bash verify.sh
node scripts/browser-startup-smoke.mjs
node scripts/browser-audio-release-smoke.mjs
```

The task reaches release evidence only when the exact PR head passes the assembled verifier and both mounted browser smokes. A missing browser executable or unavailable authoritative run keeps the PR draft rather than weakening the gate.
