# Changelog

## 1.2.0 — 2026-10-14

- MilkDrop draws on a plain canvas on every TV. Butterchurn used an OffscreenCanvas where the browser has one (webOS 6 and later) and copied each frame onto the page; on an LG C1 that copy leaked about 20 MB a minute in the TV's web runtime, so after half an hour the TV swapped, the picture and sound stuttered, and webOS restarted the app.
- "Play on this TV": viz-man can be a Music Assistant speaker as well as drawing, through Sendspin (`@sendspin/sendspin-js` 3.2.1, PCM only). One app in front both sounds and draws: a separate player app behind viz-man is suspended by webOS within minutes, and the two together ran an LG C1 out of memory. Off by default. The `speaker` launch parameter (a player name, with `speakerId` to keep an existing player's id) switches it on and is remembered. The player disconnects while viz-man is hidden and connects again when it is shown. It asks for a 1 s lead and a 2 s buffer (sendspin-js defaults to 250 ms each): MilkDrop keeps the TV's CPU busy, and at 250 ms the audio dropped out now and then.
- "Picture size" row: full, lighter or lightest MilkDrop canvas (0.5, 0.4, 0.33 of the window), at once; less work for a TV that also plays.
- Play on this TV resyncs (a jump) only beyond 600 ms of error instead of 200: a busy TV's short stalls are corrected without a sound.
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
