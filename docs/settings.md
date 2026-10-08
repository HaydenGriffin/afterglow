# Settings and remote keys

## Remote

| Key | Action |
|---|---|
| ↑ / ↓ | Next / previous preset, within the list being browsed |
| ← / → | Dim the visualizer down / up, in steps of 10% |
| OK | Open the menu |
| Yellow | Add the preset to the favorites, or remove it |
| Blue | Cycle the preset list: validated → all → favorites |
| Red / Green | Sync trim −25 ms / +25 ms |
| Back | Close the menu; pause a running scan; otherwise leave the app |

In a browser, F and L stand in for Yellow and Blue, R and G for Red and Green;
arrows, Enter and Escape work as on the remote.

## Menu

OK opens the menu; ↑/↓ pick a row, ←/→ change its value (OK also steps
forward), Back closes it. It closes by itself after a few seconds.

| Row | Values | Default | Notes |
|---|---|---|---|
| Preset | position and name | last used | ←/→ step through the list being browsed |
| Favorite | ★ yes / no | — | Shared with Music Assistant's MilkDrop favorites and with other TVs on the account |
| Validated | yes (52 fps) / no (18 fps) / yes (by you) / no (by you) / not tested | by measurement | OK adds or removes this preset from the validated list by hand. An override that agrees with the measurement again is dropped |
| Preset list | validated (n) / all (n) / favorites (n) | validated | Which presets ↑/↓, random order and the timer draw from. A favorites list with nothing in it shows all |
| Preset order | random / in order | random | How ↑/↓ move |
| Change preset | never / every 30 s / 2 min / 5 min | every 2 min | Picks a random preset from the list on a timer |
| Dim visualizer | 0% … 90% | 0% | Darkens the picture; black stays black |
| Track info | at track start / always / off | at track start | The artist, title, album and label card, lower left |
| Dim track info | 0% … 90% | 0% | Darkens the card, independently of the picture |
| Player | Auto / a speaker | Auto | See below |
| Sync trim | ms | 0 ms | Positive shows each frame later. Also Red/Green |
| Auto level | on / off | on | Scales quiet tracks so they still fill the picture |
| Frame rate cap | 60 / 30 fps | 60 | 30 saves power on a TV that struggles |
| Hold screen when idle | on / off | off | Keep the screensaver off even while nothing plays |
| Scan presets | not run / n of 395 done / done | — | See below |
| Validate above | 30 / 45 / 60 fps | 45 | The bar a preset's measured frame rate must clear to be validated; takes effect at once |
| MilkDrop | off: reason (OK to retry) | — | Only shown when MilkDrop could not start |
| Debug readout | on / off | off | Frame rate, connection, buffer, errors, sync log |
| Log out | user @ host | — | Revokes this TV's token on the account and shows the sign-in form |
| Close menu | | | |

### Player

"Auto" draws whatever is playing, the most recently started queue when several
are, and stays with it until it stops. A picked speaker is drawn whenever music
plays on it, switching to it the moment it starts; while it is silent, Auto
fills in. Sync groups are resolved by Music Assistant: pick any speaker in a
group and its group's music is drawn. The list holds the real, available
speakers (no group entities), and the choice is kept per TV. A speaker that
claims to play but has nothing Music Assistant decodes (a Sonos playing Spotify
on its own, a TV input) is passed over.

## Presets, validation and favorites

All 395 presets from the butterchurn-presets packs are in the package. They
differ enormously in cost: on an LG CX some hold 60 fps and others manage 5.
Three lists sort this out:

- **Validated** (the default list): the presets whose measured frame rate on
  this TV is at or above "Validate above", plus the ones you added by hand,
  minus the ones you removed. Until the TV has run its own scan, the
  measurements are the ones from an LG CX shipped with the app (280 of 395 at
  45 fps).
- **All**: every preset.
- **Favorites**: the ones you starred, on this TV or any other on the account,
  or in Music Assistant's web interface. Favorites are independent of
  validation: a slow preset can be a favorite, and a favorite is never skipped
  for being slow.

A preset that stays below 20 fps for a few seconds while you watch is recorded
as such and, if that takes it out of the list being browsed, skipped; favorites
and presets you validated by hand are only recorded, never skipped.

### Scan presets

The full account is in [preset-scan.md](preset-scan.md).

"Scan presets" shows every preset for about 5 seconds (3 to settle, 2 to
measure) and records the frame rate the TV manages: roughly 35 minutes for a
full pass. It runs on a built-in signal rather than the music, so every preset
is measured on the same input, with the frame rate cap lifted and the preset
timer paused. A bar at the bottom shows the progress and an estimate of the
time left.

- **Back** pauses the scan; "Scan presets" in the menu then reads "n of 395
  done (OK to continue)" and carries on from the same place.
- Presets nobody has measured are scanned first, then those known only from the
  shipped benchmark, then the rest, so a scan cut short still helps most.
- If a preset takes the TV down mid-scan, the next launch marks that preset as
  not validated, says so, and leaves the scan paused where it was.
- After a full pass, "Scan presets" reads "done: n of 395 validated (OK to scan
  again)". "Validate above" moves the bar without rescanning.
