import test from "node:test";
import assert from "node:assert/strict";
import { useFakeDocument } from "./fake-dom-tree.mjs";
import { clockLabel, createSessionLog, headline, historyArgs, offerDetail, offered, programmeColumns, programmeSongs, summary } from "../src/programme.js";
import { createProgramme } from "../src/programme-view.js";
import { createPlaylists } from "../src/playlists.js";

const at = (h, m) => new Date(2026, 9, 16, h, m).getTime();
const song = (n, artist) => ({ queue_item_id: "qi" + n, media_item: { media_type: "track", uri: "lib://track/" + n, name: "Song " + n, artists: artist ? [{ name: artist }] : [] } });
const queue = (n, state) => ({ queue_id: "q", display_name: "Kitchen", state: state || "playing", current_item: song(n, "Artist " + n) });

test("the session log notes each song as it starts on a queue, once", () => {
  let time = at(20, 0);
  const log = createSessionLog({ now: () => time });
  log.observe(queue(1)); log.observe(queue(1));
  time = at(20, 4); log.observe(queue(2, "paused"));
  time = at(20, 5); log.observe(queue(2));
  log.observe({ queue_id: "q", state: "playing", current_item: { queue_item_id: "r", media_item: { media_type: "radio", uri: "lib://radio/1", name: "Radio" } } });
  assert.deepEqual(log.entries.map(e => [e.uri, e.artist, clockLabel(e.at)]), [["lib://track/1", "Artist 1", "20:00"], ["lib://track/2", "Artist 2", "20:05"]]);
});

test("Tonight after 17:00 and until 05:00, on the evening's date", () => {
  assert.deepEqual(headline(at(21, 0)), { word: "Tonight", date: "16 October" });
  assert.deepEqual(headline(at(14, 0)), { word: "Today", date: "16 October" });
  assert.deepEqual(headline(new Date(2026, 9, 17, 1, 30).getTime()), { word: "Tonight", date: "16 October" });
});

test("history is asked for this queue's songs in the last four hours", () => {
  const args = historyArgs("q", at(22, 0));
  assert.equal(args.queue_id, "q");
  assert.deepEqual(args.media_types, ["track"]);
  assert.equal(args.fully_played_only, false);
  assert.equal(args.played_after_timestamp, Math.floor(at(18, 0) / 1000));
});

test("the programme: history oldest first, then the log's own, with artists and times where known", () => {
  const history = [{ uri: "lib://track/3", name: "Song 3" }, { uri: "lib://track/2", name: "Song 2" }, { uri: "lib://track/1", name: "Song 1" }];
  const log = [
    { queueId: "q", uri: "lib://track/2", title: "Song 2", artist: "Logged", at: at(20, 10) },
    { queueId: "other", uri: "lib://track/9", title: "Elsewhere", artist: "", at: at(20, 12) },
    { queueId: "q", uri: "lib://track/4", title: "Song 4", artist: "Now", at: at(20, 20) },
    { queueId: "q", uri: "lib://track/0", title: "Old", artist: "", at: at(12, 0) },
  ];
  const songs = programmeSongs({ history, log, queueId: "q", queueItems: [song(1, "From the queue")], nowMs: at(21, 0) });
  assert.deepEqual(songs.map(s => [s.title, s.artist, s.at && clockLabel(s.at)]),
    [["Song 1", "From the queue", null], ["Song 2", "Logged", "20:10"], ["Song 3", "", null], ["Song 4", "Now", "20:20"]]);
  const alone = programmeSongs({ history: null, log, queueId: "q", nowMs: at(21, 0) });
  assert.deepEqual(alone.map(s => s.title), ["Song 2", "Song 4"], "without Music Assistant's history the log stands alone");
  assert.equal(offered(songs), true);
  assert.equal(offered(alone), false, "two songs are not a programme");
});

test("the programme's lines", () => {
  const songs = [{ at: at(19, 40) }, { at: null }, { at: at(22, 15) }];
  assert.equal(summary(songs), "3 songs · 19:40 to 22:15");
  assert.equal(summary([{ at: null }]), "1 song");
  assert.equal(offerDetail(songs, "Kitchen"), "3 songs since 19:40");
  assert.equal(offerDetail([{ at: null }, { at: null }, { at: null }], "Kitchen"), "3 songs on Kitchen");
  const many = Array.from({ length: 30 }, (_, i) => ({ title: "S" + i, artist: "", at: null }));
  const [left, right] = programmeColumns(many);
  assert.equal(left.length, 11); assert.equal(right.length, 11);
  assert.equal(left[0].number, "01");
  assert.equal(right[10].title, "and 9 more");
});

test("the page: offered on the idle poster, opened by request, kept as a playlist", async t => {
  useFakeDocument(t);
  let time = at(21, 0);
  const calls = [];
  const answers = {
    "music/recently_played_items": [3, 2, 1].map(n => ({ uri: "lib://track/" + n, name: "Song " + n })),
    "player_queues/items": [song(1, "A1"), song(2, "A2"), song(3, "A3")],
    "music/playlists/library_items": [],
    "music/playlists/create_playlist": { item_id: "9" },
    "music/playlists/add_playlist_tracks": { id: "t", status: "success", progress_text: "Added 3 item(s) to playlist" },
  };
  const live = { call: (command, args) => { calls.push({ command, args }); return Promise.resolve(answers[command]); } };
  const playlists = createPlaylists({ call: live.call, now: () => time, wait: () => Promise.resolve() });
  const programme = createProgramme({ live, playlists, now: () => time });
  assert.equal(programme.tile(), null, "nothing known yet");
  await programme.refresh({ queue_id: "q", display_name: "Kitchen" });
  assert.deepEqual(programme.tile(), { word: "Tonight", detail: "3 songs on Kitchen" });
  assert.equal(programme.isOpen, false, "offered, never opened by itself");
  programme.open();
  await new Promise(resolve => setImmediate(resolve));
  const page = programme.element;
  assert.equal(page.querySelector(".programme-word").textContent, "Tonight");
  assert.equal(page.querySelector(".programme-date").textContent, "16 October");
  assert.equal(page.querySelector(".programme-count").textContent, "3 songs");
  assert.equal(page.querySelectorAll(".programme-col li").length, 3);
  assert.ok(page.querySelector(".programme-col li").textContent.indexOf("A1") >= 0, "artists come from the queue's items");
  programme.handleKey("ok");
  await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve));
  const add = calls.find(c => c.command === "music/playlists/add_playlist_tracks");
  assert.deepEqual(add.args.uris, ["lib://track/1", "lib://track/2", "lib://track/3"]);
  assert.equal(calls.find(c => c.command === "music/playlists/create_playlist").args.name, "Tonight · 16 Oct");
  programme.render();
  assert.ok(page.querySelector(".programme-actions button").classList.contains("chosen"));
  assert.equal(page.querySelector(".programme-actions button").lastChild.textContent, "Kept as “Tonight · 16 Oct”");
  programme.handleKey("down"); programme.handleKey("ok");
  assert.equal(programme.isOpen, false, "Back closes it");
});
