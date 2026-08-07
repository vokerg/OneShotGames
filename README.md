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
- **Outbreak Directive** — outbreak-response strategy simulation (`outbreak-directive/`)
- **Red Fortress** — browser raycasting shooter (`red-fortress/`)
- **Way of the Ninja: Momentum Trial** — momentum platformer (`the-way-of-the-ninja/`)
- **Tremendous Peace Prize Run** — original political-satire platformer (`tremendous-peace-prize-run/`)
- **Fields of Resolve** — original browser RTS (`ukrainian-front-rts/`)

## GitHub Pages

The repository includes `.github/workflows/pages.yml`. After this change reaches `main`, GitHub Actions uploads the repository as a static Pages artifact and deploys it to the `github-pages` environment.

One-time repository setup may be required if Pages has never been enabled:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push or merge to `main` (or run the Pages workflow manually).

For the repository `vokerg/OneShotGames`, the default project-site URL is expected to be:

`https://vokerg.github.io/OneShotGames/`

All launcher and game links are relative so they work both at that project sub-path and on the local HTTP server.

## Pages compatibility

GitHub Pages does not run Python or Node servers. That is fine here because they are only local static-file servers; the games themselves execute in the browser. The root `.nojekyll` file tells Pages to publish the repository contents without Jekyll processing.
