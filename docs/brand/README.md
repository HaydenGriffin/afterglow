# Afterglow logo

The wordmark is *afterglow* in lowercase Archivo (the app's own face, ExtraBold, outlined and kerned by hand)
with one change: the o is the sun. It sits a quarter of its height below the baseline and the baseline cuts it
off, so the word is the horizon and its o is setting. The app icon is a close-up of the same scene: a night sky
over dark ground, the sun going down at the horizon with two flat steps of dusk round it.

## Files

| File | Use |
|---|---|
| `afterglow-wordmark-paper.svg` | The wordmark in paper with an amber sun, for ink and other dark grounds |
| `afterglow-wordmark-ink.svg` | The wordmark in ink, one colour, for paper and other light grounds |
| `afterglow-icon.svg` | App icon master: sky, ground, the sun and its glow |
| `afterglow-icon-small.svg` | App icon for 32 px and under and the favicon: no glow, a larger sun |
| `afterglow-lockup.svg` | Icon and wordmark side by side, on ink |
| `afterglow-scene.svg` | The whole word on the horizon, sky above and ground below: banners, splash screens |
| `social-preview.svg`, `social-preview.png` | GitHub social preview, 1280 × 640 |

## Colour

| Name | HEX | RGB | Role |
|---|---|---|---|
| Sky | `#16233A` | 22 35 58 | The field above the horizon; `iconColor` |
| Sun | `#EEB875` | 238 184 117 | The o, and nothing else |
| Dusk, outer | `#242A47` | 36 42 71 | The glow's outer step |
| Dusk, inner | `#46394A` | 70 57 74 | The glow's inner step |
| Ink | `#121417` | 18 20 23 | The ground below the horizon; the one-colour wordmark |
| Paper | `#EFEBE3` | 239 235 227 | The letters on dark grounds |

The glow is two flat steps, never a gradient. In one colour the sun takes the letters' colour and stays cut by the
baseline. In the app, colour still comes from the album artwork: the sun's amber is the logo's, not a UI accent.

## The app icon

`app/icon.png` (80 × 80) and `app/largeIcon.png` (130 × 130) are `afterglow-icon.svg` rendered at those sizes;
`app/favicon.svg` is `afterglow-icon-small.svg`, and `app/favicon.ico` is the same at 16, 32 and 48 px. Any SVG
renderer does it, for example:

```sh
rsvg-convert -w 80 -h 80 docs/brand/afterglow-icon.svg -o app/icon.png
rsvg-convert -w 130 -h 130 docs/brand/afterglow-icon.svg -o app/largeIcon.png
```

The launcher's ribbon is near-black, so the ink ground melts into it and the sky is what holds the tile's square;
that is why the horizon sits low (70 % down) and `iconColor` in `app/appinfo.json` is the sky.

The SVGs are the masters. They were drawn with a small Python script (fontTools and skia-pathops over
`app/fonts/archivo-latin.woff2`) that is not part of this repository; edit the SVGs, not the PNGs.

## In the app

The logo appears only on screens you pass through or open on purpose, never on the now-playing or idle poster:
the TV is an OLED and a still logo would burn in.

- **Launch splash:** `app/splash.png` (1920 × 1080, `splashBackground` in `app/appinfo.json`), the scene with the
  word centred, as on the PS5.
- **Sign-in:** the scene drawn by CSS and an inline SVG in `app/index.html`: sky down to the horizon at 35vh,
  the word with its glow standing on it at column 5, as wide as the fields (44vw), the form below on ink.
- **Waiting for music:** `app/brand/afterglow-wordmark-paper.svg` (a copy of the master) above the line.
- **Settings:** the same file at the foot of the list, with the version.

## Clear space and minimum size

Keep clear space of one x-height round the wordmark, and use it at 96 px wide or more. Use the icon master down to
40 px; at 32 px and under use `afterglow-icon-small.svg`.

## Don't

Don't retype the word in a font, put the o back on the baseline or show the part below it, colour the letters
anything but paper or ink, turn the glow into a gradient or add shadows, or use the sun's amber anywhere but the
sun.
