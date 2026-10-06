import assert from "node:assert/strict";
import { test } from "node:test";
import { BEAT_TAG, WAVE_TAG, createClock, createRelay, parseFrame } from "../src/relay.js";
import { createTimeline } from "../src/timeline.js";

function frame(tag, ts, payload) {
  const bytes = new Uint8Array(9 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, tag);
  view.setBigInt64(1, BigInt(ts));
  bytes.set(payload, 9);
  return bytes.buffer;
}

function wave(value = 128) {
  return new Uint8Array(1024).fill(value);
}

test("waveform frames are parsed, including timestamps past 32 bits", () => {
  const ts = 123456789012345; // ~3.9 years of uptime in microseconds
  const parsed = parseFrame(frame(WAVE_TAG, ts, wave(200)));
  assert.equal(parsed.type, "wave");
  assert.equal(parsed.ts, ts);
  assert.equal(parsed.samples.length, 1024);
  assert.equal(parsed.samples[0], 200);
  assert.equal(parsed.samples[1023], 200);
});

test("beat frames carry the downbeat flag; unknown and short frames are ignored", () => {
  assert.deepEqual(parseFrame(frame(BEAT_TAG, 5000, [1])), { type: "beat", ts: 5000, downbeat: true });
  assert.deepEqual(parseFrame(frame(BEAT_TAG, 5000, [0])), { type: "beat", ts: 5000, downbeat: false });
  assert.equal(parseFrame(frame(99, 5000, [1])), null);
  assert.equal(parseFrame(frame(WAVE_TAG, 5000, [1, 2, 3])), null);
  assert.equal(parseFrame(new ArrayBuffer(4)), null);
});

test("the clock trusts the round trip with the least delay", () => {
  const clock = createClock();
  assert.equal(clock.ready, false);
  // server clock = local ms * 1000 + 7_000_000 us
  clock.add(1000, 1080, 1040 * 1000 + 7000000 + 30000); // slow, asymmetric round trip
  clock.add(2000, 2004, 2002 * 1000 + 7000000); // fast one
  clock.add(3000, 3060, 3030 * 1000 + 7000000 - 20000);
  assert.equal(clock.ready, true);
  assert.equal(clock.delayMs, 4);
  assert.equal(clock.serverUs(5000), 5000 * 1000 + 7000000);
  clock.reset();
  assert.equal(clock.ready, false);
});

test("the timeline shows the newest frame that is due and drops older ones", () => {
  const timeline = createTimeline();
  timeline.push(1000000, wave(1));
  timeline.push(1023220, wave(2));
  timeline.push(1046440, wave(3));
  assert.equal(timeline.pick(999999), null);
  assert.equal(timeline.pick(1030000)[0], 2);
  assert.equal(timeline.buffered, 1);
  assert.equal(timeline.pick(1040000)[0], 2, "held until the next frame is due");
  assert.equal(timeline.pick(1046440)[0], 3);
  assert.equal(timeline.sampleRate, 44100);
  assert.equal(timeline.leadUs(1046440), 0);
});

test("a starved timeline holds the last frame, fades it out, then reports nothing", () => {
  const timeline = createTimeline();
  timeline.push(1000000, wave(228));
  assert.equal(timeline.pick(1000000 + 300000)[0], 228);
  const fading = timeline.pick(1000000 + 550000)[0];
  assert.ok(fading > 128 && fading < 228, `expected a faded sample, got ${fading}`);
  assert.equal(timeline.pick(1000000 + 800000), null);
});

test("beats come due once, downbeats winning, and clear empties everything", () => {
  const timeline = createTimeline();
  timeline.pushBeat(1000, false);
  timeline.pushBeat(2000, true);
  timeline.pushBeat(9000, false);
  assert.equal(timeline.takeBeat(500), 0);
  assert.equal(timeline.takeBeat(2500), 2);
  assert.equal(timeline.takeBeat(2600), 0);
  timeline.push(1000000, wave(5));
  timeline.clear();
  assert.equal(timeline.takeBeat(99999), 0);
  assert.equal(timeline.pick(2000000), null);
});

// A scripted stand-in for the browser WebSocket.
function fakeSockets() {
  const made = [];
  class Fake {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.readyState = 0;
      made.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
    }
    open() {
      this.readyState = 1;
      this.onopen();
    }
    text(message) {
      this.onmessage({ data: JSON.stringify(message) });
    }
  }
  return { Fake, made };
}

