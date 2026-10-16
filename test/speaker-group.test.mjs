import test from "node:test";
import assert from "node:assert/strict";
import { canSetVolume, joinPlan, leaderName, memberVolumes, speakerActivity } from "../src/speaker-group.js";

function player(id, extra) {
  return Object.assign({ player_id: id, name: id, type: "player", available: true, enabled: true, provider: "sendspin--x", can_group_with: [], group_members: [],
    supported_features: ["set_members", "volume_set"], volume_level: 30 }, extra);
}
function byId(list, key) {
  const out = {};
  for (const item of list) out[item[key]] = item;
  return out;
}
const song = (name, artists) => ({ queue_item_id: name, name, media_item: { name, artists: (artists || []).map((a) => ({ name: a })) } });
function house() {
  const players = byId([
    player("lead", { name: "Living room", can_group_with: ["sendspin--x"] }),
    player("tv", { name: "This TV" }),
    player("den", { name: "Den" }),
    player("sonos", { name: "Sonos", provider: "sonos--x" }),
  ], "player_id");
  const queues = byId([
    { queue_id: "lead", display_name: "Living room", state: "playing", current_item: song("Low tide", ["Demo One", "Demo Two"]) },
    { queue_id: "tv", display_name: "This TV", state: "idle", current_item: null },
    { queue_id: "den", display_name: "Den", state: "paused", current_item: song("Second kettle") },
    { queue_id: "sonos", display_name: "Sonos", state: "idle", current_item: null },
  ], "queue_id");
  return { players, queues };
}

test("this TV can join a speaker that plays when the grouping rules let it in", () => {
  const { players, queues } = house();
  const plan = (leader, own) => joinPlan({ players, queues, leader, own: own === undefined ? "tv" : own });
  assert.deepEqual(plan("lead"), { leader: "lead", member: "tv" });
  assert.equal(plan("lead", ""), null, "no own player, no join");
  assert.equal(plan("tv"), null, "never itself");
  assert.equal(plan("den"), null, "the den cannot lead a group of this provider");
  queues.lead.state = "paused";
  assert.deepEqual(plan("lead"), { leader: "lead", member: "tv" }, "paused music can be joined");
  queues.lead.state = "idle";
  assert.equal(plan("lead"), null, "stopped music is not joined");
  queues.lead.state = "playing";
  queues.tv.state = "playing"; queues.tv.current_item = song("Mine");
  assert.equal(plan("lead"), null, "this TV plays music of its own");
  queues.tv.state = "idle";
  players.tv.synced_to = "lead"; players.lead.group_members = ["lead", "tv"];
  assert.equal(plan("lead"), null, "already sounding it");
  players.tv.synced_to = null; players.lead.group_members = [];
  players.tv.available = false;
  assert.equal(plan("lead"), null, "unavailable");
  players.tv.available = true;
  players.lead.supported_features = ["volume_set"];
  assert.equal(plan("lead"), null, "a leader that cannot group");
  players.lead.supported_features = ["set_members"];
  players.lead.static_group_members = ["tv"];
  assert.equal(plan("lead"), null, "a fixed member is not a choice");
  delete players.lead.static_group_members;
  players.lead.can_group_with = ["tv"];
  assert.deepEqual(plan("lead"), { leader: "lead", member: "tv" }, "can_group_with may name the player itself");
});

test("each speaker says what it plays: the song, paused, or idle", () => {
  const { players, queues } = house();
  assert.equal(speakerActivity("lead", players, queues), "Low tide — Demo One, Demo Two");
  assert.equal(speakerActivity("den", players, queues), "Paused · Second kettle", "no artist, just the title");
  assert.equal(speakerActivity("tv", players, queues), "Idle");
  players.tv.synced_to = "lead";
  assert.equal(speakerActivity("tv", players, queues), "Low tide — Demo One, Demo Two", "a member sounds its leader's song");
  assert.equal(speakerActivity("missing", players, queues), "Idle");
  queues.den.state = "idle";
  assert.equal(speakerActivity("den", players, queues), "Idle", "a stopped queue that keeps its song is idle");
});

test("the leader goes by its player's name, else its queue's", () => {
  const { players, queues } = house();
  assert.equal(leaderName(players, queues, "lead"), "Living room");
  delete players.lead;
  assert.equal(leaderName(players, queues, "lead"), "Living room");
  assert.equal(leaderName(players, queues, "gone"), "gone");
});

test("only members whose volume can be set get a row, and only in a group", () => {
  const { players } = house();
  assert.deepEqual(memberVolumes(players, "lead"), [], "a single speaker has the Queue's volume");
  players.lead.group_members = ["lead", "tv", "den", "sonos"];
  players.den.volume_control = "none"; players.den.volume_level = null;
  players.sonos.supported_features = [];
  players.tv.volume_control = "uuid:linked-control";
  assert.deepEqual(memberVolumes(players, "lead"), [{ id: "lead", name: "Living room", level: 30 }, { id: "tv", name: "This TV", level: 30 }]);
  assert.equal(canSetVolume(player("g", { type: "group" })), false, "a group player has the group volume");
  assert.equal(canSetVolume(player("n", { volume_level: null })), false, "nothing to show");
  assert.equal(canSetVolume(player("f", { volume_control: "none" })), false, "fixed volume");
  assert.equal(canSetVolume(null), false);
  assert.deepEqual(memberVolumes(players, "missing"), []);
});
