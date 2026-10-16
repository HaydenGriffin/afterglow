import test from "node:test";
import assert from "node:assert/strict";
import { addedCount, confirmationFor, createPlaylists, editablePlaylists, outcomeText, pickerRows, playlistName, refusal, taskState, uniqueName } from "../src/playlists.js";

const settle = () => new Promise(resolve => setImmediate(resolve));
const day = new Date(2026, 9, 16, 21, 30);

test("names need no keyboard: prefix, day and short month, unique with a number", () => {
  assert.equal(playlistName("Queue", day), "Queue · 16 Oct");
  assert.equal(playlistName("Playlist", new Date(2026, 0, 3)), "Playlist · 3 Jan");
  assert.equal(uniqueName("Queue · 16 Oct", ["Other"]), "Queue · 16 Oct");
  assert.equal(uniqueName("Queue · 16 Oct", ["Queue · 16 Oct", "Queue · 16 Oct (2)"]), "Queue · 16 Oct (3)");
});

test("only playlists that can change are offered, eight at most, in the order asked", () => {
  const p = (id, extra) => Object.assign({ item_id: String(id), name: "P" + id, is_editable: true, is_dynamic: false }, extra);
  const list = [p(1), p(2, { is_editable: false }), p(3, { is_dynamic: true }), p(4)].concat([5, 6, 7, 8, 9, 10, 11].map(n => p(n)));
  assert.deepEqual(editablePlaylists(list).map(x => x.item_id), ["1", "4", "5", "6", "7", "8", "9", "10"]);
  assert.deepEqual(editablePlaylists(null), []);
});

test("a task's state and how many songs it added", () => {
  assert.equal(taskState(null), "done", "no task object: an older server already did it");
  assert.equal(taskState({ id: "t", status: "pending" }), "running");
  assert.equal(taskState({ id: "t", status: "running" }), "running");
  assert.equal(taskState({ id: "t", status: "partial_success" }), "done");
  assert.equal(taskState({ id: "t", status: "cancelled" }), "failed");
  assert.equal(addedCount({ progress_text: "Added 12 item(s) to playlist" }), 12);
  assert.equal(addedCount({ progress_text: "No new playlist items to add" }), 0);
  assert.equal(addedCount({ progress_text: "Matching item 3/9" }), null);
});

test("refusals are named by Music Assistant's error code", () => {
  assert.equal(refusal({ code: 22 }, "save"), "This account can’t change playlists");
  assert.equal(refusal({ code: 8 }, "save"), "Nothing in the queue can go in a playlist");
  assert.equal(refusal({ code: 3 }, "create"), "Music Assistant has nowhere to keep playlists");
  assert.equal(refusal({ code: 3 }, "add"), "Couldn’t add. Try again");
  assert.equal(refusal(new Error("x"), "save"), "Couldn’t save. Try again");
});

test("outcomes say what went in", () => {
  assert.deepEqual(outcomeText("save", "Queue · 16 Oct", 20, 20), { text: "Saved as “Queue · 16 Oct”", ok: true });
  assert.deepEqual(outcomeText("save", "Queue · 16 Oct", 17, 20), { text: "Saved as “Queue · 16 Oct” · 3 songs couldn’t be added", ok: false });
  assert.equal(outcomeText("keep", "Tonight · 16 Oct", 4, 5).text, "Kept as “Tonight · 16 Oct” · 1 song couldn’t be added");
  assert.deepEqual(outcomeText("save", "Q", null, 20), { text: "Saved as “Q”", ok: true }, "an unknown count is taken as all");
  assert.deepEqual(outcomeText("add", "Sunday", 1, 1), { text: "Added to “Sunday”", ok: true });
  assert.deepEqual(outcomeText("add", "Sunday", 0, 1), { text: "Already in “Sunday”, or not available there", ok: false });
});

test("the picker: New playlist first, then the list or why not", () => {
  assert.deepEqual(pickerRows({ state: "loading", items: [] }, day).map(r => r.label), ["New playlist", "Loading playlists…"]);
  assert.equal(pickerRows({ state: "ready", items: [] }, day)[0].detail, "As “Playlist · 16 Oct”");
  assert.equal(pickerRows({ state: "error", items: [] }, day)[1].kind, "retry");
  assert.equal(pickerRows({ state: "ready", items: [] }, day)[1].label, "No playlists you can add to yet");
  assert.deepEqual(pickerRows({ state: "ready", items: [{ item_id: "1", name: "Sunday" }] }, day).map(r => r.kind), ["new", "playlist"]);
});

// A fake Music Assistant: answers in order; tasks finish on the second look.
function fakeMa(answers) {
  const calls = [];
  const call = (command, args) => { calls.push({ command, args }); const a = answers[command]; return typeof a === "function" ? a(args) : a instanceof Error ? Promise.reject(a) : Promise.resolve(a); };
  return { calls, call };
}
const instant = () => Promise.resolve();

