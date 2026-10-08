// The live signal: relay frames, buffered and released on the server's clock.
import { createFollow } from "./follow.js";
import { createRelay } from "./relay.js";
import { SHARED_PREFS, loadPref, savePref } from "./settings.js";
import { createTimeline } from "./timeline.js";

const TRIM_LIMIT_MS = 2000;

export function createLive(settings) {
  const timeline = createTimeline();
  let trimMs = loadPref("trim", 0);
  let beatHit = 0;
  let palette = null;
  let showing = false;
  let problem = "";
  let follow = null;
  let track = null;
  let trackListener = null;
  let remoteListener = null;
  let rejectedListener = null;
  const REJECTED = "Signed out: Music Assistant no longer accepts this TV's token.";

  function rejected() {
    problem = REJECTED;
    if (rejectedListener) rejectedListener();
  }

  const relay = createRelay({
    host: settings.host,
    token: settings.token,
    handlers: {
      wave(ts, samples) {
        timeline.push(ts, samples);
        follow.noteFrame();
      },
      beat(ts, downbeat) {
        timeline.pushBeat(ts, downbeat);
      },
      clear() {
        timeline.clear();
        follow.noteClear();
      },
      end() {
        timeline.clear();
        follow.noteEnd();
      },
      color(payload) {
        palette = payload;
      },
      error(message) {
        follow.noteError();
        problem = message;
      },
      state(state) {
        if (state === "rejected") rejected();
        else if (state === "open") {
          problem = "";
          follow.noteRelayOpen();
        }
      },
    },
  });

  follow = createFollow({
    host: settings.host,
    token: settings.token,
    pinned: settings.player,
    preferred: loadPref("preferredPlayer", ""),
    relay,
    onState(state) {
      if (state === "rejected") rejected();
    },
    onTrack(next) {
      track = next;
      if (trackListener) trackListener(next);
    },
    onRemotePrefs(shared, device) {
      if (remoteListener) remoteListener(shared, device);
    },
    deviceId: settings.deviceId,
    sharedKeys: SHARED_PREFS,
  });

  return {
    // The waveform to draw now, or null when nothing is playing.
    wave(nowMs) {
      beatHit = 0;
      if (!relay.clock.ready) {
        showing = false;
        return null;
      }
      // A positive trim shows each frame later.
      const nowUs = relay.clock.serverUs(nowMs) - trimMs * 1000;
      beatHit = timeline.takeBeat(nowUs);
      const wave = timeline.pick(nowUs);
      showing = wave !== null;
      return wave;
    },
    get beatHit() {
      return beatHit;
    },
    get sampleRate() {
      return timeline.sampleRate;
    },
    get palette() {
      return palette;
    },
    get showing() {
      return showing;
    },
    get problem() {
      return problem;
    },
    get trimMs() {
      return trimMs;
    },
    get track() {
      return track;
    },
    onTrack(fn) {
      trackListener = fn;
    },
    onRemotePrefs(fn) {
      remoteListener = fn;
    },
    // The token was refused by the API or the relay.
    onRejected(fn) {
      rejectedListener = fn;
    },
    savePrefs(snapshot) {
      follow.savePrefs(snapshot);
    },
    reloadTrim() {
      trimMs = loadPref("trim", 0);
    },
    // The speakers that can be picked, and the pick ("" for automatic).
    speakers() {
      return follow.speakers();
    },
    setPreferred(playerId) {
      follow.setPreferred(playerId);
    },
    reloadPreferred() {
      follow.setPreferred(loadPref("preferredPlayer", ""));
    },
    get preferred() {
      return follow.preferred;
    },
    // What is being watched: {queueId, playerId, name, reason}, or null.
    get following() {
      return follow.following;
    },
    nudgeTrim(deltaMs) {
      trimMs = Math.max(-TRIM_LIMIT_MS, Math.min(TRIM_LIMIT_MS, trimMs + deltaMs));
      savePref("trim", trimMs);
    },
    start() {
      follow.start();
    },
    stop() {
      follow.stop();
      relay.close();
      timeline.clear();
      showing = false;
    },
    status() {
      const nowUs = relay.clock.ready ? relay.clock.serverUs(performance.now()) : 0;
      return {
        relay: relay.state + (relay.reconnects ? " (" + relay.reconnects + " reconnects)" : ""),
        follow: follow.state + (follow.following ? " " + follow.following.name + " (" + follow.following.reason + ")" : follow.player ? " " + follow.player : ""),
        clock: relay.clock.ready ? "delay " + relay.clock.delayMs.toFixed(1) + "ms" : "syncing",
        buffer: timeline.buffered + " frames, " + (timeline.leadUs(nowUs) / 1e6).toFixed(1) + "s ahead, " + timeline.sourceRate + "Hz source",
        trim: trimMs + "ms",
        sync: follow.syncLog,
      };
    },
  };
}
