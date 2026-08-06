# Localization

UFR-143 owns the English/Ukrainian player-facing string contract for the assembled browser runtime. The localization layer is presentation-only: it does not mutate simulation state, campaign progression, command semantics, saves, balance, or content identities.

## Authoritative files

- `src/localization/localization.js` — immutable catalog schema, locale normalization, fallback, interpolation, plural selection, and number/date/list formatting.
- `src/localization/catalogs.js` — reusable English and Ukrainian message foundation.
- `src/localization/runtime-catalogs.js` — assembled shell, mission framing, command guidance, selection status, audio/accessibility, wave, and endgame copy.
- `src/localization/runtime-localization.js` — reversible DOM adapter, locale persistence, root-language metadata, ARIA/tooltips, locale control, font fallback, diagnostics, and teardown.
- `src/ui.js` — consumes localization keys for dynamic mission and battlefield presentation.

English (`en`) is the fallback and source-review locale. Ukrainian (`uk`) must retain exact key, message-shape, and placeholder parity with English. Catalog order is deterministic: `en`, then `uk`.

## Key and placeholder rules

Use dotted semantic keys rather than English prose as identifiers. Keep runtime ownership under `runtime.<surface>.<message>`, such as `runtime.commands.attackMove` or `runtime.audio.subtitles`.

Placeholders use `{name}` syntax and must match exactly between locales. Plural messages must expose the same plural object shape and placeholders in every locale. Do not concatenate translated fragments when one complete message with placeholders can preserve Ukrainian word order.

The verifier rejects missing keys, extra keys, duplicate locale entries, shape mismatches, placeholder mismatches, empty messages, unsupported control/private-use characters, malformed locale tags, and invalid formatting values.

## Translation workflow

1. Add or revise the English source message in the appropriate catalog surface.
2. Add the Ukrainian translation in the same change with identical placeholders and plural shape.
3. Use the key from runtime code; do not introduce a second hard-coded player-facing copy of the same concept.
4. Run `node --test tests/localization` and `node scripts/verify-localization.mjs`.
5. Run `bash verify.sh` and the Chromium localization smoke before claiming completion.
6. Review Ukrainian copy for terminology, sentence-level context, grammatical number, UI expansion, tooltip/ARIA equivalence, and sensitive historical framing.

Machine validation proves structural parity, not linguistic quality. A Ukrainian-language reviewer remains the authority for idiom, tone, terminology, and culturally sensitive phrasing.

## Runtime behavior

The top-bar language control switches between English and Ukrainian without restarting the mission or changing simulation state. The selected locale is stored under `fields-of-resolve.locale.v1`, reapplied after reload, reflected in `<html lang>` and `data-locale`, and announced through `fields-of-resolve:localechange`.

`window.__fieldsOfResolveLocalization` exposes read-only locale selection, translation, subscription, diagnostics, and disposal for browser verification and composition owners. Disposal removes the injected control and style, restores original static DOM copy/attributes, restores document metadata, and removes the diagnostic global.

## Fonts and expansion

The adapter owns a UTF-8 Latin/Cyrillic fallback stack:

```text
"Noto Serif", "DejaVu Serif", Georgia, Cambria, serif
```

The browser smoke verifies Ukrainian-specific glyph probes, font readiness, measurable rendering, zero missing DOM bindings, and no top-bar overflow at 1920×1080. UI authors must still avoid fixed text widths and must review longer Ukrainian copy at supported viewports.

## Evidence boundary

Automated unit, verifier, and Chromium coverage establishes runtime integration and reversible switching. It does not establish native-speaker sign-off, exhaustive translation of authored mission/unit names and narrative content, or human playthrough at every viewport. Those remain follow-up review and player-verification work.
