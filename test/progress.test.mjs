import test from "node:test";
import assert from "node:assert/strict";
import { SNAP_S, createProgressSmoother, progressTransform } from "../src/progress.js";

// Frames every 16 ms from `at`, the true position running with the clock.
function play(smoother, { from, at, frames, offset = 0, song = "a" }) {
  const shown = [];
  for (let i = 0; i < frames; i++) {
    const t = at + i * 16;
    shown.push(smoother.next({ target: from + (t - at) / 1000 + offset, playing: true, song, at: t }));
  }
  return shown;
}

test("the first position is drawn as it is, then moves with every frame", () => {
  const s = createProgressSmoother();
  const shown = play(s, { from: 10, at: 1000, frames: 10 });
  assert.equal(shown[0], 10);
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i] > shown[i - 1], "frame " + i + " moves on");
  assert.ok(Math.abs(shown[9] - (10 + 9 * 0.016)) < 1e-9, "on time while nothing is corrected");
});

test("a small correction forward is eased in, not jumped", () => {
  const s = createProgressSmoother();
  play(s, { from: 10, at: 0, frames: 5 });
  // The clock is corrected 0.4 s ahead.
  const shown = play(s, { from: 10 + 5 * 0.016, at: 5 * 16, frames: 60, offset: 0.4 });
  const steps = shown.slice(1).map((v, i) => v - shown[i]);
  assert.ok(Math.max(...steps) < 0.05, "no frame jumps by much more than a frame's worth");
  const target = 10 + 64 * 0.016 + 0.4;
  assert.ok(Math.abs(shown[59] - target) < 0.02, "settles on the corrected position within a second");
});

test("a small correction backward never moves the bar back while playing", () => {
  const s = createProgressSmoother();
  play(s, { from: 30, at: 0, frames: 5 });
  const shown = play(s, { from: 30 + 5 * 0.016, at: 5 * 16, frames: 90, offset: -0.5 });
  for (let i = 1; i < shown.length; i++) assert.ok(shown[i] >= shown[i - 1], "frame " + i + " is not behind the one before");
  const target = 30 + 94 * 0.016 - 0.5;
  assert.ok(Math.abs(shown[89] - target) < 0.03, "and comes back to the true position");
});

test("a seek or a new song snaps", () => {
  const s = createProgressSmoother();
  play(s, { from: 20, at: 0, frames: 3 });
  assert.equal(s.next({ target: 20 + SNAP_S + 8, playing: true, song: "a", at: 64 }), 20 + SNAP_S + 8, "a seek ahead");
  assert.equal(s.next({ target: 5, playing: true, song: "a", at: 80 }), 5, "a seek back");
  assert.equal(s.next({ target: 5.3, playing: true, song: "b", at: 96 }), 5.3, "the next song, even close by");
});

test("paused, the bar holds still", () => {
  const s = createProgressSmoother();
  play(s, { from: 40, at: 0, frames: 3 });
  const held = s.next({ target: 40.032, playing: false, song: "a", at: 48 });
  for (let i = 1; i < 20; i++) assert.equal(s.next({ target: 39.8, playing: false, song: "a", at: 48 + i * 250 }), held, "a paused correction does not move it");
  assert.equal(s.next({ target: 12, playing: false, song: "a", at: 6000 }), 12, "a seek while paused still shows");
});

test("with reduced motion the bar shows the position as it is", () => {
  const s = createProgressSmoother({ reduced: () => true });
  play(s, { from: 10, at: 0, frames: 3 });
  assert.equal(s.next({ target: 10.5, playing: true, song: "a", at: 48 }), 10.5);
  assert.equal(s.next({ target: 10.2, playing: true, song: "a", at: 64 }), 10.2);
});

test("the fill is a scale, clamped to the song", () => {
  assert.equal(progressTransform(60, 240), "scaleX(0.2500)");
  assert.equal(progressTransform(300, 240), "scaleX(1.0000)");
  assert.equal(progressTransform(-1, 240), "scaleX(0.0000)");
  assert.equal(progressTransform(30, 0), "scaleX(0.0000)", "a stream without a length shows no progress");
});
