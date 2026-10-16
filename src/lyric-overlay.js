// Lyrics over Visuals + track: which overlay (Off, One line, Stage), how each
// one looks (Position, Background, Size, kept separately per overlay), and
// where it goes on screen so it never sits on the notices, the track card or
// the "Waiting for music" line. Positions and heights are in vh.

export const OVERLAY_KINDS = ["off", "line", "stage"];
export const OVERLAY_LABELS = { off: "Off", line: "One line", stage: "Stage" };
// The rows under "Lyrics over Visuals + track", in order: [field, label, values, value labels].
export const LOOK_ROWS = [
  ["position", "Position", ["top", "middle", "bottom"], { top: "Top", middle: "Middle", bottom: "Bottom" }],
  ["background", "Background", ["box", "shade", "none"], { box: "Box", shade: "Shade", none: "None" }],
  ["size", "Size", ["small", "medium", "large"], { small: "Small", medium: "Medium", large: "Large" }],
];
export const SIZE_SCALE = { small: 0.8, medium: 1, large: 1.25 };
const DEFAULTS = {
  line: { position: "bottom", background: "box", size: "medium" },
  stage: { position: "middle", background: "box", size: "medium" },
};
// Preferences: the overlay chosen, and one look per overlay.
export const KIND_PREF = "lyricsOverlay";
export const LOOK_PREFS = { line: "lyricsLineLook", stage: "lyricsStageLook" };

// The overlay chosen. Before Stage the preference was On/Off (true: One line).
export function overlayKind(stored) {
  if (stored === true) return "line";
  return OVERLAY_KINDS.indexOf(stored) >= 0 ? stored : "off";
}

// An overlay's look, with the defaults for whatever is missing or unknown.
export function overlayLook(kind, stored) {
  const look = Object.assign({}, DEFAULTS[kind] || DEFAULTS.line);
  if (!stored || typeof stored !== "object") return look;
  for (const [field, , values] of LOOK_ROWS) if (values.indexOf(stored[field]) >= 0) look[field] = stored[field];
  return look;
}

// Left/right (or OK) on one of the rows: the next value, wrapping round.
export function stepLook(look, field, direction) {
  const row = LOOK_ROWS.filter((r) => r[0] === field)[0];
  if (!row) return look;
  const values = row[2];
  const at = Math.max(0, values.indexOf(look[field]));
  return Object.assign({}, look, { [field]: values[(at + direction + values.length) % values.length] });
}

export function stepKind(kind, direction) {
  const at = Math.max(0, OVERLAY_KINDS.indexOf(kind));
  return OVERLAY_KINDS[(at + direction + OVERLAY_KINDS.length) % OVERLAY_KINDS.length];
}

// The screen's furniture the overlay keeps clear of (vh).
export const LAYOUT = {
  top: 12, // below the notices: the error strip (2vh) and the toast (5vh to about 11vh)
  bottom: 6, // the TV-safe margin the track card also keeps
  gap: 1.4, // between the overlay and the track card or the message
  messageTop: 46, // "Waiting for music" (index.html #message)
  messageBottom: 50,
};

// Where the overlay's box goes: { top } or { bottom } in vh.
//   position: "top" | "middle" | "bottom"
//   height:   the box's height (vh), for centring
//   card:     the track card's height (vh) while it shows, else null; the
//             card sits `LAYOUT.bottom` above the screen's lower edge
//   message:  whether the "Waiting for music" line shows
// Middle is the vertical centre of the screen unless that would touch the
// message or the card; Bottom stacks above the card while it shows.
export function placeOverlay({ position, height = 0, card = null, message = false }) {
  const L = LAYOUT;
  const floor = 100 - L.bottom - (card ? card + L.gap : 0); // the lowest the box's lower edge may go
  if (position === "top") return { top: L.top };
  if (position === "bottom") return { bottom: round(100 - floor) };
  let top = 50 - height / 2;
  if (message && top < L.messageBottom + L.gap && top + height > L.messageTop - L.gap) {
    top = L.messageBottom + L.gap; // beneath the message, or above it when the card is in the way
    if (top + height > floor) top = L.messageTop - L.gap - height;
  }
  top = Math.max(L.top, Math.min(top, floor - height));
  return { top: round(top) };
}

function round(vh) {
  return Math.round(vh * 100) / 100;
}
