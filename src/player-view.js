import { loadPref, savePref } from "./settings.js";
import { createPlayback, lyricIndex, timeLabel, trackInfo, VIEW_LABELS, VIEW_MODES } from "./playback.js";

// Drawn UI runs at 4 Hz, independently of the visualizer. Text only changes
// when its value changes; artwork is requested once per URL at 512 pixels.
export function createPlayerView({ root, live, host, engine, onSettings, onMode, onNotice }) {
  const model = createPlayback({ live, host });
  let mode = loadPref("viewMode", "track");
  if (VIEW_MODES.indexOf(mode) < 0) mode = "track";
  let background = loadPref("playerBackground", false);
  let overlay = loadPref("lyricsOverlay", false);
  let panel = "", focus = 1, timer = 0, hideAt = 0, trackKey = "", artUrl = "", lyricsKey = "", queueKey = "", optionKey = "";
  let sleepMinutes = 30, plainPage = 0;
  const paths = {
    previous: '<path d="M5 5v14M19 5L8 12l11 7z"/>',
    next: '<path d="M19 5v14M5 5l11 7-11 7z"/>',
    play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    back: '<path d="M10 6L4 12l6 6M20 6l-6 6 6 6"/>',
    forward: '<path d="M4 6l6 6-6 6M14 6l6 6-6 6"/>',
    queue: '<path d="M4 5h16M4 11h16M4 17h9M17 16l4 3-4 3z"/>',
    view: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + '</svg>';
  root.innerHTML = '<div class="player-ground"></div><section class="player-scene" aria-label="Now playing">' +
    '<div class="player-cover"><img alt="Album artwork"><div class="cover-empty">Music</div></div>' +
    '<div class="player-info"><h1></h1><p class="player-artist"></p><p class="player-album"></p><p class="player-next"></p></div>' +
    '<div class="player-lyrics" aria-label="Lyrics"></div></section><div class="lyric-overlay"></div>' +
    '<section class="player-controls" aria-label="Playback controls"><div class="control-heading"><span class="control-target"></span><span class="control-track"></span><span class="control-state"></span></div>' +
    '<div class="progress-row"><span class="elapsed">0:00</span><div class="progress-track" role="progressbar" aria-label="Track progress"><div></div></div><span class="duration">0:00</span></div>' +
    '<div class="transport"></div><div class="control-help">Arrows to choose · OK to select · Back to hide</div></section>' +
    '<section class="player-panel" aria-label="Player options"><header><h2></h2><button class="panel-close" aria-label="Close panel">Close</button></header><div class="panel-items"></div><p class="panel-note"></p></section>' +
    '<p class="player-error" role="status"></p>';
  const el = selector => root.querySelector(selector);
  function text(node, value) { const v = String(value == null ? "" : value); if (node.textContent !== v) node.textContent = v; }
  const toolbar = el(".transport");
  const actions = [
    ["previous", "Previous", () => command("previous")],
    ["pause", "Pause", () => command("play_pause")],
    ["next", "Next", () => command("next")],
    ["back", "Back 10s", () => command("seek", model.snapshot().position - 10)],
    ["forward", "Ahead 10s", () => command("seek", model.snapshot().position + 10)],
    ["queue", "Up next", () => openPanel("queue")],
    ["view", "Display", () => openPanel("display")],
    ["more", "Options", () => openPanel("options")]
  ];
  actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.innerHTML = icon(action[0]) + '<span></span>';
    text(button.lastChild, action[1]);
    button.setAttribute("aria-label", action[1]);
    button.addEventListener("click", () => { focus = index; action[2](); touch(); });
    toolbar.appendChild(button);
  });
  el(".panel-close").addEventListener("click", () => openControls());
  function touch() { hideAt = Date.now() + 9000; }
  function buttons() { return panel === "controls" ? Array.from(toolbar.children) : Array.from(el(".panel-items").querySelectorAll("button")); }
  function focusButton() {
    const list = buttons(); focus = Math.max(0, Math.min(focus, list.length - 1));
    list.forEach((button, i) => { button.classList.toggle("selected", i === focus); button.tabIndex = i === focus ? 0 : -1; });
    if (list[focus]) { list[focus].focus({ preventScroll: true }); if (panel !== "controls") list[focus].scrollIntoView({ block: "nearest" }); }
  }
  function close() { panel = ""; model.wantQueue(false); root.classList.remove("controls-open", "panel-open"); if (root.contains(document.activeElement)) document.activeElement.blur(); }
  function openControls() {
    panel = "controls"; focus = 1; model.wantQueue(false);
    root.classList.add("controls-open"); root.classList.remove("panel-open"); touch(); render(); focusButton();
  }
  function openPanel(which) {
    panel = which; focus = 0; optionKey = ""; queueKey = "";
    root.classList.remove("controls-open"); root.classList.add("panel-open");
    model.wantQueue(which === "queue"); model.tick(); render(); focusButton();
  }
  async function command(action, value) {
    touch();
    const ok = await model.command(action, value);
    if (ok && action === "favorite") onNotice("Added to music favourites");
    if (ok && action === "sleep") onNotice(value ? "Sleep timer: " + value + " minutes" : "Sleep timer cleared");
    if (ok && action === "play_index") openControls();
    render();
  }
  function applyMode() {
    root.setAttribute("data-mode", mode);
    root.classList.toggle("has-background", background && (mode === "album" || mode === "lyrics"));
    engine.setDrawing(mode === "visuals" || mode === "track" || background);
    model.wantLyrics(mode === "lyrics" || (overlay && mode !== "visuals"));
    onMode(mode);
  }
  function setMode(next) { mode = next; savePref("viewMode", mode); lyricsKey = ""; plainPage = 0; applyMode(); render(); }
  function addRow(label, value, action, disabled, adjustable) {
    const button = document.createElement("button"); button.className = "player-option";
    const name = document.createElement("span"), detail = document.createElement("span");
    text(name, label); text(detail, value); button.appendChild(name); button.appendChild(detail);
    button.disabled = !!disabled; button.addEventListener("click", () => { action(1); optionKey = ""; render(); focusButton(); });
    button._change = adjustable ? action : null; el(".panel-items").appendChild(button);
  }
  function options(s) {
    const q = s.queue || {}, p = s.player || {};
    const stateKey = JSON.stringify([panel, mode, background, overlay, s.connected, s.busy, q.shuffle_enabled, q.smart_shuffle_active, q.repeat_mode, q.autoplay_enabled, q.crossfade_enabled, p.volume_level, sleepMinutes, s.lyrics.status, plainPage]);
    if (stateKey === optionKey) return;
    optionKey = stateKey; el(".panel-items").textContent = "";
    text(el(".player-panel h2"), panel === "display" ? "Your screen" : "Playback options");
    text(el(".panel-note"), panel === "display" ? "Your display choices are saved on this TV." : "Controls " + (q.display_name || "the current Music Assistant queue") + ".");
    if (panel === "display") {
      VIEW_MODES.forEach(value => addRow(VIEW_LABELS[value], mode === value ? "Selected" : "", () => setMode(value)));
      addRow("MilkDrop behind artwork & lyrics", background ? "On" : "Off", () => { background = !background; savePref("playerBackground", background); applyMode(); });
      addRow("Lyrics over visuals + track", overlay ? "On" : "Off", () => { overlay = !overlay; savePref("lyricsOverlay", overlay); applyMode(); });
      if (s.lyrics.status === "plain") addRow("Lyrics page", plainPage + 1, dir => { plainPage = Math.max(0, plainPage + dir); lyricsKey = ""; }, false, true);
      if (s.lyrics.status === "error") addRow("Retry lyrics", "", () => model.retryLyrics());
    } else {
      const disabled = !s.connected || s.busy;
      addRow("Shuffle", q.smart_shuffle_active ? "Smart shuffle" : q.shuffle_enabled ? "On" : "Off", () => command("shuffle"), disabled || q.smart_shuffle_active, true);
      addRow("Repeat", q.repeat_mode || "off", dir => { const values = ["off", "all", "one"]; command("repeat", values[(Math.max(0, values.indexOf(q.repeat_mode)) + dir + 3) % 3]); }, disabled, true);
      addRow("Autoplay", q.autoplay_enabled ? "On" : "Off", () => command("autoplay"), disabled, true);
      addRow("Crossfade", q.crossfade_enabled ? "On" : "Off", () => command("crossfade"), disabled, true);
      addRow("Group volume", p.volume_level == null ? "Unavailable" : p.volume_level + "%", dir => command("volume", p.volume_level + dir * 5), disabled || p.volume_level == null, true);
      addRow("Add song to favourites", "", () => command("favorite"), disabled || !s.track);
      addRow("Sleep timer duration", sleepMinutes + " minutes", dir => { const values = [15, 30, 45, 60, 90]; sleepMinutes = values[(values.indexOf(sleepMinutes) + dir + values.length) % values.length]; }, false, true);
      addRow("Start sleep timer", sleepMinutes + " minutes", () => command("sleep", sleepMinutes), disabled);
      addRow("Clear sleep timer", "", () => command("sleep", 0), disabled);
      addRow("Visualizer settings", "Presets, brightness & audio", () => { close(); onSettings(); });
    }
  }
  function queue(s) {
    const signature = JSON.stringify([s.itemsState, s.items.map(i => [i.queue_item_id, i.name, i.available])]);
    if (signature === queueKey) return;
    queueKey = signature; el(".panel-items").textContent = "";
    text(el(".player-panel h2"), "Up next");
    text(el(".panel-note"), s.itemsState === "loading" ? "Loading queue…" : s.itemsState === "error" ? "Could not load the queue. Close and reopen to retry." : s.items.length ? "Next " + s.items.length + " tracks · OK plays your selection" : "Nothing queued. Add music in Music Assistant.");
    s.items.forEach(item => {
      const track = trackInfo(item, host);
      addRow(track.title, track.artist || timeLabel(track.duration), () => command("play_index", item.queue_item_id), item.available === false);
    });
  }
  function renderLyrics(s) {
    const index = lyricIndex(s.lyrics.lines, s.lyricPosition);
    const signature = trackKey + ":" + s.lyrics.status + ":" + index + ":" + plainPage;
    if (lyricsKey !== signature) {
      lyricsKey = signature; const box = el(".player-lyrics"); box.textContent = "";
      if (s.lyrics.status === "timed") {
        for (let i = index - 1; i <= index + 2; i++) {
          const line = document.createElement("p"); line.className = i === index ? "current" : "";
          text(line, s.lyrics.lines[i] ? s.lyrics.lines[i].text : ""); box.appendChild(line);
        }
      } else if (s.lyrics.status === "plain") {
        const lines = s.lyrics.plain.split(/\r?\n/).filter(Boolean);
        plainPage = Math.min(plainPage, Math.max(0, Math.ceil(lines.length / 5) - 1));
        const words = document.createElement("p"); words.className = "plain";
        text(words, lines.slice(plainPage * 5, plainPage * 5 + 5).join("\n")); box.appendChild(words);
        const note = document.createElement("small"); text(note, "Untimed lyrics · Display → Lyrics page"); box.appendChild(note);
      } else {
        const note = document.createElement("p"); note.className = "lyrics-status";
        text(note, s.lyrics.status === "error" ? "Lyrics couldn’t load. Retry in Display." : s.lyrics.status === "missing" ? "No lyrics for this track" : s.track ? "Finding lyrics…" : "Start music in Music Assistant"); box.appendChild(note);
      }
    }
    const showOverlay = overlay && mode === "track" && s.lyrics.status === "timed";
    const line = s.lyrics.lines[index];
    text(el(".lyric-overlay"), showOverlay && line ? line.text : "");
  }
  function render() {
    const s = model.snapshot(), track = s.track;
    const nextTrackKey = s.queue ? s.queue.queue_id + ":" + (track ? track.id : "") : "";
    if (nextTrackKey !== trackKey) { trackKey = nextTrackKey; lyricsKey = ""; plainPage = 0; }
    text(el(".player-info h1"), track ? track.title : "Ready when you are");
    text(el(".player-artist"), track ? track.artist : "Play music in Music Assistant");
    text(el(".player-album"), track ? track.album : "");
    text(el(".player-next"), s.next ? "Up next · " + s.next.title + (s.next.artist ? " — " + s.next.artist : "") : "");
    const url = track && track.image || "";
    if (url !== artUrl) { artUrl = url; const img = el(".player-cover img"); img.style.display = url ? "block" : "none"; el(".cover-empty").style.display = url ? "none" : "flex"; if (url) img.src = url; else img.removeAttribute("src"); }
    text(el(".control-target"), s.queue && s.queue.display_name || "Music Assistant");
    text(el(".control-track"), track ? track.title + (track.artist ? " · " + track.artist : "") : "No track playing");
    text(el(".control-state"), !s.connected ? "Connecting…" : s.busy ? "Working…" : s.queue.state === "paused" ? "Paused" : "");
    text(el(".elapsed"), timeLabel(s.position)); text(el(".duration"), track && track.duration ? timeLabel(track.duration) : "Live");
    const progress = track && track.duration ? Math.min(100, s.position / track.duration * 100) : 0;
    el(".progress-track div").style.width = progress + "%";
    el(".progress-track").setAttribute("aria-valuenow", String(Math.round(progress)));
    const playing = s.queue && s.queue.state === "playing";
    const play = toolbar.children[1];
    if (play.getAttribute("aria-label") !== (playing ? "Pause" : "Play")) {
      play.innerHTML = icon(playing ? "pause" : "play") + '<span>' + (playing ? "Pause" : "Play") + '</span>';
      play.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    Array.from(toolbar.children).slice(0, 5).forEach((b, i) => b.disabled = !s.connected || s.busy || (i >= 3 && (!track || !track.duration)));
    text(el(".player-error"), s.error);
    if (mode === "lyrics" || overlay) renderLyrics(s);
    if (panel === "options" || panel === "display") options(s);
    if (panel === "queue") queue(s);
    if (panel) focusButton();
  }
  el(".player-cover img").onerror = () => { el(".player-cover img").style.display = "none"; el(".cover-empty").style.display = "flex"; };
  applyMode(); render();
  return {
    get mode() { return mode; },
    get isOpen() { return !!panel; },
    open: openControls, close,
    setMode,
    reloadPrefs() { const next = loadPref("viewMode", "track"); if (VIEW_MODES.indexOf(next) >= 0) mode = next; background = loadPref("playerBackground", false); overlay = loadPref("lyricsOverlay", false); applyMode(); },
    start() { model.start(); if (!timer) timer = setInterval(() => { model.tick(); render(); if (panel === "controls" && Date.now() > hideAt) close(); }, 250); },
    stop() { clearInterval(timer); timer = 0; model.stop(); close(); },
    setPalette(palette) { el(".player-ground").style.backgroundColor = ""; const c = palette && (palette.background_dark || palette.primary); if (Array.isArray(c) && c.length >= 3) el(".player-ground").style.backgroundColor = "rgb(" + c.slice(0, 3).map(v => Math.max(0, Math.min(55, Math.round(v * 0.28)))).join(",") + ")"; },
    handleKey(name) {
      if (name === "playpause" || name === "play" || name === "pause") { command(name === "playpause" ? "play_pause" : name); return true; }
      if (!panel) return false;
      touch();
      if (name === "back") { if (panel === "controls") close(); else openControls(); return true; }
      const list = buttons();
      if (name === "ok") { if (list[focus] && !list[focus].disabled) list[focus].click(); }
      else if (panel === "controls") {
        if (name === "left" || name === "right") focus = (focus + (name === "left" ? -1 : 1) + list.length) % list.length;
        else if (name === "up") openPanel("display");
        else if (name === "down") openPanel("options");
      } else if (name === "up" || name === "down") focus = list.length ? (focus + (name === "up" ? -1 : 1) + list.length) % list.length : 0;
      else if ((name === "left" || name === "right") && list[focus] && !list[focus].disabled && list[focus]._change) { list[focus]._change(name === "left" ? -1 : 1); optionKey = ""; render(); }
      focusButton(); return true;
    }
  };
}
