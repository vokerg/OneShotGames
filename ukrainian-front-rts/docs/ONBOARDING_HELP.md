# Onboarding help, glossary, and control reference

## Ownership

UFR-140 adds a presentation-only onboarding and reference surface.

- `src/ui/onboarding-help.js` owns the searchable catalog, hint persistence, contextual hint dispatch, F1 interaction, overlay, localization adapter, and teardown.
- `src/localization/onboarding-help-catalogs.js` owns structurally matched English and Ukrainian help, tutorial, glossary, control, tooltip, and status messages.
- `src/ui/onboarding-help-bootstrap.js` acquires storage safely and installs the surface.
- `src/ui/viewport-runtime-bootstrap.js` loads onboarding before the general UI viewport runtime.

The feature does not wrap or replace `Game` methods, issue commands, change tutorial progression, or own input bindings. It reads existing contracts:

- UFR-093 `TUTORIAL_STEPS` for stable guide IDs, topics, and event metadata;
- UFR-141 live input bindings for the control reference;
- UFR-143 locale-change events for reversible English/Ukrainian presentation.

## Player access

- Press **F1** to open or close the field manual.
- Use the localized **Help / Допомога** button in the top bar.
- Search across guides, controls, and glossary terms in English or Ukrainian.
- Filter to a single section.
- Use the localized reset action to replay onboarding prompts.

The control section reflects the current runtime key bindings, including rebinding and unbound actions. It does not maintain a second key map. The catalog resolves the live binding profile whenever help is rendered or searched, so an already-installed help surface does not retain stale labels after a rebind.

## Localization

The help surface starts from the current document locale and listens for `fields-of-resolve:localechange`. A locale switch rebuilds the catalog and rerenders open results and active hints without replacing persisted hint IDs or simulation state. Search tokenization accepts Unicode letters and numbers, allowing Ukrainian terms such as `туман війни` to resolve normally.

English and Ukrainian catalogs use the repository localization schema and are validated for exact key, message-shape, plural, and placeholder parity. Tutorial IDs remain canonical and language-neutral; localized text is derived from those IDs rather than persisted.

## First-time and contextual hints

Tutorial steps are the canonical hint source. Seen and dismissed hint IDs are stored under:

`fields-of-resolve:onboarding-help:v1`

The first available hint appears on initial startup. Contextual hints can be raised through:

```js
window.dispatchEvent(new CustomEvent('fields-of-resolve:onboarding-context', {
  detail: { topic: 'minimap' },
}));
```

The installer also recognizes interactions with objectives, minimap, economy/production, accessibility settings, selection, and the battlefield canvas. A topic is shown once unless hints are reset. Players can dismiss one hint or all hints without affecting tutorial mission progress.

The diagnostic API is available while installed:

```js
window.__fieldsOfResolveOnboarding.open();
window.__fieldsOfResolveOnboarding.notify('production');
window.__fieldsOfResolveOnboarding.search('attack move');
window.__fieldsOfResolveOnboarding.reset();
window.__fieldsOfResolveOnboarding.snapshot();
```

The snapshot includes the active locale. Search and open calls refresh both locale text and the live runtime binding profile before returning results.

## Accessibility and modal behavior

The help surface is an `aria-modal` dialog with a localized labelled title, searchable native controls, localized status announcements, keyboard-close behavior, and focus recovery to the Help button. Hint prompts use a polite live region and do not depend on animation. F1 is ignored while editing text, select, or content-editable controls.

## Teardown

Disposal removes:

- the F1 and Escape listener;
- contextual click, locale-change, and custom-event listeners;
- the pending first-time-hint timer;
- the top-bar Help button;
- the help dialog and hint surface;
- the global diagnostic API.

Timer cancellation is best-effort and cannot interrupt the rest of teardown if a host implementation rejects cancellation. No timer callback can display a hint after disposal, and no simulation or command state is retained.

## Verification

Focused tests cover:

- complete tutorial/control/glossary catalog composition;
- English/Ukrainian catalog parity, Cyrillic search, and runtime locale switching;
- live binding inversion, post-install rebinding, and unbound actions;
- multi-token search and category filtering;
- deterministic persistence, malformed-storage normalization, dismiss, dismiss-all, and reset behavior;
- first-run hint scheduling and timer cancellation;
- F1 opening, contextual custom events, global API, and exact teardown.

The assembled browser smoke verifies that the new bootstrap coexists with normal startup and mission selection. Manual player verification should additionally check top-bar layout in both locales, focus movement, search interaction, hint placement at supported viewport sizes, and current rebound keys.
