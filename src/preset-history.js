// The presets shown in shuffled order, so Previous returns to the one actually
// shown before rather than to another random pick, and Next after Previous
// walks forward again. Bounded; presets no longer available are skipped.
export const HISTORY_LIMIT = 50;

export function createPresetHistory(limit = HISTORY_LIMIT) {
  let back = [];
  let ahead = [];
  return {
    // A new preset is shown in place of `from` (not by back or forward).
    shown(from) {
      if (!from) return;
      if (back[back.length - 1] !== from) back.push(from);
      if (back.length > limit) back = back.slice(back.length - limit);
      ahead = [];
    },
    // The preset before `current` that `available` accepts, or null.
    back(current, available) {
      return walk(back, ahead, current, available, limit);
    },
    // The preset after `current` that was left by back(), or null.
    forward(current, available) {
      return walk(ahead, back, current, available, limit);
    },
    get size() {
      return back.length;
    },
  };
}

function walk(from, to, current, available, limit) {
  while (from.length) {
    const name = from.pop();
    if (name === current || !available(name)) continue;
    if (current && to[to.length - 1] !== current) to.push(current);
    if (to.length > limit) to.splice(0, to.length - limit);
    return name;
  }
  return null;
}
