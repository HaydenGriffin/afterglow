// Client for Music Assistant's MilkDrop Visualizer relay.
//   ws://<host>:8095/milkdrop_visualizer?player=<id>
// Wire format (music_assistant/providers/milkdrop_visualizer/relay.py):
//   binary [22][int64 BE us][1024 x uint8]  waveform window, 0x80 = zero
//   binary [17][int64 BE us][flags]         beat, bit 0 = downbeat
//   text   stream/start, stream/clear, stream/end, color, error, server/time
// Timestamps are the server's monotonic clock: when the data should be shown.

export const WAVE_TAG = 22;
export const BEAT_TAG = 17;
const HEADER_BYTES = 9;
const WAVE_BYTES = 1024;
const AUTH_REJECTED = 4001;

const FAST_PINGS = 8;
const FAST_PING_MS = 250;
const PING_MS = 5000;
const PING_TIMEOUT_MS = 10000;
const HANDSHAKE_MS = 10000; // a socket must be logged in by then
const CLOCK_SAMPLES = 40;
const BACKOFF_MIN_MS = 1000;
const BACKOFF_MAX_MS = 30000;

// Music Assistant's web port, unless the configured host names another.
export function authority(host) {
  return host.indexOf(":") >= 0 ? host : host + ":8095";
}

export function parseFrame(buffer) {
  if (buffer.byteLength < HEADER_BYTES + 1) return null;
  const view = new DataView(buffer);
  const tag = view.getUint8(0);
  // Chromium 68 has no DataView.getBigInt64; a monotonic clock in microseconds
  // stays far below 2^53, so two 32-bit halves are exact.
  const ts = view.getInt32(1) * 4294967296 + view.getUint32(5);
  if (tag === WAVE_TAG && buffer.byteLength >= HEADER_BYTES + WAVE_BYTES) {
    return { type: "wave", ts, samples: new Uint8Array(buffer, HEADER_BYTES, WAVE_BYTES) };
  }
  if (tag === BEAT_TAG) return { type: "beat", ts, downbeat: (view.getUint8(HEADER_BYTES) & 1) === 1 };
  return null;
}

// Estimates the offset between the local clock (ms) and the server clock (us)
// from ping round trips, trusting the round trip with the least delay.
export function createClock() {
  const samples = [];
  let best = null;
  return {
    add(sentMs, receivedMs, serverUs) {
      samples.push({ delay: receivedMs - sentMs, offset: serverUs - ((sentMs + receivedMs) / 2) * 1000 });
      if (samples.length > CLOCK_SAMPLES) samples.shift();
      best = samples[0];
      for (const sample of samples) if (sample.delay < best.delay) best = sample;
    },
    reset() {
      samples.length = 0;
      best = null;
    },
    get ready() {
      return best !== null;
    },
    get delayMs() {
      return best ? best.delay : 0;
    },
    serverUs(localMs) {
      return best ? localMs * 1000 + best.offset : 0;
    },
  };
}

