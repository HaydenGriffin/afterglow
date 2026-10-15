---
name: Afterglow
description: Each track set as a Swiss concert poster on a TV, read from the sofa.
colors:
  ink: "rgb(18,20,23)"
  paper: "rgb(239,235,227)"
  paper-2: "rgba(239,235,227,.68)"
  rule: "rgba(239,235,227,.28)"
  field-a-neutral: "rgb(62,66,72)"
  field-b-neutral: "rgb(38,41,46)"
  paper-night: "rgb(196,192,185)"
  paper-2-night: "rgba(196,192,185,.72)"
typography:
  display-short:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "18vh"
    fontWeight: 820
    lineHeight: 0.86
    letterSpacing: "-.02em"
    fontVariation: "'wdth' 80"
  display:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "13.6vh"
    fontWeight: 820
    lineHeight: 0.9
    letterSpacing: "-.02em"
    fontVariation: "'wdth' 80"
  display-long:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "9.8vh"
    fontWeight: 820
    lineHeight: 0.92
    letterSpacing: "-.02em"
    fontVariation: "'wdth' 80"
  display-xlong:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "7.4vh"
    fontWeight: 820
    lineHeight: 0.95
    letterSpacing: "-.02em"
    fontVariation: "'wdth' 80"
  headline:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "9vh"
    fontWeight: 820
    lineHeight: 0.92
    letterSpacing: "-.02em"
    fontVariation: "'wdth' 80"
  lyric-now:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "8.4vh"
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: "-.015em"
    fontVariation: "'wdth' 82"
  panel-title:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "6vh"
    fontWeight: 820
    lineHeight: 1
    letterSpacing: "-.015em"
    fontVariation: "'wdth' 82"
  title:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "5vh"
    fontWeight: 750
    lineHeight: 1.05
    fontVariation: "'wdth' 88"
  body:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.6vh"
    fontWeight: 600
    lineHeight: 1.3
  label:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.2vh"
    fontWeight: 800
    letterSpacing: ".02em"
  caption:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.2vh"
    fontWeight: 500
    letterSpacing: ".01em"
  figures:
    fontFamily: "Archivo, Helvetica Neue, Arial, sans-serif"
    fontSize: "2.3vh"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  none: "0"
spacing:
  hair: ".19vh"
  margin: "5vw"
  gutter: "1.25vw"
  column: "6.354vw"
  column-step: "7.604vw"
  art-width: "34.16vw"
  top: "6vh"
  field-pad: "2.6vh 1.4vw"
components:
  button-focus:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
  transport-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: "1.6vh 1vw"
    width: "10vw"
    height: "11vh"
  player-option:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "1.2vh 1vw"
    height: "7vh"
  nav-item:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    padding: "0 1.4vw"
    height: "10vh"
  field-a:
    backgroundColor: "{colors.field-a-neutral}"
    textColor: "{colors.paper}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    padding: "{spacing.field-pad}"
    width: "36.77vw"
    height: "23vh"
  field-b:
    backgroundColor: "{colors.field-b-neutral}"
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "{spacing.field-pad}"
    height: "23vh"
  panel:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    padding: "6vh 5vw 4vh 1.26vw"
  toast:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    padding: "1.4vh 1.6vw"
---

# Design System: Afterglow

## Overview

## Listening screen (1.5)

Album and Lyrics views favour complete artwork and lyrics over the cropped cover and large colour blocks. For Album and Lyrics views, this section supersedes the poster layout, field components, and track-change motion described below. The controls and panels keep the established Archivo, ink/paper palette, remote focus, and navigation.

Artwork is contained inside a square at 6vw from the left and 16vh from the top, 30vw wide, with no cropping. The right column starts at 43vw. In Lyrics view, quiet song and artist text sits below the cover; the current line leads the right column, with smaller preceding and following lines. Album view uses that column for the song title and artist. A single plain “Up next” line and a thin progress rule finish the screen. All content has TV-safe breathing room. Large coloured information blocks and their reveal animation are removed. Visuals captions and lyric overlays use a dark ink ground with paper text.

The lyrics timing adjustment affects words only; it does not move the audio, visualizer, progress, or seek target. A failed lookup and a confirmed missing recording remain distinct states, both with a Retry lyrics row under Lyrics in Display.

