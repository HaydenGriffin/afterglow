# Unreleased

- **New logo.** The wordmark is *afterglow* in lowercase Archivo with its o as the sun, setting below the
  baseline; the launcher icon is a close-up of that sunset, a night sky over dark ground with a two-step glow
  round the sun. New app icons, favicon and social preview; `iconColor` is the sky (`#16233A`). See
  `docs/brand/README.md`.
- Music playing on another speaker can be joined or moved: while Play on this
  TV is on, Queue and Playing on offer **Join <speaker>** (the TV joins that
  speaker's group, where Music Assistant allows it) and **Move here** (the
  music moves to the TV, as the old Play on this TV row did). Nothing happens
  until you choose one.
- Playing on says what each speaker plays: the song and artist, Paused, or
  Idle, instead of Speaker or Group.
- Speakers together: **Volume for each speaker** sets one member's volume
  (`players/cmd/volume_set`) beside the group's Volume; speakers with a fixed
  volume are left out.
- **Cover art in the visuals** (Settings → Visuals & presets, on by default): the 44 presets that sample a
  picture get the song's cover instead of Butterchurn's clouds, faded in over 2 s once the artwork and its
  colours have arrived, at most every 4 s. One fixed 512 × 512 texture is updated in place for the whole page,
  never one per song, and released with MilkDrop.
