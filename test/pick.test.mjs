import test from "node:test";
import assert from "node:assert/strict";
import { audibleQueue, choose, commandTarget, groupOptions, isSkipped, speakersOf, transferPlan } from "../src/pick.js";

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

test("speakers are the usable groups then real players, each sorted by name", () => {
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
    { id: "grp", name: "Everywhere", group: true },
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

test("commands go to the chosen speaker, else the followed queue, else this TV, else the first speaker", () => {
  const players = byId([player("kitchen", { name: "Kitchen" }), player("tv", { name: "TV" }), player("attic", { name: "Attic" }), player("m", { synced_to: "kitchen" }), player("grp", { type: "group", name: "All" })], "player_id");
  const queues = byId([queue("kitchen", "idle"), queue("tv", "idle"), queue("attic", "idle"), queue("m", "idle"), queue("grp", "idle")], "queue_id");
  const target = (extra) => commandTarget(Object.assign({ players, queues, preferred: "", current: "", last: "", own: "" }, extra));
  assert.deepEqual(target({ preferred: "tv", current: "kitchen" }), { queueId: "tv", playerId: "tv", reason: "chosen" }, "an idle chosen speaker still takes commands");
  assert.deepEqual(target({ preferred: "m" }), { queueId: "kitchen", playerId: "m", reason: "chosen" }, "a synced member commands its leader's queue");
  assert.deepEqual(target({ current: "kitchen", own: "tv" }), { queueId: "kitchen", playerId: "kitchen", reason: "following" });
  assert.deepEqual(target({ last: "kitchen", own: "tv" }), { queueId: "kitchen", playerId: "kitchen", reason: "last" });
  assert.deepEqual(target({ own: "tv" }), { queueId: "tv", playerId: "tv", reason: "this-tv" });
  assert.deepEqual(target({}), { queueId: "attic", playerId: "attic", reason: "first" }, "a real speaker before a group");
  assert.deepEqual(target({ preferred: "gone", own: "missing" }).reason, "first", "missing players are passed over");
  assert.equal(commandTarget({ players: {}, queues: {}, preferred: "", current: "", last: "", own: "" }), null);
});

test("a transfer moves music that is playing or paused to a speaker not already sounding it", () => {
  const players = byId([player("a"), player("b"), player("c", { synced_to: "a" }), player("d")], "player_id");
  const item = { queue_item_id: "i1" };
  const queues = byId([queue("a", "playing"), queue("b", "idle"), queue("c", "idle"), queue("d", "playing")], "queue_id");
  queues.a.current_item = item;
  const plan = (from, to, stopped) => transferPlan({ players, queues, from, to, stopped });
  assert.deepEqual(plan("a", "b"), { from: "a", to: "b" });
  assert.equal(plan("a", "c"), null, "already in the group");
  assert.equal(plan("a", "d"), null, "has its own music: just follow it");
  assert.equal(plan("b", "a"), null, "nothing to move");
  queues.a.state = "idle";
  assert.equal(plan("a", "b"), null, "stopped music only moves when asked to");
  assert.deepEqual(plan("a", "b", true), { from: "a", to: "b" });
});

test("group options tick members and show speakers that cannot join as unavailable", () => {
  const players = byId([
    player("lead", { name: "Lead", group_members: ["lead", "m1", "fixed"], static_group_members: ["fixed"], can_group_with: ["m1", "free", "fixed"], supported_features: ["set_members"] }),
    player("m1", { name: "Member", synced_to: "lead" }),
    player("fixed", { name: "Fixed", synced_to: "lead" }),
    player("free", { name: "Free" }),
    player("sonos", { name: "Sonos", provider: "sonos--x" }),
    player("other", { name: "Other" }),
    player("grp", { type: "group", name: "Group" }),
  ], "player_id");
  players.lead.can_group_with.push("sonos--x");
  const options = groupOptions(players, "lead");
  assert.deepEqual(options.map((o) => [o.id, o.member, o.allowed]), [
    ["fixed", true, false], ["free", false, true], ["lead", true, false], ["m1", true, true], ["other", false, false], ["sonos", false, true],
  ]);
  assert.equal(options.find((o) => o.id === "lead").leader, true);
  delete players.lead.supported_features;
  assert.equal(groupOptions(players, "lead").filter((o) => o.allowed).length, 0, "a leader that cannot group offers nothing");
  assert.deepEqual(groupOptions(players, "missing"), []);
});
