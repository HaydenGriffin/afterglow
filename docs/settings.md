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

- **Browse:** Search, then recently played, favourite playlists, albums, songs
  and artists, radio stations, all playlists and albums. Search opens the TV
  keyboard (type or say an artist, album or song) and lists the artists,
  albums, songs and playlists found. An item offers Play now, Play next, Add to
  the queue, Start radio from this (not for radio stations) and, for albums,
  playlists and artists, Show songs.
- **Queue:** the next 12 songs of the queue commands act on; a song offers Play
  now, Play next, Move up, Move down and Remove from the queue. **Playing on**
  picks the player Afterglow follows (see below); picking a silent speaker
  while music plays elsewhere moves the music to it. **Play on this TV** (shown
  while Play on this TV is on and the music is elsewhere) moves the music to
  the TV. **Speakers together** ticks the speakers that play the same music as
  the chosen one; speakers that cannot join, and the group's leader, are listed
  but cannot be changed. Shuffle, repeat, crossfade, keep playing when the
  queue ends, volume (a group's volume for a group) and the sleep timer are
  here too.
- **Details:** what the song is and how it is streamed (source, format,
  quality), with Start radio from this song and Add to favourites.
- **Display** (saved on this TV):
  - The view: **Visuals only** (MilkDrop alone), **Visuals + track** (MilkDrop
    with the track card), **Album** (the complete artwork, song, artist and up
    next) or **Lyrics** (the artwork with the song's lyrics beside it: the
    current line leads, with word-by-word karaoke when the lyrics carry word
    timing).
  - **Lyrics**, shown in the Lyrics view or while lyrics are over Visuals +
    track: **Lyrics timing** moves the words only, up to 10 s earlier or
    later in 100 ms steps (left/right; "With the music" at zero), and
    **Reset lyrics timing** puts it back to zero. **Online lyrics** (On by
    default, synced with your other TVs): when Music Assistant has no lyrics
    for a song, the TV asks lrclib.net directly, sending the title and artist;
    Off keeps lyrics to what Music Assistant provides, and switching it back
    On looks up a song that had none again. **Retry lyrics** appears
    when the lookup failed or found nothing, and asks again (a manual retry
    also clears a remembered "no lyrics").
  - **Extras:** **MilkDrop behind artwork and lyrics** (off by default; off
    stops GPU drawing in Album and Lyrics), **Lyrics over Visuals + track**
    (below), and **Lyrics page** for untimed lyrics.
  - **Lyrics over Visuals + track:** **Off** (the default), **One line** (the
    current timed line in the track card's corner) or **Stage** (the current
    line large, centred). While One line or Stage is chosen, three rows follow
    and act on that overlay only; each overlay keeps its own, saved on this TV
    and synced with its settings on the account:

    | Row | Values | One line default | Stage default |
    |---|---|---|---|
    | Position | Top / Middle / Bottom | Bottom | Middle |
    | Background | Box / Shade / None | Box | Box |
    | Size | Small / Medium / Large | Medium | Medium |

    Box is the flat ink field; Shade a band of the ground across the whole
    screen width, fading out above and below the text; None text only, with a soft dark edge to stay readable over
    bright visuals. Small and Large are about 0.8x and 1.25x Medium; long lines
    wrap. Top sits below the notices, Middle at the screen's vertical centre
    (moved off the "Waiting for music" line or a tall track card), Bottom on
    the lower margin, stacked above the track card while it shows. The overlay
    steps aside while controls or a panel are open and is back, with the new
    look, as soon as they close. **Dim track info** dims it with the card.
- **Settings:** the settings menu below.

Failed actions are shown; nothing is assumed to have worked while Music
Assistant is unreachable.

Lists longer than their sheet (Settings, Display, Queue and its Play on and
Speakers together pages, Details, Browse) show **More** with a chevron at the
lower edge, over a fade of the last visible row, and the same at the top once
rows sit above; the focused row always keeps one row visible beyond it.

The progress bar under Album and Lyrics moves every frame with the song;
small corrections from Music Assistant are eased in rather than jumped, a seek
or a new song moves it at once, and it holds still while paused.

### Idle poster

When nothing has played for 8 seconds (30 seconds after a pause), the screen
sets what was played recently as a poster: the paused song first (OK resumes
it), then recently played items (OK plays one), and Browse last. Left/right
move along the strip; every other key keeps its usual meaning. After three
minutes without a key it steps down to a dim register, and the first key only
wakes it. While no song is shown the poster's fields are neutral, not the last
song's colours.

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

With the playback controls and the menu closed, in Visuals only and Visuals +
track:

| Key | Action |
|---|---|
| ↑ / ↓ | Next / previous preset, within the list being browsed |
| ← / → | Dim the visualizer down / up, in steps of 10% |
| OK | Open the playback controls |
| Yellow | Add the preset to the favourites, or remove it |
| Blue | Cycle the preset list: runs well here → all → favourites |
| Red / Green | Picture and lyrics timing −25 ms / +25 ms |
| Back | Close the menu; pause a running scan; otherwise leave the app |

In every view, and with the playback controls open:

| Key | Action |
|---|---|
| Play / Pause / Play-pause | Play, pause, or toggle the queue commands act on |
| Stop | Pause (Music Assistant keeps the queue) |
| Fast-forward / Rewind | Next / previous track |

These keys act once per press, even when held (the arrows still repeat), and
skips pressed while one is under way collapse to one waiting skip per direction.

In Album and Lyrics the keys work the song instead:

| Key | Action |
|---|---|
| ← / → | Seek back / ahead 10 s; with untimed lyrics, previous / next page |
| ↑ / ↓ | Next / previous preset when MilkDrop runs behind; otherwise a hint (untimed lyrics: previous / next page) |
| Yellow | Add the song to the favourites in Music Assistant |
| Blue | Cycle the preset list, only when MilkDrop runs behind |

In a browser, F and L stand in for Yellow and Blue, R and G for Red and Green;
arrows, Enter and Escape work as on the remote. The settings menu and the
idle poster handle keys of their own; the on-screen focus shows what a key
will act on.

## Menu

**Settings** in the top strip opens the menu. Up/down pick a row, left/right
change its value (OK also steps forward); Back closes it and returns to the
playback controls. It closes by itself after 45 seconds without a key. Rows
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
lyrics timing** (positive means later), which you set by eye against the
sound. **Lyrics timing** (Display → Lyrics) is a second, words-only offset on
top of it, for lyrics whose own timestamps run early or late: it moves neither
the picture nor the sound, nor the progress bar or seeking. The progress bar
shows the queue's media position. The sync figure in the menu draws the music and the picture on
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
