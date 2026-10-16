import test from "node:test";
import assert from "node:assert/strict";
import { useFakeDocument } from "./fake-dom-tree.mjs";
import { createPlayerView } from "../src/player-view.js";
import { allPrefs, loadPref, savePref } from "../src/settings.js";
import { candidateDetail, timingLabel } from "../src/lyrics-tools.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));
const LRC = "[00:00]First line\n[00:10]\n[00:20]Second line\n[00:35]Third line";
const song = (id) => ({ queue_item_id: "i" + id, duration: 200, media_item: { media_type: "track", uri: "library://track/" + id, name: "Low Tide", artists: [{ name: "Demo Band" }], album: { name: "Coast" } } });
const RESULTS = [
  { id: 11, trackName: "Low Tide", artistName: "Demo Band", albumName: "Coast", duration: 200, syncedLyrics: "[00:00]Other words", plainLyrics: "" },
  { id: 12, trackName: "Low Tide (live)", artistName: "Demo Band", albumName: "Live", duration: 290, syncedLyrics: "[00:00]Live words", plainLyrics: "" },
];

// The player view over a fake document; Music Assistant answers LRC for every
// song, lrclib.net (fetch) answers `lrclib`.
function harness(t, lrclib = async () => ({ ok: true, status: 200, json: async () => RESULTS })) {
  const doc = useFakeDocument(t);
  const previous = globalThis.fetch;
  const fetched = [];
  globalThis.fetch = (url) => { fetched.push(url); return lrclib(url); };
  t.after(() => { globalThis.fetch = previous; for (const key of ["lyricsSongs", "lyricsOffsetMs", "viewMode", "onlineLyrics"]) savePref(key, null); });
  savePref("lyricsSongs", []); savePref("lyricsOffsetMs", 0); savePref("onlineLyrics", true);
  const calls = [], notices = [];
  const queue = { queue_id: "tv", display_name: "TV", state: "playing", current_item: song(1) };
  const live = {
    mock: false, palette: null,
    playback: { queue, player: {}, connected: true, position: 21 },
    call(command, args) { calls.push({ command, args }); return Promise.resolve(command === "metadata/get_track_lyrics" ? [null, LRC] : null); },
  };
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  const view = createPlayerView({ root, live, host: "ma", engine: { setDrawing() {} }, onSettings() {}, onMode() {}, onNotice: (n) => notices.push(n) });
  view.setMode("lyrics");
  view.start();
  // The fake document is gone by now; stop() clears the timer before it needs one.
  t.after(() => { try { view.stop(); } catch (e) { /* no document */ } });
  const rows = () => root.querySelector(".panel-items").querySelectorAll("button");
  const row = (label) => rows().find((b) => b.children[0].textContent === label);
  const value = (label) => row(label) && row(label).children[1].textContent;
  const open = async (name) => {
    root.querySelector(".transport").children.find((b) => b.getAttribute("aria-label") === name).click();
    await settle(); await settle();
    view.close(); root.querySelector(".transport").children.find((b) => b.getAttribute("aria-label") === name).click();
  };
  // The view rebuilds its panels four times a second.
  const later = () => new Promise((resolve) => setTimeout(resolve, 300));
  const headings = () => root.querySelector(".panel-items").querySelectorAll("h3").map((h) => h.textContent);
  return { root, view, live, queue, calls, notices, fetched, rows, row, value, open, headings, later };
}

test("labels: timings as the Lyrics timing row says them, candidates with their length", () => {
  assert.equal(timingLabel(0), "With the music");
  assert.equal(timingLabel(300), "0.3 s later");
  assert.equal(timingLabel(-1200), "1.2 s earlier");
  assert.equal(candidateDetail({ album: "Coast", duration: 201, timed: true }, 200), "Coast · 3:21 · Timed");
  assert.equal(candidateDetail({ album: "Live", duration: 290, timed: false }, 200), "Live · 4:50 · Plain · 1:30 longer");
  assert.equal(candidateDetail({ album: "", duration: 150, timed: true }, 200), "2:30 · Timed · 0:50 shorter");
});

test("changing the timing offers to keep it; Keep keeps it for this song and puts the others back", async (t) => {
  const h = harness(t);
  savePref("lyricsOffsetMs", 200); h.view.reloadPrefs();
  await h.open("Display");
  assert.equal(h.value("Lyrics timing"), "0.2 s later");
  assert.ok(!h.headings().includes("Keep this timing for this song?"), "nothing changed during this song yet");
  h.row("Lyrics timing")._change(1); h.view.handleKey("down");
  await h.open("Display");
  assert.equal(h.value("Lyrics timing"), "0.3 s later");
  assert.ok(h.headings().includes("Keep this timing for this song?"));
  assert.equal(h.value("Keep"), "Other songs: 0.2 s later");
  assert.ok(h.row("Not now"));
  h.row("Keep").click();
  assert.equal(loadPref("lyricsOffsetMs", 0), 200, "the device timing is back where it was");
  assert.deepEqual(loadPref("lyricsSongs", []).map(({ id, ms }) => ({ id, ms })), [{ id: "library://track/1", ms: 300 }]);
  assert.ok("lyricsSongs" in allPrefs(), "kept with the settings that follow the account");
  assert.deepEqual(h.notices, ["Timing kept for this song"]);
  assert.equal(h.value("Lyrics timing"), "0.3 s later", "this song keeps its timing");
  assert.equal(h.value("Forget timing for this song"), "Timing: kept for this song");
  assert.equal(h.row("Reset lyrics timing"), undefined);
  assert.equal(h.row("Keep"), undefined, "answered");
  assert.equal(h.view.snapshot().lyricPosition, 21 - 0.3, "the words follow the kept timing");
  h.row("Lyrics timing")._change(1);
  assert.equal(loadPref("lyricsSongs", [])[0].ms, 400, "left/right now change the kept timing");
  assert.equal(loadPref("lyricsOffsetMs", 0), 200);
  // Another song: the device timing.
  h.queue.current_item = song(2);
  await h.open("Display"); await h.open("Display");
  assert.equal(h.value("Lyrics timing"), "0.2 s later");
  h.queue.current_item = song(1);
  await h.open("Display"); await h.open("Display");
  h.row("Forget timing for this song").click();
  assert.deepEqual(loadPref("lyricsSongs", null), []);
  assert.equal(h.value("Lyrics timing"), "0.2 s later");
});

