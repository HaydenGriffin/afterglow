import assert from "node:assert/strict";
import { test } from "node:test";
import { BEDTIME_CHOICES, bedtimeLabel, createBedtime, createBedtimeController } from "../src/bedtime.js";

const MIN = 60000;
const track = (id, leftS) => ({ id, leftMs: leftS == null ? null : leftS * 1000 });

test("a timed bedtime counts down, darkens after a minute and fades the last 30 s", () => {
  const b = createBedtime();
  b.set(15, 0, null);
  let s = b.state(30000, null);
  assert.equal(s.running, true);
  assert.equal(s.dark, false);
  assert.equal(s.remainingMs, 15 * MIN - 30000);
  assert.equal(s.volume, 1);
  s = b.state(61000, null);
  assert.equal(s.dark, true);
  s = b.state(15 * MIN - 15000, null);
  assert.equal(s.volume, 0.5);
  s = b.state(15 * MIN, null);
  assert.equal(s.done, true);
});

test("a key wakes the picture for a while; only a dark picture swallows the key", () => {
  const b = createBedtime();
  b.set(30, 0, null);
  assert.equal(b.wake(10000), false, "not dark yet: the key does its job");
  assert.equal(b.state(69000, null).dark, false);
  assert.equal(b.state(71000, null).dark, true);
  assert.equal(b.wake(72000), true);
  assert.equal(b.state(100000, null).dark, false);
  b.set(0, 0, null);
  assert.equal(b.state(200000, null).running, false);
  assert.equal(b.wake(200000), false);
});

test("end of track follows the track's time left, and ends when the track changes", () => {
  const b = createBedtime();
  assert.equal(b.set("track", 0, null), false, "nothing playing: no end of track");
  assert.equal(b.set("track", 0, track("a", null)), false, "a stream without a length has no end");
  assert.equal(b.set("track", 0, track("a", 100)), true);
  let s = b.state(1000, track("a", 99));
  assert.equal(s.remainingMs, 99000);
  assert.equal(s.volume, 1);
  s = b.state(80000, track("a", 20));
  assert.equal(Math.round(s.volume * 100), 67);
  assert.equal(b.state(81000, track("b", 200)).done, true);
});

test("choices and labels", () => {
  assert.deepEqual(BEDTIME_CHOICES, [0, 15, 30, 60, "track"]);
  assert.equal(bedtimeLabel({ running: false }, 0), "Off");
  assert.equal(bedtimeLabel({ running: true, remainingMs: 754000 }, 15), "15 min · 12:34 left");
  assert.equal(bedtimeLabel({ running: true, remainingMs: 130000 }, "track"), "End of track · 2:10 left");
});

function controllerHarness(volume = 40) {
  let now = 0;
  const calls = [];
  const darks = [];
  const snap = { track: { id: "a", duration: 600 }, position: 0, player: { volume_level: volume } };
  const playback = {
    snapshot: () => snap,
    command(action, value) {
      calls.push([action, value]);
      if (action === "volume") snap.player.volume_level = value;
      return Promise.resolve(true);
    },
  };
  const bedtime = createBedtime();
  const ctl = createBedtimeController({ bedtime, playback, setDark: (on) => darks.push(on), now: () => now });
  return { ctl, calls, darks, snap, bedtime, at: (ms) => (now = ms) };
}

test("the controller fades the volume down, pauses at the end and puts the volume back", async () => {
  const h = controllerHarness(40);
  h.ctl.set(15);
  h.at(61000);
  h.ctl.tick();
  assert.equal(h.darks[h.darks.length - 1], true);
  h.at(15 * MIN - 15000);
  h.ctl.tick();
  assert.deepEqual(h.calls, [["volume", 20]]);
  h.ctl.tick();
  assert.equal(h.calls.length, 1, "the same level is not sent again");
  h.at(15 * MIN);
  h.ctl.tick();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(h.calls.slice(1), [["pause", undefined], ["volume", 40]]);
  assert.equal(h.ctl.choice, 0, "bedtime turns itself off");
  assert.equal(h.darks[h.darks.length - 1], false);
});

test("turning bedtime off during the fade restores the volume", () => {
  const h = controllerHarness(50);
  h.ctl.set(15);
  h.at(15 * MIN - 10000);
  h.ctl.tick();
  assert.deepEqual(h.calls, [["volume", 17]]);
  h.ctl.set(0);
  h.ctl.tick();
  assert.deepEqual(h.calls[1], ["volume", 50]);
});

test("without a player volume the fade is skipped, the stop still happens", () => {
  const h = controllerHarness(null);
  h.snap.player = {};
  h.ctl.set(15);
  h.at(15 * MIN - 10000);
  h.ctl.tick();
  assert.equal(h.calls.length, 0);
  h.at(15 * MIN);
  h.ctl.tick();
  assert.deepEqual(h.calls, [["pause", undefined]]);
});

test("cycling the choice skips End of track when there is no track length", () => {
  const h = controllerHarness();
  h.snap.track = { id: "radio", duration: 0 };
  h.ctl.set(60);
  h.ctl.cycle(1);
  assert.equal(h.ctl.choice, 0);
  h.ctl.cycle(-1);
  assert.equal(h.ctl.choice, 60);
});

test("setting a longer bedtime during the fade puts the volume back", () => {
  const h = controllerHarness(30);
  h.ctl.set(15);
  h.at(15 * MIN - 10000);
  h.ctl.tick();
  assert.deepEqual(h.calls, [["volume", 10]]);
  h.ctl.set(60);
  h.ctl.tick();
  assert.deepEqual(h.calls[1], ["volume", 30]);
  assert.equal(h.ctl.choice, 60);
});
