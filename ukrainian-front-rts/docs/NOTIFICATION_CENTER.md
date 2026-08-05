# Notification center and message history

Task: UFR-144  
Contract: `fields-of-resolve.notification-center` version 1

## Ownership

`src/ui/notification-center.js` owns notification presentation, bounded retention, anti-spam collapse, the live feed, message-history controls, and navigation from a notice back to a battlefield entity. It reads completed simulation state and existing research records; it never changes objective, combat, production, research, or save authority.

The top-level `UI` constructor installs the component because UFR-144 is a self-contained UI extension. The component dynamically mounts its own semantic DOM and `notification-center.css`, so it does not compete with active work in `index.html`, `src/main.js`, bootstrap, minimap, command-card, tech-tree, economy, or shared-skin files.

## Sources

At each normal UI refresh, the adapter compares two immutable observations and publishes only completed presentation changes:

- incomplete-to-complete mission objectives;
- health loss for Ukrainian units or buildings;
- a removed production item paired with a newly created Ukrainian unit of the same type;
- new `researchCompleted` entries from the bounded research queue event record.

Save notices are captured from save/checkpoint toast messages. Other UI owners may publish explicit notices through `ui.notify()` or inspect/control the center through `ui.notificationCenter` without mutating the store directly.

## Anti-spam and retention

History is newest-first and capped at 100 records; the live feed shows the newest five. Repeated notices with the same stable key collapse during a per-kind cooldown and increment a visible count. Under-attack notices collapse for eight simulation seconds per entity. Mission transitions clear history and establish a fresh observation baseline, preventing initial mission state from being replayed as new events.

## Accessibility and navigation

The live feed is a polite status region. History is an explicitly labelled dialog surface with native buttons, unread count, clear/close controls, scrollable retention, reduced-motion behavior, and forced-colors fallback. Notices with a stable entity or position expose a **View** action that uses the existing public selection command and camera presentation state.

## Verification

Focused coverage:

```bash
node --test tests/ui/notification-center.test.mjs
```

The tests cover bounded immutable retention, collapse policy, objective/attack/production/research derivation, save capture, accessible feed/history rendering, unread state, navigation, mission reset, stylesheet lifecycle, and exact method teardown. Full repository verification remains `bash verify.sh`.
