// MilkDrop presets through Butterchurn (MIT, Jordan Berg; the Music Assistant
// fork, 3.x). Needs WebGL2, which a TV may lack or run badly, so the library
// is fetched only once a context has been obtained, and every way it can fail
// leads to `onFail`.
//
// Presets differ enormously in cost: on an LG CX some hold 60 fps and others
// manage 5. Every preset in the packs is shipped; which ones this TV shows by
// default is decided by measured frame rate (validation.js), from the preset
// scan or, until the TV has scanned, from the benchmark shipped with the app.
import { favoriteNames, favoritesFromList, loadPref, savePref } from "./settings.js";
import { DEFAULT_VALIDATE_FPS, LISTS, countValidated, describeValidation, isValidated, ratingOf, scanOrder, toggleValidated } from "./validation.js";

const SCRIPTS = ["./vendor/butterchurn.min.js", "./vendor/presets.js"];
const BLEND_SECONDS = 2.7;
const PROVEN_FRAMES = 120; // frames rendered before a start counts as survived
const SCALE = 0.5; // render size relative to the window
const SLOW_FPS = 20;
const SLOW_SECONDS = 4; // this long below SLOW_FPS and a preset is marked slow
const SETTLE_SECONDS = 4; // not judged while loading and blending in
const GIVE_UP_AFTER = 8; // this many slow presets in a row and MilkDrop is off
export const ROTATE_CHOICES = [0, 30, 120, 300]; // seconds; 0 = stay on the chosen preset
export const DEFAULT_ROTATE = 120;
export const COLOR_MODES = ["default", "art"]; // the preset's own colors, or the album art's
export const COLOR_STRENGTHS = [25, 50, 75, 100]; // percent
export const DEFAULT_COLOR_STRENGTH = 100;
// Music Assistant's artwork palette roles, in the order they fill Butterchurn's
// four color slots: waveform, outer border, inner border, motion vectors. The
// "on" colors come last: they are picked for contrast, so they tend to be
// near white or near black.
const PALETTE_ROLES = ["primary", "accent", "background_light", "background_dark", "on_dark", "on_light"];
const MIN_CHROMA = 40; // a palette color flatter than this (of 255) carries no hue worth taking
// The preset's own colors for those slots, and Butterchurn's defaults for them.
const SLOT_KEYS = [["wave_r", "wave_g", "wave_b"], ["ob_r", "ob_g", "ob_b"], ["ib_r", "ib_g", "ib_b"], ["mv_r", "mv_g", "mv_b"]];
const SLOT_DEFAULTS = [[1, 1, 1], [0, 0, 0], [0.25, 0.25, 0.25], [1, 1, 1]];
const SLOT_SIZE = [null, "ob_size", "ib_size", null]; // borders: the preset's width for the slot
const MAX_BORDER = 0.05; // wider than this and a border is a wash the preset builds on, not a frame
const LUMA = [0.3, 0.59, 0.11];

const describe = (error) => String((error && error.message) || error);

let probed = null;

// Whether this browser hands out a WebGL2 context at all.
export function hasWebGL2() {
  if (probed === null) {
    try {
      probed = !!document.createElement("canvas").getContext("webgl2");
    } catch (e) {
      probed = false;
    }
  }
  return probed;
}

// Why MilkDrop should not be started, or "" if it may be.
export function milkdropBlocker() {
  if (!hasWebGL2()) return "no WebGL2";
  if (loadPref("milkdropPending", false)) return "did not survive its last start";
  return "";
}

export function clearMilkdropBlocks() {
  savePref("milkdropPending", false);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = src;
    tag.onload = resolve;
    tag.onerror = () => reject(new Error("could not load " + src));
    document.head.appendChild(tag);
  });
}

