import test from "node:test";
import assert from "node:assert/strict";
import { contrast, posterColours, INK, PAPER } from "../src/poster-colour.js";

const palettes = {
  none: null,
  cobalt: { primary: [40, 70, 200], accent: [227, 200, 75], background_dark: [10, 14, 40], background_light: [220, 225, 240] },
  pastel: { primary: [250, 220, 230], accent: [230, 250, 240] },
  muddy: { primary: [128, 120, 110] },
  junk: { primary: [300, -1, 2], accent: "red" },
};

test("every palette yields fields whose text reads at 4.5:1 or better", () => {
  for (const [name, palette] of Object.entries(palettes)) {
    const c = posterColours(palette);
    assert.ok(contrast(c.fieldA, c.onA) >= 4.5, name + " field A");
    assert.ok(contrast(c.fieldB, c.onB) >= 4.5, name + " field B");
    assert.ok([INK, PAPER].includes(c.onA) && [INK, PAPER].includes(c.onB), name + " text is ink or paper");
  }
});

test("the ground stays near-black so paper text reads on it", () => {
  for (const [name, palette] of Object.entries(palettes)) {
    const c = posterColours(palette);
    assert.ok(contrast(c.ground, PAPER) >= 12, name + " ground");
  }
});

test("the most colourful artwork role leads", () => {
  const c = posterColours(palettes.cobalt);
  assert.deepEqual(c.fieldA, [40, 70, 200]);
  assert.notDeepEqual(c.fieldB, c.fieldA);
});
