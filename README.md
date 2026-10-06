# Viz-Man

A full-screen music visualizer for LG webOS TVs. It plays no audio: it draws
what [Music Assistant](https://music-assistant.io/) is playing on your
speakers, in time with it.

Built for an LG CX (webOS 5, Chromium 68) and installed on a rooted TV with
[Glasshouse](https://github.com/rorygallagher2024/lg-webos-dashboard).

## What it shows

| Visualizer | Needs |
|---|---|
| Winamp Bars, Winamp Thin Bars, Winamp Scope: the Winamp 2 spectrum analyzer and oscilloscope | Canvas 2D |
| Radial bars, Ribbon, Ring scope, Lissajous, Kaleidoscope, Spirograph, Tunnel, Orbitals | Canvas 2D |
| MilkDrop presets through Butterchurn; pick one with ↑/↓, or have it change on a timer | WebGL2 |

MilkDrop is offered only if the TV gives out a WebGL2 context, and is taken
out of rotation if it fails to start or loses its context. A preset that stays
below 20 fps is skipped and remembered. The presets shipped are the ones named
in `presets.json`: those of the 395 in the butterchurn-presets packs that ran
at 45 fps or better on the CX (`bench/lg-cx-webos5.json` has every result;
`npm run bench` produces it).
The eight middle visualizers are coloured from the playing album's artwork.
Everything unlit is true black.

## How it gets the music

Music Assistant's **MilkDrop Visualizer** plugin streams the waveform of
whatever a player is playing over a WebSocket (`/milkdrop_visualizer`), a few
seconds ahead of time, along with beats and album colours. The app:

- keeps Music Assistant's player and queue lists through its API (events, with
  a snapshot every 10–30 s) and watches whichever queue is playing, or the one
  named in `player`,
- resolves a picked speaker to what sounds on it: in a Sonos group every member
  sounds the leader's queue, and that is what gets drawn,
- buffers the frames and shows each when the server's clock reaches it,
- downsamples hi-res streams (96 kHz, 192 kHz) to about 48 kHz,
- levels quiet tracks so they still fill the display.

The plugin must be added in Music Assistant (Settings → Plugins), and the app
needs a long-lived token for a Music Assistant user.

## Remote

| Key | Action |
|---|---|
| ← / → | Previous / next visualizer |
| ↑ / ↓ | MilkDrop: next / previous preset, within all presets or just the favorites, in order or at random ("Preset order" in the menu) |
| OK | Menu: visualizer, player, preset, favorite, preset list (all / favorites), preset order (in order / random), preset timer, track info, sync trim, Winamp colours, auto level, frame rate cap, hold screen when idle, debug readout |
| Red / Green | Sync trim −25 ms / +25 ms |
| Yellow | MilkDrop: add or remove the preset from the favorites |
| Blue | MilkDrop: switch between all presets and the favorites |

In a browser, F and L stand in for yellow and blue, R and G for red and green;
arrows, Enter and Escape work as on the remote. Favorites marked in the
browser sync to the TVs through the account like any other.
| Back | Close the menu, or leave the app |

"Player" in the menu picks a speaker. "Auto" draws whatever is playing, the
most recently started queue when several are, and stays with it until it
stops. A picked speaker is drawn whenever music plays on it, switching to it
the moment it starts; while it is silent, Auto fills in. Sync groups are
resolved by Music Assistant: pick any speaker in a group and its group's music
is drawn, and moving between speakers of one group changes nothing. The list
holds the real, available speakers (no group entities), and the choice is
kept per TV. A speaker that claims to play but has nothing Music Assistant
decodes (a Sonos playing Spotify on its own, a TV input) is passed over.

While music plays the app stops the TV's screensaver from starting; when it
stops, the screensaver runs as usual unless "Hold screen when idle" is on.

When a track starts, its artist, title, album and label slide in at the lower
left for a few seconds, the way MTV captioned videos. "Track info" in the menu
keeps the card on screen permanently, or turns it off. The details come from
Music Assistant's queue, so they are as complete as its metadata.

Settings are kept on the TV and mirrored to the Music Assistant user the app
logs in as (in that user's preferences), so a reinstall that wipes the TV's
app storage gets them back on the next launch. Favorites are shared by every
TV using the account and with Music Assistant's own MilkDrop favorites for
that user (the star in its web interface), so they can be marked anywhere; a
change reaches the other devices within a minute. Everything else (sync trim,
picked player, skipped presets, chosen preset, menu settings) is stored per TV.

## Settings

Copy `config.example.json` to `config.local.json` (git-ignored):

| Key | Meaning |
|---|---|
| `host` | Music Assistant's address. An IP; `host:port` if it is not on 8095 |
| `token` | Long-lived Music Assistant token |
| `player` | Optional: a player id to watch and nothing else (the Player row in the menu is then hidden) |
| `holdWhenIdle` | Keep the screensaver off while nothing plays |
| `report` | Address of a running dev server to report to (testing only) |

These are baked into the package at build time, so **the package contains the
token**. webOS launch parameters override them, and the query string overrides
both when the page is opened in a browser.

## Build and install

```
npm install
npm run package        # dist/net.botworth.vizman_<version>_all.ipk
```

Hand the `.ipk` to Glasshouse (Apps tab, with sideloading on), either by
uploading the file or by URL. `npm run serve-ipk` serves `dist/` on port 8138
for the URL route; stop it afterwards. If Glasshouse's page stalls at its
preview step, `npm run install-tv -- <tv-ip>` does the upload and the
confirmation through its API. Either way the install stops the running app;
open it again from the TV's home screen.

## Develop

```
npm test               # node --test
npm run dev            # serves app/ on port 8137
npm run probe -- <player_id> [seconds]   # print what the relay sends
npm run bench          # time every MilkDrop preset on a linked page (the TV)
```

Open `http://<host>:8137/?report=1&debug=1` in a desktop browser. Useful
query flags:

| Flag | Effect |
|---|---|
| `mock=1` | Synthetic signal instead of Music Assistant |
| `debug=1` | On-screen readout: frame rate, connection, buffer, errors |
| `report=1` | Post status and snapshots to the dev server, and take commands from it |
| `noWebgl=1` | Behave as if WebGL2 were missing |
| `player=<id>` | Watch one player |

With `report=1` the page holds a WebSocket to the dev server, which writes
the page's `status-*.json` and snapshots into `.dev/` and passes on commands:

```
curl -d '{"type":"snapshot"}' http://localhost:8137/cmd
curl -d '{"type":"key","key":"right"}' http://localhost:8137/cmd
curl -d '{"type":"mode","id":"winamp-bars"}' http://localhost:8137/cmd
curl -d '{"type":"blacks"}' http://localhost:8137/cmd
```

The dev server serves `app/config.js`, token included, to anyone who can reach
the port. Run it only while testing.

## Layout

- `src/` — source, bundled by esbuild into `app/app.js` for Chromium 68
- `src/vendor/` — third-party code, unchanged (see `app/THIRD_PARTY.md`)
- `app/` — what gets packaged: page shell, manifest, icons, notices
- `scripts/` — build, package, dev server, icon generator, relay probe
- `test/` — unit tests

## Licence

MIT. Third-party code and its notices are listed in `app/THIRD_PARTY.md`.
