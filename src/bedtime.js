// Bedtime: after a set time, or at the end of the track, playback stops. A
// minute after it is set (or after the last key) the picture goes black (an
// OLED at black is off) while the music plays on; the volume fades out over
// the last 30 s when the player has one. A key only wakes the picture for a
// while; bedtime runs until it ends or is set to Off.
import { timeLabel, volumeOf } from "./playback.js";

export const BEDTIME_CHOICES = [0, 15, 30, 60, "track"]; // minutes, or the end of the track
const DARK_AFTER_MS = 60000;
const FADE_MS = 30000;

export function bedtimeLabel(state, choice) {
  if (!state.running) return "Off";
  const name = choice === "track" ? "End of track" : choice + " min";
  return name + " · " + timeLabel(Math.ceil(state.remainingMs / 1000)) + " left";
}

// The state machine, on a clock handed in. track: { id, leftMs } or null.
export function createBedtime() {
  let choice = 0;
  let endsAt = 0;
  let trackId = null;
  let activeAt = 0; // the start, or the last key

  return {
    get choice() {
      return choice;
    },
    // Returns false when the choice cannot apply (End of track with no track
    // or no length to it); bedtime is then unchanged.
    set(next, now, track) {
      if (next === "track" && !(track && track.leftMs > 0)) return false;
      choice = next;
      endsAt = typeof next === "number" ? now + next * 60000 : 0;
      trackId = next === "track" ? track.id : null;
      activeAt = now;
      return true;
    },
    // Returns whether the picture was dark (the key then only wakes it).
    wake(now) {
      const wasDark = this.state(now, null).dark;
      activeAt = now;
      return wasDark;
    },
    state(now, track) {
      if (!choice) return { running: false, dark: false, volume: 1, remainingMs: 0, done: false };
      let remainingMs;
      if (choice === "track") remainingMs = !track || track.id !== trackId ? 0 : track.leftMs == null ? Infinity : track.leftMs;
      else remainingMs = endsAt - now;
      remainingMs = Math.max(0, remainingMs);
      return {
        running: true,
        dark: now - activeAt >= DARK_AFTER_MS,
        volume: Math.min(1, remainingMs / FADE_MS),
        remainingMs,
        done: remainingMs <= 0,
      };
    },
  };
}

// Drives the state machine from the playback model (player-view's snapshot and
// command), once a second. setDark(on) blacks the picture out or brings it back.
// It watches the target (what commands act on), which may not be the queue
// drawn on the poster, and its volume as the volume command sets it (a
// group's volume for a group).
export function createBedtimeController({ bedtime, playback, setDark, now = Date.now }) {
  let dark = false;
  let original = null; // the volume before the fade
  let sent = null;

  function trackNow() {
    const t = playback.snapshot().target;
    if (!t || !t.track) return null;
    return { id: t.track.id, leftMs: t.track.duration ? Math.max(0, (t.track.duration - t.position) * 1000) : null };
  }
  function showDark(on) {
    if (on === dark) return;
    dark = on;
    setDark(on);
  }
  function restoreVolume() {
    if (original === null) return null;
    const level = original;
    original = sent = null;
    return level;
  }
  function fade(factor) {
    const t = playback.snapshot().target;
    const volume = volumeOf(t && t.player);
    if (volume == null) return;
    if (original === null) original = volume;
    const level = Math.round(original * factor);
    if (level === sent) return;
    sent = level;
    playback.command("volume", level);
  }
  function finish() {
    const level = restoreVolume();
    bedtime.set(0, now(), null);
    showDark(false);
    const paused = playback.command("pause");
    if (level !== null) paused.then(() => playback.command("volume", level));
  }

  return {
    get choice() {
      return bedtime.choice;
    },
    get label() {
      return bedtimeLabel(bedtime.state(now(), trackNow()), bedtime.choice);
    },
    set(choice) {
      return bedtime.set(choice, now(), trackNow());
    },
    // Step through the choices, past any that cannot apply now.
    cycle(direction) {
      const n = BEDTIME_CHOICES.length;
      let at = Math.max(0, BEDTIME_CHOICES.indexOf(bedtime.choice));
      for (let tried = 0; tried < n; tried++) {
        at = (at + direction + n) % n;
        if (this.set(BEDTIME_CHOICES[at])) return;
      }
    },
    // A key was pressed: true when it only woke the picture.
    wake() {
      const wasDark = bedtime.wake(now());
      showDark(false);
      return wasDark;
    },
    tick() {
      const state = bedtime.state(now(), trackNow());
      if (!state.running) {
        const level = restoreVolume();
        if (level !== null) playback.command("volume", level);
        return showDark(false);
      }
      if (state.done) return finish();
      showDark(state.dark);
      if (state.volume < 1) fade(state.volume);
      else if (original !== null) playback.command("volume", restoreVolume()); // set longer mid-fade
    },
  };
}
