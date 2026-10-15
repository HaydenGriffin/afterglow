# 1.4.2 — Sync figure fix (15 October 2026)

- The sync figure placed the picture relative to the TV's audio compensation,
  but pictures and lyrics are timed from the group clock. The TV's compensation
  only offsets its own output latency, so it no longer moves the picture mark;
  rows now read "TV output compensation: Sound sent 420 ms early" and
  "Picture and lyrics timing: 75 ms after the music". Found in review on 14 October.

# 1.4.1 — Launcher icon (14 October 2026)

- Replace viz-man's equaliser icon with the poster world's mark: a sun setting
  on a horizon rule over two lines of type, paper on ink (`scripts/make-icons.mjs`).

# 1.4.0 — Poster redesign and Music Assistant parity (14 October 2026)

- Replace the amber player and the green settings list with one visual system:
  each track set as a concert poster on a 12-column grid, flat colour fields
  from the artwork palette Music Assistant sends, Archivo throughout, focus
  shown as an inverted field. After 22:00 the poster steps down in brightness.
- One top strip (Browse · Now playing · Queue · Settings) on OK, with the
  transport row below it; Display and Details are on the transport row.
- Browse: recently played, favourite playlists, albums, songs and artists,
  radio stations, all playlists and albums; play now, next, add to the queue,
  start radio, or open an album's or playlist's songs.
- Queue: choose the player or sync group Afterglow follows ("Play on"); play,
  move, play next or remove queued songs; shuffle, repeat, crossfade, volume
  and sleep timer live here.
- Details (the back of the poster): source, format, quality and album, with
  Start radio from this song and Add to favourites.
- Settings grouped as Sound & sync, Display, Visuals & presets, Performance,
  Account & diagnostics; sync is drawn as one timeline and reads "420 ms
  earlier" / "75 ms later" instead of signed numbers.
- Long lists Music Assistant sends in parts (playlists over 500 songs) are
  collected whole instead of cut at the first part.

# 1.3.1 — Uninterrupted app reopening (14 October 2026)

- Keep audio connected when the already-running app receives another open command.
  Relaunching with changed parameters still reloads; returning from another input resumes normally.

# 1.3.0 — Afterglow TV player (14 October 2026)

- Rename the local fork to Afterglow; retain the webOS ID, storage keys and
  existing speaker identity for in-place upgrades. Preserve upstream attribution.
- Add a remote-friendly playback bar, artwork/lyrics views, optional overlays,
  pure visuals, up next and Music Assistant playback options.
- Artwork/lyrics without a MilkDrop background stop drawing and analysis while
  still draining the waveform. Timed lyrics share visual Sync trim.
- Reuse the authenticated API connection; bounded requests, lyric cache and queue
  reads; guard against stale responses after track switches and suspension.
- Default new installations to 30 fps. Residual native graphics growth is open.

# Changelog

## 1.2.2 — 2026-10-14

- Disable Butterchurn's unused GPU profiling by default. A guarded build patch makes timer queries opt-in (`gpuTiming: true`); it leaves the installed dependency untouched and fails if its source changes. Live C1 comparisons showed substantially faster native memory growth with these queries enabled. Longer-run findings are in `docs/performance.md`.
- Guard asynchronous speaker startup and callbacks by connection generation. A stopped player's delayed unlock can no longer connect its replacement twice; stale state/error callbacks cannot overwrite the current connection.
- Restore Sendspin's default sync thresholds. Raising just the hard-resync threshold did not disable its separate sustained-drift correction, and audible cutouts also occurred with zero resyncs and eight seconds buffered.
- Add bounded render and audio diagnostics and a read-only TV profiling script, without credentials or track metadata in its output.

## 1.2.0 — 2026-10-14

- MilkDrop draws on a plain canvas on every TV. This was an attempted workaround for native web-runtime growth of about 20 MB/min on an LG C1. Later measurements showed that growth continued with this workaround; the original attribution to OffscreenCanvas copying was not established.
- "Play on this TV": viz-man can be a Music Assistant speaker as well as drawing, through Sendspin (`@sendspin/sendspin-js` 3.2.1, PCM only). One app in front both sounds and draws: a separate player app behind viz-man is suspended by webOS within minutes, and the two together ran an LG C1 out of memory. Off by default. The `speaker` launch parameter (a player name, with `speakerId` to keep an existing player's id) switches it on and is remembered. The player disconnects while viz-man is hidden and connects again when it is shown. It asks for a 1 s lead and a 2 s buffer (sendspin-js defaults to 250 ms each): MilkDrop keeps the TV's CPU busy, and at 250 ms the audio dropped out now and then.
- "Picture size" row: full, lighter or lightest MilkDrop canvas (0.5, 0.4, 0.33 of the window), at once; less work for a TV that also plays.
- Raised the sync mode's hard-resync threshold from 200 to 600 ms. This did not cover the independent sustained-drift monitor and was reverted in 1.2.2.
- "Audio delay" row (while Play on this TV is on): this TV's sound against the other speakers, 10 ms a step, right plays earlier. It is saved as the player's delay setting in Music Assistant, which sends it to the player.

## 1.1.0 — 2026-10-08

- MilkDrop renderer upgraded to Butterchurn 3.0.0-beta.5.ma.4, the Music Assistant fork of jberg/butterchurn 3.0.0-beta.5: renderer fixes, fewer per-frame allocations, batched shape draws. `npm run build` bundles it from its ES module build into `app/vendor/butterchurn.min.js`.
- "Color" menu row: default, or album art, which gives the preset's waveform, borders and motion vectors the hue of the track's artwork (the palette Music Assistant sends with the stream) at the brightness the preset meant for them. "Color strength" (25–100%) sets how far.
- "Auto level" now defaults to off. A TV that had it on keeps it on.
- "Validate above" gains a 40 fps choice and defaults to it; a TV that had chosen a bar keeps it.
- The shipped LG CX benchmark was re-measured on the new renderer: 316 of 395 presets at or above 40 fps (303 at 45, against 280 before; median +2 fps, none broken). Ratings a TV scanned itself were measured on the old renderer; "Scan presets" again to refresh them.

## 1.0.1 — 2026-10-08

- Menu fits on screen: tighter rows, so "Close menu" is no longer cut off at 1080p.
- Homebrew Channel manifest written by `npm run package` and attached to releases; catalog entry and PR text under `homebrew/`.
- Screenshots under `docs/screenshots/`; test link gains `login` (show the sign-in form) and `dump` commands.

## 1.0.0 — 2026-10-08

- Sign in on the TV with a Music Assistant username and password. The TV gets its own long-lived token, named after it; "Log out" in the menu revokes it. The package no longer contains a token.
- MilkDrop only: the Winamp and wavescope visualizers are gone.
- Every MilkDrop preset in the butterchurn-presets packs is shipped (395). "Scan presets" measures each one's frame rate on the TV on a built-in signal; presets at or above "Validate above" (45 fps by default) make up the validated list, seeded from an LG CX benchmark until the TV has scanned. "Validated" in the menu adds or removes the current preset by hand.
- "Preset list" chooses between validated, all and favorites (Blue key cycles). Favorites and validation are independent.
- "Dim visualizer" and "Dim track info", 0–90% in steps of 10. ←/→ dim the visualizer without opening the menu.
- New defaults: validated list, random order, change preset every 2 minutes.
- Menu rows reordered by how often they are used.
- Renamed to viz-man.
