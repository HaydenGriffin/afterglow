// Check my setup: a pass/fail list, each failure with one plain next step.
// It runs only when asked (Settings, or the offer on an empty screen), never
// in a loop. The checks are read-only: one short API socket (version, token,
// players), the relay's login, one request to lrclib.net when Online lyrics is
// on; the rest are facts the app already has. The rows and their copy match
// Afterglow for PS5 (.lanes/_brief/R2-share.md).
import { connectApi } from "./ma.js";
import { authority } from "./relay.js";

export const MIN_VERSION = [2, 10];
// A player id nobody has: the relay logs in, then finds no player and closes,
// so no audio tap is ever started for the check.
export const RELAY_PROBE_PLAYER = "afterglow-setup-check";
export const LYRICS_PROBE_URL = "https://lrclib.net/api/get/1";
const PROBE_MS = 8000;

// "2.10.6" passes, "2.9.3" does not; "0.0.0" is a development build and passes.
export function versionOk(version) {
  const parts = String(version || "").split(".").map((p) => parseInt(p, 10));
  if (parts.length < 2 || parts.some((p) => !(p >= 0))) return false;
  if (parts.every((p) => p === 0)) return true;
  return parts[0] > MIN_VERSION[0] || (parts[0] === MIN_VERSION[0] && parts[1] >= MIN_VERSION[1]);
}

// A lyrics answer: any HTTP status is an answer; 429 and 5xx mean busy.
export function lyricsState(status) {
  if (!status) return "fail";
  return status === 429 || status >= 500 ? "busy" : "pass";
}

const row = (id, label, state, value, next) => ({ id, label, state, value, next: next || "" });
const notChecked = (id, label) => row(id, label, "skip", "Not checked");

// The rows from what the app knows (facts) and what the probes found
// (results; null while they run). facts: { host, plays, sendspin,
// onlineLyrics, milkdropOn, scan: { done, measured, total } }.
// results: { server: { reached, version, authed, playerFound }, relay: { ok },
// lyrics: { status } }.
export function setupRows(facts, results) {
  const rows = [];
  const running = !results;
  const checking = (id, label) => row(id, label, "checking", "Checking…");
  const server = results && results.server;
  const reached = !!(server && server.reached);
  const fresh = reached && versionOk(server.version);

  if (running) rows.push(checking("server", "Music Assistant"));
  else if (!reached) rows.push(row("server", "Music Assistant", "fail", "Can’t reach it", "Check that Music Assistant is running at " + facts.host + "."));
  else if (!fresh) rows.push(row("server", "Music Assistant", "fail", "Version " + server.version, "Update Music Assistant to 2.10 or newer."));
  else rows.push(row("server", "Music Assistant", "pass", "Version " + server.version));

  const authed = reached && !!server.authed;
  if (running) rows.push(checking("account", "Signed in"));
  else if (!reached) rows.push(notChecked("account", "Signed in"));
  else if (!authed) rows.push(row("account", "Signed in", "fail", "Token refused", "Log out, then sign in again."));
  else rows.push(row("account", "Signed in", "pass", "Token accepted"));

  if (facts.plays) {
    const label = "This TV as a speaker";
    if (running) rows.push(checking("player", label));
    else if (!authed) rows.push(notChecked("player", label));
    else if (!server.playerFound) rows.push(row("player", label, "fail", "Not in Music Assistant", "Check that Music Assistant’s Sendspin provider is on, then reopen Afterglow."));
    else rows.push(row("player", label, "pass", "In Music Assistant"));
    const connected = facts.sendspin === "ready" || facts.sendspin === "playing";
    rows.push(connected ? row("sendspin", "Sendspin", "pass", "Connected")
      : row("sendspin", "Sendspin", "fail", "Not connected", "Check that Music Assistant’s Sendspin provider is on."));
  }

  if (running) rows.push(checking("visualizer", "MilkDrop Visualizer"));
  else if (!authed) rows.push(notChecked("visualizer", "MilkDrop Visualizer"));
  else if (!(results.relay && results.relay.ok)) rows.push(row("visualizer", "MilkDrop Visualizer", "fail", "Plugin not found", "Add MilkDrop Visualizer in Music Assistant: Settings, Plugins."));
  else rows.push(row("visualizer", "MilkDrop Visualizer", "pass", "Plugin found"));

  if (facts.onlineLyrics) {
    const state = running ? "checking" : lyricsState(results.lyrics && results.lyrics.status);
    if (state === "checking") rows.push(checking("lyrics", "Online lyrics"));
    else if (state === "pass") rows.push(row("lyrics", "Online lyrics", "pass", "lrclib.net answers"));
    else if (state === "busy") rows.push(row("lyrics", "Online lyrics", "busy", "Busy right now", "LRCLIB is busy. Lyrics are tried again by themselves."));
    else rows.push(row("lyrics", "Online lyrics", "fail", "Can’t reach lrclib.net", "Check the TV’s internet connection, or turn Online lyrics off."));
  }

  if (facts.milkdropOn) {
    const scan = facts.scan || {};
    if (scan.done) rows.push(row("scan", "Preset scan", "pass", "Done"));
    else rows.push(row("scan", "Preset scan", "fail", scan.measured ? scan.measured + " of " + scan.total + " done" : "Not run", "Run Scan presets in Settings, Performance."));
  }
  return rows;
}