- **Change preset** adds **Each song** (a new preset when the queue moves to another song, after 2 s, at least
  10 s apart) and **On big moments** (when the music's energy jumps, at least 25 s apart). Both go through the
  preset list, favourites and skip-slow as the timer does.
- In Shuffled order, ↓ now goes back to the preset actually shown before (the last 50), and ↑ forward again,
  instead of another random pick.
- **Scan to save:** Details shows a QR code beside the facts that opens the
  playing song on a phone, on a public service Music Assistant knows it from
  (Spotify, Tidal, Apple Music, YouTube Music, Deezer, Qobuz, SoundCloud),
  preferring the one it plays from. Drawn on the TV with Project Nayuki's QR
  Code generator (MIT); hidden when the song has no public page.
- **Check my setup** (Settings, Account & diagnostics): Music Assistant
  reachable and 2.10 or newer, the token accepted, this TV's speaker known and
  connected, the MilkDrop Visualizer plugin found, lrclib.net answering (busy
  is not a failure) and the preset scan done, each failure with one next step.
  Runs only when asked. An empty idle poster offers it as **Check setup**.
- README: the per-album and per-artist preset locks removed in 1.5.2 are no
  longer described.

# 1.5.5 — Lyric overlay looks and More cues (16 October 2026)

- Long lists show that they continue: **More** with a chevron at the bottom
  edge over a fade of the last visible row, and at the top once scrolled, on
  Settings, Display, Queue (and its Play on and Speakers together pages),
  Details and Browse. The focused row keeps one row of context beyond it, so
  the cue never covers it; the scrollbar stays.
- Display → **Lyrics over Visuals + track** is now Off / **One line** /
  **Stage** (the current line large, centred). While one is chosen,
  **Position** (Top, Middle, Bottom), **Background** (Box, Shade, None) and
  **Size** (Small, Medium, Large) follow, kept separately per overlay (One
  line: Bottom, Box, Medium; Stage: Middle, Box, Medium), saved on this TV and
  synced with its account settings. Shade is a full-width dark band that
  fades out above and below the text. A TV that had the overlay On keeps One
  line. Bottom still stacks above the track card; Middle moves off a tall
  card or the "Waiting for music" line; Dim track info and the OLED shift
  apply to every look.
- The progress bar under Album and Lyrics moves smoothly every frame, by
  transform rather than width; small clock corrections are eased in and never
  move it backwards, seeks and new songs snap, and it holds still while paused.
- The browser demo (`?mock=1`) shows the track card as live songs do.

# 1.5.4 — Lyrics survive a busy LRCLIB (16 October 2026)

- When lyrics fail to load (LRCLIB answering "server busy"), Afterglow keeps
  retrying while the song plays, after 30 s, 1 min and then every 2 min,
  instead of giving up after one retry.
- `afterglowDiagnostics()` reports the lyrics status and why the last lookup
  failed.

# 1.5.3 — Poster block identity (16 October 2026)

- New identity: the AFTER/GLOW poster-block wordmark in Archivo; new launcher icons
  (ink on a paper tile; AF/GL at small sizes), README wordmark, social preview
  and a favicon for the browser demo. Masters and usage notes in `docs/brand/`.

# 1.5.2 — Fewer features (15 October 2026)

- Removed Bedtime: Music Assistant's sleep timer (Queue panel) and the TV's own
  sleep timer cover it.
- Removed preset locks per album or artist: favourite presets with automatic
  changes off cover holding a preset.

# 1.5.1 — Review fixes and an Online lyrics switch (15 October 2026)

- Display → Lyrics gains **Online lyrics** (On by default, synced): Off keeps
  lyrics to what Music Assistant provides and nothing is sent to lrclib.net;
  switching it back On looks up a song that had no lyrics again.
- Bedtime brings the volume back only after the pause has succeeded; if the
  pause fails, the music stays silenced and bedtime keeps retrying.
- Play, Pause, Play/Pause, Stop, fast-forward, rewind and Space act once per
  press, so holding fast-forward or rewind no longer skips many tracks; skips
  pressed while one is under way collapse to one waiting skip per direction.
- Transient lyrics failures stay retryable instead of being remembered as
  missing.
- The TV speaker watches its connection and reconnects when it drops.
- A pinned speaker that pauses no longer makes the relay reconnect every 10 s.
- Token renewal and Log out are safe with two TVs of the same name: tokens are
  revoked by id, and Log out removes only this TV's own token. New sign-ins
  name the token "Afterglow on <model> (<device id>)".
- New Play on this TV speakers get the id `webos-afterglow-tv`. A TV keeps its
  stored speaker id; a TV with none reuses `webos-viz-man-tv` only while Music
  Assistant still knows that player.

# 1.5.0 — Afterglow, rebranded for publishing (15 October 2026)

- Display → Lyrics: a per-TV **Lyrics timing** row moves the words only, up to
  10 s earlier or later in 100 ms steps, with **Reset lyrics timing** when it
  is not zero. It adds to "Picture and lyrics timing" and leaves the audio,
  MilkDrop, the progress bar and seeking alone. **Retry lyrics** sits under the
  same heading and is offered when the lookup failed and when no lyrics were
  found.
- The poster no longer shows a stream-quality badge (Details still has the
  format and quality), and the track-change animation is gone.
- "Next" on the listening screen is now "Up next".

- Lyrics: when Music Assistant has none (its exact LRCLIB lookup misses titles
  listed with featured artists, and misses are rate-limited), Afterglow
  searches LRCLIB itself and takes the hit with the same base title, artist and
  length (same album and closer length first). The search also runs after a
  Music Assistant error or a 5 s timeout; a failed lookup is retried once
  after 30 s, and a manual retry clears a cached miss.
- A simpler listening layout for Album and Lyrics.
- Media keys: Stop pauses, fast-forward/rewind skip tracks; named media keys
  (MediaPlayPause and friends) work too.
- Config global `window.AFTERGLOW_CONFIG` (was `VIS_CONFIG`).

- New app id: `io.github.haydengriffin.afterglow` (was `net.botworth.vizman`),
  for publishing as Afterglow. The package is now
  `io.github.haydengriffin.afterglow_<version>_all.ipk` and the Homebrew
  Channel manifest `io.github.haydengriffin.afterglow.manifest.json`.
- **Migration.** webOS treats the new id as a different app: it installs
  beside the old one rather than replacing it. Remove `net.botworth.vizman`
  afterwards (and its Music Assistant token, "viz-man on ..." / "Afterglow on
  ...", under Settings → Users). On the new app, sign in again; what is kept
  only on the TV (its login, device id, Play on this TV choice, a scan in
  progress) starts fresh.
  Favourites and the shared preferences synced through the Music Assistant
  account come back after sign-in; this TV's own synced settings are keyed by
  its device id, which is new, so they start from the shared ones. A TV that turns Play on this TV on again without its
  launch parameter rejoins as the same player (`webos-viz-man-tv`).
- Anything that launches the app by id (launchApp, deep links, scripts) must
  use the new id.
- Branding: `window.afterglowDiagnostics()` (was `vizmanDiagnostics()`), preset
  globals `afterglowPresets` / `afterglowPresetBench`, local storage prefix
  `afterglow.` (was `vis.`), screensaver client names under the new id.
- Publishing metadata: vendor Hayden Griffin, app description, README,
  LICENSE (upstream viz-man notice kept), NOTICE with credits (Butterchurn,
  butterchurn-presets, sendspin-js, Archivo), sendspin-js's Apache-2.0 licence
  shipped in the app, Homebrew Channel entry pointing at
  github.com/HaydenGriffin/afterglow.

# 1.4.4 — Review fixes and a waveform stall guard (15 October 2026)

- The picture comes back when Music Assistant stops sending the waveform
  without ending the stream: after 10 s with no frame while the queue still
  plays, the relay reconnects. Before, the picture could stop for many
  minutes while the audio played on.
- The TV speaker's retry no longer replaces a player that has connected and
  is playing.
- `vizmanDiagnostics()` reports relay, clock, follow and frame-age state.
- One highlight only: a disabled row no longer leaves the previous row lit;
  sub-lists open on their first usable row.
- Bedtime reads and fades the speaker it pauses (the command target), with
  group volume; it finishes while Afterglow is on screen.
- The no-track poster drops the last song's colours; night fields use the
  night paper; the idle poster's second field resets too.
- The one-second bedtime/preset-lock timer stops with the screen; a locked
  preset is no longer saved as the default.
- Lyrics view fits two-line titles above the artist; the lyric overlay sits
  above the track card; both hide while a panel is open; the poster and
  overlay glide on the burn-in drift.
- Down or Up leaves the Search field for the results.
- docs/settings.md covers 1.4.3's rows and keys; `"type": "module"` silences
  Node's test warnings.

# 1.4.3 — Review fixes, play from idle, search and bedtime (15 October 2026)

Fixes
- Token renewal no longer signs the TV out: the fresh token is handed to every
  open connection before the old one is revoked, and a refusal of a replaced
  token logs in again instead of clearing the sign-in.
- Browse, the idle poster and the controls act on a command target (the chosen
  speaker, else the one followed, else the last one, else this TV), so Play now
  works with nothing playing and "Play on" an idle speaker takes effect.
- Back while an album's songs load keeps the category list; arrow keys in
  Browse move the selection without rebuilding the list.
- Settings passes Play/Pause and the colour keys through, stays open 45 s
  after the last key, reopens on the last row and keeps its values current.
- The TV speaker retries a failed connection with a growing wait; switching
  speakers no longer carries one speaker's delay onto another.
- Held volume and quick seek presses are combined instead of dropped; group
  volume uses Music Assistant's group command for synced speakers.
- An open panel no longer refocuses and scrolls itself every 250 ms.
- A positive LRC `[offset:]` now brings lyrics sooner, as the format defines.
- The WebGL context is released on the browser's `pagehide` event and before
  app-triggered reloads; a restored context reloads cleanly. Switching to
  another TV app only suspends rendering until the page closes. The
  long-session memory growth remains open; see `docs/performance.md`.
- The provider list is re-read after a failure; message refresh and burn-in
  drift stop while hidden or signed out. New speakers are named Afterglow TV.

Features
- Search in Browse, with the TV keyboard or voice; results grouped by kind.
- Idle poster: the paused song (after 30 s) or recent music (after 8 s with
  nothing playing), OK plays, dims after three quiet minutes.
- Queue panel: Play on moves the music, "Play on this TV", and Speakers
  together to join or leave the group.
- Artists offer Show songs; Play next / Add confirm on their own row.
- Album and Lyrics views: left/right seek 10 s (or turn untimed lyric pages),
  Yellow favourites the song.
- Word-by-word karaoke for enhanced LRC lyrics.
- Bedtime (15/30/60 min or end of track): the picture goes black and the
  renderer rests after a minute, the volume fades over the last 30 s, then
  playback pauses.
- Lock a preset to the playing album or artist.

# 1.4.2 — Sync figure fix (15 October 2026)

- The sync figure placed the picture relative to the TV's audio compensation,
  but pictures and lyrics are timed from the group clock. The TV's compensation
  only offsets its own output latency, so it no longer moves the picture mark;
  rows now read "TV output compensation: Sound sent 420 ms early" and
  "Picture and lyrics timing: 75 ms after the music".

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

- Rename the fork to Afterglow; retain the webOS ID, storage keys and
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

- Disable Butterchurn's unused GPU profiling by default. A guarded build patch makes timer queries opt-in (`gpuTiming: true`); it leaves the installed dependency untouched and fails if its source changes. On an LG C1, native memory grew substantially faster with these queries enabled. See `docs/performance.md`.
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
