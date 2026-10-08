#!/usr/bin/env node
// Usage: MA_HOST=<host> MA_TOKEN=<token> scripts/relay-probe.mjs <player_id> [seconds]
// Connects to the relay with the app's own client code and prints what
// arrives: frame rate, how far ahead frames are sent, and the clock offset.
import { createRelay } from "../src/relay.js";
import { createTimeline } from "../src/timeline.js";

const config = { host: process.env.MA_HOST || "", token: process.env.MA_TOKEN || "" };
const player = process.argv[2];
const seconds = Number(process.argv[3] || 10);
if (!player || !config.host || !config.token) {
  console.error("usage: MA_HOST=<host> MA_TOKEN=<token> relay-probe.mjs <player_id> [seconds]");
  process.exit(1);
}

const timeline = createTimeline();
let waves = 0;
let beats = 0;
const relay = createRelay({
  host: config.host,
  token: config.token,
  handlers: {
    state: (state, detail) => console.log(`state: ${state}${detail ? ` (${detail})` : ""}`),
    start: (payload) => console.log("stream/start", JSON.stringify(payload)),
    clear: () => console.log("stream/clear"),
    end: () => console.log("stream/end"),
    error: (message) => console.log("error:", message),
    color: (payload) => console.log("color", JSON.stringify(payload)),
    wave: (ts, samples) => {
      waves++;
      timeline.push(ts, samples);
    },
    beat: (ts, downbeat) => {
      beats++;
      timeline.pushBeat(ts, downbeat);
    },
  },
});
relay.connect(player);

let last = 0;
const timer = setInterval(() => {
  const now = relay.clock.serverUs(performance.now());
  const picked = relay.clock.ready ? timeline.pick(now) : null;
  console.log(
    `frames/s ${waves - last}  buffered ${timeline.buffered}  lead ${(timeline.leadUs(now) / 1e6).toFixed(2)}s  ` +
      `rate ${timeline.sourceRate}Hz  beats ${beats}  clock delay ${relay.clock.delayMs.toFixed(1)}ms  ` +
      `showing ${picked ? "a frame" : "nothing"}`
  );
  last = waves;
}, 1000);

setTimeout(() => {
  clearInterval(timer);
  relay.close();
}, seconds * 1000);