Pure black remains intentional for the underlying visualizer canvas and the OLED bedtime screen.

**Original poster system (retained for the existing controls and reference)**

Every song is set as a Swiss International Style concert poster (Müller-Brockmann, Tonhalle Zürich): one enormous condensed grotesk title locked to a strict 12-column grid, the cover bleeding off the left edge at full height, and two flat colour fields cut from that cover's own palette. The world refuses the category default of a blurred-artwork backdrop with a polite square cover beside centred text. Nothing glows, nothing blurs, nothing is gradated; the poster changes colour with every track because the artwork does, and there is no fixed accent colour.

The surface is a TV, a large OLED read from about 3 m in a dim room with a 5-way remote and Back. Density is low and the type is very large: the title owns the upper two thirds of the right side, panels slide in as full-height ink sheets over the right zone, and every interactive row is at least 6.4vh tall. The UI is drawn in viewport units (vh for type, vw for the grid) so 720p and 1080p panels render the same poster.

MilkDrop stays the visual authority. In the two Visuals modes the poster is hidden and the only Afterglow element is a single flat field caption over the visualizer; the poster world never paints over MilkDrop with its own effects.

**Key Characteristics:**
- Near-black ink ground, one warm paper white, two per-track flat fields from the artwork.
- One family, Archivo variable (400–900 weight, 62–125% width), self-hosted woff2 latin + latin-ext.
- Title size chosen by length (18 / 13.6 / 9.8 / 7.4vh), never scaled to fit by script.
- 2 px hairlines (.19vh) are the only lines; square corners everywhere.
- One state vocabulary: focus inverts to paper on ink, chosen carries a drawn tick, disabled drops to 45%.
- One motion moment: a ground-coloured cover slides off each field on song change.
- After 22:00 the whole poster steps down to a night register.

## Colors

Two fixed neutrals and two fields that belong to the song, not the app.

### Primary
- **Field A, the cover's loudest colour** (per track; neutral fallback `field-a-neutral`): the most chromatic of Music Assistant's artwork palette roles (primary, accent, background_light, background_dark). Fills the artist/album field, the Visuals + track caption, the lyric overlay, the Sign in button and the picture mark on the sync timeline. Written by the player at runtime into the field-a property.

### Secondary
- **Field B, the contrasting colour** (per track; neutral fallback `field-b-neutral`): the next palette role that differs from A by more than 0.08 luminance or carries chroma above 40; otherwise A darkened to 55%. Fills the Next field and stands behind artwork and thumbnails while they load.

### Neutral
- **Tonhalle Ink** (`ink`): the ground of every poster, panel, nav strip, transport band and sign-in screen; also the text colour on focus.
- **Programme Paper** (`paper`): titles, body text, focus fill, progress fill, toast and error fill. Warm, never pure white, so the OLED does not glare in a dim room.
- **Faded Paper** (`paper-2`): secondary text only (target player, stream quality, notes, section headings, elapsed/total in the transport heading, earlier and later lyric lines).
- **Hairline Rule** (`rule`): every rule, the progress track, scrollbar thumb, and the fill of a selected-but-disabled button.
- **Night Paper / Night Faded Paper** (`paper-night`, `paper-2-night`): replace paper and paper-2 from 22:00 to 06:00; artwork drops to 72% opacity at the same time.

### Named Rules
**The Readable Field Rule.** Text on a field is ink or paper, whichever reaches 4.5:1; if neither does, the field is darkened in 15% steps until paper does. Field colours are never hand-picked and never shipped without this check.

**The Flat Field Rule.** Fields are solid colour. No gradients, blur, glow, tint overlays or translucency on the Afterglow layer; the only partial opacities are the ground at 82% when MilkDrop runs behind artwork or lyrics, night artwork at 72%, and disabled at 45%.

**The No Brand Accent Rule.** The app owns no brand colour. Anything that needs emphasis takes paper (focus) or a field (content), never a new hue.

## Typography

**Display Font:** Archivo variable (with Helvetica Neue, Arial, sans-serif)
**Body Font:** Archivo variable, same file
**Label/Mono Font:** none; times and stream figures use Archivo tabular figures

**Character:** A heavy condensed grotesk for everything the room should read at a glance, the same face at regular width and 500–700 weight for the columns. Width is a design axis: display roles run at 80–88% width, body at 100%.

