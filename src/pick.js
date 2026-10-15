// Which player to visualize, worked out from Music Assistant's player and
// queue lists. Pure functions: the caller (follow.js) keeps the lists, the
// clock and the timers.
//
// The interface talks about speakers. What sounds on a speaker is a queue,
// and in a sync group every member sounds the leader's queue, so a speaker is
// first resolved to its audible queue the way Music Assistant does
// (synced_to, then active_group, then active_source). The relay is always
// given the queue id, so moving between speakers in one group changes nothing
// on the wire.

const SPEAKER_TYPES = { player: true, stereo_pair: true, group: true };
const RETRY_BASE_MS = 15000;
const RETRY_MAX_MS = 5 * 60000;

// The players a person can pick: usable sync groups, then real players, by name.
export function speakersOf(players) {
  const list = [];
  for (const id in players) {
    const p = players[id];
    if (!p || !SPEAKER_TYPES[p.type]) continue;
    if (!p.available || p.enabled === false || p.hide_in_ui) continue;
    const speaker = { id: p.player_id, name: p.name || p.player_id };
    if (p.type === "group") speaker.group = true;
    list.push(speaker);
  }
  const key = (s) => (s.group ? "0" : "1") + s.name.toLowerCase();
  list.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return list;
}

// The queue sounding on a player, or null when there is none Music Assistant
// decodes itself (a Sonos playing Spotify on its own, a TV input).
export function audibleQueue(playerId, players, queues) {
  const seen = {};
  let id = playerId;
  while (id && !seen[id]) {
    seen[id] = true;
    const p = players[id];
    if (!p || !p.available) return null;
    if (p.synced_to && p.synced_to !== id) {
      id = p.synced_to;
      continue;
    }
    if (p.active_group && p.active_group !== id) {
      id = p.active_group;
      continue;
    }
    const source = p.active_source || id;
    return queues[source] || null;
  }
  return null;
}

// A queue that claimed to play but sent no frames is left alone until it
// stops, except that while nothing else is on it is tried again now and then.
export function isSkipped(skipped, queueId, now, retryAllowed) {
  const entry = skipped[queueId];
  if (!entry) return false;
  if (!retryAllowed) return true;
  const wait = Math.min(RETRY_BASE_MS * Math.pow(2, entry.tries - 1), RETRY_MAX_MS);
  return now - entry.at < wait;
}

function ownerName(queue, players) {
  const p = players[queue.queue_id];
  return (p && p.name) || queue.display_name || queue.queue_id;
}

// Picks what to watch. Returns {queueId, playerId, reason} or null.
//   preferred: the picked speaker's audible queue, whenever it plays
//   current:   the queue already watched, kept while it plays (and always
//              while frames flow: the relay knows better than queue state,
//              which blips between tracks)
//   auto:      the queue that started most recently, by name when tied
export function choose({ players, queues, current, streaming, preferred, skipped, firstPlaying, now }) {
  const idle = !streaming;
  if (preferred) {
    const queue = audibleQueue(preferred, players, queues);
    if (queue && queue.state === "playing" && !isSkipped(skipped, queue.queue_id, now, idle)) {
      return { queueId: queue.queue_id, playerId: preferred, reason: "preferred" };
    }
  }
  if (current) {
    const queue = queues[current];
    if (streaming || (queue && queue.state === "playing" && !isSkipped(skipped, current, now, idle))) {
      return { queueId: current, playerId: current, reason: "current" };
    }
  }
  let best = null;
  for (const id in queues) {
    const queue = queues[id];
    if (!queue || queue.state !== "playing" || isSkipped(skipped, id, now, idle)) continue;
    const started = firstPlaying[id] || 0;
    if (!best || started > best.started || (started === best.started && ownerName(queue, players).toLowerCase() < best.name.toLowerCase())) {
      best = { id, started, name: ownerName(queue, players) };
    }
  }
  return best ? { queueId: best.id, playerId: best.id, reason: "auto" } : null;
}

// The queue a command acts on, which is not always the one being drawn: a
// speaker picked with "Play on" takes commands before it plays, and from a
// cold start something must still answer Play. Returns {queueId, playerId,
// reason} or null.
//   chosen:    the picked speaker's audible queue, or its own when idle
//   following: the queue drawn now or last (kept after its stream ends)
//   last:      the queue followed before the app was suspended
//   this-tv:   this TV's own speaker, when it plays here too
//   first:     the first speaker by name, real speakers before groups
export function commandTarget({ players, queues, preferred, current, last, own }) {
  const queueOf = (playerId) => {
    const p = playerId && players[playerId];
    if (!p || !p.available || p.enabled === false) return null;
    return audibleQueue(playerId, players, queues) || queues[playerId] || null;
  };
  const target = (playerId, reason) => {
    const queue = queueOf(playerId);
    return queue ? { queueId: queue.queue_id, playerId, reason } : null;
  };
  if (preferred && target(preferred, "chosen")) return target(preferred, "chosen");
  if (current && queues[current]) return { queueId: current, playerId: current, reason: "following" };
  if (last && target(last, "last")) return target(last, "last");
  if (own && target(own, "this-tv")) return target(own, "this-tv");
  const speakers = speakersOf(players);
  const ordered = speakers.filter((s) => !s.group).concat(speakers.filter((s) => s.group));
  for (const s of ordered) if (target(s.id, "first")) return target(s.id, "first");
  return null;
}

// Whether picking a speaker should move the music there: only music that is
// playing or paused (or stopped, when asked for), and only to a speaker that
// is not already sounding it or something of its own. Returns {from, to} or null.
export function transferPlan({ players, queues, from, to, stopped }) {
  const source = queues[from];
  if (!source || !source.current_item) return null;
  if (!stopped && source.state !== "playing" && source.state !== "paused") return null;
  const dest = players[to];
  if (!dest || !dest.available || dest.enabled === false) return null;
  const sounding = audibleQueue(to, players, queues);
  if (sounding && (sounding.queue_id === from || sounding.state === "playing")) return null;
  return { from, to };
}

// The speakers that could sound together with a leader, by name, with a tick
// for those in its group. Speakers it cannot group with are listed but not
// allowed, as are its leader and fixed members.
export function groupOptions(players, leaderId) {
  const leader = players[leaderId];
  if (!leader) return [];
  const members = leader.group_members || [];
  const fixed = leader.static_group_members || [];
  const can = leader.can_group_with || [];
  const groupable = (leader.supported_features || []).indexOf("set_members") >= 0;
  return speakersOf(players)
    .filter((s) => !s.group)
    .map((s) => {
      const p = players[s.id];
      const isLeader = s.id === leaderId;
      const member = isLeader || members.indexOf(s.id) >= 0;
      const compatible = member || can.indexOf(s.id) >= 0 || (!!p.provider && can.indexOf(p.provider) >= 0);
      return { id: s.id, name: s.name, member, leader: isLeader, allowed: groupable && !isLeader && fixed.indexOf(s.id) < 0 && compatible };
    });
}
