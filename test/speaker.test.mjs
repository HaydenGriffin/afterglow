import test from "node:test";
import assert from "node:assert/strict";
import { createSpeaker, playerIdFor, sendspinUrl, toggledSpeaker } from "../src/speaker.js";

function fakePlayer() {
  const made = [];
  class Player {
    constructor(config) {
      this.config = config;
      this.calls = [];
      made.push(this);
    }
    unlock() {
      this.calls.push("unlock");
    }
    connect() {
      this.calls.push("connect");
      return Promise.resolve();
    }
    disconnect(reason) {
      this.calls.push("disconnect:" + reason);
    }
  }
  return { Player, made };
}

// Lets queued promise callbacks run (works with mocked timers too).
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

test("Sendspin is Music Assistant's host on its own port", () => {
  assert.equal(sendspinUrl("192.168.0.4"), "http://192.168.0.4:8927");
  assert.equal(sendspinUrl("192.168.0.4:8095"), "http://192.168.0.4:8927");
  assert.equal(sendspinUrl("http://ma.local:8095/"), "http://ma.local:8927");
});

test("player ids are made as the Sendspin Cinema app makes them", () => {
  assert.equal(playerIdFor("Living Room LG C1"), "webos-living-room-lg-c1");
  assert.equal(playerIdFor(""), "webos-tv");
});

test("off until a player is set; then one PCM player that keeps the given id", async () => {
  const { Player, made } = fakePlayer();
  const speaker = createSpeaker({ host: "192.168.0.4", Player });
  speaker.start();
  assert.equal(made.length, 0);
  assert.equal(speaker.state, "off");
  speaker.set("Living Room LG C1", "webos-living-room-lg-c1");
  speaker.start();
  speaker.start(); // shown twice: still one player
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(made.length, 1);
  const c = made[0].config;
  assert.equal(c.playerId, "webos-living-room-lg-c1");
  assert.equal(c.clientName, "Living Room LG C1");
  assert.equal(c.baseUrl, "http://192.168.0.4:8927");
  assert.deepEqual(c.codecs, ["pcm"]);
  assert.equal(c.requiredLeadTimeMs, 1000);
  assert.equal(c.minBufferMs, 2000);
  assert.equal(c.correctionMode, "sync");
  assert.equal(c.correctionThresholds, undefined);
  assert.deepEqual(made[0].calls, ["unlock", "connect"]);
  c.onStateChange({ isPlaying: true });
  assert.equal(speaker.state, "playing");
});

test("hidden (suspended) disconnects, shown again connects afresh; off disconnects for good", async () => {
  const { Player, made } = fakePlayer();
  const speaker = createSpeaker({ host: "ma", Player });
  speaker.set("TV");
  speaker.start();
  speaker.stop();
  assert.equal(made[0].calls.pop(), "disconnect:user_request");
  speaker.start();
  assert.equal(made.length, 2);
  speaker.set("");
  assert.equal(made[1].calls.pop(), "disconnect:user_request");
  speaker.start();
  assert.equal(made.length, 2);
  assert.equal(speaker.state, "off");
});

test("a failed connect shows as an error, then is retried with a growing wait until it connects", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Player, made } = fakePlayer();
  let refusals = 2;
  Player.prototype.connect = function () {
    this.calls.push("connect");
    return refusals-- > 0 ? Promise.reject(new Error("refused")) : Promise.resolve();
  };
  const speaker = createSpeaker({ host: "ma", Player });
  speaker.set("TV");
  speaker.start();
  await flush();
  assert.equal(speaker.state, "error");
  assert.equal(speaker.error, "refused");
  t.mock.timers.tick(1300);
  await flush();
  assert.equal(made.length, 2, "retried after about a second");
  assert.equal(made[0].calls.pop(), "disconnect:retry", "the failed player is let go");
  t.mock.timers.tick(1400);
  await flush();
  assert.equal(made.length, 2, "the next wait is longer");
  t.mock.timers.tick(1200);
  await flush();
  assert.equal(made.length, 3);
  assert.equal(speaker.state, "connecting");
  assert.equal(speaker.error, "");
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(made.length, 3, "connected: no more retries");
});

test("a player that Sendspin reconnected by itself is not torn down by the retry", async (t) => {
  // sendspin-js retries a failed open on its own. Replacing the player once it
  // is connected again ends the stream Music Assistant just started on it
  // (and the relay's waveform tap with it) a few seconds in.
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Player, made } = fakePlayer();
  Player.prototype.connect = function () {
    this.calls.push("connect");
    return Promise.reject(new Error("refused"));
  };
  const speaker = createSpeaker({ host: "ma", Player });
  speaker.set("TV");
  speaker.start();
  await flush();
  assert.equal(speaker.state, "error");
  made[0].isConnected = true; // its own reconnect got through
  made[0].config.onStateChange({ isPlaying: true });
  t.mock.timers.tick(120000);
  await flush();
  assert.equal(made.length, 1, "kept");
  assert.deepEqual(made[0].calls, ["unlock", "connect"], "never disconnected");
  assert.equal(speaker.state, "playing");
  assert.equal(speaker.error, "");
});

