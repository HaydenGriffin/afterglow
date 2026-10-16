import test from "node:test";
import assert from "node:assert/strict";
import { useFakeDocument } from "./fake-dom-tree.mjs";
import { createPlayerView } from "../src/player-view.js";
import { allPrefs, loadPref, savePref } from "../src/settings.js";

const settle = () => new Promise((resolve) => setImmediate(resolve));
const song = { queue_item_id: "i1", duration: 200, media_item: { media_type: "track", uri: "library://track/1", name: "Song", artists: [{ name: "Artist" }], album: { name: "Album" } } };

// The player view over a fake document and a Music Assistant that answers
// every command at once (lyrics: none).
function harness(t) {
  const doc = useFakeDocument(t);
  const calls = [];
  const live = {
    mock: false,
    palette: null,
    playback: { queue: { queue_id: "tv", display_name: "TV", state: "playing", current_item: song }, player: {}, connected: true, position: 10 },
    call(command, args) {
      calls.push({ command, args });
      return Promise.resolve(command === "metadata/get_track_lyrics" ? [null, null] : null);
    },
  };
  const root = doc.createElement("div");
  doc.body.appendChild(root);
  const view = createPlayerView({ root, live, host: "ma", engine: { setDrawing() {} }, onSettings() {}, onMode() {}, onNotice() {} });
  const panelRows = () => root.querySelector(".panel-items").querySelectorAll("button");
  const row = (label) => panelRows().find((b) => b.children[0].textContent === label);
  return { doc, root, view, calls, row };
}

test("media keys send their Music Assistant commands to the target queue", async (t) => {
  const h = harness(t);
  const sent = [];
  for (const key of ["playpause", "play", "pause", "stop", "fastforward", "rewind"]) {
    assert.equal(h.view.handleKey(key), true, key + " is handled with no panel open");
    await settle();
    const last = h.calls[h.calls.length - 1];
    sent.push([key, last.command, last.args.queue_id]);
  }
  assert.deepEqual(sent, [
    ["playpause", "player_queues/play_pause", "tv"],
    ["play", "player_queues/play", "tv"],
    ["pause", "player_queues/pause", "tv"],
    ["stop", "player_queues/pause", "tv"],
    ["fastforward", "player_queues/next", "tv"],
    ["rewind", "player_queues/previous", "tv"],
  ]);
  assert.equal(h.view.handleKey("left"), false, "arrows are left to the main screen with no panel open");
});

test("Display has an Online lyrics row, On by default; Off is saved and asks nothing of lrclib.net", async (t) => {
  const asked = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => { asked.push(url); return { ok: true, json: async () => [] }; };
  t.after(() => { globalThis.fetch = previous; savePref("onlineLyrics", true); savePref("viewMode", "track"); });
  savePref("onlineLyrics", true);
  const h = harness(t);
  h.view.setMode("lyrics");
  h.root.querySelector(".transport").children.find((b) => b.getAttribute("aria-label") === "Display").click();
  const online = h.row("Online lyrics");
  assert.ok(online, "the row is in the Lyrics group");
  assert.equal(online.children[1].textContent, "On");
  online.click();
  assert.equal(loadPref("onlineLyrics", true), false);
  assert.equal(h.row("Online lyrics").children[1].textContent, "Off");
  asked.length = 0; // a view started with the setting Off
  const fresh = harness(t);
  fresh.view.setMode("lyrics");
  fresh.root.querySelector(".transport").children.find((b) => b.getAttribute("aria-label") === "Display").click();
  await settle();
  await settle();
  assert.equal(fresh.view.snapshot().lyrics.status, "missing");
  assert.deepEqual(asked, [], "no request to lrclib.net");
});

test("Lyrics over Visuals + track: Off, One line, Stage; Position, Background and Size follow while one is chosen", (t) => {
  t.after(() => { for (const key of ["lyricsOverlay", "lyricsLineLook", "lyricsStageLook"]) savePref(key, null); });
  savePref("lyricsOverlay", false); savePref("lyricsLineLook", null); savePref("lyricsStageLook", null);
  const h = harness(t);
  h.root.querySelector(".transport").children.find((b) => b.getAttribute("aria-label") === "Display").click();
  const value = (label) => h.row(label) && h.row(label).children[1].textContent;
  assert.equal(value("Lyrics over Visuals + track"), "Off");
  assert.equal(h.row("Position"), undefined, "no look rows while Off");
  h.row("Lyrics over Visuals + track").click();
  assert.equal(value("Lyrics over Visuals + track"), "One line");
  assert.deepEqual(["Position", "Background", "Size"].map(value), ["Bottom", "Box", "Medium"], "One line's defaults");
  h.row("Position").click();
  assert.equal(value("Position"), "Top");
  h.row("Lyrics over Visuals + track").click();
  assert.equal(value("Lyrics over Visuals + track"), "Stage");
  assert.deepEqual(["Position", "Background", "Size"].map(value), ["Middle", "Box", "Medium"], "Stage's defaults, untouched by One line's change");
  h.row("Background").click(); h.row("Size").click();
  assert.deepEqual(["Background", "Size"].map(value), ["Shade", "Large"]);
  assert.equal(loadPref("lyricsOverlay", false), "stage");
  assert.deepEqual(loadPref("lyricsLineLook", null), { position: "top", background: "box", size: "medium" });
  assert.deepEqual(loadPref("lyricsStageLook", null), { position: "middle", background: "shade", size: "large" });
  assert.deepEqual(["lyricsOverlay", "lyricsLineLook", "lyricsStageLook"].filter((k) => k in allPrefs()), ["lyricsOverlay", "lyricsLineLook", "lyricsStageLook"], "synced with this TV's settings on the account");
  const layer = h.root.querySelector(".lyric-overlay");
  assert.deepEqual(["kind", "position", "background", "size"].map((f) => layer.getAttribute("data-" + f)), ["stage", "middle", "shade", "large"], "the overlay shows the look at once");
  h.row("Lyrics over Visuals + track").click();
  assert.equal(value("Lyrics over Visuals + track"), "Off");
  assert.equal(h.row("Size"), undefined);
});

test("an overlay saved as On before Stage existed comes back as One line with its defaults", (t) => {
  t.after(() => { savePref("lyricsOverlay", null); });
  savePref("lyricsOverlay", true); savePref("lyricsLineLook", null);
  const h = harness(t);
  h.root.querySelector(".transport").children.find((b) => b.getAttribute("aria-label") === "Display").click();
  assert.equal(h.row("Lyrics over Visuals + track").children[1].textContent, "One line");
  assert.equal(h.row("Position").children[1].textContent, "Bottom");
  const line = h.root.querySelector(".lyric-overlay-line");
  assert.equal(line.style.bottom, "6vh", "One line at Bottom sits on the safe margin");
  h.view.setOverlayContext({ cardPx: 0, message: false });
  assert.equal(line.style.bottom, "6vh");
});
