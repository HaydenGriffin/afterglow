// The poster's colours come from the track's artwork palette (Music Assistant
// roles, each [r, g, b] 0–255): two flat fields on the neutral ink ground, with
// ink or paper text on each field, whichever reads at 4.5:1 or better.
export const INK = [18, 20, 23];
export const PAPER = [239, 235, 227];
const NEUTRAL = { fieldA: [62, 66, 72], fieldB: [38, 41, 46], ground: INK };
const ROLES = ["primary", "accent", "background_light", "background_dark"];

function channel(v) { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export function luminance(c) { return 0.2126 * channel(c[0]) + 0.7152 * channel(c[1]) + 0.0722 * channel(c[2]); }
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function chroma(c) { return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]); }
function valid(c) { return Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(v => typeof v === "number" && v >= 0 && v <= 255); }
function scale(c, k) { return c.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(255, v * k)))); }

// Ink or paper, whichever is clearer; a field neither reads on is darkened until paper does.
export function onField(field) {
  let f = field.slice(0, 3);
  for (let i = 0; i < 12; i++) {
    const best = contrast(f, INK) >= contrast(f, PAPER) ? INK : PAPER;
    if (contrast(f, best) >= 4.5) return { field: f, text: best };
    f = scale(f, 0.85);
  }
  return { field: f, text: PAPER };
}

export function posterColours(palette) {
  const colours = palette ? ROLES.map(r => palette[r]).filter(valid) : [];
  if (!colours.length) return finish(NEUTRAL.fieldA, NEUTRAL.fieldB, NEUTRAL.ground);
  const vivid = colours.slice().sort((a, b) => chroma(b) - chroma(a));
  const a = vivid[0];
  const b = vivid.find(c => Math.abs(luminance(c) - luminance(a)) > 0.08 || (chroma(c) > 40 && c !== a)) || scale(a, 0.55);
  return finish(a, b === a ? scale(a, 0.55) : b, INK);
}

function finish(a, b, ground) {
  const A = onField(a), B = onField(b);
  return { fieldA: A.field, onA: A.text, fieldB: B.field, onB: B.text, ground: ground.slice(0, 3) };
}

export const css = c => "rgb(" + c.join(",") + ")";
