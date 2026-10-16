// Joining the music elsewhere, what each speaker plays, and the volume of one
// speaker in a group. Pure functions over Music Assistant's player and queue
// lists, beside pick.js; the PS5 app has the same rules (speaker_group.cpp).
import { audibleQueue, groupOptions } from "./pick.js";

const sounds = (queue) => !!queue && !!queue.current_item && (queue.state === "playing" || queue.state === "paused");

// The name a leader goes by: its player's, else its queue's.
export function leaderName(players, queues, leader) {
  const p = players[leader], q = queues[leader];
  return (p && p.name) || (q && q.display_name) || leader;
}

// Whether this device's own player can join the leader's group: the leader
// sounds a song, the own player sounds neither it nor music of its own, and
// the grouping rules (pick.js groupOptions) let it in. Returns {leader,
// member} or null.
export function joinPlan({ players, queues, leader, own }) {
  if (!own || !leader || own === leader) return null;
  if (!sounds(queues[leader])) return null;
  const p = players[own];
  if (!p || !p.available || p.enabled === false) return null;
  const sounding = audibleQueue(own, players, queues);
  if (sounding && (sounding.queue_id === leader || sounding.state === "playing")) return null;
  const option = groupOptions(players, leader).filter((o) => o.id === own)[0];
  return option && option.allowed && !option.member ? { leader, member: own } : null;
}

// What a speaker plays: "Song — Artist", "Paused · Song — Artist" or "Idle".
export function speakerActivity(playerId, players, queues) {
  const queue = audibleQueue(playerId, players, queues);
  if (!sounds(queue)) return "Idle";
  const item = queue.current_item, media = item.media_item || {};
  const title = media.name || item.name || "Unknown track";
  const artist = (media.artists || []).map((a) => a.name).filter(Boolean).join(", ");
  const song = artist ? title + " — " + artist : title;
  return queue.state === "paused" ? "Paused · " + song : song;
}

// A volume Music Assistant can set: not fixed ("none"), and a level to show.
// A linked control (volume_control naming another control) is set through it.
export function canSetVolume(player) {
  return !!player && player.type !== "group" && typeof player.volume_level === "number" &&
    player.volume_control !== "none" && (player.supported_features || []).indexOf("volume_set") >= 0;
}

// The members of the leader's group whose volume can be set, by name, the
// leader included; none while the group is a single speaker.
export function memberVolumes(players, leader) {
  const members = groupOptions(players, leader).filter((o) => o.member);
  if (members.length < 2) return [];
  return members.filter((o) => canSetVolume(players[o.id])).map((o) => ({ id: o.id, name: o.name, level: players[o.id].volume_level }));
}
