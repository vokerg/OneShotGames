# Campaign alpha readiness — UFR-105

## Scope

This gate validates the integrated nine-operation campaign rather than individual mission contracts. It exercises the production campaign progression runtime, difficulty balance policy, campaign save runtime, authored checkpoint contracts, content policy, finale debrief, and credits transition.

## Deterministic alpha matrix

- Difficulties: Story, Standard, Veteran
- Operations per difficulty: 9
- Total operation traversals: 27
- Active-mission save/restore checkpoints: 27 (one per operation/difficulty traversal)
- Expected credits transitions: 3
- Content audit violations allowed: 0
- Hidden combat-stat difficulty modifiers allowed: 0

The executable gate is `node scripts/audit-campaign-alpha.mjs`; the same traversal is enforced by `tests/campaign/campaign-alpha-gate.test.mjs` in the assembled test suite.

## Blocker closed during alpha integration

The UFR-103 difficulty policy existed and passed isolated balance tests, but the production campaign progression runtime still returned raw operation contracts. UFR-105 closes that P1 integration blocker by applying the active profile difficulty through `applyCampaignBalance()` inside `beginOperation()`, including the dynamically assembled finale mission.

## Save/checkpoint coverage

Each traversal enters the battlefield, captures an active mission snapshot with operation identity, deterministic simulation seed, tick, and checkpoint identity, persists it through the production campaign save runtime, restores it, and verifies profile revision plus checkpoint continuity before recording the mission result. Authored checkpoint-policy/label structures encountered in mission contracts are also validated for stable unique IDs.

## Progression/finale coverage

Every difficulty must unlock operations strictly in authored order, complete all nine victories, reach `credits-ready` only after the finale, and transition to `credits`. The gate also confirms that runtime missions expose the active balance profile and retain `combatStatMultiplier: 1`.

## Verification evidence

Exact-head CI evidence will be recorded in the UFR-105 completion marker after the implementation head passes task-owned verification. Any unrelated repository-wide flake will be identified separately rather than counted as an alpha blocker.