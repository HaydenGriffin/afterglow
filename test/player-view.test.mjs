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

// The Queue over the demo house (mock-playback.js): the living room plays,
// this TV can join it or take it, the hallway's volume is fixed.
async function demoQueue(t) {
  useFakeDocument(t);
  t.after(() => savePref("preferredPlayer", ""));
  const { createMockPlayback } = await import("../src/mock-playback.js");
  const live = createMockPlayback();
  const doc = globalThis.document, root = doc.createElement("div"), notices = [];
  doc.body.appendChild(root);
  const view = createPlayerView({ root, live, host: "ma", engine: { setDrawing() {} }, onSettings() {}, onMode() {}, onNotice: (n) => notices.push(n) });
  const rows = () => root.querySelector(".panel-items").querySelectorAll("button");
  const labels = () => rows().map((b) => [b.children[0].textContent, b.children[1].textContent]);
  const row = (label, at = 0) => rows().filter((b) => b.children[0].textContent === label)[at];
  root.querySelector(".player-nav").children.find((b) => b.dataset.nav === "queue").click();
  const back = () => view.handleKey("back");
  const settled = async () => { await settle(); await settle(); view.handleKey("down"); view.handleKey("up"); };
  return { live, view, labels, row, back, notices, settled };
}

test("music elsewhere offers Join and Move here, in the Queue and atop Play on", async (t) => {
  const h = await demoQueue(t);
  assert.deepEqual(h.labels().slice(0, 4), [
    ["Playing on", "Living room · Preview"],
    ["Join Living room · Preview", "Plays here too"],
    ["Move here", "Moves the music from Living room · Preview"],
    ["Speakers together", "Just this one"],
  ]);
  h.row("Playing on").click();
  assert.deepEqual(h.labels(), [
    ["Join Living room · Preview", "Plays here too"],
    ["Move here", "Moves the music from Living room · Preview"],
    ["Automatic", "Whatever is playing"],
    ["Home speakers · Preview", "Idle · moves the music here"],
    ["Bedroom · Preview", "Paused · Low tide — Demo Field Recordings · moves the music here"],
    ["Hallway · Preview", "Idle · moves the music here"],
    ["Kitchen · Preview", "Idle · moves the music here"],
    ["Living room · Preview", "A quieter kind of evening — Afterglow demo"],
    ["This TV · Preview", "This TV · Idle · moves the music here"],
  ]);
  h.row("Join Living room · Preview").click();
  await h.settled();
  assert.deepEqual(h.notices, ["Joined Living room · Preview"]);
  assert.equal(h.live.preferred, "demo-tv", "this TV is now the speaker shown and controlled");
  assert.equal(h.live.target.queueId, "demo-living", "and it sounds the living room's music");
  assert.deepEqual(h.labels().slice(0, 2), [["Playing on", "This TV · Preview"], ["Speakers together", "2 speakers"]], "neither offer stays once joined");
});

test("Move here sends the music to this TV, as Play on this TV did", async (t) => {
  const h = await demoQueue(t);
  h.row("Move here").click();
  await h.settled();
  assert.deepEqual(h.notices, ["Moved the music"]);
  assert.equal(h.live.playback.queue.queue_id, "demo-tv");
});

test("Speakers together lists a volume for each speaker in the group that has one", async (t) => {
  const h = await demoQueue(t);
  h.row("Speakers together").click();
  assert.equal(h.labels().filter(([, v]) => /%$/.test(v)).length, 0, "no volumes for a single speaker");
  h.row("Kitchen · Preview").click();
  await h.settled();
  h.row("Hallway · Preview").click();
  await h.settled();
  assert.deepEqual(h.labels().filter(([, v]) => /%$/.test(v)), [["Kitchen · Preview", "20%"], ["Living room · Preview", "35%"]], "the hallway's volume is fixed");
  h.row("Kitchen · Preview", 1).click();
  await h.settled();
  assert.equal(h.live.speakerLists().players["demo-kitchen"].volume_level, 25, "OK steps up 5, like Volume");
  assert.equal(h.row("Kitchen · Preview", 1).children[1].textContent, "25%");
  assert.equal(h.live.speakerLists().players["demo-living"].volume_level, 35, "the others keep theirs");
});