// The sheet's note and the Settings row's value.
export function setupNote(rows) {
  if (!rows) return "";
  if (rows.some((r) => r.state === "checking")) return "Checking…";
  const failed = rows.filter((r) => r.state === "fail").length;
  return !failed ? "Everything looks right." : failed === 1 ? "1 thing needs a look." : failed + " things need a look.";
}
export function setupSummary(rows) {
  if (!rows) return "Not run";
  if (rows.some((r) => r.state === "checking")) return "Checking…";
  const failed = rows.filter((r) => r.state === "fail").length;
  return failed ? failed + " to look at" : "All good";
}

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}

// The probes against the real server; each resolves, never rejects.
export function liveProbes({ host, token, WebSocketImpl, fetchImpl }) {
  const Socket = WebSocketImpl || (typeof WebSocket === "function" ? WebSocket : null);
  const get = fetchImpl || (typeof fetch === "function" ? fetch : null);
  return {
    async server(playerId) {
      let api;
      try {
        api = await connectApi(host, WebSocketImpl);
      } catch (e) {
        return { reached: false };
      }
      const out = { reached: true, version: api.serverVersion || "", authed: false, playerFound: false };
      try {
        const auth = await api.call("auth", { token });
        out.authed = !!(auth && auth.authenticated !== false);
        if (out.authed && playerId) {
          const players = await api.call("players/all");
          out.playerFound = (players || []).some((p) => p && p.player_id === playerId);
        }
      } catch (e) {
        // a refused token rejects the call
      } finally {
        api.close();
      }
      return out;
    },
    relay() {
      if (!Socket) return Promise.resolve({ ok: false });
      return withTimeout(new Promise((resolve) => {
        let ws;
        try {
          ws = new Socket("ws://" + authority(host) + "/milkdrop_visualizer?player=" + RELAY_PROBE_PLAYER);
        } catch (e) {
          return resolve({ ok: false });
        }
        const done = (ok) => { resolve({ ok }); try { ws.close(); } catch (e) { /* closed */ } };
        ws.onopen = () => ws.send(JSON.stringify({ type: "auth", token }));
        ws.onmessage = (event) => {
          let message = null;
          try { message = JSON.parse(event.data); } catch (e) { return; }
          if (message && message.type === "auth_ok") done(true);
        };
        ws.onerror = () => {};
        ws.onclose = () => resolve({ ok: false });
      }), PROBE_MS, { ok: false });
    },
    lyrics() {
      if (!get) return Promise.resolve({ status: 0 });
      const abort = typeof AbortController === "function" ? new AbortController() : null;
      const timer = setTimeout(() => abort && abort.abort(), PROBE_MS);
      return get(LYRICS_PROBE_URL, abort ? { signal: abort.signal } : {})
        .then((response) => ({ status: response.status }), () => ({ status: 0 }))
        .then((result) => { clearTimeout(timer); return result; });
    },
  };
}

// The browser demo's answers: nothing leaves the page.
export function demoProbes() {
  const later = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 900));
  return {
    server: () => later({ reached: true, version: "2.10.6", authed: true, playerFound: true }),
    relay: () => later({ ok: true }),
    lyrics: () => later({ status: 503 }),
  };
}

// One run at a time; onChange gets the rows as they stand (first all
// "Checking…", then the results).
export function createSetupCheck({ facts, probes }) {
  let rows = null, running = false, generation = 0;
  return {
    get rows() { return rows; },
    get running() { return running; },
    get summary() { return setupSummary(rows); },
    async run(onChange) {
      if (running) return rows;
      running = true;
      const gen = ++generation;
      const f = facts();
      rows = setupRows(f, null);
      if (onChange) onChange(rows);
      const [server, relay, lyrics] = await Promise.all([
        probes.server(f.plays ? f.playerId : ""),
        probes.relay(),
        f.onlineLyrics ? probes.lyrics() : Promise.resolve(null),
      ]);
      running = false;
      if (gen !== generation) return rows;
      // Sendspin and the scan are read again: they may have moved meanwhile.
      rows = setupRows(Object.assign({}, f, facts()), { server, relay, lyrics });
      if (onChange) onChange(rows);
      return rows;
    },
  };
}