test("stopping or switching the speaker cancels a pending retry", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Player, made } = fakePlayer();
  Player.prototype.connect = () => Promise.reject(new Error("refused"));
  const speaker = createSpeaker({ host: "ma", Player });
  speaker.set("TV");
  speaker.start();
  await flush();
  speaker.stop(); // hidden
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(made.length, 1);
  speaker.start();
  await flush();
  speaker.set(""); // switched off
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(made.length, 2);
  assert.equal(speaker.state, "off");
});

test("hide/show before unlock completes connects only the replacement player once", async () => {
  const { Player, made } = fakePlayer();
  let finishUnlock;
  Player.prototype.unlock = function () {
    this.calls.push("unlock");
    return made.indexOf(this) === 0 ? new Promise((r) => { finishUnlock = r; }) : Promise.resolve();
  };
  const speaker = createSpeaker({ host: "ma", Player });
  speaker.set("TV"); speaker.start();
  await Promise.resolve();
  speaker.stop(); speaker.start();
  finishUnlock();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(made[0].calls.filter((c) => c === "connect").length, 0);
  assert.equal(made[1].calls.filter((c) => c === "connect").length, 1);
});

test("callbacks from a disconnected player cannot overwrite the replacement's state", async () => {
  const { Player, made } = fakePlayer();
  const speaker = createSpeaker({ host: "ma", Player });
  speaker.set("TV"); speaker.start();
  await new Promise((r) => setTimeout(r, 0));
  speaker.stop(); speaker.start();
  made[1].config.onStateChange({ isPlaying: true });
  made[0].config.onStateChange({ isPlaying: false });
  assert.equal(speaker.state, "playing");
  speaker.set("");
  made[1].config.onStateChange({ isPlaying: false });
  assert.equal(speaker.state, "off");
});

test("a delayed rejection from an old connection cannot mark a new connection failed", async () => {
  const { Player, made } = fakePlayer();
  let rejectOld;
  Player.prototype.connect = function () {
    return made.indexOf(this) === 0 ? new Promise((_, reject) => { rejectOld = reject; }) : Promise.resolve();
  };
  const speaker = createSpeaker({ host: "ma", Player });
  speaker.set("TV"); speaker.start();
  await new Promise((r) => setTimeout(r, 0));
  speaker.stop(); speaker.start();
  made[1].config.onStateChange({ isPlaying: true });
  rejectOld(new Error("old socket"));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(speaker.state, "playing");
  assert.equal(speaker.error, "");
});

function fakeDelays(start) {
  const saved = [];
  return { saved, get: () => Promise.resolve(start), set: (id, ms) => (saved.push([id, ms]), Promise.resolve()) };
}

test("Audio delay: read from Music Assistant on start, nudged in 10 ms steps, saved once the presses stop", async () => {
  const { Player } = fakePlayer();
  const delays = fakeDelays(310);
  const speaker = createSpeaker({ host: "ma", Player, delays });
  speaker.set("Living Room LG C1", "webos-living-room-lg-c1");
  assert.equal(speaker.delayMs, null);
  speaker.nudgeDelay(1); // not read yet: nothing to step from
  speaker.start();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(speaker.delayMs, 310);
  speaker.nudgeDelay(1);
  speaker.nudgeDelay(1);
  speaker.nudgeDelay(-1);
  assert.equal(speaker.delayMs, 320);
  assert.deepEqual(delays.saved, []);
  await new Promise((r) => setTimeout(r, 700));
  assert.deepEqual(delays.saved, [["webos-living-room-lg-c1", 320]]);
});

test("Audio delay stays within 0-5000 ms", async () => {
  const { Player } = fakePlayer();
  const speaker = createSpeaker({ host: "ma", Player, delays: fakeDelays(0) });
  speaker.set("TV");
  speaker.start();
  await new Promise((r) => setTimeout(r, 0));
  speaker.nudgeDelay(-1);
  assert.equal(speaker.delayMs, 0);
});

test("Play on this TV off and on again comes back as the same player (14 Oct: it came back as a new 'viz-man TV')", () => {
  const tv = { name: "Living Room LG C1", id: "webos-living-room-lg-c1" };
  assert.equal(toggledSpeaker(true, tv), null);
  assert.deepEqual(toggledSpeaker(false, tv), tv);
});

test("a TV never set up becomes 'Afterglow TV', under the id earlier versions gave it so it is not registered twice", () => {
  assert.deepEqual(toggledSpeaker(false, null), { name: "Afterglow TV", id: "webos-viz-man-tv" });
});

test("Audio delay belongs to its speaker: switching neither shows nor saves the old one's on the new one", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Player } = fakePlayer();
  const saved = [];
  const values = { "webos-a": 300, "webos-b": 40 };
  const delays = { get: (id) => Promise.resolve(values[id]), set: (id, ms) => (saved.push([id, ms]), Promise.resolve()) };
  const speaker = createSpeaker({ host: "ma", Player, delays });
  speaker.set("A", "webos-a");
  speaker.start();
  await flush();
  speaker.nudgeDelay(1); // a save for A is waiting
  speaker.set("B", "webos-b");
  assert.equal(speaker.delayMs, null, "nothing shown until B's own is read");
  assert.deepEqual(saved, [["webos-a", 310]], "A's change is saved to A straight away");
  speaker.start();
  await flush();
  assert.equal(speaker.delayMs, 40);
  t.mock.timers.tick(5000);
  assert.deepEqual(saved, [["webos-a", 310]], "nothing of A's lands on B");
});
