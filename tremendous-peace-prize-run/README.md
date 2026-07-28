# Tremendous Peace Prize Run

A compact, original side-scrolling platform game starring a code-drawn cartoon Donald Trump. The world replaces familiar platformer scenery with political satire: reciprocal-tariff shipping docks, trade-deficit creatures, Iran de-escalation switches, negotiation tables, podiums, superlative billboards and a fictional Nobel Peace Prize finish in Oslo.

## Run

From the repository root:

```bash
python3 tremendous-peace-prize-run/run.py
```

That is the complete startup procedure. The launcher uses only Python's standard library, selects an available local port and opens the game in the default browser. No package installation or build step is needed.

Optional:

```bash
python3 tremendous-peace-prize-run/run.py --no-browser --port 8045
```

## Controls

- `A` / `D` or left / right arrows: move
- `W`, up arrow or `Space`: jump
- `P`: pause
- `R`: restart
- Touch controls appear automatically on touch-oriented devices

## Game structure

1. **Reciprocal Harbor** — cross stacked import containers and tariff barriers.
2. **Strait of De-escalation** — hit diplomacy switches that convert escalation rockets into peace doves.
3. **Unprecedented Avenue** — climb podiums and superlative billboards while filling the Greatness Meter.
4. **Oslo Finish** — reach the fictional committee stage and collect the in-game peace medal.

The game is intentionally satirical. Its prize result is fictional and does not claim or imply any real nomination, endorsement or award. The real Nobel Peace Prize laureate is selected independently by the Norwegian Nobel Committee; nominations are confidential for 50 years.

## Assets and implementation

- HTML5 Canvas and plain JavaScript
- no external packages, fonts, images, tracking or network calls
- character, environments, particles and interface are drawn in code
- original platform layout and mechanics; no Nintendo or Mario assets are used

## Research references

- White House memorandum, “Reciprocal Trade and Tariffs” (13 February 2025): https://www.whitehouse.gov/releases/2025/02/reciprocal-trade-and-tariffs/
- Executive Order 14257 on reciprocal tariffs (2 April 2025): https://www.whitehouse.gov/presidential-actions/2025/04/regulating-imports-with-a-reciprocal-tariff-to-rectify-trade-practices-that-contribute-to-large-and-persistent-annual-united-states-goods-trade-deficits/
- Nobel Prize, nomination and selection of Nobel Peace Prize laureates: https://www.nobelprize.org/nomination/peace/
