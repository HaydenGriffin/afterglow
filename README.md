# Afterglow

An unofficial Music Assistant TV companion for LG webOS. Visuals, album
artwork, timed lyrics and remote-friendly playback, following the music in
your room. Based on [Michael Nestrud’s viz-man](https://github.com/mnestrud/viz-man).
Independent of, and not endorsed by, Music Assistant.

## Build and install

```sh
npm install
npm run package
```

Install the generated `dist/net.botworth.vizman_1.3.0_all.ipk` with your webOS
installer. The original app ID is deliberately retained: Afterglow replaces
Vizman in place and preserves its player identity and preferences. This fork
has not been published; upstream Vizman releases do not contain these features.

Enable Music Assistant’s MilkDrop Visualizer plugin, open Afterglow, and sign
in to your Music Assistant server. Press **OK** for playback controls and
**Display** to choose Visuals only, Visuals + track, Album or Lyrics. **Options →
Visualizer settings** opens the original preset, brightness and audio settings.

The TV can also play audio through Sendspin. Existing speaker names/IDs are
preserved so that groups and latency compensation survive the update.

## TV player

- Album artwork and next-track information; timed lyrics with the current line
  highlighted, plus paged untimed lyrics when timestamps are unavailable.
- Pure visuals, optional track card, optional lyric overlay, and optional
  MilkDrop behind artwork or lyrics. With that background off, rendering stops
  while the waveform buffer continues draining and audio keeps playing.
- Play/pause, previous/next, seek ±10 seconds, a bounded 12-track up-next list
  with direct selection, music favourites, shuffle/repeat, autoplay, crossfade,
  group volume and a server-owned sleep timer.
- All playback changes go through Music Assistant’s existing authenticated
  connection. The controlled queue/group is named on screen.
- 30 fps by default. Native graphics memory growth remains under investigation;
  this release does not claim to eliminate the long-session leak.

## What it does

- Shows MilkDrop presets (through the Music Assistant fork of Butterchurn)
  driven by the waveform Music Assistant streams for whichever speaker is playing, a few seconds ahead, so
  the picture lands on the beat.
- Follows the speaker that is playing, or the one you pick; sync groups are
  resolved the way Music Assistant does.
- Ships all 395 presets from the butterchurn-presets packs. A **preset scan**
  measures each one on your TV and builds a *validated* list of the ones it can
  run smoothly; you can add or remove presets from that list by hand, and keep
  **favorites** separately. Favorites are shared with Music Assistant's own
  MilkDrop favorites and between TVs on the same account.
- Shows the track (artist, title, album, label) when it starts, or always, or
  never; dims the picture and the track card independently for night-time.
- Can color a preset's waveform, borders and motion vectors from the album
  art, using the palette Music Assistant sends with the stream.
- Keeps the TV's screensaver off while music plays; nudges the picture a few
  pixels now and then against OLED burn-in.

## Documentation

- [Setting up, step by step](docs/install.md)
- [The preset scan](docs/preset-scan.md)
- [Settings and remote keys](docs/settings.md)
- [Development](docs/development.md)
- [Changelog](CHANGELOG.md)

## Licence

MIT. Third-party code and its notices are listed in `app/THIRD_PARTY.md`.