### Hierarchy
- **Display** (820, 80% width; 18vh at 12 characters or fewer, 13.6vh to 26, 9.8vh to 50, 7.4vh beyond; line-height .86–.95, tracking -.02em): the song title in a 46vh box over columns 5–12, bottom-aligned, two lines before it steps down a size.
- **Headline** (820, 80% width, 9vh, .92): Browse, Settings and the Details back-of-poster title. Sign-in uses the same voice at 12.6vh.
- **Lyric now** (800, 82% width, 8.4vh, .98): the current lyric line, taking the title's place in Lyrics mode; earlier/later lines at 3–3.6vh in faded paper.
- **Panel title** (820, 82% width, 6vh, 1): Queue and Display sheet titles.
- **Title** (750, 88% width, 5vh, 1.05): the artist in field A; the Visuals + track caption title uses 5.4vh 820.
- **Body** (600, 2.6vh, 1.3): options, nav items, browse category and action rows; album line and next-song names sit at 2.6–2.8vh 700.
- **Label** (800, 2.2vh, +.02em, sentence case): list section headings in faded paper and the Next heading in field B, with a hairline under it.
- **Caption** (500, 2.2vh): target player, stream quality, notes, transport labels at 2vh 600.
- **Figures** (500, 2.3vh, tabular): elapsed and duration, volume, delays, sample rates.

### Named Rules
**The Length Ladder Rule.** The title's size is chosen from its character count in four fixed steps; type is never scaled to fit and never animated in size.

**The One Family Rule.** Archivo carries every role. A second family, a system display face or a monospace on the poster is off-system.

## Layout

A 1920×1080 poster on a 12-column grid: 5vw outer margins, 1.25vw gutters, 6.354vw columns, column n starting at 5 + (n−1) × 7.604vw. Type sizes are in vh, horizontal measures in vw.

- **Columns 1–4 (0 to 34.16vw):** the artwork, full height, bleeding off the left edge with no margin, cropped to cover.
- **Columns 5–12, top:** target player (left) and stream quality (right) at 6vh, a hairline at 10.5vh, the title box from 13vh to 59vh.
- **Field A, columns 5–9 (35.42vw, 36.77vw wide) and field B, columns 10–12 (73.44vw to the right margin):** both at 62vh, 23vh tall.
- **Progress, columns 5–12** at 89vh: elapsed, a hairline track, duration.

**Deliberate adaptation of the FIRST VIEWPORT:** the direction contract placed artist, album, up next and progress in small columns 10–12. The build sets artist and album at display size inside field A (columns 5–9) and runs progress across columns 5–12, because the screen is read from about 3 m on a 65" TV; field B (columns 10–12) carries Up next.

Controls open as a 10vh nav strip at the top (Browse, Now playing, Queue, Settings) and a 24vh transport band at the bottom, both ink with a hairline edge; the fields and progress hide while they are open. Panels (Queue, Display, Details, Settings) are full-height ink sheets starting at 34.16vw with content at column 5, so they own the right zone while the artwork stays visible. Browse is full width: categories in columns 1–3, the list or an item's actions in columns 4–12. Below a 4:3 aspect ratio the artwork narrows to 30vw and panels start at 20vw.

## Elevation & Depth

Flat. There are no shadows anywhere; depth is stacking order and ground. Overlays (nav, transport, panels, Browse, menu) are opaque ink sheets that hide what is beneath them; when MilkDrop runs behind artwork or lyrics, the ground drops to 82% so the visualizer reads through ink without any blur.

**The Opaque Sheet Rule.** A layer above the poster is solid ground with a hairline edge, never a shadow, blur or frosted panel.

## Shapes

Square corners on everything (radius 0): fields, buttons, rows, panels, thumbnails, toast, sync marks. The only lines are 2 px hairlines (.19vh) in the rule colour, or in the current text colour under the Next heading. The silhouette of every screen is the grid: a full-height artwork slab at the left edge, rectangular fields, ruled lists. Icons are drawn 24-unit SVG strokes (2 wide, square caps, mitred joins); the chosen tick is a drawn SVG path (3.2 wide, square caps) applied as a mask so it takes the text colour.

## Components

