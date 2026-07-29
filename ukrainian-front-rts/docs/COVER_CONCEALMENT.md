# Cover and concealment

`src/combat/cover-concealment.js` owns deterministic defensive modifiers derived from terrain or explicit fortification state.

Cover reduces incoming accuracy and damage. Concealment reduces accuracy only. The two multipliers compose multiplicatively, and explicit attack capabilities may ignore either channel independently.

The service returns feedback metadata (`protected`, `concealed`, and labels) so renderer and HUD consumers can display state without duplicating combat rules.

Terrain defaults currently cover open ground, roads, mud, rubble, shelterbelts, trenches, and buildings. Unknown terrain safely falls back to open ground; unknown explicit cover or concealment identifiers are rejected.

This module does not calculate line of sight, fog, suppression, morale, projectile travel, or targeting priority.