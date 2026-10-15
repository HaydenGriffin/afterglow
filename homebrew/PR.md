# Pull request text for webosbrew/apps-repo

Title: `Add Afterglow (Music Assistant TV companion with MilkDrop visuals)`

---

Adds **Afterglow**, an unofficial [Music Assistant](https://music-assistant.io/) player for LG webOS TVs:
artwork, word-by-word lyrics, Browse and Search, the queue and playback from the remote, plus MilkDrop visuals drawn
from the waveform Music Assistant streams for whatever speaker is playing, in time with the music. The TV can also be a
Music Assistant speaker through Sendspin.

- Source: https://github.com/HaydenGriffin/afterglow (MIT), based on https://github.com/mnestrud/viz-man (MIT)
- Manifest: https://github.com/HaydenGriffin/afterglow/releases/latest/download/io.github.haydengriffin.afterglow.manifest.json
- Web app, `type: web`, no root required; also installs under Developer Mode.
- Tested on an LG OLED C1 (webOS 6). Needs WebGL2; the app says so on screen on a TV without it.
- Third-party code: Butterchurn (the Music Assistant fork) with its inlined eel-wasm and ecma-proposal-math-extensions (MIT) and @assemblyscript/loader (Apache-2.0), butterchurn-presets (MIT), sendspin-js (Apache-2.0) and the Archivo typeface (SIL OFL 1.1), listed in `app/THIRD_PARTY.md` and `NOTICE`.
- The app talks to the user's own Music Assistant server. The one exception: when Music Assistant has no lyrics for a song, the TV asks lrclib.net directly with the song's title and artist; the "Online lyrics" switch in the Display panel turns that off. The TV signs in with username and password once and keeps a per-TV long-lived token, revocable in Music Assistant or from the app's menu.

Being considerate to the TV: the preset scan runs every one of the 395 presets for a few seconds to measure its frame rate. A preset that takes the TV's browser down is noted before it loads, marked unusable on the next launch, and skipped; the scan can be paused and resumed. The TV's screensaver is held off only while music plays, and the picture drifts a few pixels every two minutes against burn-in.

**AI disclosure.** viz-man, which Afterglow is based on, was written with substantial help from AI tools, as its author disclosed. Afterglow's own changes (the player, Browse and Search, lyrics, the Sendspin speaker, the redesign) were also written largely with AI coding assistants. The design and feature decisions, testing on the TV and review are mine, and I maintain the project.