test("Save as a playlist: a free name, save_as_playlist, the task followed to its count", async () => {
  let polls = 0;
  const ma = fakeMa({
    "music/playlists/library_items": [{ name: "Queue · 16 Oct" }],
    "player_queues/save_as_playlist": { id: "t1", status: "pending" },
    "tasks/get": () => Promise.resolve(++polls < 2 ? { id: "t1", status: "running" } : { id: "t1", status: "success", progress_text: "Added 9 item(s) to playlist" }),
  });
  const notices = [];
  let time = 1000;
  const lists = createPlaylists({ call: ma.call, now: () => time, wait: instant, onNotice: t => notices.push(t) });
  const done = lists.saveQueue("q1", 9, day);
  assert.equal(confirmationFor(lists.job, "queue-save", time).text, "Saving…");
  assert.equal(await lists.saveQueue("q1", 9, day), false, "one job at a time");
  assert.equal(await done, true);
  assert.deepEqual(ma.calls.find(c => c.command === "player_queues/save_as_playlist").args, { queue_id: "q1", name: "Queue · 16 Oct (2)" });
  assert.equal(polls, 2);
  assert.deepEqual(notices, ["Saved as “Queue · 16 Oct (2)”"]);
  assert.deepEqual(confirmationFor(lists.job, "queue-save", time), { text: "Saved as “Queue · 16 Oct (2)”", tick: true });
  assert.equal(confirmationFor(lists.job, "other", time), null);
  time += 2500;
  assert.equal(confirmationFor(lists.job, "queue-save", time), null, "a success's tick goes after 2.5 s");
});

test("a refused save names why and stays longer", async () => {
  const ma = fakeMa({ "music/playlists/library_items": [], "player_queues/save_as_playlist": Object.assign(new Error("Insufficient"), { code: 22 }) });
  let time = 0;
  const lists = createPlaylists({ call: ma.call, now: () => time, wait: instant });
  assert.equal(await lists.saveQueue("q1", 3, day), false);
  time += 3000;
  assert.deepEqual(confirmationFor(lists.job, "queue-save", time), { text: "This account can’t change playlists", tick: false });
  time += 3000;
  assert.equal(confirmationFor(lists.job, "queue-save", time), null);
});

test("a task that never finishes is reported as still saving", async () => {
  let time = 0;
  const ma = fakeMa({ "music/playlists/library_items": [], "player_queues/save_as_playlist": { id: "t", status: "pending" }, "tasks/get": { id: "t", status: "running" } });
  const lists = createPlaylists({ call: ma.call, now: () => time, wait: () => { time += 1000; return Promise.resolve(); } });
  await lists.saveQueue("q", 2, day);
  assert.equal(lists.job.text, "Still saving in Music Assistant");
});

test("Add to a playlist and New playlist", async () => {
  const ma = fakeMa({
    "music/playlists/library_items": [],
    "music/playlists/create_playlist": args => Promise.resolve({ item_id: "77", name: args.name }),
    "music/playlists/add_playlist_tracks": { id: "t", status: "pending" },
    "tasks/get": { id: "t", status: "success", progress_text: "No new playlist items to add" },
  });
  const lists = createPlaylists({ call: ma.call, wait: instant });
  await lists.addTo({ item_id: "5", name: "Sunday" }, ["library://track/1"], "browse:x");
  assert.deepEqual(ma.calls.find(c => c.command === "music/playlists/add_playlist_tracks").args, { db_playlist_id: "5", uris: ["library://track/1"] });
  assert.equal(lists.job.text, "Already in “Sunday”, or not available there");
  ma.calls.length = 0;
  await lists.addToNew(["library://track/2"], "details:y", day);
  assert.deepEqual(ma.calls.map(c => c.command), ["music/playlists/library_items", "music/playlists/create_playlist", "music/playlists/add_playlist_tracks", "tasks/get"]);
  assert.equal(ma.calls[1].args.name, "Playlist · 16 Oct");
  assert.equal(ma.calls[2].args.db_playlist_id, "77");
  assert.equal(lists.job.key, "details:y");
});

test("the picker list loads afresh and reports a failure", async () => {
  const ma = fakeMa({ "music/playlists/library_items": [{ item_id: "1", name: "A", is_editable: true }, { item_id: "2", name: "B", is_editable: false }] });
  const lists = createPlaylists({ call: ma.call });
  const loading = lists.loadEditable();
  assert.equal(lists.list.state, "loading");
  await loading;
  assert.deepEqual(lists.list.items.map(p => p.name), ["A"]);
  assert.deepEqual(ma.calls[0].args, { limit: 50, offset: 0, order_by: "timestamp_modified_desc" });
  const failing = createPlaylists({ call: () => Promise.reject(new Error("down")) });
  await failing.loadEditable(); await settle();
  assert.equal(failing.list.state, "error");
});