test("the relay authenticates first, then pings and forwards frames", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Fake, made } = fakeSockets();
  const seen = [];
  let time = 0;
  const relay = createRelay({
    host: "h",
    token: "secret",
    WebSocketImpl: Fake,
    now: () => time,
    handlers: { wave: (ts, s) => seen.push(["wave", ts, s[0]]), state: (s) => seen.push(["state", s]), start: () => seen.push(["start"]) },
  });
  relay.connect("RINCON 1");
  assert.equal(made[0].url, "ws://h:8095/milkdrop_visualizer?player=RINCON%201");
  made[0].open();
  assert.deepEqual(made[0].sent[0], { type: "auth", token: "secret" });
  made[0].text({ type: "auth_ok" });
  assert.equal(relay.state, "open");
  assert.equal(made[0].sent[1].type, "client/time");

  time = 12;
  made[0].text({ type: "server/time", payload: { client_transmitted: 0, server_received: 9006000, server_transmitted: 9006000 } });
  assert.equal(relay.clock.ready, true);
  assert.equal(relay.clock.serverUs(6), 9006000);

  made[0].text({ type: "stream/start", payload: { visualizer: { types: ["waveform"] } } });
  made[0].onmessage({ data: frame(WAVE_TAG, 9100000, wave(77)) });
  assert.deepEqual(seen.slice(-2), [["start"], ["wave", 9100000, 77]]);
});

test("connecting to another player says goodbye on the old socket and ends its stream", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Fake, made } = fakeSockets();
  const ends = [];
  const relay = createRelay({ host: "h", token: "t", WebSocketImpl: Fake, now: () => 0, handlers: { end: () => ends.push(1) } });
  relay.connect("a");
  made[0].open();
  made[0].text({ type: "auth_ok" });
  relay.connect("b");
  assert.equal(made.length, 2);
  assert.equal(made[0].readyState, 3, "the first socket was closed");
  assert.equal(made[0].sent[made[0].sent.length - 1].type, "client/goodbye");
  assert.equal(ends.length, 1, "the listener was told the old stream ended");
  assert.equal(made[1].url, "ws://h:8095/milkdrop_visualizer?player=b");
  made[0].onclose({ code: 1006 });
  t.mock.timers.tick(60000);
  assert.equal(made.length, 2, "the old socket's close did not start a reconnect");
});

test("a rejected token is not retried; any other close is, with a fresh socket", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Fake, made } = fakeSockets();
  const relay = createRelay({ host: "h", token: "t", WebSocketImpl: Fake, now: () => 0, handlers: {} });
  relay.connect("p");
  made[0].open();
  made[0].onclose({ code: 1006 });
  assert.equal(relay.state, "connecting");
  t.mock.timers.tick(2000);
  assert.equal(made.length, 2, "reconnected after the backoff");

  made[1].open();
  made[1].onclose({ code: 4001, reason: "Invalid or expired token" });
  assert.equal(relay.state, "rejected");
  t.mock.timers.tick(120000);
  assert.equal(made.length, 2, "no further attempts");
});

test("a socket that stops answering pings is replaced", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Fake, made } = fakeSockets();
  let time = 0;
  const relay = createRelay({ host: "h", token: "t", WebSocketImpl: Fake, now: () => time, handlers: {} });
  relay.connect("p");
  made[0].open();
  made[0].text({ type: "auth_ok" });
  for (let i = 0; i < 40 && made.length === 1; i++) {
    time += 1000;
    t.mock.timers.tick(1000);
  }
  assert.equal(made[0].readyState, 3, "the silent socket was closed");
  t.mock.timers.tick(2000);
  assert.equal(made.length, 2);
  assert.equal(relay.reconnects, 1);
});

test("a 96 kHz stream is averaged down to one 48 kHz window from two frames", () => {
  const timeline = createTimeline();
  const gap = Math.round(1024e6 / 96000);
  const a = new Uint8Array(1024).fill(100);
  const b = new Uint8Array(1024);
  for (let i = 0; i < 1024; i++) b[i] = i % 2 ? 200 : 100; // pairs average to 150
  timeline.push(1000000, a);
  timeline.push(1000000 + gap, b);
  assert.equal(timeline.sourceRate, 96000);
  assert.equal(timeline.sampleRate, 48000);
  const shown = timeline.pick(1000000 + gap);
  assert.equal(shown.length, 1024);
  assert.equal(shown[0], 100, "first half comes from the older frame");
  assert.equal(shown[511], 100);
  assert.equal(shown[512], 150, "second half from the newer one, pairs averaged");
  assert.equal(shown[1023], 150);
});

test("a socket that opens but is never logged in is replaced", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Fake, made } = fakeSockets();
  const relay = createRelay({ host: "h", token: "t", WebSocketImpl: Fake, now: () => 0, handlers: {} });
  relay.connect("p");
  made[0].open(); // auth is sent, but no auth_ok ever comes back
  t.mock.timers.tick(9999);
  assert.equal(made.length, 1);
  t.mock.timers.tick(1);
  assert.equal(made[0].readyState, 3, "the unanswered socket was closed");
  t.mock.timers.tick(2000);
  assert.equal(made.length, 2, "and a new one opened");
});

test("the Music Assistant port is 8095 unless the host names one", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { Fake, made } = fakeSockets();
  const relay = createRelay({ host: "10.0.0.5:9000", token: "t", WebSocketImpl: Fake, now: () => 0, handlers: {} });
  relay.connect("p");
  assert.equal(made[0].url, "ws://10.0.0.5:9000/milkdrop_visualizer?player=p");
  relay.close();
});
