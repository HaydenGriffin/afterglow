import test from "node:test";
import assert from "node:assert/strict";
import { contrast, posterColours, posterTheme, INK, PAPER, PAPER_NIGHT } from "../src/poster-colour.js";

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

test("by day the theme is the poster's colours", () => {
  assert.deepEqual(posterTheme(palettes.cobalt, false), posterColours(palettes.cobalt));
});

test("at night the fields step down and their text is night paper or ink, still at 4.5:1", () => {
  assert.deepEqual(PAPER_NIGHT, [196, 192, 185], "DESIGN.md paper-night");
  for (const [name, palette] of Object.entries(palettes)) {
    const day = posterColours(palette), c = posterTheme(palette, true);
    assert.ok(contrast(c.fieldA, c.onA) >= 4.5, name + " field A");
    assert.ok(contrast(c.fieldB, c.onB) >= 4.5, name + " field B");
    assert.ok([INK, PAPER_NIGHT].includes(c.onA) && [INK, PAPER_NIGHT].includes(c.onB), name + " text is ink or night paper, never day paper");
    assert.ok(c.fieldA.every((v, i) => v <= day.fieldA[i]) && c.fieldB.every((v, i) => v <= day.fieldB[i]), name + " fields are no brighter than by day");
    assert.deepEqual(c.ground, day.ground);
  }
  assert.deepEqual(posterTheme(null, true).onA, PAPER_NIGHT, "the neutral fields carry night paper");
});
