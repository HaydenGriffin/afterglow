# Settings and remote keys

## Playback controls

**OK** opens the playback controls: a transport row (Previous, Play/Pause,
Next, Back 10 s, Ahead 10 s, Favourite, Details, Display) and, above it, a top
strip: **Browse · Now playing · Queue · Settings**. Left/right move along a
row, up/down move between the strip and the transport row, OK selects. Back
returns from a panel to the controls, then closes them; with everything closed
it leaves the app. The controls hide after nine seconds without a key. Pointer
clicks and the remote's play/pause keys also work; in a browser Space toggles
playback.

- **Browse:** recently played, favourite playlists, albums, songs and artists,
  radio stations, all playlists and albums. An item offers Play now, Play next,
  Add to the queue, Start radio from this and, for albums and playlists, Show
  songs.
- **Queue:** the next 12 songs of the queue being shown; a song offers Play now,
  Play next, Move up, Move down and Remove from the queue. **Playing on** picks
  the player Afterglow follows (see below). Shuffle, repeat, crossfade, keep
  playing when the queue ends, volume and the sleep timer are here too.
- **Details:** what the song is and how it is streamed (source, format,
  quality), with Start radio from this song and Add to favourites.
- **Display:** the view (Visuals only, Visuals + track, Album, Lyrics), MilkDrop
  behind artwork and lyrics (off by default; off stops GPU drawing in Album and
  Lyrics), and lyrics over Visuals + track. Untimed lyrics get a page control.
- **Settings:** the settings menu below.

Failed actions are shown; nothing is assumed to have worked while Music
Assistant is unreachable.

### Playing on

"Automatic" draws whatever is playing, the most recently started queue when
several are, and stays with it until it stops. A picked speaker is drawn
whenever music plays on it, switching to it the moment it starts; while it is
silent, Automatic fills in. Sync groups are resolved by Music Assistant: pick
any speaker in a group and its group's music is drawn. The list holds the
available speakers and groups, and the choice is kept per TV. A speaker that
claims to play but has nothing Music Assistant decodes (a Sonos playing Spotify
on its own, a TV input) is passed over.

## Remote

With the playback controls and the menu closed:

| Key | Action |
|---|---|
| ↑ / ↓ | Next / previous preset, within the list being browsed |
| ← / → | Dim the visualizer down / up, in steps of 10% |
| OK | Open the playback controls |
| Yellow | Add the preset to the favourites, or remove it |
| Blue | Cycle the preset list: runs well here → all → favourites |
| Red / Green | Picture and lyrics timing −25 ms / +25 ms |
| Back | Close the menu; pause a running scan; otherwise leave the app |

In a browser, F and L stand in for Yellow and Blue, R and G for Red and Green;
arrows, Enter and Escape work as on the remote. Some views (Album, Lyrics) and
the settings menu may handle keys of their own; the on-screen focus shows what
a key will act on.

## Menu

**Settings** in the top strip opens the menu. Up/down pick a row, left/right
change its value (OK also steps forward); Back closes it and returns to the
playback controls. It closes by itself after 12 seconds without a key. Rows
that do not apply (no speaker on, MilkDrop off) are hidden.

| Row | Values | Default | Notes |
|---|---|---|---|
| **Sound & sync** | | | |
| Play on this TV | Off / player name · state | Off | Plays the music on the TV too, as a Music Assistant player through Sendspin. Switching it on again comes back as the same player |
| TV output compensation | None / Sound sent n ms early | from Music Assistant | Shown while Play on this TV is on. Compensates the TV's own output latency so its sound lands with the other speakers, in 10 ms steps; saved as the player's Sendspin delay in Music Assistant |
| Picture and lyrics timing | With the music / n ms after / before the music | With the music | Shifts MilkDrop and timed lyrics together, in 25 ms steps. Also Red/Green |
| **Display** | | | |
| Dim visualizer | 0% … 90% | 0% | Darkens the picture; black stays black |
| Track info | When a song starts / Always / Off | When a song starts | The artist, title, album and label card, lower left |
| Dim track info | 0% … 90% | 0% | Darkens the card, independently of the picture |
| Hold screen when idle | On / Off | Off | Keep the screensaver off even while nothing plays |
| Color | The preset's own / From the artwork | The preset's own | Gives the preset's waveform, borders and motion vectors the hue of the track's artwork, at the brightness the preset meant for them, from the palette Music Assistant sends with the stream ("Tint with track color" in the plugin's settings, on by default). Presets that paint everything in their own shaders change little |
| Color strength | 25% … 100% | 100% | How far toward the artwork colors; shown while Color is From the artwork |
| **Visuals & presets** | | | |
| Preset | position and name | last used | Left/right step through the list being browsed |
| Favorite | Yes / No | — | Shared with Music Assistant's MilkDrop favourites and with other TVs on the account |
| Validated | Yes (52 fps) / No (18 fps) / Yes (by you) / No (by you) / Not tested | by measurement | OK adds or removes this preset from the validated list by hand. An override that agrees with the measurement again is dropped |
| Preset list | Runs well here / All presets / Favourite presets, with a count | Runs well here | Which presets ↑/↓, shuffle and the timer draw from. A favourites list with nothing in it shows all |
| Preset order | Shuffled / In order | Shuffled | How ↑/↓ move |
| Change preset | Never / Every 30 s / 2 min / 5 min | Every 2 min | Picks a random preset from the list on a timer |
| Auto level | On / Off | Off | Scales quiet tracks so they still fill the picture |
| MilkDrop | off: reason (OK to retry) | — | Only shown when MilkDrop could not start |
| **Performance** | | | |
| Picture size | Full / Lighter / Lightest | Full | Fewer pixels for MilkDrop, leaving more of the TV for Play on this TV. Applies at once |
| Frame rate cap | 60 / 30 fps | 30 | 30 saves power on a TV that struggles |
| Scan presets | Not run / n of 395 done / Done | — | See below |
| Validate above | 30 / 40 / 45 / 60 fps | 40 | The bar a preset's measured frame rate must clear to be validated; takes effect at once |
| **Account & diagnostics** | | | |
| Debug readout | On / Off | Off | Frame rate, connection, buffer, errors, sync log |
| Log out | user @ host | — | Revokes this TV's token on the account and shows the sign-in form |

### Timing

Every speaker, the TV included, plays the group's music in step on Music
Assistant's clock. **TV output compensation** is the player's Sendspin delay
(positive sends the TV's sound earlier) and only makes up for the TV's own
output path, such as ARC to a soundbar; it is not added again to the picture.
MilkDrop and timed lyrics follow the group clock, shifted by **Picture and
lyrics timing** (positive means later). The progress bar shows the queue's
media position. The sync figure in the menu draws the music and the picture on
one timeline.

## Presets, validation and favorites

All 395 presets from the butterchurn-presets packs are in the package. They
differ enormously in cost: on an LG CX some hold 60 fps and others manage 5.
Three lists sort this out:

- **Validated** ("Runs well here", the default list): the presets whose measured frame rate on
  this TV is at or above "Validate above", plus the ones you added by hand,
  minus the ones you removed. Until the TV has run its own scan, the
  measurements are the ones from an LG CX shipped with the app (316 of 395 at
  40 fps).
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
  done · OK continues" and carries on from the same place.
- Presets nobody has measured are scanned first, then those known only from the
  shipped benchmark, then the rest, so a scan cut short still helps most.
- If a preset takes the TV down mid-scan, the next launch marks that preset as
  not validated, says so, and leaves the scan paused where it was.
- After a full pass, "Scan presets" reads "Done: n of 395 run well · OK scans
  again". "Validate above" moves the bar without rescanning.
