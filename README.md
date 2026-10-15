# Afterglow

A Music Assistant companion for LG webOS TVs. Afterglow draws MilkDrop visuals
in time with whatever your speakers are playing, and shows the album artwork,
timed lyrics and the queue, with playback you drive from the TV remote. It can
also make the TV itself a Music Assistant speaker.

Afterglow is independent of, and not endorsed by, Music Assistant or LG. It
began as a fork of [Michael Nestrud's viz-man](https://github.com/mnestrud/viz-man).

## What it does

- **Visuals.** MilkDrop presets (through the Music Assistant fork of
  Butterchurn) driven by the waveform Music Assistant streams a few seconds
  ahead, so the picture lands on the beat. Presets can take their colours from
  the album art.
- **Display modes.** Visuals only, visuals with a track card, album artwork, or
  lyrics: timed lyrics with the current line highlighted, paged untimed lyrics
  otherwise. MilkDrop can run behind artwork or lyrics, or stop entirely.
- **Playback.** Play/pause, previous/next, seek, the next queued songs (play,
  move, remove), favourites, shuffle/repeat, crossfade, volume and a sleep
  timer. Browse recently played, favourites, radio, playlists and albums.
- **Following.** Follows the speaker that is playing, or the one you pick; sync
  groups are resolved the way Music Assistant does.
- **Preset scan.** Measures each of the 395 bundled presets on your TV and
  keeps a validated list of the ones it runs smoothly. Favourites are shared
  with Music Assistant's own MilkDrop favourites and between your TVs.
- **Play on this TV.** Optionally a Music Assistant speaker through Sendspin,
  so one app both sounds and draws.
- **Kind to OLEDs.** Holds the screensaver off only while music plays and
  drifts the picture against burn-in.

## Requirements

- An LG webOS TV with WebGL2 (2020 models onward; tested on a CX, webOS 5, and
  a C1, webOS 6), either rooted with the
  [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) or in
  Developer Mode.
- [Music Assistant](https://music-assistant.io/) 2.10 or newer on the same
  network, with the **MilkDrop Visualizer** plugin added (Settings → Plugins).
- Speakers Music Assistant streams to itself (Sonos, Chromecast, AirPlay,
  Squeezelite, ...). A speaker playing on its own, such as Spotify straight from
  the Spotify app, carries nothing to draw.

## Install

Download `io.github.haydengriffin.afterglow_<version>_all.ipk` from the
[releases](https://github.com/HaydenGriffin/afterglow/releases), or build it
(below). Then either:

- **Homebrew Channel** (rooted TV): install the `.ipk` from a URL. From a
  checkout, `npm run serve-ipk` serves `dist/` and prints the URL to enter.
- **Developer Mode**: `npx ares-install --device <name> dist/io.github.haydengriffin.afterglow_<version>_all.ipk`.

Open Afterglow and sign in with your Music Assistant address, username and
password. The TV keeps its own long-lived token, named after the TV, which you
can revoke in Music Assistant or with **Log out**; the password is not stored.
Then run **Scan presets** once. The [setup guide](docs/install.md) walks
through every step.

## Settings

Press **OK** for the playback controls: a transport row with **Display** and
**Details**, and a top strip with **Browse**, **Now playing**, **Queue** and
**Settings** (presets, picture, sound and sync, account). Per-TV settings live
on the TV; favourites and shared preferences sync through your Music Assistant
account. See [Settings and remote keys](docs/settings.md) and
[The preset scan](docs/preset-scan.md).

## Building

```sh
npm install
npm test
npm run package   # dist/io.github.haydengriffin.afterglow_<version>_all.ipk
                  # and dist/io.github.haydengriffin.afterglow.manifest.json
```

`npm run dev` serves the app in a desktop browser. See
[Development](docs/development.md) and the [changelog](CHANGELOG.md).

## Credits

- [viz-man](https://github.com/mnestrud/viz-man) by Michael Nestrud (MIT), the
  project Afterglow grew from.
- [Butterchurn](https://github.com/jberg/butterchurn) by Jordan Berg, in
  [Music Assistant's fork](https://github.com/music-assistant/butterchurn) (MIT).
- [butterchurn-presets](https://github.com/jberg/butterchurn-presets) (MIT).
- [sendspin-js](https://github.com/Sendspin/sendspin-js) (Apache-2.0).
- [Archivo](https://github.com/Omnibus-Type/Archivo) typeface (SIL OFL 1.1).

Full notices are in [NOTICE](NOTICE) and `app/THIRD_PARTY.md`.

## Licence

MIT. See [LICENSE](LICENSE).
