# Endgame analytics and detailed report

UFR-145 defines the browser-independent presentation contract for a detailed victory, withdrawal, or defeat report. The contract is owned by `src/ui/endgame-analytics.js`; compatibility with the existing UFR-089 campaign flow is owned by `src/ui/endgame-report-adapter.js`.

## Ownership boundary

The analytics layer receives an explicit mission-end snapshot. It does not inspect or mutate `Game`, campaign profiles, save slots, replay storage, DOM, canvas, or browser capabilities.

Authoritative producers remain responsible for:

- combat events and entity identities;
- economy/resource accounting;
- research completion and costs;
- objective status and resolution ticks;
- campaign unlocks, choices, modifiers, and persistent losses;
- save/replay capability and identifiers.

The report normalizes and validates those values for presentation. It never changes gameplay outcomes or balance values.

## Report shape

`createEndgameAnalyticsReport()` returns a deeply immutable `endgame-analytics-report` version 1 snapshot containing:

- outcome, completion tick, clock duration, title, summary, and metadata;
- friendly deployment/loss/survival categories and totals;
- hostile deployment/destruction/capture/escape/remaining categories and totals;
- damage, healing, repair, and friendly-fire counters;
- conserved resource ledgers plus production, construction, worker, and command peaks;
- ordered completed technologies and aggregate research costs;
- ordered required/optional objective results and resolution timing;
- awarded medals, explicit operational penalties, and an ordered event timeline;
- deterministic score entries and total;
- capability-gated continue, return, retry, save, view-replay, and save-replay actions;
- normalized campaign unlocks, upgrades, choices, modifiers, medals, and persistent losses;
- an exact UFR-084 campaign mission-result handoff.

`createCampaignDebriefFromAnalytics()` converts the report to the existing UFR-089 `mission-debrief` model without creating a second campaign-flow schema.

## Resource conservation

Every resource ledger records:

```text
starting + gathered + salvaged = spent + remaining + lost
```

The report rejects a ledger that does not conserve resources. This catches incomplete telemetry and prevents a detailed report from presenting contradictory economy totals.

## Force accounting

Friendly categories record deployed and lost entities. Hostile categories record deployed, destroyed, captured, and escaped entities. Removed entities may not exceed deployed entities; the report derives friendly survivors and hostile remaining forces.

Each category's `scoreValue` is the already-valued total contribution or penalty for that category, not a unit price and not a balance authority. Runtime telemetry or mission content may calculate those values from versioned balance data when that integration is owned.

## Score policy

The default presentation score has explicit version-1 components:

- mission outcome;
- completed required and optional objectives;
- hostile-force value neutralized;
- friendly-loss value deducted;
- explicit economy/logistics value;
- completed technology value;
- bounded early-completion bonus;
- medal bonuses;
- explicit operational penalties.

The raw total may be negative, but the displayed total is clamped to zero. A caller may supply a complete versioned score policy; the module never mutates the default policy. UFR-149 remains authoritative for a release balance baseline and may provide mission-specific score values later.

## Action capabilities

The report describes actions; it does not execute them.

- Continue is enabled only when a next-operation identifier is provided.
- Return to operations is always a safe primary fallback.
- Retry is independently capability-gated.
- Save requires a writable save identifier.
- View/save replay require an available replay identifier and corresponding capability.
- Disabled actions retain a player-facing reason.

A future mounted endgame screen must route enabled actions through the save, replay, campaign, and runtime owners rather than implementing those systems inside UI code.

## Campaign handoffs

`report.campaignResult` matches the UFR-084 `recordCampaignMissionResult()` input:

```js
{
  outcome,
  score,
  attempts: 1,
  completedTick,
  medalIds,
}
```

The campaign profile remains responsible for attempt aggregation, best score/time preservation, medal ownership, and victory completion state.

The UFR-089 adapter maps report medals, friendly losses, timeline, next operations, score, and consequences into `createMissionDebriefModel()`.

## Determinism and validation

The contract:

- uses stable identifiers and rejects duplicates where records require identity;
- sorts unordered sets and keyed resource/cost data canonically;
- requires timelines to arrive in nondecreasing tick order;
- rejects resolved objectives without a resolution tick;
- rejects unsupported outcomes, malformed policies, non-finite JSON, and circular data;
- defensively clones and deeply freezes every returned structure.

## Runtime composition and evidence ceiling

This task deliberately avoids `src/ui.js`, `src/main.js`, `index.html`, and shared styles while those hotspots have active owners. The active browser endgame remains unchanged.

The highest justified evidence for UFR-145 in this PR is therefore `CONTRACT_COMPLETE`: the detailed report, scoring, campaign handoffs, actions, and validation are complete and covered by focused tests, while a future isolated runtime adapter may mount the report in the production endgame screen. Browser smoke proves assembled regression safety, not player interaction with this unmounted report.
