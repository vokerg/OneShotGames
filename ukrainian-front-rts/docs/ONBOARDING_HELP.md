# Onboarding help, glossary, and control reference

## Ownership

UFR-140 adds a presentation-only onboarding and reference surface.

- `src/ui/onboarding-help.js` owns the searchable catalog, hint persistence, contextual hint dispatch, F1 interaction, overlay, and teardown.
- `src/ui/onboarding-help-bootstrap.js` acquires storage safely and installs the surface.
- `src/ui/viewport-runtime-bootstrap.js` loads onboarding before the general UI viewport runtime.

The feature does not wrap or replace `Game` methods, issue commands, change tutorial progression, or own input bindings. It reads existing contracts:

- UFR-093 `TUTORIAL_STEPS` for guide prompts and hints;
- UFR-141 live input bindings and labels for the control reference.

## Player access

- Press **F1** to open or close the field manual.
- Use the **Help** button in the top bar.
- Search across guides, controls, and glossary terms.
- Filter to a single section.
- Use **Reset first-time hints** to replay onboarding prompts.

The control section reflects the current runtime key bindings, including rebinding and unbound actions. It does not maintain a second key map.

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

## Accessibility and modal behavior

The help surface is an `aria-modal` dialog with a labelled title, searchable native controls, status announcements, keyboard-close behavior, and focus recovery to the Help button. Hint prompts use a polite live region and do not depend on animation. F1 is ignored while editing text, select, or content-editable controls.

## Teardown

Disposal removes:

- the F1 and Escape listener;
- contextual click and custom-event listeners;
- the top-bar Help button;
- the help dialog and hint surface;
- the global diagnostic API.

No timers continue after disposal, and no simulation or command state is retained.

## Verification

Focused tests cover:

- complete tutorial/control/glossary catalog composition;
- live binding inversion and unbound actions;
- multi-token search and category filtering;
- deterministic persistence, dismiss, dismiss-all, and reset behavior;
- first-run hint scheduling;
- F1 opening, contextual custom events, global API, and exact teardown.

The assembled browser smoke verifies that the new bootstrap coexists with normal startup and mission selection. Manual player verification should additionally check top-bar layout, focus movement, search interaction, hint placement at supported viewport sizes, and current rebound keys.
