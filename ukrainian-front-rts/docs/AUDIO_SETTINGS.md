# Audio settings and hearing-accessibility ownership

UFR-131 owns the persistent audio settings model in `src/audio/audio-settings.js`, the browser-owned settings and accessibility adapter in `src/audio/audio-settings-ui.js`, and the corresponding markup and styling in `index.html` and `audio-settings.css`.

## Settings contract

The storage record uses schema `fields-of-resolve.audio-settings`, version `1`, under the key `fields-of-resolve.audio-settings.v1`. The normalized record contains:

- requested levels and mute state for `master`, `music`, `sfx`, `voice`, and `ambience`;
- `full`, `reduced`, or `night` dynamic-range mode;
- `pause`, `mute`, or `continue` background-tab policy;
- independent subtitle, speaker-label, and important-audio visual-cue preferences.

Loading and migration are fail-closed. Missing, malformed, inaccessible, incompatible, or future-version storage falls back to immutable defaults without blocking application startup. Writes are best effort and expose a persistence status to the UI. A mixer mutation failure does not publish or persist a partially applied settings record; the controller restores the previous complete mix, or raises an aggregate error if rollback itself fails.

## Requested and effective levels

Sliders preserve the player-requested level. Dynamic-range profiles derive deterministic effective mixer gains without rewriting those requested values:

| Mode | Master | Music | SFX | Voice | Ambience |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| Reduced | 0.92 | 0.82 | 0.78 | 1.00 | 0.86 |
| Night | 0.72 | 0.58 | 0.48 | 1.00 | 0.62 |

UFR-131 owns this settings policy, not final mastering. UFR-132 retains loudness, clipping, compressor/limiter, concurrency, target-browser, autoplay, and full-campaign mix QA.

## Browser lifecycle

`src/main.js` constructs one UFR-124 mixer and installs the audio settings adapter through the deterministic application composition registry. The adapter:

- applies the persisted mix before audio unlock;
- binds Web Audio unlock to user gestures and removes those listeners after success or disposal;
- pauses, temporarily mutes, or continues audio when document visibility changes according to policy;
- restores the exact configured master-mute state when the tab becomes visible;
- owns the modal DOM listeners, focus trap, background `inert` state, storage controller, visibility listener, visual-cue timer, and mixer disposal;
- exposes read-only diagnostics through `window.__fieldsOfResolveComposition.audio()`.

Composition rollback and page teardown call the same disposer. Presentation failure must not alter simulation state or prevent startup.

## Hearing accessibility

Voice mute and subtitle visibility are independent. A player may mute voice while retaining subtitles and speaker labels. Speaker-label preference remains stored when subtitles are temporarily disabled, while the effective voice preference suppresses labels until subtitles are enabled again.

Important `audio.request` events may be projected into a polite live-region cue with a stable label, urgency, source, and direction. The adapter fails closed when no domain event stream is installed, and the settings screen includes a test cue so the visual-equivalent preference is directly observable without requiring an audio asset. The runtime does not infer gameplay outcomes from these cues.

## UI and input behavior

The audio settings panel is an accessible modal dialog. Opening it:

- records and later restores the invoking control;
- moves focus to the close control;
- traps Tab and Shift+Tab inside the dialog;
- captures Escape and gameplay key events before battlefield input;
- marks the application shell `inert` and `aria-hidden` until the dialog closes.

All controls are native labels, ranges, checkboxes, selects, buttons, outputs, and live regions. The layout remains usable in narrow desktop viewports and uses the production UI skin variables.

## Evidence boundary

UFR-131 can reach `RUNTIME_INTEGRATED` when the assembled application installs this lifecycle, exact-head verification passes, and browser startup smoke exercises the mounted panel. It does not claim `PLAYER_VERIFIED` without human audible review of per-bus levels, dynamic-range modes, mute, tab transitions, subtitles, speaker labels, and visual cues. Production audio assets and full audio QA remain owned by UFR-126 through UFR-130 and UFR-132 respectively.
