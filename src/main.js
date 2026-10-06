import "./polyfills.js";
import { createAnalysis } from "./analysis.js";
import { createDebug } from "./debug.js";
import { startDevlink } from "./devlink.js";
import { startDrift } from "./drift.js";
import { createEngine } from "./engine.js";
import { createKeepAwake } from "./keepawake.js";
import { exitApp, installKeys } from "./keys.js";
import { createLive } from "./live.js";
import { createMenu } from "./menu.js";
import { createMock } from "./mock.js";
import { classicModes, classicOptions } from "./modes/classic.js";
import { ROTATE_CHOICES, clearMilkdropBlocks, createMilkdropMode, hasWebGL2, milkdropBlocker } from "./modes/milkdrop.js";
import { wavescopeModes, wavescopeOptions } from "./modes/wavescope.js";
import { allPrefs, favoriteNames, loadPref, mergeFavorites, mergePrefs, mergeSettings, normalizeParams, onPrefChange, parseQuery, readLaunchParams, savePref, takePrefs } from "./settings.js";

const TRIM_STEP_MS = 25;
const MESSAGE_REFRESH_MS = 1000;
const HINT_MS = 3000;
const TOAST_MS = 3500;
const TRACK_CARD_MS = 9000;
const TRACK_MODES = ["start", "always", "off"];

let booted = false;

