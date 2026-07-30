# Campaign briefing and debrief flow

UFR-089 owns the browser-independent presentation model for the mission briefing, loading transition, and post-mission debrief. The implementation lives in `src/ui/campaign-flow.js` and consumes the UFR-084 campaign profile vocabulary plus the UFR-133 `briefing`, `battlefield`, `endgame`, and `operations` screens.

## Briefing model

A briefing contains authored operation identity and summary, map preview markers, available forces, intelligence with explicit confidence, ordered objectives, selected difficulty notes, loading hints, and JSON-compatible metadata. The model preserves authored array order and exposes only immutable values.

## Loading transition

Loading progress is normalized to `0..1` with an integer percentage, status, message, deterministic hint selection, and an explicit ready flag. A mission cannot enter the battlefield stage until status is `ready` and progress is exactly `1`.

## Debrief model

A debrief contains the outcome, score, completion tick, medals, categorized losses, an ordered mission timeline, campaign consequences, and authored next-operation choices. Locked choices remain visible with a reason but cannot become the selected continuation.

## Flow ownership

`reduceCampaignFlow()` enforces this sequence:

```text
briefing → loading → battlefield → debrief → operations
```

This module does not access the DOM, start missions, mutate campaign state, record results, save data, or render pixels. A later UI adapter may translate these immutable models into the UFR-133 screen stack and invoke existing application commands.

## Verification

Run:

```bash
node --check src/ui/campaign-flow.js
node --check tests/ui/campaign-flow.test.mjs
node --test tests/ui/campaign-flow.test.mjs
bash verify.sh
```

The task deliberately adds no live browser adapter. Interactive mission startup and debrief presentation checks become applicable when a later composition task mounts this contract.
