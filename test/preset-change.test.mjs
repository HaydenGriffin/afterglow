import assert from "node:assert/strict";
import { test } from "node:test";
import { CHANGE_CHOICES, MOMENTS, SONG, changeChoice, changeLabel, createMomentDetector, createPresetChanger, createSongGate, timerSeconds, waveEnergy } from "../src/preset-change.js";
import { createMock } from "../src/mock.js";

test("Change preset reads as the menu says it", () => {
  assert.deepEqual(CHANGE_CHOICES.map(changeLabel), ["Never", "Every 30 s", "Every 2 min", "Every 5 min", "Each song", "On big moments"]);
  assert.equal(changeChoice("bogus", 120), 120);
  assert.equal(changeChoice(SONG, 120), SONG);
  assert.equal(timerSeconds(MOMENTS), 0);
  assert.equal(timerSeconds(300), 300);
});

test("each song: not the first song, a 2 s settle, then once", () => {
  const gate = createSongGate();
  gate.song("a", 0);
  assert.equal(gate.due(5000), false, "the first song heard keeps the preset");
  gate.song("b", 20000);
  assert.equal(gate.due(21000), false, "too soon after the song started");
  assert.equal(gate.due(22000), true);
  assert.equal(gate.due(40000), false, "once per song");
  gate.song("b", 41000);
  assert.equal(gate.due(50000), false, "the same queue item again is not a new song");
});

test("each song: skipping through changes once, after the last", () => {
  const gate = createSongGate();
  gate.song("a", 0);
  gate.song("b", 20000);
  gate.song("c", 20500);
  gate.song("d", 21000);
  assert.equal(gate.due(22500), false);
  assert.equal(gate.due(23000), true);
  assert.equal(gate.due(30000), false);
});

test("each song: a song too soon after a change waits for the 10 s gap", () => {
  const gate = createSongGate();
  gate.song("a", 0);
  gate.changed(19000); // someone picked a preset
  gate.song("b", 20000);
  assert.equal(gate.due(22000), false);
  assert.equal(gate.due(28999), false);
  assert.equal(gate.due(29000), true);
});

test("each song: music stopping is not a song, and drops a song still settling", () => {
  const gate = createSongGate();
  gate.song("a", 0);
  gate.song("b", 20000);
  gate.song("", 20500);
  assert.equal(gate.due(30000), false);
  gate.song("b", 31000);
  assert.equal(gate.due(40000), false, "resuming the same song changes nothing");
});

// Feeds `seconds` of a constant energy in 1/30 s frames; returns the times of moments.
function feed(detector, energy, seconds, start = 0) {
  const hits = [];
  const step = 1 / 30;
  for (let t = 0; t < seconds; t += step) if (detector.push(typeof energy === "function" ? energy(start + t) : energy, step)) hits.push(start + t);
  return hits;
}

test("big moments: steady music is never one", () => {
  const detector = createMomentDetector();
  const mock = createMock();
  const hits = [];
  for (let frame = 0; frame < 30 * 120; frame++) if (detector.push(waveEnergy(mock.wave((frame * 1000) / 30)), 1 / 30)) hits.push(frame);
  assert.deepEqual(hits, []);
});

test("big moments: quiet then loud is one, and it re-arms only after the music falls back", () => {
  const detector = createMomentDetector();
  assert.deepEqual(feed(detector, 0.003, 15), []);
  const hits = feed(detector, 0.03, 20, 15);
  assert.equal(hits.length, 1);
  assert.ok(hits[0] < 15.3, "found within a fraction of a second");
  assert.deepEqual(feed(detector, 0.03, 30, 35), [], "staying loud is not another");
  feed(detector, 0.002, 15, 65);
  assert.equal(feed(detector, 0.03, 5, 80).length, 1, "a second drop after a quiet stretch counts");
});

test("big moments: music out of silence or after a pause is not one", () => {
  const detector = createMomentDetector();
  assert.deepEqual(feed(detector, 0.03, 20), [], "the first ten seconds are only heard");
  feed(detector, 0, 60, 20);
  assert.deepEqual(feed(detector, 0.03, 20, 80), [], "after a pause");
});

test("big moments: a short gap between songs keeps the level before it", () => {
  const detector = createMomentDetector();
  feed(detector, 0.03, 30);
  feed(detector, 0, 1.5, 30);
  assert.deepEqual(feed(detector, 0.04, 10, 31.5), [], "a similar next song is not a moment");
});

test("big moments: too quiet to count", () => {
  const detector = createMomentDetector();
  feed(detector, 0.00005, 15);
  assert.deepEqual(feed(detector, 0.0005, 10, 15), []);
});

test("the wave's energy: silence is 0, full scale about 1", () => {
  assert.equal(waveEnergy(new Uint8Array(1024).fill(128)), 0);
  const square = new Uint8Array(1024).map((_, i) => (i % 2 ? 0 : 255));
  assert.ok(waveEnergy(square) > 0.98);
});

test("changer: moments need 25 s since the last change; one in the gap is let go", () => {
  const changer = createPresetChanger();
  changer.changed(0);
  for (let i = 0; i < 15 * 30; i++) changer.hear(0.003, 1 / 30);
  for (let i = 0; i < 30; i++) changer.hear(0.03, 1 / 30);
  assert.equal(changer.due(MOMENTS, 16000), false, "within 25 s of the last change");
  assert.equal(changer.due(MOMENTS, 30000), false, "the moment was let go, not kept");
  for (let i = 0; i < 15 * 30; i++) changer.hear(0.002, 1 / 30);
  for (let i = 0; i < 30; i++) changer.hear(0.03, 1 / 30);
  assert.equal(changer.due(MOMENTS, 47000), true);
});

test("changer: a song seen under another mode does not act when Each song is picked later", () => {
  const changer = createPresetChanger();
  changer.song("a", 0);
  changer.song("b", 20000);
  assert.equal(changer.due(120, 23000), false);
  assert.equal(changer.due(SONG, 60000), false);
  changer.song("c", 70000);
  assert.equal(changer.due(SONG, 72000), true);
});
