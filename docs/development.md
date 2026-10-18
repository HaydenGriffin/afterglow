# Development

```
npm install
npm test               # node --test
npm run dev            # serves app/ on port 8137
npm run build          # bundles src/ into app/app.js and app/vendor/
npm run package        # dist/io.github.haydengriffin.afterglow_<version>_all.ipk
```

`src/` is bundled by esbuild for Chromium 68 (the LG CX). The build fails on
APIs that browser lacks (see the list in `scripts/build.sh`). Butterchurn (the
Music Assistant fork, an ES module) is bundled the same way into
`app/vendor/butterchurn.min.js`, which sets `window.butterchurn`.
`scripts/butterchurn-source.mjs` applies a checked source transformation before
bundling: GPU timing queries are disabled unless `gpuTiming: true` is passed to
`createVisualizer`. Playback does not consume these profiling results. The
transformation checks each expected site exactly once and refuses dependency
drift; never patch the shared `node_modules` directory.

## TV timing and memory measurements

With Node 22 or later and SSH/debug access to the TV, in separate terminals:

```
ssh -N -T -o ServerAliveInterval=5 -o ServerAliveCountMax=2 -o ExitOnForwardFailure=yes -L 127.0.0.1:19998:127.0.0.1:9998 tv
node scripts/profile-tv.mjs 1800 .dev/profile.jsonl
```

`tv` is an SSH host alias for the rooted TV. `TV_DEBUG_URL` and `TV_SSH_HOST`
(default `tv`) override those endpoints. The tool records
30-second snapshots of native process RSS **and swap**, JS heap, frame timings,
and speaker buffering/corrections. Retained console messages are marked
`fresh: false`; do not count them as new events. Console `resyncs` is an interval
counter, while the speaker diagnostic uses the scheduler's cumulative count.
Neither counter proves what came out of HDMI ARC: listening remains necessary.

`window.afterglowDiagnostics()` is a bounded read-only snapshot. Render maxima and
stall counts are cumulative for the page lifetime; compare counter deltas for
each test phase. Initial loading and preset compilation can produce large gaps.
The scheduler fields are diagnostic access to the locked Sendspin version, not
an API used to control playback. Compare one variable at a time, record app
hashes and test changes, and restore temporary preferences afterwards.

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
show it, but `localStorage["afterglow.auth"]` in a browser session does.

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
3. Attach `dist/io.github.haydengriffin.afterglow_<version>_all.ipk` to the release.

## Mock mode and browser checks

`?mock=1` also provides labelled demo metadata, lyrics and local controls; no
Music Assistant writes occur in that mode. TV-facing CSS must support Chromium
68 (for example, use explicit edges rather than the newer `inset` shorthand).

Targeted checks: `node --test test/playback.test.mjs`,
`node --test test/follow.test.mjs`, `node --test test/engine.test.mjs`, then
`npm run package`. Run them one after another; the package step rebuilds
`app/`.

The Music Assistant commands the player uses are
`player_queues/{items,play_pause,previous,next,seek,play_index,shuffle,repeat,autoplay,crossfade}`,
`players/cmd/volume_set`, `players/sleep_timer/{set,clear}`,
`music/favorites/add_item` and `metadata/get_track_lyrics`. Missing permissions
or unsupported commands produce a visible refusal. Artwork uses the current
`proxy_id` image endpoint, with accessible HTTP images as a fallback.

`npm run package` writes a Homebrew Channel manifest pointing at
github.com/HaydenGriffin/afterglow; set `AFTERGLOW_REPOSITORY_URL` to build one
for a fork.

`test/browser-player.js` is an executable browser regression expression. Load
`?mock=1` afresh and evaluate its contents in the page (DevTools, or a browser
automation tool's evaluate with promise awaiting). It refuses a non-mock page.
Through real remote events it checks the top strip, queue arrow safety and song
actions, artwork draw suspension, pure visuals, visual style Off (with cold
starts in Off in a same-origin frame, whose storage changes are put back),
Browse → Add to the queue, Details, and overflow.
