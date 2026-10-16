import assert from "node:assert/strict";
import { test } from "node:test";
import { LYRICS_PROBE_URL, RELAY_PROBE_PLAYER, createSetupCheck, liveProbes, lyricsState, setupNote, setupRows, setupSummary, versionOk } from "../src/setup-check.js";

const FACTS = { host: "ma.local", plays: true, playerId: "webos-afterglow-tv", sendspin: "ready", onlineLyrics: true, milkdropOn: true, scan: { done: true } };
const GOOD = { server: { reached: true, version: "2.10.6", authed: true, playerFound: true }, relay: { ok: true }, lyrics: { status: 200 } };
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.id, r]));
const merge = (base, change) => Object.assign({}, base, change);

test("versions from 2.10 pass; a development build passes", () => {
  assert.ok(versionOk("2.10.0"));
  assert.ok(versionOk("2.10.6"));
  assert.ok(versionOk("2.11.0b3"));
  assert.ok(versionOk("3.0.0"));
  assert.ok(versionOk("0.0.0"));
  assert.ok(!versionOk("2.9.3"));
  assert.ok(!versionOk("1.8.0"));
  assert.ok(!versionOk(""));
  assert.ok(!versionOk("dev"));
});

test("an LRCLIB 503 or 429 is busy, not failed; no answer fails", () => {
  assert.equal(lyricsState(200), "pass");
  assert.equal(lyricsState(404), "pass");
  assert.equal(lyricsState(503), "busy");
  assert.equal(lyricsState(429), "busy");
  assert.equal(lyricsState(0), "fail");
  assert.equal(lyricsState(undefined), "fail");
});

test("all good: every row passes, in the spec's order", () => {
  const rows = setupRows(FACTS, GOOD);
  assert.deepEqual(rows.map((r) => r.id), ["server", "account", "player", "sendspin", "visualizer", "lyrics", "scan"]);
  assert.ok(rows.every((r) => r.state === "pass" && !r.next));
  assert.equal(byId(rows).server.value, "Version 2.10.6");
  assert.equal(setupNote(rows), "Everything looks right.");
  assert.equal(setupSummary(rows), "All good");
});

test("rows that do not apply are left out", () => {
  const rows = setupRows(merge(FACTS, { plays: false, onlineLyrics: false, milkdropOn: false }), GOOD);
  assert.deepEqual(rows.map((r) => r.id), ["server", "account", "visualizer"]);
});

test("while running every probed row says Checking…", () => {
  const rows = byId(setupRows(FACTS, null));
  for (const id of ["server", "account", "player", "visualizer", "lyrics"]) assert.equal(rows[id].value, "Checking…");
  assert.equal(setupNote(Object.values(rows)), "Checking…");
});

test("an unreachable server leaves what depends on it not checked", () => {
  const rows = byId(setupRows(FACTS, merge(GOOD, { server: { reached: false }, relay: { ok: false } })));
  assert.equal(rows.server.state, "fail");
  assert.equal(rows.server.value, "Can’t reach it");
  assert.equal(rows.server.next, "Check that Music Assistant is running at ma.local.");
  for (const id of ["account", "player", "visualizer"]) assert.deepEqual([rows[id].state, rows[id].value, rows[id].next], ["skip", "Not checked", ""]);
  assert.equal(setupNote(Object.values(rows)), "1 thing needs a look.");
});

test("each failure names one next step", () => {
  const old = byId(setupRows(FACTS, merge(GOOD, { server: merge(GOOD.server, { version: "2.9.3" }) })));
  assert.deepEqual([old.server.value, old.server.next], ["Version 2.9.3", "Update Music Assistant to 2.10 or newer."]);
  const refused = byId(setupRows(FACTS, merge(GOOD, { server: merge(GOOD.server, { authed: false }) })));
  assert.deepEqual([refused.account.value, refused.account.next], ["Token refused", "Log out, then sign in again."]);
  assert.equal(refused.player.state, "skip");
  assert.equal(refused.visualizer.state, "skip");
  const rows = byId(setupRows(merge(FACTS, { sendspin: "error", scan: { done: false, measured: 120, total: 395 } }),
    merge(GOOD, { server: merge(GOOD.server, { playerFound: false }), relay: { ok: false }, lyrics: { status: 0 } })));
  assert.equal(rows.player.next, "Check that Music Assistant’s Sendspin provider is on, then reopen Afterglow.");
  assert.deepEqual([rows.sendspin.value, rows.sendspin.next], ["Not connected", "Check that Music Assistant’s Sendspin provider is on."]);
  assert.deepEqual([rows.visualizer.value, rows.visualizer.next], ["Plugin not found", "Add MilkDrop Visualizer in Music Assistant: Settings, Plugins."]);
  assert.deepEqual([rows.lyrics.value, rows.lyrics.next], ["Can’t reach lrclib.net", "Check the TV’s internet connection, or turn Online lyrics off."]);
  assert.deepEqual([rows.scan.value, rows.scan.next], ["120 of 395 done", "Run Scan presets in Settings, Performance."]);
  assert.equal(setupNote(Object.values(rows)), "5 things need a look.");
  assert.equal(setupSummary(Object.values(rows)), "5 to look at");
  const fresh = byId(setupRows(merge(FACTS, { scan: {} }), GOOD));
  assert.equal(fresh.scan.value, "Not run");
});

