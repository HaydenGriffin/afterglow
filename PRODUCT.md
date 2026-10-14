# Afterglow
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users and purpose
A Music Assistant TV companion for listening at home with a webOS remote.
Hayden approved the TV first pass on 14 October 2026: artwork, lyrics, playback
controls and up next, plus an unobstructed visualizer and optional overlays.

## Constraints
Chromium 68, WebGL2 and an LG C1. Music Assistant owns queues, playback and
multiroom timing. Audio reliability takes priority over visuals; 30 fps is the
default. Native graphics growth remains under investigation.

## Identity
Afterglow, an unofficial Music Assistant TV companion. This is a fork of
Michael Nestrud's viz-man, not a fork of Music Assistant or an official client.
Preserve the webOS application ID and storage keys for in-place upgrades.

## Scope
This first pass adapts Music Assistant's inspected full-screen player for a TV.
Full library discovery, podcasts and audiobook browsing are later work.
