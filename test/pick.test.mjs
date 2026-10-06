import test from "node:test";
import assert from "node:assert/strict";
import { audibleQueue, choose, isSkipped, speakersOf } from "../src/pick.js";

function player(id, extra) {
  return Object.assign({ player_id: id, name: id, type: "player", available: true, enabled: true, hide_in_ui: false }, extra);
}

function queue(id, state) {
  return { queue_id: id, state, display_name: id };
}

function byId(list, key) {
  const out = {};
  for (const item of list) out[item[key]] = item;
  return out;
}

test("speakers are the usable real players, sorted by name", () => {
  const players = byId(
    [
      player("office", { name: "Office" }),
      player("bath", { name: "bathroom" }),
      player("grp", { name: "Everywhere", type: "group" }),
      player("gone", { name: "Attic", available: false }),
      player("off", { name: "Shed", enabled: false }),
      player("hid", { name: "Hidden", hide_in_ui: true }),
      player("pair", { name: "Living Room", type: "stereo_pair" }),
    ],
    "player_id"
  );
  assert.deepEqual(speakersOf(players), [
    { id: "bath", name: "bathroom" },
    { id: "pair", name: "Living Room" },
    { id: "office", name: "Office" },
  ]);
});

test("a speaker resolves to the queue that sounds on it", () => {
  const players = byId(
    [
      player("leader", { active_source: "leader" }),
      player("member", { synced_to: "leader", active_source: "leader" }),
      player("ingroup", { active_group: "grp", active_source: "grp" }),
      player("grp", { type: "group", active_source: "grp" }),
      player("native", { active_source: "spotify" }),
      player("gone", { available: false }),
      player("loopa", { synced_to: "loopb" }),
      player("loopb", { synced_to: "loopa" }),
    ],
    "player_id"
  );
  const queues = byId([queue("leader", "playing"), queue("member", "idle"), queue("grp", "playing"), queue("native", "idle")], "queue_id");
  assert.equal(audibleQueue("leader", players, queues).queue_id, "leader");
  assert.equal(audibleQueue("member", players, queues).queue_id, "leader", "a member sounds the leader's queue");
  assert.equal(audibleQueue("ingroup", players, queues).queue_id, "grp", "a group member sounds the group's queue");
  assert.equal(audibleQueue("native", players, queues), null, "a native source is not a queue");
  assert.equal(audibleQueue("gone", players, queues), null);
  assert.equal(audibleQueue("missing", players, queues), null);
  assert.equal(audibleQueue("loopa", players, queues), null, "a sync loop ends");
});

test("the preferred speaker wins whenever its queue plays, even over a running stream", () => {
  const players = byId([player("a"), player("b"), player("m", { synced_to: "b" })], "player_id");
  const queues = byId([queue("a", "playing"), queue("b", "playing"), queue("m", "idle")], "queue_id");
  const base = { players, queues, skipped: {}, firstPlaying: { a: 1, b: 2 }, now: 100 };
  assert.deepEqual(choose(Object.assign({ current: "a", streaming: true, preferred: "m" }, base)), {
    queueId: "b",
    playerId: "m",
    reason: "preferred",
  });
  queues.b.state = "idle";
  assert.deepEqual(choose(Object.assign({ current: "a", streaming: true, preferred: "m" }, base)), {
    queueId: "a",
    playerId: "a",
    reason: "current",
  });
});

test("a streaming queue is kept even when Music Assistant says it stopped", () => {
  const players = byId([player("a"), player("b")], "player_id");
  const queues = byId([queue("a", "idle"), queue("b", "playing")], "queue_id");
  const base = { players, queues, skipped: {}, firstPlaying: { b: 5 }, now: 100, preferred: "" };
  assert.equal(choose(Object.assign({ current: "a", streaming: true }, base)).queueId, "a");
  assert.equal(choose(Object.assign({ current: "a", streaming: false }, base)).queueId, "b", "once the stream ends, auto moves on");
});

test("auto takes the queue that started most recently, by name when tied", () => {
  const players = byId([player("c", { name: "Cellar" }), player("b", { name: "Bedroom" }), player("a", { name: "Attic" })], "player_id");
  const queues = byId([queue("a", "playing"), queue("b", "playing"), queue("c", "playing")], "queue_id");
  const pick = (firstPlaying) => choose({ players, queues, current: "", streaming: false, preferred: "", skipped: {}, firstPlaying, now: 100 });
  assert.equal(pick({ a: 1, b: 9, c: 5 }).queueId, "b");
  assert.equal(pick({ a: 1, b: 1, c: 1 }).queueId, "a", "same start: alphabetical");
  assert.equal(pick({}).queueId, "a", "unknown starts count as oldest");
  assert.equal(pick({ a: 1, b: 9, c: 5 }).reason, "auto");
});

test("the current queue is kept while it plays, over a newer start", () => {
  const players = byId([player("a"), player("b")], "player_id");
  const queues = byId([queue("a", "playing"), queue("b", "playing")], "queue_id");
  const picked = choose({ players, queues, current: "a", streaming: false, preferred: "", skipped: {}, firstPlaying: { a: 1, b: 9 }, now: 100 });
  assert.equal(picked.queueId, "a");
  assert.equal(picked.reason, "current");
});

test("a skipped queue blocks both the preferred and the automatic path", () => {
  const players = byId([player("a"), player("b"), player("m", { synced_to: "b" })], "player_id");
  const queues = byId([queue("a", "playing"), queue("b", "playing"), queue("m", "idle")], "queue_id");
  const skipped = { b: { at: 100, tries: 1 } };
  const picked = choose({ players, queues, current: "", streaming: false, preferred: "m", skipped, firstPlaying: { a: 1, b: 9 }, now: 100 });
  assert.deepEqual(picked, { queueId: "a", playerId: "a", reason: "auto" }, "the member's leader is skipped, so auto");
  assert.equal(choose({ players, queues, current: "", streaming: false, preferred: "", skipped: { a: { at: 0, tries: 1 }, b: { at: 0, tries: 1 } }, firstPlaying: {}, now: 100 }), null);
});

test("a skipped queue is tried again only while nothing else plays, with a growing wait", () => {
  const skipped = { q: { at: 1000, tries: 1 } };
  assert.equal(isSkipped(skipped, "q", 1000 + 14000, true), true);
  assert.equal(isSkipped(skipped, "q", 1000 + 16000, true), false, "15 s after the first failure");
  assert.equal(isSkipped(skipped, "q", 1000 + 16000, false), true, "but never while another stream runs");
  skipped.q = { at: 1000, tries: 3 };
  assert.equal(isSkipped(skipped, "q", 1000 + 59000, true), true, "third failure: 60 s");
  assert.equal(isSkipped(skipped, "q", 1000 + 61000, true), false);
  skipped.q = { at: 1000, tries: 20 };
  assert.equal(isSkipped(skipped, "q", 1000 + 5 * 60000 + 1, true), false, "capped at five minutes");
  assert.equal(isSkipped({}, "q", 0, false), false);
});
