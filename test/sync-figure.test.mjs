import test from "node:test";
import assert from "node:assert/strict";
import { syncMarks, timingLabel } from "../src/sync-figure.js";

test("the TV's sound sits earlier by its delay and the picture later from it by the trim", () => {
  const marks = Object.fromEntries(syncMarks(420, 75).map(m => [m.id, Math.round(m.at * 100) / 100]));
  assert.equal(marks.speakers, 50);
  assert.equal(marks.sound, 15);
  assert.equal(marks.picture, 21.25, "75 ms later than the TV's sound, not another 420");
});

test("without Play on this TV the picture is placed against the speakers; marks stay on the scale", () => {
  assert.deepEqual(syncMarks(null, 75).map(m => m.id), ["speakers", "picture"]);
  assert.equal(syncMarks(5000, 0).find(m => m.id === "sound").at, 2);
});

test("timings name what they are measured against, never signed numbers", () => {
  const sound = ms => timingLabel(ms, "ahead of the other speakers", "behind the other speakers", "In step");
  assert.equal(sound(420), "420 ms ahead of the other speakers");
  assert.equal(sound(-30), "30 ms behind the other speakers");
  assert.equal(sound(0), "In step");
  assert.equal(sound(null), "…");
  assert.equal(timingLabel(75, "after the TV’s sound", "before the TV’s sound", ""), "75 ms after the TV’s sound");
});