export function createRelay({ host, token, handlers, WebSocketImpl, now }) {
  const Socket = WebSocketImpl || WebSocket;
  const clock = createClock();
  const localNow = now || (() => performance.now());
  let socket = null;
  let generation = 0; // bumped on every (re)connect so stale callbacks are ignored
  let player = "";
  let state = "closed"; // closed | connecting | open | rejected
  let pingTimer = 0;
  let retryTimer = 0;
  let handshakeTimer = 0;
  let pingsSent = 0;
  let lastReplyMs = 0;
  let backoffMs = BACKOFF_MIN_MS;
  let reconnects = 0;

  function emit(name, a, b) {
    if (handlers[name]) handlers[name](a, b);
  }

  function setState(next, detail) {
    state = next;
    emit("state", next, detail);
  }

  function stopTimers() {
    clearTimeout(pingTimer);
    clearTimeout(retryTimer);
    clearTimeout(handshakeTimer);
    pingTimer = retryTimer = handshakeTimer = 0;
  }

  function ping(gen) {
    if (gen !== generation || !socket || socket.readyState !== 1) return;
    if (pingsSent > 0 && localNow() - lastReplyMs > PING_TIMEOUT_MS) {
      // The socket stopped answering without closing; replace it.
      drop("no reply to clock pings");
      return;
    }
    socket.send(JSON.stringify({ type: "client/time", payload: { client_transmitted: localNow() } }));
    pingsSent++;
    pingTimer = setTimeout(() => ping(gen), pingsSent < FAST_PINGS ? FAST_PING_MS : PING_MS);
  }

  function scheduleRetry() {
    const wait = backoffMs * (0.75 + Math.random() * 0.5);
    backoffMs = Math.min(backoffMs * 2, BACKOFF_MAX_MS);
    retryTimer = setTimeout(open, wait);
  }

  function drop(reason) {
    const old = socket;
    socket = null;
    generation++;
    stopTimers();
    if (old) {
      try {
        old.close();
      } catch (e) {
        // already closing
      }
    }
    reconnects++;
    setState("connecting", reason);
    emit("end");
    scheduleRetry();
  }

  function onText(text) {
    let message;
    try {
      message = JSON.parse(text);
    } catch (e) {
      return;
    }
    const type = message.type;
    if (type === "auth_ok") {
      clearTimeout(handshakeTimer);
      backoffMs = BACKOFF_MIN_MS;
      pingsSent = 0;
      lastReplyMs = localNow();
      setState("open");
      ping(generation);
    } else if (type === "server/time") {
      const received = localNow();
      lastReplyMs = received;
      clock.add(message.payload.client_transmitted, received, message.payload.server_transmitted);
    } else if (type === "stream/start") emit("start", message.payload);
    else if (type === "stream/clear") emit("clear");
    else if (type === "stream/end") emit("end");
    else if (type === "color") emit("color", message.payload);
    else if (type === "error") emit("error", message.message || "relay error");
  }

  function open() {
    stopTimers();
    const gen = ++generation;
    clock.reset();
    setState("connecting");
    const ws = new Socket("ws://" + authority(host) + "/milkdrop_visualizer?player=" + encodeURIComponent(player));
    ws.binaryType = "arraybuffer";
    socket = ws;
    // A connection that opens but never answers would otherwise wait forever:
    // the ping check only starts once logged in.
    handshakeTimer = setTimeout(() => {
      if (gen === generation && state !== "open") drop("no answer from the server");
    }, HANDSHAKE_MS);
    ws.onopen = () => {
      if (gen === generation) ws.send(JSON.stringify({ type: "auth", token }));
    };
    ws.onmessage = (event) => {
      if (gen !== generation) return;
      if (typeof event.data === "string") return onText(event.data);
      const frame = parseFrame(event.data);
      if (!frame) return;
      if (frame.type === "wave") emit("wave", frame.ts, frame.samples);
      else emit("beat", frame.ts, frame.downbeat);
    };
    ws.onclose = (event) => {
      if (gen !== generation) return;
      socket = null;
      stopTimers();
      emit("end");
      if (event.code === AUTH_REJECTED) return setState("rejected", event.reason || "token rejected");
      reconnects++;
      setState("connecting", "closed " + event.code);
      scheduleRetry();
    };
    ws.onerror = () => {};
  }

  // Says goodbye on the current socket, if any, and forgets it. The old
  // socket's callbacks are ignored from here on (the generation moves).
  function leave() {
    generation++;
    stopTimers();
    const old = socket;
    socket = null;
    if (!old) return false;
    try {
      old.send(JSON.stringify({ type: "client/goodbye" }));
      old.close();
    } catch (e) {
      // already closed
    }
    return true;
  }

  return {
    clock,
    // Watches a player, dropping the socket to the previous one first so the
    // server holds one tap per viewer. The stream ends for the listener.
    connect(playerId) {
      if (leave()) emit("end");
      player = playerId;
      backoffMs = BACKOFF_MIN_MS;
      open();
    },
    close() {
      leave();
      setState("closed");
    },
    get state() {
      return state;
    },
    get player() {
      return player;
    },
    get reconnects() {
      return reconnects;
    },
  };
}
