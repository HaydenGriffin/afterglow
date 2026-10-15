# Afterglow logo

The logo is a poster block: AFTER over GLOW, set to one width in heavy condensed capitals (Archivo, the
app's own face, outlined and kerned by hand). The F's stem runs on down into the L, so the two lines are one
piece. There is no symbol; the block is the logo, and AF over GL is its small cut.

## Files

| File | Use |
|---|---|
| `afterglow-wordmark-ink.svg` | The block in ink, for paper and other light grounds |
| `afterglow-wordmark-paper.svg` | The block in paper, for ink and other dark grounds |
| `afterglow-small-ink.svg`, `afterglow-small-paper.svg` | AF over GL, for 32 px and below |
| `afterglow-icon.svg` | App icon master: ink block on a paper tile |
| `afterglow-icon-small.svg` | Small app icon and favicon: AF over GL on a paper tile |
| `afterglow-icon-16.svg` | The 16 px favicon, drawn on the pixel grid |
| `social-preview.svg`, `social-preview.png` | GitHub social preview, 1280 × 640 |

## Colour

| Name | HEX | RGB |
|---|---|---|
| Ink | `#121417` | 18 20 23 |
| Paper | `#EFEBE3` | 239 235 227 |

Ink on paper or paper on ink, nothing else. In the app, colour comes from the album artwork, not the logo.

## The app icon

The TV launcher's ribbon is near-black, so an ink tile disappears into it and leaves the letters floating, smaller
than the neighbouring icons. The icon is therefore the other way round: ink lettering on a paper tile, which holds
its square on the ribbon and keeps the F-into-L join readable at 80 px. `iconColor` in `app/appinfo.json` is the
tile's paper.

`app/icon.png` (80 × 80) and `app/largeIcon.png` (130 × 130) are `afterglow-icon.svg` rendered at those sizes,
and `app/favicon.ico` is `afterglow-icon-16.svg` and `afterglow-icon-small.svg` at 16 and 32 px. Any SVG renderer
does it, for example:

```sh
rsvg-convert -w 80 -h 80 docs/brand/afterglow-icon.svg -o app/icon.png
rsvg-convert -w 130 -h 130 docs/brand/afterglow-icon.svg -o app/largeIcon.png
```

The SVGs are the masters. They were drawn with a small Python script (fontTools and skia-pathops over
`app/fonts/archivo-latin.woff2`) that is not part of this repository; edit the SVGs, not the PNGs.

## Clear space and minimum size

Keep clear space of one stem width (the width of the F and L stem) on every side. Use the block down to 48 px tall
on screen; below that, and always at 32 px and under, use AF over GL.

## Don't

Don't retype the logo in a font, set AFTERGLOW on one line, separate the F and L stems, stretch it, recolour it or
add effects to it.
