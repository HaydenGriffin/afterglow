# Changelog

## 1.0.0 — 2026-10-08

- Sign in on the TV with a Music Assistant username and password. The TV gets its own long-lived token, named after it; "Log out" in the menu revokes it. The package no longer contains a token.
- MilkDrop only: the Winamp and wavescope visualizers are gone.
- Every MilkDrop preset in the butterchurn-presets packs is shipped (395). "Scan presets" measures each one's frame rate on the TV on a built-in signal; presets at or above "Validate above" (45 fps by default) make up the validated list, seeded from an LG CX benchmark until the TV has scanned. "Validated" in the menu adds or removes the current preset by hand.
- "Preset list" chooses between validated, all and favorites (Blue key cycles). Favorites and validation are independent.
- "Dim visualizer" and "Dim track info", 0–90% in steps of 10. ←/→ dim the visualizer without opening the menu.
- New defaults: validated list, random order, change preset every 2 minutes.
- Menu rows reordered by how often they are used.
- Renamed to viz-man.
