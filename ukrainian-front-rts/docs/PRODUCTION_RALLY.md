# Production queues and rally points

## Player controls

Select a completed Ukrainian production building: the Brigade Command Post, Infantry Assembly Area, or Repair and Recovery Point.

- Click **Set Rally Point**, or press `R`, then left-click the battlefield.
- With the building selected, right-clicking the battlefield sets the rally point immediately.
- Right-click or press `Esc` while placement is armed to cancel.

The selected building displays a dashed line and flag at its current rally point. A newly completed unit exits from the side of the structure facing that point and receives a move order to assemble there.

## Queue presentation

Selecting a production building opens a five-slot production strip above the command panel.

- The current unit shows its remaining time and a continuously updating progress bar.
- Later queue entries show their order number.
- Producing buildings also display a compact progress bar on the battlefield.
- Clicking a queue slot cancels that order, refunds its resource cost, and releases reserved command capacity.

The queue strip uses stable DOM nodes so animation-frame HUD refreshes cannot swallow pointer clicks.

## Verification

Run:

```bash
bash verify.sh
```

`verify-production-rally.mjs` checks rally placement, exterior spawn positioning, automatic movement to the rally point, command-capacity accounting, queue cancellation/refunds, and direct right-click rally assignment.

Browser validation should additionally confirm:

1. rally markers remain readable at all zoom levels;
2. each production facility spawns units outside its footprint;
3. queue progress advances smoothly and queued-slot cancellation is reliable;
4. the production strip remains usable at desktop and narrow viewport widths.
