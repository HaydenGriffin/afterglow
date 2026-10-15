# Afterglow
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users and purpose
A Music Assistant TV companion for listening with a webOS remote: artwork,
lyrics, playback controls and up next, plus an unobstructed visualizer and
optional overlays.

## Constraints
Chromium 68 and WebGL2 on webOS 5 and 6 (tested on an LG C1). Music Assistant owns queues, playback and
multiroom timing. Audio reliability takes priority over visuals; 30 fps is the
default. Native graphics growth remains under investigation.

## Identity
Afterglow, an unofficial Music Assistant TV companion. This is a fork of
Michael Nestrud's viz-man, not a fork of Music Assistant or an official client.
The webOS application ID is `io.github.haydengriffin.afterglow` (from 1.5.0;
before that `net.botworth.vizman`). Keep the Music Assistant preferences key
(`vizman`): synced favourites depend on it. New TV speakers are
`webos-afterglow-tv`; existing ones keep their stored id, and the old
`webos-viz-man-tv` is reused only while Music Assistant still knows it.

## Scope
Music Assistant parity from the TV remote: Browse and Search, queue editing,
choosing the player or sync group, Start radio, bedtime and the TV as a
Sendspin speaker. Colour comes from each song's artwork; no fixed accent
colour. Podcast and audiobook browsing are later work.