test("busy lyrics are not counted as a failure", () => {
  const rows = setupRows(FACTS, merge(GOOD, { lyrics: { status: 503 } }));
  const lyrics = byId(rows).lyrics;
  assert.deepEqual([lyrics.state, lyrics.value, lyrics.next], ["busy", "Busy right now", "LRCLIB is busy. Lyrics are tried again by themselves."]);
  assert.equal(setupNote(rows), "Everything looks right.");
});

// A Music Assistant with the API socket and the relay, answering read-only calls.
function fakeSockets({ version = "2.10.6", authed = true, players = [{ player_id: "webos-afterglow-tv" }], relay = "auth_ok" } = {}) {
  const opened = [];
  class Fake {
    constructor(url) {
      this.url = url; this.sent = []; opened.push(this);
      setTimeout(() => {
        if (/\/ws$/.test(url)) this.onmessage({ data: JSON.stringify({ server_version: version }) });
        else if (relay === "missing") this.onclose({ code: 1006 });
        else this.onopen();
      }, 0);
    }
    send(data) {
      const m = JSON.parse(data); this.sent.push(m);
      setTimeout(() => {
        if (m.type === "auth") return relay === "auth_ok" ? this.onmessage({ data: '{"type":"auth_ok"}' }) : this.onclose({ code: 4001 });
        if (m.command === "auth") return this.onmessage({ data: JSON.stringify(authed ? { message_id: m.message_id, result: { authenticated: true } } : { message_id: m.message_id, error_code: 20, details: "Invalid token" }) });
        if (m.command === "players/all") return this.onmessage({ data: JSON.stringify({ message_id: m.message_id, result: players }) });
      }, 0);
    }
    close() { this.closed = true; }
  }
  return { Fake, opened };
}

test("the live probes ask only read-only things and close their sockets", async () => {
  const { Fake, opened } = fakeSockets();
  const asked = [];
  const probes = liveProbes({ host: "ma.local", token: "t", WebSocketImpl: Fake, fetchImpl: (url) => { asked.push(url); return Promise.resolve({ status: 200 }); } });
  assert.deepEqual(await probes.server("webos-afterglow-tv"), { reached: true, version: "2.10.6", authed: true, playerFound: true });
  assert.deepEqual(opened[0].sent.map((m) => m.command), ["auth", "players/all"]);
  assert.deepEqual(await probes.relay(), { ok: true });
  assert.equal(opened[1].url, "ws://ma.local:8095/milkdrop_visualizer?player=" + RELAY_PROBE_PLAYER);
  assert.deepEqual(await probes.lyrics(), { status: 200 });
  assert.deepEqual(asked, [LYRICS_PROBE_URL]);
  assert.ok(opened.every((s) => s.closed), "every socket is closed after its check");
});

test("live probes report a refused token, a missing plugin and no internet", async () => {
  const refused = fakeSockets({ authed: false, relay: "refused" });
  const probes = liveProbes({ host: "ma.local", token: "t", WebSocketImpl: refused.Fake, fetchImpl: () => Promise.reject(new TypeError("Failed to fetch")) });
  assert.deepEqual(await probes.server("x"), { reached: true, version: "2.10.6", authed: false, playerFound: false });
  assert.deepEqual(await probes.relay(), { ok: false });
  assert.deepEqual(await probes.lyrics(), { status: 0 });
  const missing = fakeSockets({ relay: "missing" });
  assert.deepEqual(await liveProbes({ host: "h", token: "t", WebSocketImpl: missing.Fake }).relay(), { ok: false });
  class Dead { constructor() { setTimeout(() => this.onclose({}), 0); } close() {} send() {} }
  assert.deepEqual(await liveProbes({ host: "h", token: "t", WebSocketImpl: Dead }).server("x"), { reached: false });
});

test("a run shows Checking… first, then the results; one run at a time", async () => {
  const seen = [];
  let calls = 0;
  const probes = { server: () => { calls++; return Promise.resolve(GOOD.server); }, relay: () => Promise.resolve({ ok: true }), lyrics: () => Promise.resolve({ status: 200 }) };
  const check = createSetupCheck({ facts: () => FACTS, probes });
  assert.equal(check.summary, "Not run");
  const first = check.run((rows) => seen.push(setupNote(rows)));
  check.run();
  await first;
  assert.deepEqual(seen, ["Checking…", "Everything looks right."]);
  assert.equal(calls, 1);
  assert.equal(check.summary, "All good");
});
