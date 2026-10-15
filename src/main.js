import "./polyfills.js";
import { createPlayerView } from "./player-view.js";
import { createMockPlayback } from "./mock-playback.js";
import { createAnalysis } from "./analysis.js";
import { renewIfDue, shouldForget } from "./auth.js";
import { createBedtime, createBedtimeController } from "./bedtime.js";
import { createDebug } from "./debug.js";
import { startDevlink } from "./devlink.js";
import { createDrift } from "./drift.js";
import { createEngine } from "./engine.js";
import { createIdle } from "./idle-view.js";
import { createKeepAwake } from "./keepawake.js";
import { exitApp, installKeys, remoteAction } from "./keys.js";
import { createLive } from "./live.js";
import { createLogin } from "./login.js";
import { getPlayerDelay, listTokens, renewToken, setPlayerDelay, signOut } from "./ma.js";
import { createMenu } from "./menu.js";
import { drawSync, timingLabel } from "./sync-figure.js";
import { COLOR_MODES, COLOR_STRENGTHS, ROTATE_CHOICES, SCALE_CHOICES, clearMilkdropBlocks, createMilkdropMode, hasWebGL2, milkdropBlocker } from "./milkdrop.js";
import { createMock } from "./mock.js";
import { createRelaunchHandler } from "./relaunch.js";
import { createPresetLocks, lockKeys } from "./preset-lock.js";
import { timeLabel } from "./playback.js";
import { createScan, recoverScan } from "./scan.js";
import { SendspinPlayer } from "@sendspin/sendspin-js";
import { createSpeaker, playerIdFor, toggledSpeaker } from "./speaker.js";
import { allPrefs, clearPref, favoriteNames, loadPref, mergeFavorites, mergePrefs, mergeSettings, normalizeParams, onPrefChange, parseQuery, readLaunchParams, savePref, takePrefs } from "./settings.js";
import { LISTS, VALIDATE_CHOICES } from "./validation.js";

const TRIM_STEP_MS = 25;
const MESSAGE_REFRESH_MS = 1000;
const HINT_MS = 3000;
const TOAST_MS = 3500;
const TRACK_CARD_MS = 9000;
const BEDTIME_TICK_MS = 1000; // also how soon a preset lock follows a new track
const TRACK_MODES = ["start", "always", "off"];
const DIM_CHOICES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]; // percent
const RENEW_CHECK_MS = 8000; // after launch

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

  // Which TV this is, for its own settings on the account and for the name of
  // its token: the TV's serial number when webOS tells us, else a random id
  // kept on the TV.
  const system = window.webOSSystem || window.PalmSystem;
  const info = normalizeParams(system && system.deviceInfo);
  settings.deviceId = loadPref("deviceId", "");
  if (!settings.deviceId) {
    settings.deviceId = String(info.serialNumber || info.serial_number || "") || "tv-" + Math.random().toString(36).slice(2, 10);
    savePref("deviceId", settings.deviceId);
  }
  const isTv = /Web0S|webOS/i.test(navigator.userAgent);
  const deviceName = "Afterglow on " + (info.modelName || (isTv ? "TV" : "browser")) + " (" + settings.deviceId.slice(-6) + ")";

  // Credentials: a development override (query string, launch parameters or
  // the build config) wins; otherwise what the sign-in form stored.
  const auth = loadPref("auth", null);
  const devOverride = !!(settings.host && settings.token);
  if (!devOverride && auth && auth.host && auth.token) {
    settings.host = auth.host;
    settings.token = auth.token;
  }
  const login = createLogin(byId("login"), {
    deviceName,
    onSignedIn(result) {
      savePref("auth", result);
      location.reload();
    },
  });

  if (!settings.mock && !(settings.host && settings.token)) {
    login.show({ host: auth ? auth.host : "", user: auth ? auth.user : "" });
    installKeys((name) => {
      if (login.handleKey(name)) return;
      if (name === "back") exitApp();
    });
    return;
  }
  start(settings, { byId, isTv, login, auth: devOverride ? null : auth, deviceName });
}

