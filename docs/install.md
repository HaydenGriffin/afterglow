# Install and sign in

## What you need

- A Music Assistant server (2.10 or later) with the **MilkDrop Visualizer**
  plugin added under Settings → Plugins, and a user account on it.
- An LG webOS TV with WebGL2 (an LG CX from 2020 and newer models do), on the
  same network as Music Assistant, that can install sideloaded apps.

## Get the package

Download `net.botworth.vizman_<version>_all.ipk` from the project's releases,
or build it yourself:

```
npm install
npm run package        # dist/net.botworth.vizman_<version>_all.ipk
```

The package contains no credentials and is the same for every TV.

## Install on the TV

**Rooted TV (Homebrew Channel / Glasshouse).** Hand the `.ipk` to the installer
on the TV, either as a file or by URL. `npm run serve-ipk` serves `dist/` on
port 8138 for the URL route. If you run Glasshouse and its page stalls at the
preview step, `npm run install-tv -- <tv-ip>` does the upload and the
confirmation through its API.

**Developer Mode (any webOS TV).** Install LG's Developer Mode app on the TV,
turn it on, then from your computer:

```
npx ares-setup-device        # add the TV with the passphrase Developer Mode shows
npx ares-install --device <name> dist/net.botworth.vizman_<version>_all.ipk
```

Developer Mode logs the TV out after a while (50 hours by default, extendable
in the app), which also removes sideloaded apps; the Homebrew route has no such
limit.

Either way the install stops a running viz-man; open it again from the TV's
home screen.

## First launch: sign in

viz-man asks for three things:

| Field | What to enter |
|---|---|
| Address | Music Assistant's IP or hostname, `host:port` if it is not on 8095 |
| Username | A Music Assistant user |
| Password | That user's password |

Use ↑/↓ to move between the fields, OK to open the TV's keyboard on a field,
and OK on **Sign in**. The app logs in, creates a long-lived token for this TV
named `viz-man on <model> (<id>)`, and keeps that token. The password is used
once and not stored. The token lasts a year; the app replaces it shortly before
it runs out.

### Where the token lives, and how to remove it

The token is kept in the app's own storage on the TV (webOS gives web apps no
encrypted store, so anyone with shell access to the TV could read it). It is
scoped to your Music Assistant user and can be revoked at any time:

- on the TV: OK → **Log out**. The token is removed from the account and the
  sign-in form comes back;
- in Music Assistant: Settings → Users → your user → tokens; remove the one
  named after the TV.

If Music Assistant stops accepting the token (revoked, expired, user disabled),
viz-man signs out on its own and shows the form again.

## Settings on the account

Favorites are shared by every TV using the account and with Music Assistant's
own MilkDrop favorites (the star in its web interface). Everything else
(validated presets, dimming, picked player, sync trim, menu settings) is kept
per TV, and mirrored to your Music Assistant user so a reinstall that wipes the
TV's app storage gets it back on the next launch.

## Update

Install the new `.ipk` the same way. Settings and the token are kept, unless
webOS wipes the app's storage, in which case the app asks you to sign in again
and restores the rest from the account.

## Uninstall

Log out first (OK → Log out) so the TV's token is removed from the account,
then remove the app from the TV's home screen or with
`npx ares-install --device <name> --remove net.botworth.vizman`.
