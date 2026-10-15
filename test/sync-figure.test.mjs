import test from "node:test";
import assert from "node:assert/strict";
import { syncMarks, timingLabel } from "../src/sync-figure.js";

test("the picture sits after the music by the trim alone", () => {
  const marks = Object.fromEntries(syncMarks(75).map(m => [m.id, Math.round(m.at * 100) / 100]));
  assert.equal(marks.music, 50);
  assert.equal(marks.picture, 56.25, "75 ms after the group's music");
});

test("the TV's output compensation does not move the picture (it is timed from the group clock)", () => {
  assert.equal(syncMarks.length, 1, "only the trim positions the figure");
  assert.equal(syncMarks(-600).find(m => m.id === "picture").at, 2, "marks stay on the scale");
  assert.equal(syncMarks(0).find(m => m.id === "picture").at, 50);
});

test("timings name what they are measured against, never signed numbers", () => {
  assert.equal(timingLabel(75, "after the music", "before the music", "With the music"), "75 ms after the music");
  assert.equal(timingLabel(-30, "after the music", "before the music", "With the music"), "30 ms before the music");
  assert.equal(timingLabel(0, "after the music", "before the music", "With the music"), "With the music");
  assert.equal(timingLabel(null, "a", "b", "c"), "…");
});