function start(settings, { byId, isTv, login, auth, deviceName }) {
  // A line of text that fades: the preset just switched to, a favorite added,
  // settings synced. Shown only with the debug readout on, unless `always`;
  // otherwise the screen carries nothing but the visuals and the track card.
  let toastTimer = 0;
  let playerView = null;
  let debug = null; // the readout, created once the engine exists
  function toast(text, always) {
    if (!always && (!debug || !debug.visible)) return;
    const element = byId("toast");
    element.textContent = text;
    element.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (element.style.opacity = "0"), TOAST_MS);
  }
  // The track card: title, artist, album, label, lower left, a flat field
  // in the artwork's colour. Shown for a while when a track starts, or always.
  const trackCard = byId("track");
  let trackMode = loadPref("trackInfo", "start");
  let trackTimer = 0;
  function fillTrackCard(track) {
    byId("track-artist").textContent = track.artist;
    byId("track-title").textContent = track.title || "";
    byId("track-album").textContent = track.album + (track.year ? " (" + track.year + ")" : "");
    byId("track-label").textContent = track.label;
  }
  function showTrackCard(track, timed) {
    clearTimeout(trackTimer);
    if (!track || trackMode === "off") return setTrackCardShown(false);
    fillTrackCard(track);
    setTrackCardShown(true);
    if (timed) trackTimer = setTimeout(() => setTrackCardShown(false), TRACK_CARD_MS);
  }
  function setTrackCardShown(shown) {
    trackCard.classList.toggle("shown", shown);
    stackLyricOverlay();
  }
  // The lyric overlay and the card share the lower left corner: while the
  // card shows, the overlay sits on top of it, a gutter above.
  function stackLyricOverlay() {
    const overlay = document.querySelector(".lyric-overlay");
    if (!overlay) return;
    const cardShown = trackCard.classList.contains("shown") && trackCard.style.display !== "none";
    overlay.style.bottom = cardShown ? "calc(6vh + " + trackCard.offsetHeight + "px + 1.4vh)" : "";
  }
  function applyTrackMode() {
    const track = live ? live.track : null;
    showTrackCard(track, trackMode === "start");
  }

  const canvas = byId("gl");
  const message = byId("message");
  const hint = byId("hint");
  let holdWhenIdle = loadPref("holdWhenIdle", settings.holdWhenIdle);

  // Dimming: a black veil over the picture, and another over the track card.
  let dimViz = loadPref("dimViz", 0);
  let dimTrack = loadPref("dimTrack", 0);
  function applyDim() {
    canvas.style.opacity = String(1 - dimViz / 100);
    trackCard.style.opacity = String(1 - dimTrack / 100);
    const scene = document.querySelector(".poster");
    const lyricOverlay = document.querySelector(".lyric-overlay");
    if (scene) scene.style.opacity = String(1 - dimTrack / 100);
    if (lyricOverlay) lyricOverlay.style.opacity = String(1 - dimTrack / 100);
  }
  function setDimViz(percent) {
    dimViz = Math.max(0, Math.min(DIM_CHOICES[DIM_CHOICES.length - 1], percent));
    savePref("dimViz", dimViz);
    applyDim();
  }
  function setDimTrack(percent) {
    dimTrack = Math.max(0, Math.min(DIM_CHOICES[DIM_CHOICES.length - 1], percent));
    savePref("dimTrack", dimTrack);
    applyDim();
  }
  function stepChoice(choices, value, direction) {
    const at = Math.max(0, choices.indexOf(value));
    return choices[(at + direction + choices.length) % choices.length];
  }
  applyDim();

  // A scan that was measuring a preset when the TV last died: mark it.
  const crashed = recoverScan();

  const analysis = createAnalysis();
  analysis.autoLevel = loadPref("autoLevel", false);
  const live = settings.mock ? null : createLive(settings);
  // This TV as a speaker too (speaker.js): the `speaker` launch parameter (a
  // player name, `speakerId` optional) wins over the menu's choice.
  const speaker = settings.mock ? null : createSpeaker({
        host: settings.host,
        Player: SendspinPlayer,
        delays: {
          get: (playerId) => getPlayerDelay({ host: settings.host, token: settings.token, playerId }),
          set: (playerId, delayMs) => setPlayerDelay({ host: settings.host, token: settings.token, playerId, delayMs }),
        },
      });
  if (speaker) {
    const chosen = settings.speaker ? { name: settings.speaker, id: settings.speakerId || playerIdFor(settings.speaker) } : loadPref("speaker", null);
    if (settings.speaker) savePref("speaker", chosen);
    if (chosen && chosen.name) {
      savePref("speakerLast", chosen); // what switching it on again comes back to
      speaker.set(chosen.name, chosen.id);
    }
  }
  // Commands from a cold start fall back to this TV's own speaker (follow.js target).
  if (live && speaker) live.setOwnPlayer(speaker.id);
  const source = settings.mock ? createMock() : live;
  const engine = createEngine({ canvas, analysis, source });
  engine.setFpsCap(loadPref("fpsCap", 30));

  // MilkDrop is the picture; when it cannot run the screen says why.
  let milkdropOff = settings.noWebgl ? "no WebGL2" : milkdropBlocker();
  const milkdrop = createMilkdropMode((reason) => {
    milkdropOff = reason;
    debug.record("MilkDrop off: " + reason);
    refreshMessage();
    toast("MilkDrop off: " + reason);
  }, toast);
  if (!milkdropOff) engine.setRenderer(milkdrop);
  if (live) {
    live.onTrack((track) => showTrackCard(track, trackMode === "start"));
    // The artwork palette colors the presets; one may have arrived already.
    live.onColor((p) => milkdrop.setPalette(p));
    milkdrop.setPalette(live.palette);
  }

  const scan = createScan({
    milkdrop,
    engine,
    source,
    overlay: byId("scan"),
    onNotice: (text) => toast(text, true),
    onDone(complete) {
      if (playerView) playerView.reloadPrefs();
      if (complete) toast("Scan done: " + milkdrop.validatedCount + " of " + milkdrop.presetCount + " validated at " + milkdrop.validateFps + " fps", true);
      else toast("Scan paused: continue it from the menu", true);
    },
  });

  // Preferences are mirrored to the Music Assistant user. Whatever arrives
  // from there fills in what this TV does not have (after a reinstall, say),
  // and every change is sent back.
  function applyPrefs() {
    analysis.autoLevel = loadPref("autoLevel", false);
    holdWhenIdle = loadPref("holdWhenIdle", settings.holdWhenIdle);
    engine.setFpsCap(loadPref("fpsCap", 30));
    dimViz = loadPref("dimViz", 0);
    dimTrack = loadPref("dimTrack", 0);
    applyDim();
    milkdrop.reloadPrefs();
    presetLocks.reload();
    if (playerView) playerView.reloadPrefs();
    if (live) {
      live.reloadTrim();
      live.reloadPreferred();
    }
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

  // Signing out: the TV's token is revoked on the account and forgotten here;
  // the sign-in form comes back. Also what happens when the token is refused.
  let leaving = false;
  // rejectedToken: the refused token; the stored sign-in is kept if it holds
  // a newer one.
  function forgetAndRelaunch(messageText, rejectedToken) {
    if (leaving) return;
    leaving = true;
    menu.close();
    if (playerView) playerView.stop();
    scan.stop();
    if (speaker) speaker.stop();
    if (live) live.stop();
    engine.stop();
    stopScreenTimers();
    if (shouldForget(loadPref("auth", null), rejectedToken)) clearPref("auth");
    login.show({ host: auth ? auth.host : settings.host, user: auth ? auth.user : "", message: messageText });
  }
  function logOut() {
    if (!auth) return toast("Signed in with a development token: nothing to log out of", true);
    menu.close();
    toast("Signing out…", true);
    signOut({ host: auth.host, token: auth.token, tokenName: auth.tokenName })
      .then(() => forgetAndRelaunch("Signed out. This TV's token was removed from the account."))
      .catch((e) => forgetAndRelaunch("Signed out here; the token could not be removed from the account (" + e.message + "). Remove it in Music Assistant's settings."));
  }
  if (live && auth) {
    live.onRejected((token) => {
      // Only the token in use counts: a renewed one has replaced the rest.
      if (token !== settings.token) return debug.record("refusal of a replaced token ignored");
      forgetAndRelaunch("Music Assistant no longer accepts this TV's token. Sign in again.", token);
    });
    // Long-lived tokens do not renew themselves: replace ours before it runs
    // out, moving everything over to the fresh one before the old is revoked.
    setTimeout(() => {
      renewIfDue({
        auth,
        listTokens,
        renewToken,
        onFresh(fresh) {
          auth.token = fresh;
          settings.token = fresh; // the speaker's delay calls read it from here
          savePref("auth", Object.assign({}, auth));
          live.setToken(fresh);
        },
      })
        .then((fresh) => fresh && debug.record("token renewed"))
        .catch((e) => debug.record("token check: " + e.message));
    }, RENEW_CHECK_MS);
  }

  // Veto the screensaver only while this page is on screen and has something
  // to show (or was asked to hold the screen while idle).
  const keepAwake = createKeepAwake(() => !document.hidden && (!engine.idle || holdWhenIdle || scan.running));
  keepAwake.start();

  const LIST_NAMES = { validated: "Runs well here", all: "All presets", favorites: "Favourite presets" };
  function listText() {
    const count = milkdrop.list === "favorites" ? milkdrop.favoriteCount : milkdrop.list === "validated" ? milkdrop.validatedCount : milkdrop.presetCount;
    return LIST_NAMES[milkdrop.list] + " · " + (count || (milkdrop.list === "validated" ? "None checked yet" : "None yet"));
  }
  function cycleList(direction) {
    milkdrop.list = stepChoice(LISTS, milkdrop.list, direction);
    if (milkdrop.list === "favorites" && !milkdrop.favoriteCount) toast("No favourite presets yet: showing all presets", true);
  }

  // Preset locks (preset-lock.js): this preset whenever this album or artist plays.
  function playingTrack() {
    return playerView ? playerView.snapshot().track : null;
  }
  const presetLocks = createPresetLocks({
    load: () => loadPref("presetLocks", {}),
    save: (locks) => savePref("presetLocks", locks),
    hold: (name) => milkdrop.hold(name),
  });
  function lockRow(kind) {
    const key = () => lockKeys(playingTrack())[kind];
    const locked = () => presetLocks.locked(key());
    const what = () => (kind === "album" ? playingTrack().album : playingTrack().artist);
    return {
      label: () => (locked() ? "Unlock preset for this " : "Lock preset for this ") + kind,
      visible: () => milkdrop.ready && !!key(),
      value: () => (locked() ? locked() : what()),
      change() {
        const name = locked() ? null : milkdrop.presetName;
        presetLocks.set(key(), name, playingTrack());
        toast(name ? "Preset locked for " + what() : "Preset unlocked for " + what(), true);
      },
    };
  }

  const menu = createMenu(byId("menu"), [
    { section: "Sound & sync" },
    {
      // Plays the music here as well as drawing it (speaker.js). The name is
      // the player's in Music Assistant.
      label: "Play on this TV",
      visible: () => !!speaker,
      value: () => (speaker.on ? speaker.name + " · " + speaker.state.charAt(0).toUpperCase() + speaker.state.slice(1) : "Off"),
      change() {
        const next = toggledSpeaker(speaker.on, loadPref("speakerLast", null));
        if (next) savePref("speakerLast", next);
        savePref("speaker", next);
        speaker.set(next ? next.name : "", next ? next.id : "");
        if (live) live.setOwnPlayer(speaker.id);
        if (engine.running) speaker.start();
      },
    },
    { visible: () => !!live, figure: (box) => drawSync(box, live.trimMs) },
    {
      // Compensates this TV's own output latency so its sound lands with the
      // other speakers: right sends it earlier, left later. Saved as the
      // player's delay in Music Assistant; not an offset on the sync figure.
      label: "TV output compensation",
      visible: () => !!speaker && speaker.on,
      value: () => (speaker.delayMs === null ? "…" : speaker.delayMs ? "Sound sent " + speaker.delayMs + " ms early" : "None"),
      change: (direction) => speaker.nudgeDelay(direction),
    },
    {
      label: "Picture and lyrics timing",
      visible: () => !!live,
      value: () => timingLabel(live.trimMs, "after the music", "before the music", "With the music"),
      change: (direction) => live.nudgeTrim(direction * TRIM_STEP_MS),
    },
    {
      // Stops the music after a while; the picture goes black in the meantime.
      label: "Bedtime",
      value: () => bedtime.label,
      change: (direction) => bedtime.cycle(direction),
    },
    { section: "Display" },
    {
      label: "Dim visualizer",
      value: () => dimViz + "%",
      change: (direction) => setDimViz(stepChoice(DIM_CHOICES, dimViz, direction)),
    },
    {
      label: "Track info",
      visible: () => !!live,
      value: () => ({ start: "When a song starts", always: "Always", off: "Off" })[trackMode],
      change(direction) {
        trackMode = stepChoice(TRACK_MODES, trackMode, direction);
        savePref("trackInfo", trackMode);
        applyTrackMode();
      },
    },
    {
      label: "Dim track info",
      visible: () => !!live,
      value: () => dimTrack + "%",
      change: (direction) => setDimTrack(stepChoice(DIM_CHOICES, dimTrack, direction)),
    },
    {
      label: "Hold screen when idle",
      value: () => (holdWhenIdle ? "On" : "Off"),
      change() {
        holdWhenIdle = !holdWhenIdle;
        savePref("holdWhenIdle", holdWhenIdle);
      },
    },
    {
      // Color the preset's waveform, borders and motion vectors from the
      // track's album art (the palette Music Assistant sends with the stream).
      label: "Color",
      visible: () => !!live,
      value: () => ({ default: "The preset’s own", art: "From the artwork" })[milkdrop.colorMode],
      change: (direction) => (milkdrop.colorMode = stepChoice(COLOR_MODES, milkdrop.colorMode, direction)),
    },
    {
      label: "Color strength",
      visible: () => !!live && milkdrop.colorMode === "art",
      value: () => milkdrop.colorStrength + "%",
      change: (direction) => (milkdrop.colorStrength = stepChoice(COLOR_STRENGTHS, milkdrop.colorStrength, direction)),
    },
    { section: "Visuals & presets" },
    {
      label: "Preset",
      visible: () => !milkdropOff,
      value: () => (milkdrop.presetName ? milkdrop.presetPosition + "  " + milkdrop.presetName : "Starts with the music"),
      change: (direction) => milkdrop.step(direction),
    },
    {
      label: "Favorite",
      visible: () => milkdrop.ready,
      value: () => (milkdrop.isFavorite ? "Yes" : "No"),
      change: () => toast(milkdrop.toggleFavorite() ? "Added to favourite presets" : "Removed from favourite presets", true),
    },
    lockRow("album"),
    lockRow("artist"),
    {
      // Whether this preset is in the validated list: by measurement, or by
      // the person's own say-so.
      label: "Validated",
      visible: () => milkdrop.ready,
      value: () => milkdrop.validationText,
      change: () => toast(milkdrop.toggleValidated() ? "Added to the validated presets" : "Removed from the validated presets", true),
    },
    {
      label: "Preset list",
      visible: () => !milkdropOff,
      value: listText,
      change: cycleList,
    },
    {
      label: "Preset order",
      visible: () => !milkdropOff,
      value: () => (milkdrop.randomOrder ? "Shuffled" : "In order"),
      change: () => (milkdrop.randomOrder = !milkdrop.randomOrder),
    },
    {
      label: "Change preset",
      visible: () => !milkdropOff,
      value: () => (milkdrop.rotateSeconds ? "Every " + (milkdrop.rotateSeconds < 60 ? milkdrop.rotateSeconds + " s" : milkdrop.rotateSeconds / 60 + " min") : "Never"),
      change: (direction) => (milkdrop.rotateSeconds = stepChoice(ROTATE_CHOICES, milkdrop.rotateSeconds, direction)),
    },
    {
      label: "Auto level",
      value: () => (analysis.autoLevel ? "On" : "Off"),
      change() {
        analysis.autoLevel = !analysis.autoLevel;
        savePref("autoLevel", analysis.autoLevel);
      },
    },
    {
      label: "MilkDrop",
      visible: () => !!milkdropOff && hasWebGL2() && !settings.noWebgl,
      value: () => "off: " + milkdropOff + " (OK to retry)",
      change() {
        clearMilkdropBlocks();
        reloadPage();
      },
    },
    { section: "Performance" },
    {
      // Fewer pixels for MilkDrop: less work for the TV, more left for Play on
      // this TV. Applies at once (the engine resizes the canvas).
      label: "Picture size",
      visible: () => !milkdropOff,
      value: () => ({ 0.5: "Full", 0.4: "Lighter", 0.33: "Lightest" })[milkdrop.scale] || "Full",
      change(direction) {
        milkdrop.scale = stepChoice(SCALE_CHOICES, milkdrop.scale, direction);
        engine.setRenderer(milkdrop);
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
      // Measures every preset's frame rate on this TV; see scan.js.
      label: "Scan presets",
      visible: () => !milkdropOff,
      value: () => scan.describe(),
      change() {
        menu.close();
        engine.setDrawing(true);
        scan.start();
      },
    },
    {
      label: "Validate above",
      visible: () => !milkdropOff,
      value: () => milkdrop.validateFps + " fps",
      change: (direction) => (milkdrop.validateFps = stepChoice(VALIDATE_CHOICES, milkdrop.validateFps, direction)),
    },
    { section: "Account & diagnostics" },
    { label: "Debug readout", value: () => (debug.visible ? "On" : "Off"), change: () => debug.show(!debug.visible) },
    { label: "Log out", visible: () => !!live, value: () => (auth ? auth.user + " @ " + auth.host : "dev token"), change: logOut },
  ], { onBack: () => playerView.open() });

  const playback = live || createMockPlayback();
  playerView = createPlayerView({
    root: byId("player"), live: playback, host: settings.host,
    engine, onSettings: () => menu.open(), onNotice: text => toast(text, true),
    onMode(mode) { trackCard.style.display = mode === "track" ? "" : "none"; stackLyricOverlay(); applyDim(); }
  });
  // While controls, Browse, a panel or Settings is open, the track card and
  // lyric overlay step aside (player.css .sheet-open).
  const markSheets = () => document.body.classList.toggle("sheet-open", playerView.isOpen || menu.isOpen);
  const sheetWatch = new MutationObserver(markSheets);
  sheetWatch.observe(byId("player"), { attributes: true, attributeFilter: ["class"] });
  sheetWatch.observe(byId("menu"), { attributes: true, attributeFilter: ["style"] });

  const bedtimeCover = document.createElement("div");
  bedtimeCover.id = "bedtime";
  document.body.appendChild(bedtimeCover);
  const bedtime = createBedtimeController({
    bedtime: createBedtime(),
    playback: playerView,
    setDark: (on) => {
      bedtimeCover.classList.toggle("dark", on);
      engine.setResting(on);
    },
  });
  function everySecond() {
    bedtime.tick();
    presetLocks.follow(playingTrack());
  }

  const idle = createIdle({
    element: byId("idle"), live: playback, host: settings.host,
    play: (media, option) => playerView.playMedia(media, option),
    resume: () => playerView.resume(),
    onBrowse() { playerView.openBrowse(); refreshMessage(); },
  });

  debug = createDebug(byId("debug"), () =>
    Object.assign(
      {
        version: typeof VIZ_VERSION === "string" ? VIZ_VERSION : "dev",
        preset: milkdrop.presetPosition + " " + milkdrop.presetName,
        list: listText() + ", validated " + milkdrop.validatedCount + "/" + milkdrop.presetCount + " at " + milkdrop.validateFps + " fps",
        favorites: milkdrop.favoriteCount,
        scan: scan.status(),
        dim: dimViz + "% picture, " + dimTrack + "% track info",
        color: milkdrop.colorMode + " " + milkdrop.colorStrength + "%" + (live && live.palette ? "" : ", no palette"),
        prefsSaved: Object.keys(allPrefs()).length + " keys, device " + settings.deviceId,
        account: auth ? auth.user + " @ " + auth.host + " as " + auth.tokenName : "development override",
        player: live && live.following ? live.following.name + " / " + live.following.queueId + " (" + live.following.reason + ")" : "-",
        track: live && live.track ? live.track.artist + " / " + live.track.title : "-",
        trackInfo: trackMode + (trackCard.classList.contains("shown") ? ", card shown" : ""),
        fps: engine.fps + " (cap " + engine.fpsCap + ")",
        canvas: canvas.width + "x" + canvas.height,
        window: window.innerWidth + "x" + window.innerHeight,
        webgl2: hasWebGL2() ? "yes" + (milkdropOff ? ", MilkDrop off: " + milkdropOff : "") : "no",
        source: settings.mock ? "mock" : "live",
        speaker: speaker && speaker.on ? speaker.id + " " + speaker.state + (speaker.error ? " (" + speaker.error + ")" : "") : "off",
        speakerSync: speaker ? speaker.stats : null,
        idle: engine.idle + (engine.idle ? " (" + message.textContent + ")" : ""),
        gain: analysis.autoLevel ? "x" + analysis.gain.toFixed(1) : "off",
        menu: menu.describe(),
      },
      live ? live.status() : {},
      { keepAwake: keepAwake.status, agent: navigator.userAgent }
    )
  );
  debug.show(settings.debug);
  // Read-only, bounded diagnostic snapshot for the TV soak tool. Deliberately
  // excludes credentials, account identity and track metadata.
  window.vizmanDiagnostics = () => ({
    version: typeof VIZ_VERSION === "string" ? VIZ_VERSION : "dev",
    preset: milkdrop.presetName,
    fps: engine.fps,
    fpsCap: engine.fpsCap,
    canvas: [canvas.width, canvas.height],
    rendering: engine.metrics,
    drawing: engine.drawing,
    viewMode: playerView.mode,
    speaker: speaker ? speaker.stats : null,
    idle: engine.idle,
  });
  if (crashed) {
    debug.record("scan: " + crashed + " took the TV down; marked not validated");
    toast("Scan: “" + crashed + "” crashed the TV and is marked not validated", true);
  }

  function refreshMessage() {
    idle.update(!(live && live.problem) && !playerView.isOpen && !menu.isOpen && !scan.running && !login.isOpen && !leaving);
    if (idle.showing) { message.style.display = "none"; return; }
    if (playerView && (playerView.mode === "album" || playerView.mode === "lyrics")) { message.style.display = "none"; return; }
    if (milkdropOff) {
      message.textContent = "MilkDrop can't run on this TV: " + milkdropOff + (hasWebGL2() ? " (OK, then MilkDrop, to retry)" : "");
      message.style.display = "block";
      return;
    }
    if (!engine.idle) {
      message.style.display = "none";
      return;
    }
    message.textContent = (live && live.problem) || "Waiting for music";
    message.style.display = "block";
  }
  engine.onIdleChange(refreshMessage);
  // Kept current while shown; stopped while hidden or signed out.
  let messageTimer = 0;
  let secondTimer = 0; // bedtime and preset locks
  function startScreenTimers() {
    if (!messageTimer) messageTimer = setInterval(refreshMessage, MESSAGE_REFRESH_MS);
    if (!secondTimer) secondTimer = setInterval(everySecond, BEDTIME_TICK_MS);
    drift.start();
  }
  function stopScreenTimers() {
    clearInterval(messageTimer);
    clearInterval(secondTimer);
    messageTimer = secondTimer = 0;
    drift.stop();
  }

  function onKey(name) {
    if (leaving) {
      if (login.handleKey(name)) return;
      if (name === "back") exitApp();
      return;
    }
    if (login.isOpen) {
      // Shown for a look by the test link: Back puts it away.
      if (name === "back") login.hide();
      else login.handleKey(name);
      return;
    }
    if (scan.running) {
      if (name === "back") scan.stop();
      return;
    }
    if (bedtime.wake()) return; // a black picture: the key only wakes it
    if (menu.handleKey(name)) return;
    if (playerView.handleKey(name)) return;
    if (idle.handleKey(name)) return;
    runKeyAction(remoteAction(name, keyContext()));
    menu.redraw(); // Settings, if open, shows what a colour key changed
  }
  function keyContext() {
    const mode = playerView.mode;
    const visualsShown = !milkdropOff && (mode === "visuals" || mode === "track" || loadPref("playerBackground", false));
    return { mode, visualsShown, milkdropReady: milkdrop.ready, milkdropOn: !milkdropOff, live: !!live, lyrics: playerView.snapshot().lyrics.status };
  }
  function seekBy(seconds) {
    const s = playerView.snapshot();
    if (!s.track || !s.track.duration) return toast("Seeking is unavailable for this stream", true);
    const to = Math.max(0, Math.min(s.track.duration, s.position + seconds));
    toast((seconds < 0 ? "Back " : "Ahead ") + Math.abs(seconds) + " s · " + timeLabel(to), true);
    playerView.command("seek", to);
  }
  function runKeyAction(action) {
    if (!action) return;
    if (action.do === "preset") milkdrop.step(action.by);
    else if (action.do === "dim") {
      setDimViz(dimViz + action.by);
      toast("Dim " + dimViz + "%", true);
    } else if (action.do === "seek") seekBy(action.by);
    else if (action.do === "lyricsPage") {
      const page = playerView.pageLyrics(action.by);
      if (page) toast("Lyrics page " + page.page + " of " + page.pages, true);
    } else if (action.do === "hint") {
      toast(playerView.mode === "lyrics" ? "Lyrics follow the song · ← → seek 10 s" : "← → seek 10 s · OK for controls", true);
    } else if (action.do === "favoriteSong") {
      playerView.command("favorite").then((ok) => ok || toast("Couldn’t add the song to favourites", true));
    } else if (action.do === "favoritePreset") {
      toast(milkdrop.toggleFavorite() ? "Added to favourite presets" : "Removed from favourite presets", true);
    } else if (action.do === "presetList") {
      cycleList(1);
      toast("Presets: " + listText(), true);
    } else if (action.do === "trim") live.nudgeTrim(action.by);
    else if (action.do === "controls") playerView.open();
    else if (action.do === "exit") exitApp();
  }
  installKeys(onKey);

  // Moving the Magic Remote pointer shows how to reach the menu.
  let hintTimer = 0;
  function showHint() {
    if (menu.isOpen || playerView.isOpen || scan.running || leaving) return;
    hint.style.opacity = "1";
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => (hint.style.opacity = "0"), HINT_MS);
  }
  document.addEventListener("mousemove", showHint);
  document.addEventListener("cursorStateChange", (change) => {
    if (change.detail && change.detail.visibility) showHint();
  });
  hint.addEventListener("click", () => playerView.open());

  const drift = createDrift([byId("stage"), byId("idle"), message, trackCard, document.querySelector(".poster"), document.querySelector(".lyric-overlay")]);

  startDevlink({
    base: settings.report,
    client: isTv ? "tv" : "browser",
    getStatus: debug.status,
    engine,
    onCommand(command, reply) {
      if (command.type === "key") onKey(command.key);
      else if (command.type === "dump") {
        // This TV's preset data, for comparing a scan with the benchmark.
        reply({ dump: { rated: loadPref("rated", {}), overrides: loadPref("validatedOverrides", {}), favorites: favoriteNames(loadPref("favoritesMeta", null) || {}), validateFps: milkdrop.validateFps } });
      }
      else if (command.type === "debug") debug.show(!!command.on);
      else if (command.type === "preset") milkdrop.showExternal(command.name, command.preset);
      else if (command.type === "goto") milkdrop.select(command.name);
      else if (command.type === "scan") (command.on === false ? scan.stop() : scan.start());
      else if (command.type === "login") {
        // Show the sign-in form as a first launch would, without signing out
        // (for screenshots); Back puts it away.
        if (command.on === false) login.hide();
        else login.show({ host: "", user: "" });
      }
    },
  });

  // A hidden app is suspended by webOS and its sockets may die unnoticed, so
  // drop everything when hidden and start afresh when shown again.
  function resume() {
    if (reloadWhenShown) return reloadPage();
    if (engine.running || leaving) return;
    if (live) live.start();
    if (speaker) speaker.start();
    playerView.start();
    engine.start();
    startScreenTimers();
  }
  function suspend() {
    stopScreenTimers();
    playerView.stop();
    scan.stop();
    engine.stop();
    if (live) live.stop();
    if (speaker) speaker.stop();
    milkdrop.settle();
  }
  function onVisibility() {
    if (document.hidden) suspend();
    else resume();
  }
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("webkitvisibilitychange", onVisibility);
  // The GL context is given back before the page goes, not left behind in
  // the web runtime (see milkdrop.js release).
  function releaseGraphics() {
    engine.stop();
    milkdrop.release();
  }
  function reloadPage() {
    releaseGraphics();
    location.reload();
  }
  // A lost GL context that comes back needs a fresh page; a hidden app gets
  // it when shown again.
  let reloadWhenShown = false;
  milkdrop.onRestored(() => {
    if (document.hidden) reloadWhenShown = true;
    else reloadPage();
  });
  window.addEventListener("pagehide", () => {
    playerView.stop();
    scan.stop();
    milkdrop.settle();
    releaseGraphics();
  });
  // Back from the page cache with its context released: start afresh.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) location.reload();
  });
  document.addEventListener("webOSRelaunch", createRelaunchHandler({ reload: reloadPage, resume }));

  refreshMessage();
  if (!document.hidden) resume();
}

// webOS delivers launch parameters with webOSLaunch on some firmware and not
// at all on others, so boot on whichever comes first.
document.addEventListener("webOSLaunch", boot);
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => boot());
else boot();
