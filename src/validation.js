// Which presets count as validated on this TV: those measured at or above the
// frame-rate threshold, unless the person has added or removed one by hand.
// Measurements come from the preset scan (or the runtime slow-preset watch);
// a TV that has never scanned starts from the benchmark shipped with the app.
// Pure functions over plain objects; milkdrop.js keeps the state.

export const VALIDATE_CHOICES = [30, 45, 60]; // fps
export const DEFAULT_VALIDATE_FPS = 45;
export const LISTS = ["validated", "all", "favorites"];

// state: { rated: {name: fps}, bench: {name: fps}, overrides: {name: bool}, validateFps }

// The frame rate known for a preset: this TV's own measurement first, else
// the shipped benchmark; undefined when neither has it.
export function ratingOf(name, state) {
  if (state.rated && name in state.rated) return state.rated[name];
  if (state.bench && name in state.bench) return state.bench[name];
  return undefined;
}

export function measuredValidated(name, state) {
  const fps = ratingOf(name, state);
  return fps !== undefined && fps >= state.validateFps;
}

export function isValidated(name, state) {
  if (state.overrides && name in state.overrides) return !!state.overrides[name];
  return measuredValidated(name, state);
}

// The Validated row's text: what the decision is and where it came from.
export function describeValidation(name, state) {
  const manual = state.overrides && name in state.overrides;
  const fps = ratingOf(name, state);
  const on = isValidated(name, state);
  if (manual) return (on ? "yes" : "no") + " (by you" + (fps !== undefined ? ", " + Math.round(fps) + " fps" : "") + ")";
  if (fps === undefined) return "not tested";
  return (on ? "yes" : "no") + " (" + Math.round(fps) + " fps)";
}

// Flip a preset in or out of the validated list by hand. An override that
// merely agrees with the measurement is dropped, so undoing a change returns
// the row to "measured" rather than leaving it on "by you".
export function toggleValidated(name, state) {
  const wanted = !isValidated(name, state);
  const overrides = Object.assign({}, state.overrides || {});
  if (wanted === measuredValidated(name, state)) delete overrides[name];
  else overrides[name] = wanted;
  return overrides;
}

export function countValidated(names, state) {
  let n = 0;
  for (const name of names) if (isValidated(name, state)) n++;
  return n;
}

// The order a scan measures in: presets nobody has measured first, then those
// known only from the shipped benchmark, then this TV's own measurements again
// (oldest knowledge is refreshed first, so a scan cut short still helps most).
export function scanOrder(names, state) {
  const rank = (name) => (state.rated && name in state.rated ? 2 : state.bench && name in state.bench ? 1 : 0);
  return names.slice().sort((a, b) => rank(a) - rank(b) || a.toLowerCase().localeCompare(b.toLowerCase()));
}