test("Not now leaves the changed timing and asks no more for this song", async (t) => {
  const h = harness(t);
  await h.open("Display");
  h.row("Lyrics timing")._change(-1);
  await h.open("Display");
  h.row("Not now").click();
  assert.equal(loadPref("lyricsOffsetMs", 0), -100);
  assert.equal(h.row("Keep"), undefined);
  h.row("Lyrics timing")._change(-1);
  await h.open("Display");
  assert.equal(h.row("Keep"), undefined, "once per song");
  assert.deepEqual(loadPref("lyricsSongs", []), []);
});

test("Choose other lyrics lists LRCLIB's versions; a pick is used and kept for the song", async (t) => {
  const h = harness(t);
  await h.open("Display");
  assert.equal(h.value("Choose other lyrics"), "From Music Assistant");
  h.row("Choose other lyrics").click();
  assert.equal(h.root.querySelector(".player-panel .panel-note").textContent, "Searching lrclib.net…");
  await h.later();
  const labels = h.rows().map((b) => [b.children[0].textContent, b.children[1].textContent, b.classList.contains("chosen")]);
  assert.equal(h.root.querySelector(".player-panel h2").textContent, "Choose lyrics");
  assert.deepEqual(labels, [
    ["Automatic", "Music Assistant, else the best match", true],
    ["Low Tide · Demo Band", "Coast · 3:20 · Timed", false],
    ["Low Tide (live) · Demo Band", "Live · 4:50 · Timed · 1:30 longer", false],
  ]);
  assert.match(h.fetched[h.fetched.length - 1], /^https:\/\/lrclib\.net\/api\/search\?track_name=low%20tide&artist_name=Demo%20Band$/);
  h.row("Low Tide (live) · Demo Band").click();
  assert.equal(h.view.snapshot().lyrics.lines[0].text, "Live words");
  assert.deepEqual(loadPref("lyricsSongs", []).map(({ id, lrclib }) => ({ id, lrclib })), [{ id: "library://track/1", lrclib: 12 }]);
  assert.ok(h.notices.includes("Lyrics chosen for this song"));
  assert.equal(h.value("Choose other lyrics"), "Chosen for this song", "back on the Lyrics rows");
  h.row("Choose other lyrics").click(); await h.later();
  h.row("Automatic").click();
  assert.deepEqual(loadPref("lyricsSongs", null), []);
  assert.ok(h.notices.includes("Lyrics back to automatic"));
});

test("a busy lrclib.net says so and offers Try again; Online lyrics Off hides the row", async (t) => {
  const h = harness(t, async () => ({ ok: false, status: 503 }));
  await h.open("Display");
  h.row("Choose other lyrics").click(); await h.later();
  assert.equal(h.root.querySelector(".player-panel .panel-note").textContent, "lrclib.net is busy. Try again shortly.");
  assert.ok(h.row("Try again"));
  h.view.handleKey("back");
  assert.equal(h.root.querySelector(".player-panel h2").textContent, "Display", "Back returns to the Lyrics rows");
  h.row("Online lyrics").click();
  assert.equal(h.row("Choose other lyrics"), undefined);
});

test("Go to a line lists the timed lines and seeks to the picked one, after the timing", async (t) => {
  const h = harness(t);
  savePref("lyricsOffsetMs", 1500); h.view.reloadPrefs();
  await h.open("Details");
  h.row("Go to a line").click();
  assert.equal(h.root.querySelector(".player-panel h2").textContent, "Go to a line");
  assert.equal(h.root.querySelector(".player-panel .panel-note").textContent, "Low Tide · plays from the line you pick");
  const labels = h.rows().map((b) => [b.children[0].textContent, b.children[1].textContent, b.classList.contains("chosen")]);
  assert.deepEqual(labels, [["First line", "0:01", false], ["Second line", "0:21", false], ["Third line", "0:36", false]], "blank lines left out");
  // 21 s into the song with lyrics 1.5 s later: 19.5 s of lyrics, the blank line after the first.
  assert.ok(h.rows()[0].classList.contains("selected"), "the line on screen has the focus");
  h.row("Third line").click();
  await settle();
  const seek = h.calls.filter((c) => c.command === "player_queues/seek");
  assert.deepEqual(seek.map((c) => c.args), [{ queue_id: "tv", position: 36 }]);
  assert.equal(h.view.isOpen, false, "back to the lyrics");
});
