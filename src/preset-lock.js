// Preset locks: a MilkDrop preset kept for an album or an artist. Saved as the
// `presetLocks` preference, { key: presetName }, so they are mirrored to the
// account with this TV's other settings. Keys are made of names, not provider
// ids, so the same album from another provider keeps its preset.

export const LOCK_LIMIT = 200;

const clean = (name) => String(name || "").trim().toLowerCase();

// track: playback.js trackInfo, or null. Empty keys where there is nothing to lock to.
export function lockKeys(track) {
  if (!track) return { album: "", artist: "" };
  const artists = (track.media && track.media.artists) || [];
  const main = clean((artists[0] && artists[0].name) || track.artist);
  const album = clean(track.album);
  return { album: album ? "album:" + main + "|" + album : "", artist: main ? "artist:" + main : "" };
}

// The preset locked for this track, the album's before the artist's.
export function lockFor(locks, track) {
  if (!locks || !track) return null;
  const keys = lockKeys(track);
  if (keys.album && locks[keys.album]) return { name: locks[keys.album], by: "album" };
  if (keys.artist && locks[keys.artist]) return { name: locks[keys.artist], by: "artist" };
  return null;
}

// A copy of `locks` with `key` set to `name` (null removes it), newest last.
export function withLock(locks, key, name) {
  const next = {};
  for (const k of Object.keys(locks || {})) if (k !== key) next[k] = locks[k];
  if (name) next[key] = name;
  const keys = Object.keys(next);
  for (let i = 0; i < keys.length - LOCK_LIMIT; i++) delete next[keys[i]];
  return next;
}

// The locks as the app uses them. follow(track) runs every second, so the
// saved locks are read once (and again after reload(), when the account's
// copy arrives), and hold(name or null) only hears of a change of album,
// artist or locks.
export function createPresetLocks({ load, save, hold }) {
  let locks = null;
  let heldFor = null; // the lock keys hold() was last told about
  const all = () => locks || (locks = load() || {});
  return {
    follow(track) {
      const keys = lockKeys(track), at = keys.album + "\n" + keys.artist;
      if (at === heldFor) return;
      heldFor = at;
      const lock = lockFor(all(), track);
      hold(lock ? lock.name : null);
    },
    // The preset locked to a key, or null.
    locked(key) {
      return (key && all()[key]) || null;
    },
    // Lock key to name (null unlocks), then apply it to the playing track.
    set(key, name, track) {
      locks = withLock(all(), key, name);
      save(locks);
      heldFor = null;
      this.follow(track);
    },
    reload() {
      locks = null;
      heldFor = null;
    },
  };
}
