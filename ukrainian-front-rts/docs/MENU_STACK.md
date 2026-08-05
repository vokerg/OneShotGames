# Pause and menu stack

Task: UFR-139  
UI owner: `src/ui/menu-stack.js`  
Composition owner: `src/ui/menu-stack-composition.js`

## Ownership

The UI layer owns pause-menu presentation, menu navigation, confirmation state, focus management, input capture, and focused adapters that invoke injected public services. `src/main.js` remains the composition root: it injects the app-owned campaign-save runtime factory, browser storage, audio-settings adapter, and application runtime without introducing a UI-to-app dependency.

It consumes but does not replace:

- `createCampaignSaveRuntime` and the UFR-085 campaign save envelope;
- the UFR-131 audio settings accessibility controller;
- existing mission start/restart and operation-selection UI;
- current keyboard and camera/input owners;
- the tech-tree, economy HUD, minimap, localization, and broad UI-skin owners.

## Pause and modal contract

Opening the menu calls the public application-runtime pause API. The runtime skips fixed-step simulation while continuing render and UI frames, so the paused battlefield and menu remain visible. Closing or disposing restores the runtime's pre-install pause state; the menu never assigns `game.update` or registers a competing loop.

While open, the shell is inert and hidden from assistive technology, keyboard input is captured in the modal, Tab is trapped, Escape backs out of confirmation/subviews before resuming, and the previously focused control is restored.

The menu does not pause when another owned modal is already handling Escape. Audio settings are opened through the installed UFR-131 adapter while the menu keeps simulation paused. A composition-level Escape bridge gives the visible Audio Settings dialog sole dismissal ownership; the pause menu resumes its modal role only after Audio Settings closes.

## Save/load boundary

Manual slot `manual-1` uses the validated campaign save runtime and browser storage. The current assembled prototype does not expose a live mission snapshot/restore API to UFR-139, and UFR-139 does not own private simulation serialization. Therefore menu saves persist the validated campaign profile and explicitly label that boundary. Loading returns to operation selection after restoring the profile.

Storage absence, corrupt/unsupported saves, write failures, and load failures are presented as non-fatal menu status messages.

## Actions

- Resume closes the menu and releases the pause gate.
- Restart and quit-to-operations require confirmation.
- Save/load lists validated slots and confirms load/delete operations.
- Audio settings delegates to UFR-131.
- Controls and accessibility views document active assembled behavior.
- Quit-to-operations uses the existing mission UI owner.

## Evidence boundary

Automated tests cover immutable state transitions, runtime pause delegation/restoration, slot model normalization, and save-service profile round trips. Browser smoke and the assembled verifier establish runtime composition. Human all-mission interaction and assistive-technology review are not claimed.
