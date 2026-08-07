# OneShot Games

A collection of small, self-contained browser games. The games are static HTML/CSS/JavaScript projects; the local Python and Node launchers only serve files over HTTP.

## Play locally

From the repository root, either launcher opens the game catalog:

```bash
python3 run.py
```

or:

```bash
npm start
```

Then choose a game from `http://127.0.0.1:8080/`.

Individual per-game launch scripts continue to work as before.

## Games

- **Bălți City Walk** — voxel-style 3D walking scene (`01-balti-city-walk/`)
- **Cat & Two Balconies** — timing / apartment-cooling arcade game (`cat-and-two-balconies/`)
- **Flat Earth: Last Meridian** — polar survey expedition across a circular Disc with moving local daylight, rotating firmament and an encircling Ice Wall (`flat-earth-last-meridian/`)
- **Flat Earth II // Southern Circuit** — Russian-language terminal investigation campaign with branching research, evidence puzzles and six endings (`flat-earth-2/`)
- **Outbreak Directive** — outbreak-response strategy simulation (`outbreak-directive/`)
- **Red Fortress** — browser raycasting shooter (`red-fortress/`)
- **Way of the Ninja: Momentum Trial** — momentum platformer (`the-way-of-the-ninja/`)
- **Tremendous Peace Prize Run** — original political-satire platformer (`tremendous-peace-prize-run/`)
- **Fields of Resolve** — original browser RTS (`ukrainian-front-rts/`)

## GitHub Pages

GitHub Pages is configured to publish directly from the repository's `main` branch at the repository root. GitHub's built-in Pages workflow handles the deployment automatically after pushes to `main`, so no custom Pages deployment workflow is required in this repository.

The public project-site URL is:

`https://vokerg.github.io/OneShotGames/`

All launcher and game links are relative so they work both at that project sub-path and on the local HTTP server.

## Pages compatibility

GitHub Pages does not run Python or Node servers. That is fine here because they are only local static-file servers; the games themselves execute in the browser. The root `.nojekyll` file tells Pages to publish the repository contents without Jekyll processing.
