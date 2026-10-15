# Performance on a TV

Afterglow runs MilkDrop, a Music Assistant connection and, optionally, a
Sendspin speaker inside a TV's web runtime (Chromium 68 on webOS 6). It does a
few things to stay light.

## What the app does

- **30 fps cap.** New installs draw at most 30 frames a second ("Frame rate
  cap" in Settings → Performance). Higher caps cost noticeably more CPU on a
  2021 TV for little visible gain.
- **Picture size.** MilkDrop draws into a canvas at half the window size by
  default and is scaled up. "Picture size" offers lighter (0.4) and lightest
  (0.33) for a TV that also plays the music.
- **No GPU timing.** Butterchurn's GPU timer queries are disabled in the build
  (`scripts/build-butterchurn.mjs`); nothing reads them, and on an LG C1 they
  made native memory grow noticeably faster. `gpuTiming: true` turns them back
  on for profiling.
- **Drawing only when it shows.** Album and Lyrics views without a MilkDrop
  background stop drawing and analysis. Switching to another TV app suspends
  rendering.
- **WebGL released on `pagehide`.** The WebGL context is released when the page
  closes and before the app reloads itself, so the TV gets its graphics memory
  back; a restored context reloads cleanly.
- **Stall reconnect.** If Music Assistant stops sending the waveform without
  ending the stream, the relay reconnects after 10 s with no frame while the
  queue still plays.
- **Bounded caches.** Lyric, queue and artwork lookups are bounded, and stale
  responses after a track change or suspension are dropped.

`window.afterglowDiagnostics()` reports render counters, frame gaps, relay,
clock and speaker buffering. `scripts/profile-tv.mjs` records these with the
web runtime's native and JS memory over a debugging tunnel; see
[Development](development.md).

## Known issues

- **Native memory growth in long sessions.** On an LG C1 the web runtime's
  native memory (not the JS heap) grows slowly while MilkDrop draws. It stays
  flat with drawing stopped, so it is tied to rendering inside the browser's
  graphics stack. It is under investigation; closing and reopening the app
  returns the memory.
- **Audio cutouts when the TV is the speaker.** On some webOS TVs "Play on this
  TV" can produce short silent gaps even with seconds of audio buffered and no
  resync. Recordings of the TV's output matched the renderer's audio thread not
  being scheduled in time. On a rooted TV, raising the priority of the
  renderer's audio output thread (for example `renice -n -10` on the thread
  named `AudioOutputDevi` in the web runtime process) removed the gaps in
  testing. The change lasts until the app reloads or quits; check the thread
  name before changing anything. Turning MilkDrop off behind Album or Lyrics
  views also leaves the TV more headroom.
