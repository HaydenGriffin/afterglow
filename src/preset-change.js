// When MilkDrop moves to a new preset by itself, besides the timer: with each
// song, or on the music's big moments (a drop, a chorus coming in). The PS5
// app makes the same decisions with the same numbers (preset_change.cpp).

// "Change preset": seconds for a timer (0 = never), or one of the two modes.
export const SONG = "song";
export const MOMENTS = "moments";
export const CHANGE_CHOICES = [0, 30, 120, 300, SONG, MOMENTS];

export function changeLabel(value) {
  if (value === SONG) return "Each song";
  if (value === MOMENTS) return "On big moments";
  if (!value) return "Never";
  return "Every " + (value < 60 ? value + " s" : value / 60 + " min");
}

// A saved value this build does not know reads as the default timer.
export function changeChoice(value, fallback) {
  return CHANGE_CHOICES.indexOf(value) >= 0 ? value : fallback;
}

// The seconds a timer runs, or 0 when changes are not on a timer.
export function timerSeconds(value) {
  return typeof value === "number" ? value : 0;
}

const SONG_SETTLE_MS = 2000; // the new song must still be playing this long after it starts
const SONG_GAP_MS = 10000; // and the last preset change this far back

// Each song: a change when the queue item changes, not for the first song
// heard, not when the music stops. Skipping through songs changes once, after
// the last; a song that comes too soon after a change waits for the gap.
export function createSongGate({ settleMs = SONG_SETTLE_MS, gapMs = SONG_GAP_MS } = {}) {
  let last = null;
  let pending = null;
  let changedAt = -Infinity;
  return {
    song(id, now) {
      if (!id) {
        pending = null;
        return;
      }
      if (last === null || id === last) {
        if (id === last) pending = null;
        last = id;
        return;
      }
      last = id;
      pending = { since: now };
    },
    // Any preset change, manual ones included, restarts the gap.
    changed(now) {
      changedAt = now;
    },
    // Whether to change now; true once per song.
    due(now) {
      if (!pending || now - pending.since < settleMs || now - changedAt < gapMs) return false;
      pending = null;
      return true;
    },
  };
}

// Big moments: the loudness of the last half second against that of the last
// ten. A jump to 2.5 times the energy (about +4 dB) is a moment; it re-arms
// once the music has fallen back below 1.25 times. Ten seconds of sound are
// needed first, and three of silence start that count again, so a song out
// of silence or music resuming after a pause is never one; a short gap
// between songs is not silence enough to forget the level before it.
const FAST_SECONDS = 0.5;
const SLOW_SECONDS = 10;
const JUMP = 2.5;
const REARM = 1.25;
const LOUD_ENOUGH = 1e-3; // -30 dBFS: quieter than this is never a moment
const SILENCE = 1e-5; // -50 dBFS
const HEARD_SECONDS = 10;
const SILENCE_SECONDS = 3;
const MOMENT_GAP_MS = 25000;

// energy: mean square of the samples, full scale 1.
export function createMomentDetector() {
  let fast = 0;
  let slow = 0;
  let armed = true;
  let heard = 0;
  let silent = 0;
  return {
    // Returns true when this stretch of audio is a big moment.
    push(energy, seconds) {
      if (!(seconds > 0)) return false;
      fast += (energy - fast) * (1 - Math.exp(-seconds / FAST_SECONDS));
      slow += (energy - slow) * (1 - Math.exp(-seconds / SLOW_SECONDS));
      if (fast < SILENCE) {
        silent += seconds;
        if (silent >= SILENCE_SECONDS) heard = 0;
      } else {
        silent = 0;
        heard += seconds;
      }
      if (!armed) {
        if (fast < REARM * slow) armed = true;
        return false;
      }
      if (heard < HEARD_SECONDS || fast < LOUD_ENOUGH || fast < JUMP * slow) return false;
      armed = false;
      return true;
    },
    get fast() {
      return fast;
    },
    get slow() {
      return slow;
    },
  };
}

// The energy of Butterchurn's 8-bit waveform (128 is silence).
export function waveEnergy(wave) {
  if (!wave || !wave.length) return 0;
  let sum = 0;
  for (let i = 0; i < wave.length; i++) {
    const v = (wave[i] - 128) / 128;
    sum += v * v;
  }
  return sum / wave.length;
}

// The two gates together, for the mode chosen. `changed` must hear about
// every preset change so the minimum gaps hold.
export function createPresetChanger({ songGapMs, momentGapMs = MOMENT_GAP_MS } = {}) {
  const songs = createSongGate(songGapMs === undefined ? {} : { gapMs: songGapMs });
  const moments = createMomentDetector();
  let changedAt = -Infinity;
  let moment = false;
  return {
    song: (id, now) => songs.song(id, now),
    // Heard all the time, so the averages are ready when the mode is picked.
    hear(energy, seconds) {
      if (moments.push(energy, seconds)) moment = true;
    },
    changed(now) {
      changedAt = now;
      songs.changed(now);
    },
    // Whether the mode wants a change now. A moment within the gap is let go.
    due(mode, now) {
      const wasMoment = moment;
      moment = false;
      // Drained in the other modes too, so picking Each song later does not
      // act on a song that started long before.
      const songDue = songs.due(now);
      if (mode === SONG) return songDue;
      if (mode === MOMENTS) return wasMoment && now - changedAt >= momentGapMs;
      return false;
    },
  };
}
