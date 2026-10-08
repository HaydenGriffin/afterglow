# viz-man

A full-screen MilkDrop visualizer for LG webOS TVs. It plays no audio: it draws
what [Music Assistant](https://music-assistant.io/) is playing on your
speakers, in time with it.

Built for an LG CX (webOS 5, Chromium 68). Runs on any webOS TV that can
sideload apps and has WebGL2.

## Quick start

1. In Music Assistant, add the **MilkDrop Visualizer** plugin (Settings → Plugins).
2. Install the `.ipk` on the TV ([docs/install.md](docs/install.md)).
3. Open viz-man and sign in with Music Assistant's address, your username and
   password. The TV keeps its own token; your password is not stored.
4. Play something. Press OK for the menu.

## What it does

- Shows MilkDrop presets (through Butterchurn) driven by the waveform Music
  Assistant streams for whichever speaker is playing, a few seconds ahead, so
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
- Keeps the TV's screensaver off while music plays; nudges the picture a few
  pixels now and then against OLED burn-in.

## Documentation

- [Install and sign in](docs/install.md)
- [Settings and remote keys](docs/settings.md)
- [Development](docs/development.md)
- [Changelog](CHANGELOG.md)

## Licence

MIT. Third-party code and its notices are listed in `app/THIRD_PARTY.md`.
