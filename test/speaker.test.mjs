import test from "node:test";
import assert from "node:assert/strict";
import { createSpeaker, playerIdFor, sendspinUrl } from "../src/speaker.js";

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

test("a failed connect shows as an error", async () => {
  const { Player } = fakePlayer();
  Player.prototype.connect = () => Promise.reject(new Error("refused"));
  const speaker = createSpeaker({ host: "ma", Player });
  speaker.set("TV");
  speaker.start();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(speaker.state, "error");
  assert.equal(speaker.error, "refused");
});
