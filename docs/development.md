# Development

```
npm install
npm test               # node --test
npm run dev            # serves app/ on port 8137
npm run build          # bundles src/ into app/app.js and app/vendor/
npm run package        # dist/net.botworth.vizman_<version>_all.ipk
```

`src/` is bundled by esbuild for Chromium 68 (the LG CX). The build fails on
APIs that browser lacks (see the list in `scripts/build.sh`). Butterchurn (the
Music Assistant fork, an ES module) is bundled the same way into
`app/vendor/butterchurn.min.js`, which sets `window.butterchurn`.

## Running in a browser

Open `http://<host>:8137/` in a desktop browser. Without stored credentials the
sign-in form appears and works as on the TV. Useful query flags:

| Flag | Effect |
|---|---|
| `mock=1` | Synthetic signal instead of Music Assistant; no sign-in |
| `debug=1` | On-screen readout: frame rate, connection, buffer, errors |
| `report=1` | Post status and snapshots to the dev server, and take commands from it |
| `noWebgl=1` | Behave as if WebGL2 were missing |
| `player=<id>` | Watch one player (the Player row is then hidden) |
| `host=<host>&token=<token>` | Development override: use this Music Assistant token instead of signing in |

The same keys can go into `config.local.json` (copied from
`config.example.json`, git-ignored), which `npm run build` bakes into
`app/config.js`; webOS launch parameters override it, and the query string
overrides both. A package built with `host` and `token` in that file carries
the token: build release packages without them.

## Test link

With `report=1` (or `report` in the config) the page holds a WebSocket to the
dev server, which writes the page's `status-*.json` and snapshots into `.dev/`
and passes on commands:

```
curl -d '{"type":"snapshot"}' http://localhost:8137/cmd
curl -d '{"type":"key","key":"right"}' http://localhost:8137/cmd
curl -d '{"type":"goto","name":"Geiss - Cosmic Dust 2"}' http://localhost:8137/cmd
curl -d '{"type":"scan"}' http://localhost:8137/cmd          # start / continue the preset scan
curl -d '{"type":"scan","on":false}' http://localhost:8137/cmd
curl -d '{"type":"dump"}' http://localhost:8137/cmd           # the TV's ratings, overrides and favorites -> .dev/dump-<client>.json
curl -d '{"type":"login"}' http://localhost:8137/cmd          # show the sign-in form without signing out (Back hides it)
curl -d '{"type":"debug","on":true}' http://localhost:8137/cmd
```

The link is a WebSocket because the TV's browser sends no plain HTTP requests
from a packaged app's page.

## Scripts

```
MA_HOST=<host> MA_TOKEN=<token> npm run probe -- <player_id> [seconds]   # print what the relay sends
MA_HOST=<host> MA_TOKEN=<token> node scripts/backup-favorites.mjs        # backups/favorites-<date>.json
npm run bench                     # time every preset on a linked page; writes .dev/bench-<client>.json
npm run serve-ipk                 # serve dist/ on 8138 for an installer that takes a URL
npm run install-tv -- <tv-ip>     # install through Glasshouse's API on a rooted TV
```

A long-lived token for the scripts comes from Music Assistant (Settings →
Users → your user → tokens), or from the TV's own: the debug readout does not
show it, but `localStorage["vis.auth"]` in a browser session does.

`bench/lg-cx-webos5.json` holds the frame rate of every preset on an LG CX;
`scripts/make-presets.mjs` ships it with the app as the seed of the validated
list. To refresh it for another TV, run `npm run bench` against that TV and
copy `.dev/bench-tv.json` over.

## Layout

- `src/` — source, bundled into `app/app.js`
  - `main.js` boots, builds the menu and wires everything
  - `login.js`, `ma.js` — the sign-in form and one-shot Music Assistant requests
  - `follow.js`, `pick.js`, `relay.js`, `timeline.js`, `live.js` — which player to draw and the waveform stream
  - `milkdrop.js`, `validation.js`, `scan.js` — the renderer, the validated list, the preset scan
  - `settings.js` — preferences, locally and on the account
- `app/` — what gets packaged: page shell, manifest, icons, notices
- `scripts/` — build, package, dev server, bench, backup
- `test/` — unit tests
- `docs/` — this documentation

## Release

1. Bump `version` in `package.json` and `app/appinfo.json`; add a `CHANGELOG.md` entry.
2. `npm test && npm run package` with no `host`/`token` in `config.local.json`.
3. Attach `dist/net.botworth.vizman_<version>_all.ipk` to the release.