// onFail(reason): MilkDrop cannot run. onNotice(text): something to tell the viewer.
export function createMilkdropMode(onFail, onNotice) {
  // One visualizer for the life of the page: it owns the canvas's GL context
  // and cannot be torn down, so it is reused each time the mode is entered.
  let visualizer = null;
  let presets = {};
  let names = [];
  let index = 0;
  let current = "";
  let loading = null;
  let failed = false;
  let frames = 0;
  let sincePreset = 0;
  // Favorites with the time each was last switched on or off (settings.js).
  let favMeta = loadFavorites();
  let favorites = favoriteNames(favMeta);
  let list = loadList();
  let rotateSeconds = loadPref("presetRotate", DEFAULT_ROTATE);
  let randomOrder = loadPref("presetRandom", true); // up/down pick at random instead of in order
  // Validation: measurements, the person's overrides, and the threshold.
  const validation = { rated: loadPref("rated", {}), bench: {}, overrides: loadPref("validatedOverrides", {}), validateFps: loadPref("validateFps", DEFAULT_VALIDATE_FPS) };
  let ratingsDirty = false;
  // frame-rate watch for the current preset
  let windowTime = 0;
  let windowFrames = 0;
  let slowSeconds = 0;
  let skippedInARow = 0;
  let watching = true;
  let scanning = false;
  // Album-art coloring: the mode, how far to go, and the palette Music
  // Assistant sent for the current track.
  let colorMode = loadPref("color", "default");
  let colorStrength = loadPref("colorStrength", DEFAULT_COLOR_STRENGTH);
  let palette = null;
  let external = null; // a preset shown by showExternal, for its colors

  function loadFavorites() {
    // The plain list from before the timestamps is folded in whenever present,
    // as is the map saved under its earlier spelling.
    const meta = loadPref("favoritesMeta", null) || loadPref("favouritesMeta", null);
    return favoritesFromList(loadPref("favorites", []) || loadPref("favourites", []), meta);
  }

  function loadList() {
    const saved = loadPref("presetList", "");
    if (LISTS.indexOf(saved) >= 0) return saved;
    // Before the validated list there was a favorites-only switch.
    return loadPref("onlyFavorites", false) ? "favorites" : "validated";
  }

  function fail(reason) {
    if (failed) return;
    failed = true;
    // This code running means the page survived: whatever went wrong, it was
    // not the TV dying inside Butterchurn.
    savePref("milkdropPending", false);
    onFail(reason);
  }

  function luma(c) {
    return c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
  }

  // `color` with its brightness moved to `target` (0-255), clipped toward the
  // gray of that brightness so no channel leaves 0-255. The same blend the
  // fork's tint shader does.
  function atLuma(color, target) {
    const shift = target - luma(color);
    let out = color.map((v) => v + shift);
    const max = Math.max(out[0], out[1], out[2]);
    const min = Math.min(out[0], out[1], out[2]);
    if (max > 255) out = out.map((v) => target + (v - target) * ((255 - target) / (max - target)));
    if (min < 0) out = out.map((v) => target + (v - target) * (target / (target - min)));
    return out;
  }

  // The palette's colors with some hue to them, most prominent first.
  function paletteHues(p) {
    if (!p) return [];
    const hues = [];
    for (const role of PALETTE_ROLES) {
      const c = p[role];
      if (c && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) >= MIN_CHROMA) hues.push(c);
    }
    return hues;
  }

  // One color per slot: the artwork's hue at the brightness the preset gives
  // that slot. A preset draws its waveform and borders into the feedback
  // texture, so handing it a light palette color where it meant a dark one
  // floods the whole picture; keeping the brightness keeps the preset. A wide
  // border is a fill the preset's shaders build on, not a frame, and even at
  // the same brightness another hue washes it out: that slot keeps its own color.
  function paletteColors(p, preset) {
    const hues = paletteHues(p);
    if (!hues.length) return null;
    const base = (preset && preset.baseVals) || {};
    const val = (key, fallback) => (typeof base[key] === "number" ? base[key] : fallback);
    return SLOT_KEYS.map((keys, slot) => {
      const own = keys.map((key, i) => val(key, SLOT_DEFAULTS[slot][i]) * 255);
      if (SLOT_SIZE[slot] && val(SLOT_SIZE[slot], 0.01) > MAX_BORDER) return own;
      return atLuma(hues[Math.min(slot, hues.length - 1)], luma(own));
    });
  }

  // Passing null fades the coloring out, so "default" and a track without a
  // palette both end on the preset's own colors.
  function applyColor() {
    if (!visualizer || typeof visualizer.setPaletteColors !== "function") return;
    const colors = colorMode === "art" ? paletteColors(palette, presets[current] || external) : null;
    visualizer.setPaletteColors(colors, colorStrength / 100);
  }

  function show(name, preset, blend) {
    // loadPreset is async in Butterchurn 3: a preset that fails to load
    // rejects instead of throwing.
    const loaded = visualizer.loadPreset(preset, blend);
    if (loaded && typeof loaded.catch === "function") loaded.catch((error) => fail(describe(error)));
    current = name;
    external = name in presets ? null : preset;
    sincePreset = windowTime = windowFrames = slowSeconds = 0;
    applyColor();
  }

  function showIndexed(blend) {
    watching = true;
    show(names[index], presets[names[index]], blend);
    savePref("preset", names[index]);
    onNotice(names[index]);
  }

  // Whether a preset is in the list being browsed. A favorites list with
  // nothing in it shows everything rather than nothing.
  function listed(name) {
    if (list === "all") return true;
    if (list === "favorites") return !favorites.length || favorites.indexOf(name) >= 0;
    return isValidated(name, validation);
  }

  function listedNames() {
    return names.filter(listed);
  }

  function setList(next) {
    list = next;
    savePref("presetList", next);
  }

  // Move to the next listed preset in `direction`, or to a random one when
  // browsing in random order.
  function step(direction, blend) {
    if (!visualizer || !names.length) return;
    if (randomOrder) return random();
    for (let tried = 0; tried < names.length; tried++) {
      index = (index + direction + names.length) % names.length;
      if (listed(names[index])) break;
    }
    showIndexed(blend === undefined ? BLEND_SECONDS : blend);
  }

  function random() {
    if (!visualizer || names.length < 2) return;
    const from = index;
    for (let tried = 0; tried < 40; tried++) {
      index = Math.floor(Math.random() * names.length);
      if (index !== from && listed(names[index])) break;
    }
    showIndexed(BLEND_SECONDS);
  }

  function commitRatings() {
    if (!ratingsDirty) return;
    ratingsDirty = false;
    savePref("rated", validation.rated);
  }

  // The runtime safety net: a preset that stays slow is marked as such. The
  // person's own choices are respected: a favorite, or a preset validated by
  // hand, is never skipped, only measured.
  function watchFrameRate(dt) {
    windowTime += dt;
    windowFrames++;
    if (windowTime < 1) return;
    const fps = windowFrames / windowTime;
    windowTime = windowFrames = 0;
    if (!watching || sincePreset < SETTLE_SECONDS) return;
    slowSeconds = fps < SLOW_FPS ? slowSeconds + 1 : 0;
    if (slowSeconds === 0 && sincePreset > SETTLE_SECONDS * 2) skippedInARow = 0;
    if (slowSeconds < SLOW_SECONDS) return;
    slowSeconds = 0;
    const name = current;
    validation.rated = Object.assign({}, validation.rated);
    validation.rated[name] = Math.round(fps);
    ratingsDirty = true;
    commitRatings();
    if (favorites.indexOf(name) >= 0 || validation.overrides[name] === true || listed(name)) return;
    if (++skippedInARow >= GIVE_UP_AFTER) return fail("too slow on this TV");
    onNotice("Too slow, skipped: " + name);
    step(1, 0);
  }

  function start(canvas) {
    // If the TV dies inside Butterchurn, this flag is still set on the next
    // launch and MilkDrop is skipped.
    savePref("milkdropPending", true);
    loading = Promise.all(SCRIPTS.map(loadScript))
      .then(() => {
        const api = window.butterchurn.default || window.butterchurn;
        presets = window.vizmanPresets || {};
        validation.bench = window.vizmanPresetBench || {};
        names = Object.keys(presets).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        if (!names.length) throw new Error("no presets in the package");
        index = Math.max(0, names.indexOf(loadPref("preset", "")));
        if (!listed(names[index])) index = Math.max(0, names.findIndex(listed));
        const options = { width: canvas.width, height: canvas.height, pixelRatio: 1, meshWidth: 32, meshHeight: 24 };
        // Butterchurn only uses the audio context to tap live audio; the
        // waveform is handed to render() instead.
        visualizer = api.createVisualizer(null, canvas, options);
        // The GL context lives on Butterchurn's own canvas; ours only gets
        // the 2D blit.
        (visualizer.internalCanvas || canvas).addEventListener("webglcontextlost", (event) => {
          event.preventDefault();
          fail("graphics context lost");
        });
        showIndexed(0);
      })
      .catch((error) => fail(describe(error)));
  }

  return {
    scale: SCALE,
    create({ canvas }) {
      if (visualizer) {
        visualizer.setRendererSize(canvas.width, canvas.height);
        onNotice(current);
      }
      return {
        draw(f) {
          // Started on the first frame of audio, not on entering the mode, so
          // an idle screen never counts as a start that failed.
          if (!loading) start(canvas);
          if (!visualizer || failed) return;
          try {
            const wave = f.analysis.wave;
            visualizer.render({ audioLevels: { timeByteArray: wave, timeByteArrayL: wave, timeByteArrayR: wave } });
          } catch (error) {
            return fail(describe(error));
          }
          if (++frames === PROVEN_FRAMES) savePref("milkdropPending", false);
          if (scanning) return; // the scan does its own timing
          sincePreset += f.dt;
          watchFrameRate(f.dt);
          if (rotateSeconds && sincePreset >= rotateSeconds) random();
        },
      };
    },
    step,
    fail,
    // Jump to a preset by name, browsing the full list from there.
    select(name) {
      const at = names.indexOf(name);
      if (!visualizer || at < 0) return false;
      setList("all");
      index = at;
      showIndexed(BLEND_SECONDS);
      return true;
    },
    // Show a preset that is not in the package (used to measure candidates).
    // It is never skipped, so its true frame rate can be read.
    showExternal(name, preset) {
      if (!visualizer) return false;
      watching = false;
      show(name, preset, 0);
      return true;
    },
    // Called when the page is hidden or closed normally: a start that got
    // this far did not take the TV down.
    settle() {
      if (loading && !failed) savePref("milkdropPending", false);
    },
    // Re-read the lists after preferences arrived from elsewhere.
    reloadPrefs() {
      favMeta = loadFavorites();
      favorites = favoriteNames(favMeta);
      list = loadList();
      rotateSeconds = loadPref("presetRotate", DEFAULT_ROTATE);
      randomOrder = loadPref("presetRandom", true);
      validation.rated = loadPref("rated", {});
      validation.overrides = loadPref("validatedOverrides", {});
      validation.validateFps = loadPref("validateFps", DEFAULT_VALIDATE_FPS);
      colorMode = loadPref("color", "default");
      colorStrength = loadPref("colorStrength", DEFAULT_COLOR_STRENGTH);
      applyColor();
    },
    // Add or remove the current preset; returns whether it is now a favorite.
    toggleFavorite() {
      if (!current) return false;
      const on = favorites.indexOf(current) < 0;
      favMeta = Object.assign({}, favMeta);
      favMeta[current] = { on, at: Date.now() };
      favorites = favoriteNames(favMeta);
      savePref("favoritesMeta", favMeta);
      return on;
    },
    // Put the current preset into, or take it out of, the validated list by
    // hand; returns whether it is now validated.
    toggleValidated() {
      if (!current) return false;
      validation.overrides = toggleValidated(current, validation);
      savePref("validatedOverrides", validation.overrides);
      return isValidated(current, validation);
    },
    get isFavorite() {
      return favorites.indexOf(current) >= 0;
    },
    get isValidated() {
      return !!current && isValidated(current, validation);
    },
    // "yes (52 fps)", "no (by you)", "not tested": for the Validated row.
    get validationText() {
      return current ? describeValidation(current, validation) : "";
    },
    get favoriteCount() {
      return favorites.length;
    },
    get validatedCount() {
      return countValidated(names, validation);
    },
    get presetCount() {
      return names.length;
    },
    get list() {
      return list;
    },
    set list(next) {
      setList(next);
    },
    // How many presets the list being browsed holds.
    get listCount() {
      return listedNames().length;
    },
    get validateFps() {
      return validation.validateFps;
    },
    set validateFps(fps) {
      validation.validateFps = fps;
      savePref("validateFps", fps);
    },
    get randomOrder() {
      return randomOrder;
    },
    set randomOrder(on) {
      randomOrder = on;
      savePref("presetRandom", on);
    },
    get rotateSeconds() {
      return rotateSeconds;
    },
    set rotateSeconds(seconds) {
      rotateSeconds = seconds;
      savePref("presetRotate", seconds);
    },
    // "default" or "art": whether presets take their colors from the album art.
    get colorMode() {
      return colorMode;
    },
    set colorMode(mode) {
      colorMode = mode;
      savePref("color", mode);
      applyColor();
    },
    // Percent of the way toward the album art's colors.
    get colorStrength() {
      return colorStrength;
    },
    set colorStrength(percent) {
      colorStrength = percent;
      savePref("colorStrength", percent);
      applyColor();
    },
    // The current track's palette from Music Assistant (live.js), or null.
    setPalette(next) {
      palette = next;
      applyColor();
    },
    get ready() {
      return visualizer !== null && !failed;
    },
    get failed() {
      return failed;
    },
    get presetName() {
      return visualizer ? current : loading ? "loading" : "";
    },
    // "n/total", counted within the list being browsed.
    get presetPosition() {
      if (!visualizer) return "";
      const all = listedNames();
      const at = all.indexOf(current);
      return at < 0 ? "-/" + all.length : at + 1 + "/" + all.length;
    },

    // --- the preset scan (scan.js) ---
    // Every preset name, in the order a scan should measure them.
    scanOrder() {
      return scanOrder(names, validation);
    },
    // Known frame rate for a preset, or undefined.
    ratingOf(name) {
      return ratingOf(name, validation);
    },
    // Load a preset for measuring: no blend, no save, no announcement.
    showForScan(name) {
      if (!visualizer || !(name in presets)) return false;
      watching = false;
      show(name, presets[name], 0);
      return true;
    },
    // Record a measurement; written to the preferences by commitRatings, so a
    // scan can record hundreds without saving each one.
    rate(name, fps) {
      validation.rated = Object.assign({}, validation.rated);
      validation.rated[name] = Math.round(fps);
      ratingsDirty = true;
    },
    commitRatings,
    get scanning() {
      return scanning;
    },
    set scanning(on) {
      scanning = on;
    },
    // Back to the chosen preset after a scan; if it fell out of the list being
    // browsed, on to the next one that is in it.
    resume() {
      if (!visualizer) return;
      if (listed(names[index])) showIndexed(0);
      else step(1, 0);
    },
  };
}