### Buttons
Transport buttons are tall rectangles, not pills: 10vw wide, at least 11vh tall, a hairline on top, the drawn icon at 3.6vh above a 2vh label, left-aligned.
- **Shape:** square (0).
- **Default:** paper on ink, no fill.
- **Focus / selected:** the whole button inverts to paper fill with ink text; no outline ring, no glow, no scale.
- **Disabled:** 45% opacity; a selected disabled button takes the rule colour as fill.

### Options and lists
Ruled rows over the panel: 7vh minimum, 1.2vh 1vw padding, label left in body type, value right in caption type with tabular figures, hairline beneath. Section headings in label type and faded paper. Focus inverts the row. The chosen option in a set carries the tick before its label.

### Navigation
A hairline-ruled strip at the top, only while controls are open: Browse, Now playing, Queue, Settings in body type at 700. The current view carries the tick; focus inverts the item.

### Fields
Field A holds the artist (title type) and album (body, one line, ellipsis). Field B holds the Next label over a hairline in its own text colour, then up to the next songs (name 2.7vh 700, artist 2.1vh). Both use the per-track colours and the Readable Field Rule. On song change a ground-coloured cover slides off each field from the left (.52s, cubic-bezier(.16, 1, .3, 1)), field B 70 ms after A. The type underneath is never scaled or moved. This is the one expressive motion in the system.

### Browse rows
9.4vh rows with a 7.4vh square thumbnail on a field-B ground, name 2.8vh 700, detail 2.1vh in faded paper (inherits ink when focused), hairline beneath. Category rows 6.4vh, chosen category ticked.

### Sync timeline (signature)
Sound and sync drawn as one horizontal timeline under a hairline scale, ±600 ms: the other speakers fixed at the centre, this TV's sound moved earlier by its audio delay, the picture and lyrics moved later by the trim. Marks are 0.5vw × 3.2vh rectangles (paper, faded paper, and field A with a paper hairline outline for the picture) labelled above or below in 2vh 700; Earlier and Later name the ends.

### Visuals + track caption
In Visuals modes, one field-A rectangle at the lower left (5vw, 6vh from the bottom, at most 62vw wide) with the title clamped to two lines, then artist, album and label. It fades in over .5s and is the only Afterglow surface over MilkDrop besides the optional lyric overlay, which uses the same field.

### Notices
Toast: paper fill, ink text, 2.6vh 700, top centre, .4s fade. Error: paper strip over columns 5–12 at 2vh. Hint: ink chip at the lower right. Sign-in: headline at column 5, ruled fields 44vw wide, Sign in button on field A.

## Do's and Don'ts

### Do:
- **Do** place every element on the 12-column grid: column n starts at 5 + (n−1) × 7.604vw, columns 6.354vw, gutters 1.25vw.
- **Do** take field colours only from the track's artwork palette and run every one through the 4.5:1 ink-or-paper check.
- **Do** pick the title size from the length ladder (18 / 13.6 / 9.8 / 7.4vh) and let it run two lines before stepping down.
- **Do** show focus by inverting to paper on ink, chosen by the drawn tick, disabled at 45%; nothing else signals state.
- **Do** keep artist and album at display size in field A and progress across columns 5–12 for 3 m reading.
- **Do** give panels the right zone from 34.16vw so the artwork stays on screen.
- **Do** switch to the night register from 22:00 to 06:00.
- **Do** keep every positioned poster element inside the drift group so the OLED burn-in guard (a few pixels every 120 s) moves it.
- **Do** build within Chromium 68: margins instead of flex gap, a focus class instead of :focus-visible, prefixed keyframes.
- **Do** leave a fact out of Details when Music Assistant does not supply it; credits are absent because Music Assistant 2.10 does not expose them.

### Don't:
- **Don't** add gradients, blur, glow, filters or backdrop-filter to the Afterglow layer; Chromium 68 on a memory-tight TV cannot afford them and the world does not use them.
- **Don't** paint over MilkDrop in Visuals modes beyond the single caption field and the optional lyric overlay.
- **Don't** add shadows or rounded corners.
- **Don't** introduce a brand accent colour, a second typeface, or an icon font; icons are drawn SVG strokes.
- **Don't** add a second expressive animation or animate type size; utility fades on transient notices are the only other motion.
- **Don't** add per-frame effects or animated background layers; audio reliability and the 30 fps renderer come first.
- **Don't** put labels above headings as kickers; the target-player and quality line carries real information, not decoration.
