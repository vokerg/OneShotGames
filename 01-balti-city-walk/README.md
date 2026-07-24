# OneShotGames

A collection of small, self-contained browser games and interactive scenes.

Each game lives in its own top-level folder and includes its own README with run instructions and implementation notes.

## Run

From the repository root, run:

```bash
npm start
```

That single command starts the local server and opens Bălți City Walk in the default browser. No `npm install` step is required; the launcher uses only Node.js built-in modules.

The default address is `http://127.0.0.1:8080`. Set `PORT` to use another port, or set `NO_OPEN=1` to prevent automatic browser launch.

## Games

1. [Bălți City Walk](./01-balti-city-walk/) — a voxel-style first-person walk through an interpretation of central Bălți, Moldova.
