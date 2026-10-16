import assert from "node:assert/strict";
import { test } from "node:test";
import { createMock } from "../src/mock.js";

test("the built-in signal is a looped window: continuous, repeatable, and never silent", () => {
  const mock = createMock();
  const a = Array.from(mock.wave(5000));
  assert.equal(a.length, 1024);
  assert.ok(a.some((v) => v !== 128), "has signal");
  assert.deepEqual(Array.from(mock.wave(5000)), a, "the same instant gives the same window");
  assert.deepEqual(Array.from(mock.wave(5000 + 8000)), a, "eight seconds later it repeats");
  // A window straddling the loop's end is still 1024 contiguous samples.
  const atEnd = mock.wave(8000 + 1000 * (512 / 44100));
  assert.equal(atEnd.length, 1024);
  assert.ok(Array.from(atEnd).some((v) => v !== 128));
});

test("the preview player moves its music, groups speakers and answers from an idle pick", async () => {
  const { createMockPlayback } = await import("../src/mock-playback.js");
  const mock = createMockPlayback();
  assert.equal(mock.target.queueId, "demo-living");
  assert.deepEqual(mock.groupOptions().map((o) => [o.id, o.member, o.allowed]), [
    ["demo-bedroom", false, false], ["demo-hallway", false, true], ["demo-kitchen", false, true], ["demo-living", true, false], ["demo-tv", false, true],
  ]);
  await mock.call("players/cmd/set_members", { target_player: "demo-living", player_ids_to_add: ["demo-kitchen"] });
  assert.equal(mock.target.player.group_volume, 28);
  await mock.call("players/cmd/group_volume", { player_id: "demo-living", volume_level: 40 });
  assert.equal(mock.groupOptions().filter((o) => o.member).length, 2);
  assert.ok(mock.transferPlan("demo-tv"));
  await mock.call("player_queues/transfer", { source_queue_id: "demo-living", target_queue_id: "demo-tv", auto_play: true });
  mock.setPreferred("demo-tv");
  assert.equal(mock.playback.queue.queue_id, "demo-tv");
  assert.equal(mock.target.name, "This TV · Preview");
  mock.setPreferred("demo-bedroom");
  assert.equal(mock.target.queueId, "demo-bedroom", "an idle pick takes commands");
  await mock.call("player_queues/play_media", { queue_id: "demo-bedroom", media: "library://album/1", option: "replace" });
  assert.equal(mock.playback.queue.queue_id, "demo-bedroom", "and playing there starts the music there");
});

test("the preview player lets this TV join the music and shows each speaker's volume", async () => {
  const { createMockPlayback } = await import("../src/mock-playback.js");
  const { joinPlan, memberVolumes, speakerActivity } = await import("../src/speaker-group.js");
  const mock = createMockPlayback();
  const { players, queues } = mock.speakerLists();
  assert.deepEqual(joinPlan({ players, queues, leader: "demo-living", own: mock.ownPlayer }), { leader: "demo-living", member: "demo-tv" });
  assert.equal(speakerActivity("demo-bedroom", players, queues), "Paused · Low tide — Demo Field Recordings");
  assert.equal(speakerActivity("demo-kitchen", players, queues), "Idle");
  await mock.call("players/cmd/set_members", { target_player: "demo-living", player_ids_to_add: ["demo-tv", "demo-hallway"] });
  assert.equal(joinPlan({ players, queues, leader: "demo-living", own: "demo-tv" }), null, "already in the group");
  assert.equal(speakerActivity("demo-tv", players, queues), "A quieter kind of evening — Afterglow demo");
  assert.deepEqual(memberVolumes(players, "demo-living").map((v) => [v.id, v.level]), [["demo-living", 35], ["demo-tv", 50]], "the hallway's volume is fixed");
  await mock.call("players/cmd/volume_set", { player_id: "demo-tv", volume_level: 55 });
  assert.equal(memberVolumes(players, "demo-living")[1].level, 55);
});
