// The poster's progress bar moves every animation frame from the interpolated
// playback position rather than in steps. Small clock corrections from Music
// Assistant are eased in over a few hundred milliseconds and never move the
// bar backwards while the song plays; a seek or a new song snaps. Paused, the
// bar holds still. With reduced motion there is no easing: the bar shows the
// position as it is.

export const SNAP_S = 2; // a jump at least this big is a seek: no easing
const EASE_MS = 300; // the time constant small corrections settle with
const MAX_STEP_MS = 250; // a longer gap between frames (a hidden page) counts as this

export function createProgressSmoother({ reduced = () => false } = {}) {
  let shown = null, key = "", last = 0;
  return {
    // target: the interpolated position (s); playing: whether time runs;
    // song: changes with the song (or queue); at: now in ms. Returns the
    // position to draw.
    next({ target, playing, song, at }) {
      const dt = last ? Math.max(0, Math.min(MAX_STEP_MS, at - last)) : 0;
      last = at;
      if (shown === null || song !== key || Math.abs(target - shown) >= SNAP_S || reduced()) {
        key = song;
        shown = target;
        return shown;
      }
      if (!playing) return shown;
      const predicted = shown + dt / 1000;
      const eased = predicted + (target - predicted) * (1 - Math.exp(-dt / EASE_MS));
      shown = Math.max(shown, eased);
      return shown;
    },
    reset() {
      shown = null;
      last = 0;
    },
  };
}

// The bar's fill as a transform (no layout per frame): "scaleX(0.4321)".
export function progressTransform(position, duration) {
  const f = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;
  return "scaleX(" + f.toFixed(4) + ")";
}
