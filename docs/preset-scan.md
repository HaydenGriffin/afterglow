# The preset scan

## Why it exists

viz-man ships all 395 MilkDrop presets from the butterchurn-presets packs.
They are small programs, and they differ enormously in what they ask of a
TV's graphics chip: on an LG CX some hold 60 frames a second and some manage
5. There is no way to know which are which without running them on the TV in
front of you, so the app does exactly that and keeps the answer.

The result is the **validated list**: the presets this TV runs at or above a
frame rate you choose. It is the list the app browses by default, and the
list "Change preset" draws from.

## What a scan does

1. Takes over the screen with a progress bar and switches to a built-in
   signal: eight seconds of synthetic music (kick, bass, arpeggio, hi-hat)
   that loops. Every preset is measured on the same input whether or not
   music is playing, and the signal costs the TV nothing to produce, so the
   numbers reflect the preset and only the preset.
2. Lifts the frame rate cap to 60, pauses the preset timer, and shows each
   preset in turn: **3 seconds to settle** (shaders compile, buffers fill)
   and **2 seconds to measure**, the mean of two one-second frame counts.
3. Records the frame rate per preset, saves the lot to the account every half
   minute, and on the last preset puts the screen back as it was.

395 presets at just over 5 seconds each is **about 35 minutes**. The progress
bar shows how many are done, how many are validated so far, the time left,
and the name of the preset on screen.

## Running it

**Scan presets** is in the menu, below the everyday rows. It reads:

| Row text | Meaning |
|---|---|
| not run (OK to start) | This TV has never scanned; the validated list is the shipped benchmark |
| 57 of 395 done (OK to continue) | A scan was paused; OK carries on from preset 58 |
| done: 294 of 395 validated (OK to scan again) | Finished; OK starts a fresh pass |

While it runs, **Back** pauses it and everything else is ignored. The
position is kept, so a scan can be done in pieces across evenings. The scan
measures the presets it knows least about first (never measured, then those
with only the shipped figure, then the rest), so even a short run improves
the list.

Music does not matter either way. The Music Assistant connection stays up and
the track card stays hidden until the scan ends.

### If a preset takes the TV down

Rarely, a shader can crash the TV's browser or the TV. Before each preset the
scan notes its name on the TV; if the app comes back and finds that note, it
marks that preset as not validated (0 fps), drops it from the queue, says so
on screen, and leaves the scan paused where it was. Choose **Scan presets**
again to continue past it.

## The threshold: "Validate above"

A preset is validated when its measured frame rate is at or above the
**Validate above** setting: **30, 40, 45 or 60 fps**, 40 by default. Changing it
takes effect at once; the counts in the menu move and nothing needs
rescanning, because the measurements are kept, not the verdicts.

- **60**: only presets that never drop a frame. Strict; on a CX about half.
- **45**: smooth to the eye, with headroom for a busy passage. The default.
- **30**: for an older or slower TV, or if you would rather see more presets
  and accept some judder. Pairs well with **Frame rate cap** 30, which also
  saves power.

The runtime watch is separate and much lower: a preset that stays **under 20
fps for 4 seconds** while you watch is recorded as such and skipped if that
takes it out of the current list. The scan should make that rare.

## Reading the numbers

The **Validated** row in the menu shows the verdict for the preset on screen
and where it came from:

| Row text | Meaning |
|---|---|
| yes (58 fps) | Measured on this TV (or from the shipped benchmark if never scanned) and above the bar |
| no (31 fps) | Measured and below the bar |
| yes (by you, 41 fps) | You added it by hand; the measurement is shown for reference |
| no (by you, 55 fps) | You removed it by hand |
| not tested | Neither this TV nor the benchmark has a figure (a preset added to the packs later) |

What to expect: the benchmark shipped with the app, from an LG CX, puts 316
of 395 at or above 40 fps (303 at 45), with the lightest presets at the 60 fps
cap. Numbers within a couple of frames of the bar are the ones worth
a second look.

## Adding and removing by hand

Open the menu on any preset and press OK on **Validated**. It toggles:

- a preset the scan rejected is **added**; it joins the validated list and is
  never auto-skipped for being slow, since you chose it;
- a preset the scan accepted is **removed**; it leaves the list, though it
  can still be reached through *all* or *favorites*.

Toggling back to what the measurement says drops the override, so the row
returns to "yes (58 fps)" rather than sticking on "by you". Overrides survive
rescans: a new measurement never overrules a decision you made.

To look through what the scan rejected, set **Preset list** to *all*, step
with ↑/↓, and watch the Validated row.

## Favorites are separate

**Favorite** (Yellow) and **Validated** are independent lists with different
jobs. Validation is about the TV: can it draw this smoothly. Favorites are
about you: do you want this one. A slow preset can be a favorite; it is
simply not in the validated list, and shows up in the *favorites* list, where
it is never skipped for being slow. Favorites are shared across your TVs and
with Music Assistant's web interface; validation is per TV.

## When to scan again

- After moving the app to a different TV (each TV scans for itself; the
  results are kept per TV on the account).
- After a TV firmware update that changes graphics performance.
- If you changed **Validate above** and want fresh numbers near the new bar.
  Not required: the old numbers are compared to the new bar straight away.

A rescan replaces the measurements but keeps your hand-made overrides and
your favorites.

## For the curious

The shipped benchmark is `bench/lg-cx-webos5.json` in the repository: every
preset's frame rate on an LG OLED48CX, webOS 5, measured with music playing
through the development test link. `scripts/make-presets.mjs` bakes it into
the package as the seed. On the TV the measurements live in the `rated`
preference and the overrides in `validatedOverrides`, both mirrored to the
Music Assistant user under the TV's id; the development test link's `dump`
command (see [development.md](development.md)) prints them.
