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

const SPEAKER_TYPES = { player: true, stereo_pair: true };
const RETRY_BASE_MS = 15000;
const RETRY_MAX_MS = 5 * 60000;

// The players a person can pick: real, usable ones, by name.
export function speakersOf(players) {
  const list = [];
  for (const id in players) {
    const p = players[id];
    if (!p || !SPEAKER_TYPES[p.type]) continue;
    if (!p.available || p.enabled === false || p.hide_in_ui) continue;
    list.push({ id: p.player_id, name: p.name || p.player_id });
  }
  list.sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0));
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
