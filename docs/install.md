# Setting up viz-man

A walkthrough from nothing to a tuned visualizer. Budget an hour the first
time: most of it is the preset scan running on its own.

1. [Check what you need](#1-what-you-need)
2. [Add the plugin to Music Assistant](#2-add-the-milkdrop-visualizer-plugin)
3. [Install the app on the TV](#3-install-the-app-on-the-tv)
4. [Sign in](#4-sign-in)
5. [Get a first picture](#5-get-a-first-picture)
6. [Pick the speaker and fix the timing](#6-pick-the-speaker-and-fix-the-timing)
7. [Run the preset scan](#7-run-the-preset-scan)
8. [Shape the show](#8-shape-the-show)
9. [More TVs](#9-more-tvs)
10. [Keeping it running](#10-keeping-it-running)

---

## 1. What you need

- **Music Assistant 2.10 or newer**, reachable from the TV over the local
  network, and a user account on it (the one you log into its web interface
  with). Home Assistant's ingress address does not work; the TV needs Music
  Assistant's own address and port (8095 unless you changed it).
- **Speakers Music Assistant streams to itself**: Sonos, Chromecast, AirPlay,
  Squeezelite, Snapcast, DLNA, and the like. The visualizer draws the audio
  Music Assistant decodes. A Sonos playing Spotify straight from the Spotify
  app, or a TV input, carries nothing it can draw.
- **An LG webOS TV with WebGL2.** Every LG OLED and NanoCell from 2020 (CX,
  BX, GX, NANO) onward qualifies, and many earlier ones. The app says so on
  screen if the TV lacks it.
- **A way to install an app that is not in LG's store.** Either the TV is
  rooted and runs the [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel),
  or you turn on LG's **Developer Mode**. Section 3 covers both.

## 2. Add the MilkDrop Visualizer plugin

In Music Assistant's web interface: **Settings → Plugins → Add plugin →
MilkDrop Visualizer**. Keep its defaults and save. The plugin streams the
waveform of whatever is playing, a few seconds ahead, which is what the TV
draws in time with the music. Without it the TV connects, signs in, and shows
"Waiting for music" forever.

## 3. Install the app on the TV

Get `net.botworth.vizman_<version>_all.ipk` from the
[releases page](https://github.com/mnestrud/viz-man/releases), or build it
with `npm install && npm run package` (it lands in `dist/`). The package is
the same for every TV and contains no credentials.

### Rooted TV with the Homebrew Channel

Any of these works; pick what you have.

- **Homebrew Channel on the TV**: it installs `.ipk` files from a URL. Put the
  package on any web server on your network and enter its address. From a
  checkout of this repo, `npm run serve-ipk` serves `dist/` on port 8138 and
  prints the URL to enter.
- **[Glasshouse](https://github.com/rorygallagher2024/lg-webos-dashboard)**:
  Apps tab → switch on *Install from a URL or a file* (it warns you, that is
  expected) → **Upload .ipk** or **From URL…** → confirm the preview. Switch
  sideloading off again afterwards. From a checkout, `npm run install-tv --
  <tv-ip>` does the upload and the confirmation through Glasshouse's API.
- **Shell on the TV** (SSH or telnet): copy the package over and run
  `luna-send -n 1 luna://com.webos.appInstallService/dev/install '{"id":"net.botworth.vizman","ipkUrl":"/tmp/vizman.ipk","subscribe":true}'`.

### Developer Mode (any webOS TV, no root)

1. On the TV, install **Developer Mode** from LG's Content Store, sign in with
   an LG developer account (free, created at webostv.developer.lge.com), and
   turn **Dev Mode Status** on. The TV restarts. Note the passphrase it shows
   and turn **Key Server** on.
2. On a computer on the same network, from a checkout of this repo (the webOS
   CLI is a dev dependency, so `npm install` provides it):

   ```
   npx ares-setup-device        # add the TV: its IP, port 9922, user prisoner, the passphrase
   npx ares-install --device <name> dist/net.botworth.vizman_<version>_all.ipk
   ```

3. Developer Mode's session expires after 50 hours and takes sideloaded apps
   with it. Extend it from the Developer Mode app before it runs out, or
   reinstall; the TV's settings and sign-in survive a reinstall, and anything
   the TV loses comes back from your Music Assistant account.

Either way, an install stops a running viz-man. Open it from the home screen.

## 4. Sign in

The first launch shows a form with three fields. With the Magic Remote,
either point and click, or use ↑/↓ to move between rows and **OK** to act on
one.

| Field | Enter |
|---|---|
| Address | Music Assistant's IP or hostname, with `:port` if it is not on 8095. Example: `192.168.1.10` |
| Username | Your Music Assistant username |
| Password | Its password |

OK on a field opens the TV's keyboard. Finish each field with the keyboard's
**Enter**, which moves to the next row; **Back** closes the keyboard without
moving. OK on **Sign in** submits.

What happens: the app logs in once, asks Music Assistant for a **long-lived
token named after the TV** (`viz-man on OLED48CXPUB (a1b2c3)`, say), stores
that token, and forgets the password. The token appears in Music Assistant
under Settings → Users → your user, alongside its tokens for your phone and
browser; you can remove it there at any time, or with **Log out** in the TV's
menu. It lasts a year and the app replaces it a month before it runs out.

The token lives in the app's own storage on the TV. webOS gives web apps no
encrypted store, so anyone with shell access to the TV could read it; it is
scoped to your user and revocable, which is the protection you have.

If sign-in fails, the message says why:

| Message | Meaning |
|---|---|
| No answer from … / Could not connect to … | Wrong address or port, Music Assistant not running, or the TV on another network |
| Invalid username or password | As it says; usernames are case-insensitive, passwords are not |
| Login failed … rate limit | Too many tries; wait a minute |

## 5. Get a first picture

Play something on a speaker. Within a few seconds the TV shows a MilkDrop
preset moving with the music; the track's artist, title and album slide in at
the lower left. Press **OK** for the menu, **Back** to close it.

If the screen stays on "Waiting for music":

- Is the MilkDrop Visualizer plugin added (section 2)?
- Is the speaker one Music Assistant streams to itself (section 1)? Pick it
  in the **Player** row to see whether the app can draw it; "(unavailable)" or
  no change means Music Assistant has no audio for it.
- Turn on **Debug readout** in the menu. `relay: open` and `buffer: … frames`
  mean the waveform is arriving; `relay: rejected` means the token stopped
  working (the app signs out by itself in that case); `follow: waiting` means
  Music Assistant reports nothing playing.

If MilkDrop itself cannot start, the screen says why: no WebGL2 (nothing to do
on that TV), or it did not survive its last start (the menu's **MilkDrop** row
lets you retry).

## 6. Pick the speaker and fix the timing

**Player.** "Auto" draws whatever is playing: the most recently started speaker
when several are, until it stops. For a TV in one room, pick that room's
speaker instead; it is then drawn whenever it plays, and Auto fills in while it
is silent. Speakers in a sync group all sound the same queue, so picking any
member draws the group's music.

**Sync trim.** Music Assistant's stream carries timestamps and the TV's clock
is matched to the server's, so the picture is usually on the beat out of the
box. If it leads or trails the sound, press **Green** to show frames later and
**Red** to show them earlier, 25 ms a step (or use the **Sync trim** row). A
bass-heavy track with a plain preset such as a simple spectrum or wave makes
the offset easy to see. The value is kept per TV; speakers with large buffers
(Bluetooth, some Chromecasts) may want a few hundred milliseconds.

## 7. Run the preset scan

This is the step that makes the difference between a show and a slideshow.
[docs/preset-scan.md](preset-scan.md) explains it in full; the short version:

1. Open the menu and choose **Scan presets** (near the bottom). The screen
   shows "Scanning presets 0 / 395" with the preset names going by.
2. Leave it alone for about **35 minutes**. Music may play or not; the scan
   uses its own signal either way. You can watch, or press **Back** to pause
   and pick it up later from the same row.
3. When it finishes, the menu's **Preset list** row shows the result:
   "validated (294)", say. That list is what the TV plays by default.

Until you scan, the validated list is borrowed from an LG CX. On a faster TV
that leaves good presets out; on a slower one it lets stutterers in. Scan once
per TV.

## 8. Shape the show

All in the menu; see [docs/settings.md](settings.md) for every row.

- **Preset list**: *validated* (the scan's pick), *all*, or *favorites*. The
  Blue key cycles them without the menu.
- **Preset order** random, **Change preset** every 2 minutes: the defaults
  give a rotating show. "Never" stays on the preset you chose.
- **Favorite** (Yellow key) marks the preset on screen. Favorites are shared
  with Music Assistant's own MilkDrop favorites and across your TVs, and are
  independent of the scan: a slow preset can be a favorite.
- **Validated** adds or removes the current preset from the validated list by
  hand, when you disagree with the scan.
- **Dim visualizer** and **Dim track info** darken the picture and the card
  for evenings; ←/→ dim the picture without opening the menu.
- **Track info** at track start, always, or off.

## 9. More TVs

Install and sign in on each TV with the same Music Assistant user. Each TV gets
its own token and keeps its own settings, validated list and sync trim, all
mirrored to the account under that TV's id. Favorites are shared. Run the scan
on each TV; what one TV can draw says nothing about another.

## 10. Keeping it running

- **Updating**: install the new package the same way. Settings and the sign-in
  stay. If webOS wipes the app's storage (Developer Mode expiring, a factory
  reset), the app asks you to sign in again and restores everything else from
  the account, favorites and scan results included.
- **Screensaver**: the app holds the TV's screensaver off while music plays
  and lets it run when the music stops, unless **Hold screen when idle** is on.
  It also nudges the picture a few pixels every two minutes against burn-in.
- **Signing out**: OK → **Log out** removes the TV's token from the account
  and shows the sign-in form. Do this before uninstalling or lending the TV.
- **Uninstalling**: from the TV's home screen, Glasshouse's Apps tab, or
  `npx ares-install --device <name> --remove net.botworth.vizman`.
