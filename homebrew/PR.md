# Pull request text for webosbrew/apps-repo

Title: `Add Afterglow (Music Assistant TV companion with MilkDrop visuals)`

---

Adds **Afterglow**, a [Music Assistant](https://music-assistant.io/) companion for LG webOS TVs:
it draws MilkDrop visuals from the waveform Music Assistant streams for whatever speaker is playing, in time with the music,
and shows artwork, lyrics and the queue with playback from the remote.

- Source: https://github.com/HaydenGriffin/afterglow (MIT), based on https://github.com/mnestrud/viz-man (MIT)
- Manifest: https://github.com/HaydenGriffin/afterglow/releases/latest/download/io.github.haydengriffin.afterglow.manifest.json
- Web app, `type: web`, no root required; also installs under Developer Mode.
- Tested on an LG OLED48CX (webOS 5.6, Chromium 68) and an LG C1 (webOS 6). Needs WebGL2; the app says so on screen on a TV without it.
- Third-party code: Butterchurn (the Music Assistant fork) and butterchurn-presets (MIT), sendspin-js (Apache-2.0), listed in `app/THIRD_PARTY.md` and `NOTICE`.
- Nothing is sent anywhere but the user's own Music Assistant server. The TV signs in with username and password once and keeps a per-TV long-lived token, revocable in Music Assistant or from the app's menu.

Being considerate to the TV: the preset scan runs every one of the 395 presets for a few seconds to measure its frame rate. A preset that takes the TV's browser down is noted before it loads, marked unusable on the next launch, and skipped; the scan can be paused and resumed. The TV's screensaver is held off only while music plays, and the picture drifts a few pixels every two minutes against burn-in.

**AI disclosure.** AI tools (Claude) were used in writing a substantial part of this code and its documentation. The design, feature decisions, testing on the TV (sign-in, playback following across sync groups, two full preset scans, dimming, menu), preset curation and review are mine, and I maintain the project.