function boot(event) {
  if (booted) return;
  booted = true;

  const settings = mergeSettings(
    window.VIS_CONFIG || {},
    readLaunchParams(window, event),
    parseQuery(location.search),
    location.origin
  );
  const byId = (id) => document.getElementById(id);

  // A line of text that fades: the visualizer or preset just switched to,
  // a favorite added, settings synced. Shown only with the debug readout on;
  // otherwise the screen carries nothing but the visuals and the track card.
  let toastTimer = 0;
  let debug = null; // the readout, created once the engine exists
  function toast(text, always) {
    if (!always && (!debug || !debug.visible)) return;
    const element = byId("toast");
    element.textContent = text;
    element.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (element.style.opacity = "0"), TOAST_MS);
  }
  // The track card: artist, "title", album, label, lower left, as MTV
  // captioned videos. Shown for a while when a track starts, or always.
  const trackCard = byId("track");
  let trackMode = loadPref("trackInfo", "start");
  let trackTimer = 0;
  function fillTrackCard(track) {
    byId("track-artist").textContent = track.artist;
    byId("track-title").textContent = track.title ? "\u201c" + track.title + "\u201d" : "";
    byId("track-album").textContent = track.album + (track.year ? " (" + track.year + ")" : "");
    byId("track-label").textContent = track.label;
  }
  function showTrackCard(track, timed) {
    clearTimeout(trackTimer);
    if (!track || trackMode === "off") {
      trackCard.className = "";
      return;
    }
    fillTrackCard(track);
    trackCard.className = "shown";
    if (timed) trackTimer = setTimeout(() => (trackCard.className = ""), TRACK_CARD_MS);
  }
  function applyTrackMode() {
    const track = live ? live.track : null;
    showTrackCard(track, trackMode === "start");
  }

  const canvas = byId("canvas");
  const message = byId("message");
  const hint = byId("hint");
  const isTv = /Web0S|webOS/i.test(navigator.userAgent);
  const configured = !!(settings.host && settings.token);
  let holdWhenIdle = loadPref("holdWhenIdle", settings.holdWhenIdle);

  // Which TV this is, for its own settings on the account: the TV's serial
  // number when webOS tells us, else a random id kept on the TV.
  settings.deviceId = loadPref("deviceId", "");
  if (!settings.deviceId) {
    const system = window.webOSSystem || window.PalmSystem;
    const info = normalizeParams(system && system.deviceInfo);
    settings.deviceId = String(info.serialNumber || info.serial_number || "") || "tv-" + Math.random().toString(36).slice(2, 10);
    savePref("deviceId", settings.deviceId);
  }

  const analysis = createAnalysis();
  analysis.autoLevel = loadPref("autoLevel", true);
  classicOptions.album = loadPref("classicAlbum", false);
  const live = settings.mock || !configured ? null : createLive(settings);
  const source = settings.mock ? createMock() : live || { wave: () => null };
  const engine = createEngine({ canvas, glCanvas: byId("gl"), analysis, source });
  engine.setFpsCap(loadPref("fpsCap", 60));

  // MilkDrop goes into the rotation only if it may run; every failure takes
  // it back out and falls back to the classic analyzer.
  let milkdropOff = settings.noWebgl ? "no WebGL2" : milkdropBlocker();
  const milkdrop = createMilkdropMode((reason) => {
    milkdropOff = reason;
    debug.record("MilkDrop off: " + reason);
    engine.remove("milkdrop");
    toast("MilkDrop off: " + reason);
  }, toast);
  engine.register(classicModes);
  engine.register(wavescopeModes);
  if (!milkdropOff) engine.register([milkdrop]);
  if (live) live.onTrack((track) => showTrackCard(track, trackMode === "start"));

  // Preferences are mirrored to the Music Assistant user. Whatever arrives
  // from there fills in what this TV does not have (after a reinstall, say),
  // and every change is sent back.
  function applyPrefs() {
    analysis.autoLevel = loadPref("autoLevel", true);
    classicOptions.album = loadPref("classicAlbum", false);
    holdWhenIdle = loadPref("holdWhenIdle", settings.holdWhenIdle);
    engine.setFpsCap(loadPref("fpsCap", 60));
    milkdrop.reloadPrefs();
    if (live) live.reloadTrim();
    // The track card is re-shown only if its setting actually changed, not
    // on every sync with the account.
    const nextTrackMode = loadPref("trackInfo", "start");
    if (nextTrackMode !== trackMode) {
      trackMode = nextTrackMode;
      applyTrackMode();
    }
  }
  if (live) {
    let firstRemote = true;
    live.onRemotePrefs((shared, device) => {
      // Per-TV settings only fill in what is missing. Shared lists take on
      // what the account has that this device lacks; nothing is ever removed
      // locally by a read, so a stale copy from the server cannot lose work.
      let changed = mergePrefs(device);
      let favoriteNote = "";
      if (shared.favoritesMeta) {
        const mine = loadPref("favoritesMeta", null) || {};
        const merged = mergeFavorites(mine, shared.favoritesMeta);
        if (merged !== mine) {
          const before = favoriteNames(mine);
          const after = favoriteNames(merged);
          const added = after.filter((n) => before.indexOf(n) < 0).length;
          const removed = before.filter((n) => after.indexOf(n) < 0).length;
          takePrefs({ favoritesMeta: merged });
          changed.push("favorites");
          favoriteNote = " (" + (added ? "+" + added : "") + (added && removed ? " " : "") + (removed ? "-" + removed : "") + ")";
        }
      }
      if (changed.length) {
        applyPrefs();
        toast((firstRemote ? "Settings restored: " : "Updated from the account: ") + changed.join(", ") + favoriteNote);
      }
      if (firstRemote) live.savePrefs(allPrefs());
      firstRemote = false;
    });
    onPrefChange((snapshot) => live.savePrefs(snapshot));
  }

  engine.onModeChange((mode) => {
    savePref("mode", mode.id);
    if (mode !== milkdrop) toast(mode.name); // MilkDrop announces its preset instead
  });

  // Veto the screensaver only while this page is on screen and has something
  // to show (or was asked to hold the screen while idle).
  const keepAwake = createKeepAwake(() => !document.hidden && (!engine.idle || holdWhenIdle));
  keepAwake.start();

  const menu = createMenu(byId("menu"), [
    {
      label: "Visualizer",
      value: () => (engine.mode ? engine.mode.name : ""),
      change: (direction) => (direction < 0 ? engine.prev() : engine.next()),
    },
    {
      label: "Preset",
      visible: () => engine.mode === milkdrop,
      value: () => milkdrop.presetPosition + "  " + milkdrop.presetName,
      change: (direction) => milkdrop.step(direction),
    },
    {
      label: "Favorite",
      visible: () => engine.mode === milkdrop && milkdrop.ready,
      value: () => (milkdrop.isFavorite ? "\u2605 yes" : "no"),
      change: () => toast(milkdrop.toggleFavorite() ? "\u2605 Added to favorites" : "Removed from favorites", true),
    },
    {
      label: "Preset list",
      visible: () => engine.mode === milkdrop,
      value: () => (milkdrop.onlyFavorites ? "favorites (" + milkdrop.favoriteCount + ")" : "all"),
      change() {
        milkdrop.onlyFavorites = !milkdrop.onlyFavorites;
        if (milkdrop.onlyFavorites && !milkdrop.favoriteCount) toast("No favorites yet: showing all presets");
      },
    },
    {
      label: "Preset order",
      visible: () => engine.mode === milkdrop,
      value: () => (milkdrop.randomOrder ? "random" : "in order"),
      change: () => (milkdrop.randomOrder = !milkdrop.randomOrder),
    },
    {
      label: "Change preset",
      visible: () => engine.mode === milkdrop,
      value: () => (milkdrop.rotateSeconds ? "every " + (milkdrop.rotateSeconds < 60 ? milkdrop.rotateSeconds + " s" : milkdrop.rotateSeconds / 60 + " min") : "never"),
      change(direction) {
        const at = ROTATE_CHOICES.indexOf(milkdrop.rotateSeconds);
        milkdrop.rotateSeconds = ROTATE_CHOICES[(at + direction + ROTATE_CHOICES.length) % ROTATE_CHOICES.length];
      },
    },
    {
      label: "Slow presets",
      visible: () => engine.mode === milkdrop && milkdrop.slowCount > 0,
      value: () => milkdrop.slowCount + " skipped (OK to try them again)",
      change: () => milkdrop.forgetSlow(),
    },
    {
      label: "MilkDrop",
      visible: () => !!milkdropOff && hasWebGL2() && !settings.noWebgl,
      value: () => "off: " + milkdropOff + " (OK to retry)",
      change() {
        clearMilkdropBlocks();
        savePref("mode", "milkdrop");
        location.reload();
      },
    },
    {
      label: "Track info",
      visible: () => !!live,
      value: () => ({ start: "at track start", always: "always", off: "off" })[trackMode],
      change(direction) {
        trackMode = TRACK_MODES[(TRACK_MODES.indexOf(trackMode) + direction + TRACK_MODES.length) % TRACK_MODES.length];
        savePref("trackInfo", trackMode);
        applyTrackMode();
      },
    },
    {
      label: "Sync trim",
      visible: () => !!live,
      value: () => (live.trimMs > 0 ? "+" : "") + live.trimMs + " ms",
      change: (direction) => live.nudgeTrim(direction * TRIM_STEP_MS),
    },
    {
      label: "Winamp colours",
      value: () => (classicOptions.album ? "from album" : "classic"),
      change() {
        classicOptions.album = !classicOptions.album;
        savePref("classicAlbum", classicOptions.album);
      },
    },
    {
      label: "Auto level",
      value: () => (analysis.autoLevel ? "on" : "off"),
      change() {
        analysis.autoLevel = !analysis.autoLevel;
        savePref("autoLevel", analysis.autoLevel);
      },
    },
    {
      label: "Frame rate cap",
      value: () => engine.fpsCap + " fps",
      change() {
        engine.setFpsCap(engine.fpsCap === 60 ? 30 : 60);
        savePref("fpsCap", engine.fpsCap);
      },
    },
    {
      label: "Hold screen when idle",
      value: () => (holdWhenIdle ? "on" : "off"),
      change() {
        holdWhenIdle = !holdWhenIdle;
        savePref("holdWhenIdle", holdWhenIdle);
      },
    },
    { label: "Debug readout", value: () => (debug.visible ? "on" : "off"), change: () => debug.show(!debug.visible) },
    { label: "Close menu", change: () => menu.close() },
  ]);

  debug = createDebug(byId("debug"), () =>
    Object.assign(
      {
        version: typeof VIZ_VERSION === "string" ? VIZ_VERSION : "dev",
        mode: engine.mode ? engine.mode.name : "-",
        preset: engine.mode === milkdrop ? milkdrop.presetPosition + " " + milkdrop.presetName : "-",
        slowPresets: milkdrop.slowCount,
        favorites: milkdrop.favoriteCount + (milkdrop.onlyFavorites ? " (browsing favorites)" : ""),
        prefsSaved: Object.keys(allPrefs()).length + " keys, device " + settings.deviceId,
        track: live && live.track ? live.track.artist + " / " + live.track.title : "-",
        trackInfo: trackMode + (trackCard.className === "shown" ? ", card shown" : ""),
        fps: engine.fps + " (cap " + engine.fpsCap + ")",
        canvas: (engine.mode && engine.mode.gl ? byId("gl").width + "x" + byId("gl").height + " gl" : canvas.width + "x" + canvas.height),
        window: window.innerWidth + "x" + window.innerHeight,
        webgl2: hasWebGL2() ? "yes" + (milkdropOff ? ", MilkDrop off: " + milkdropOff : "") : "no",
        source: settings.mock ? "mock" : live ? "live" : "not configured",
        idle: engine.idle + (engine.idle ? " (" + message.textContent + ")" : ""),
        scripts: document.scripts.length,
        gain: analysis.autoLevel ? "x" + analysis.gain.toFixed(1) : "off",
        menu: menu.describe(),
      },
      live ? live.status() : {},
      { keepAwake: keepAwake.status, agent: navigator.userAgent }
    )
  );
  debug.show(settings.debug);

  function refreshMessage() {
    if (!engine.idle) {
      message.style.display = "none";
      return;
    }
    message.textContent = !configured && !settings.mock ? "Not configured" : (live && live.problem) || "Waiting for music";
    message.style.display = "block";
  }
  engine.onIdleChange(refreshMessage);
  setInterval(refreshMessage, MESSAGE_REFRESH_MS);

  function onKey(name) {
    if (menu.handleKey(name)) return;
    if (name === "right") engine.next();
    else if (name === "left") engine.prev();
    else if (name === "up" && engine.mode === milkdrop) milkdrop.step(1);
    else if (name === "down" && engine.mode === milkdrop) milkdrop.step(-1);
    else if (name === "ok") menu.open();
    else if (name === "red" && live) live.nudgeTrim(-TRIM_STEP_MS);
    else if (name === "green" && live) live.nudgeTrim(TRIM_STEP_MS);
    else if (name === "yellow" && engine.mode === milkdrop && milkdrop.ready) {
      toast(milkdrop.toggleFavorite() ? "\u2605 Added to favorites" : "Removed from favorites", true);
    } else if (name === "blue" && engine.mode === milkdrop) {
      milkdrop.onlyFavorites = !milkdrop.onlyFavorites;
      toast(milkdrop.onlyFavorites ? (milkdrop.favoriteCount ? "Favorites (" + milkdrop.favoriteCount + ")" : "No favorites yet: all presets") : "All presets");
    }
    else if (name === "back") exitApp();
  }
  installKeys(onKey);

  // Moving the Magic Remote pointer shows how to reach the menu.
  let hintTimer = 0;
  function showHint() {
    if (menu.isOpen) return;
    hint.style.opacity = "1";
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (hint.style.opacity = "0"), HINT_MS);
  }
  document.addEventListener("mousemove", showHint);
  document.addEventListener("cursorStateChange", (change) => {
    if (change.detail && change.detail.visibility) showHint();
  });
  hint.addEventListener("click", () => menu.open());

  startDrift([byId("stage"), message, trackCard]);

  startDevlink({
    base: settings.report,
    client: isTv ? "tv" : "browser",
    getStatus: debug.status,
    engine,
    onCommand(command) {
      if (command.type === "key") onKey(command.key);
      else if (command.type === "mode") engine.setModeById(command.id);
      else if (command.type === "debug") debug.show(!!command.on);
      else if (command.type === "floor") wavescopeOptions.floor = !!command.on;
      else if (command.type === "blank") wavescopeOptions.blank = !!command.on;
      else if (command.type === "preset") milkdrop.showExternal(command.name, command.preset);
      else if (command.type === "goto") milkdrop.select(command.name);
    },
  });

  // A hidden app is suspended by webOS and its sockets may die unnoticed, so
  // drop everything when hidden and start afresh when shown again.
  function resume() {
    if (engine.running) return;
    if (live) live.start();
    engine.start();
  }
  function suspend() {
    engine.stop();
    if (live) live.stop();
    milkdrop.settle();
  }
  function onVisibility() {
    if (document.hidden) suspend();
    else resume();
  }
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("webkitvisibilitychange", onVisibility);
  window.addEventListener("pagehide", () => milkdrop.settle());
  document.addEventListener("webOSRelaunch", (relaunch) => {
    // Relaunched with parameters (a different player, say): start over so
    // they are read the same way as on a first launch.
    if (Object.keys(normalizeParams(relaunch.detail)).length) return location.reload();
    suspend();
    resume();
  });

  // Start on the last visualizer used; failing that MilkDrop, then the bars.
  if (!engine.setModeById(loadPref("mode", "")) && !engine.setModeById("milkdrop")) engine.setMode(0);
  if (document.hidden) refreshMessage();
  else resume();
}

// webOS delivers launch parameters with webOSLaunch on some firmware and not
// at all on others, so boot on whichever comes first.
document.addEventListener("webOSLaunch", boot);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => boot());
else boot();
