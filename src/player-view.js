import { loadPref, savePref } from "./settings.js";
import { createPlayback, lyricIndex, timeLabel, trackInfo, VIEW_LABELS, VIEW_MODES } from "./playback.js";
import { css, onField, posterColours } from "./poster-colour.js";
import { createBrowse } from "./browse-view.js";
import { badgeOf, describeStream } from "./stream-details.js";

// Drawn UI runs at 4 Hz, independently of the visualizer. Text only changes
// when its value changes; artwork is requested once per URL at 512 pixels.
const NAV = [["browse", "Browse"], ["now", "Now playing"], ["queue", "Queue"], ["settings", "Settings"]];
const SLEEP_MINUTES = [0, 15, 30, 45, 60, 90];

export function createPlayerView({ root, live, host, engine, onSettings, onMode, onNotice }) {
  const model = createPlayback({ live, host });
  let mode = loadPref("viewMode", "track");
  if (VIEW_MODES.indexOf(mode) < 0) mode = "track";
  let background = loadPref("playerBackground", false);
  let overlay = loadPref("lyricsOverlay", false);
  let panel = "", row = "transport", focus = 1, timer = 0, hideAt = 0, trackKey = "", artUrl = "", lyricsKey = "", queueKey = "", optionKey = "";
  let sleepIndex = 2, plainPage = 0, palette = null, night = null;
  let queuePick = null, picking = false, providers = null, detailsKey = "";
  const paths = {
    previous: '<path d="M5 5v14M19 5L8 12l11 7z"/>',
    next: '<path d="M19 5v14M5 5l11 7-11 7z"/>',
    play: '<path d="M7 4l13 8-13 8z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    back: '<path d="M10 6L4 12l6 6M20 6l-6 6 6 6"/>',
    forward: '<path d="M4 6l6 6-6 6M14 6l6 6-6 6"/>',
    favorite: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    details: '<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    view: '<rect x="3" y="4" width="18" height="13"/><path d="M8 21h8M12 17v4"/>'
  };
  const icon = name => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter">' + paths[name] + '</svg>';
  root.innerHTML = '<div class="player-ground"></div>' +
    '<section class="poster" aria-label="Now playing">' +
      '<div class="poster-art"></div>' +
      '<p class="poster-target"></p><p class="poster-state"></p>' +
      '<h1 class="poster-title"></h1>' +
      '<div class="poster-lyrics" aria-label="Lyrics"></div>' +
      '<div class="poster-field field-a"><p class="poster-artist"></p><p class="poster-album"></p></div>' +
      '<div class="poster-field field-b"><h2>Next</h2><ol class="poster-next"></ol></div>' +
      '<div class="poster-progress"><span class="elapsed">0:00</span><div class="progress-track" role="progressbar" aria-label="Track progress"><div></div></div><span class="duration">0:00</span></div>' +
    '</section><div class="lyric-overlay"></div>' +
    '<nav class="player-nav" aria-label="Afterglow"></nav>' +
    '<section class="player-controls" aria-label="Playback controls"><div class="control-heading"><span class="control-track"></span><span class="control-time"></span></div>' +
      '<div class="transport"></div></section>' +
    '<section class="player-browse" aria-label="Browse"></section>' +
    '<section class="player-panel" aria-label="Player options"><header><h2></h2><p class="panel-note"></p></header><div class="panel-items"></div></section>' +
    '<p class="player-error" role="status"></p>';
  const el = selector => root.querySelector(selector);
  function text(node, value) { const v = String(value == null ? "" : value); if (node.textContent !== v) node.textContent = v; }
  const nav = el(".player-nav"), toolbar = el(".transport");
  NAV.forEach(([id, label]) => {
    const button = document.createElement("button");
    button.dataset.nav = id; text(button, label);
    button.addEventListener("click", () => openSection(id));
    nav.appendChild(button);
  });
  const actions = [
    ["previous", "Previous", () => command("previous")],
    ["pause", "Pause", () => command("play_pause")],
    ["next", "Next", () => command("next")],
    ["back", "Back 10 s", () => command("seek", model.snapshot().position - 10)],
    ["forward", "Ahead 10 s", () => command("seek", model.snapshot().position + 10)],
    ["favorite", "Favourite", () => command("favorite")],
    ["details", "Details", () => openPanel("details")],
    ["view", "Display", () => openPanel("display")]
  ];
  actions.forEach((action, index) => {
    const button = document.createElement("button");
    button.innerHTML = icon(action[0]) + "<span></span>";
    text(button.lastChild, action[1]);
    button.setAttribute("aria-label", action[1]);
    button.addEventListener("click", () => { row = "transport"; focus = index; action[2](); touch(); });
    toolbar.appendChild(button);
  });

  const browse = createBrowse({
    element: el(".player-browse"), live, host,
    play: (media, option) => command("play_media", { media, option }),
    target: () => { const q = model.snapshot().queue; return q && q.display_name || "the current player"; },
    onNotice, onLeave: toNow => toNow ? close() : openControls()
  });
  function touch() { hideAt = Date.now() + 9000; }
  function buttons() {
    if (panel !== "controls") return Array.from(el(".panel-items").querySelectorAll("button"));
    return Array.from((row === "nav" ? nav : toolbar).children);
  }
  function focusButton() {
    root.querySelectorAll("button.selected").forEach(b => { b.classList.remove("selected"); b.tabIndex = -1; });
    const list = buttons(); focus = Math.max(0, Math.min(focus, list.length - 1));
    const target = list[focus];
    if (!target) return;
    target.classList.add("selected"); target.tabIndex = 0; target.focus({ preventScroll: true });
    if (panel !== "controls") target.scrollIntoView({ block: "nearest" });
  }
  function close() {
    if (panel === "browse") browse.close();
    panel = ""; queuePick = null; picking = false; model.wantQueue(false);
    root.classList.remove("controls-open", "panel-open"); root.removeAttribute("data-panel");
    if (root.contains(document.activeElement)) document.activeElement.blur();
  }
  function openControls() {
    if (panel === "browse") browse.close();
    panel = "controls"; row = "transport"; focus = 1; queuePick = null; picking = false; model.wantQueue(false);
    root.classList.add("controls-open"); root.classList.remove("panel-open"); root.removeAttribute("data-panel"); touch(); render(); focusButton();
  }
  function openPanel(which) {
    panel = which; focus = 0; optionKey = ""; queueKey = ""; detailsKey = ""; queuePick = null; picking = false;
    root.classList.remove("controls-open"); root.classList.add("panel-open");
    root.setAttribute("data-panel", which);
    model.wantQueue(which === "queue"); model.tick();
    if (which === "browse") return browse.open();
    if (which === "details") readProviders();
    render(); focusButton();
  }
  function openSection(id) {
    if (id === "now") return close();
    if (id === "settings") { close(); return onSettings(); }
    openPanel(id);
  }
  async function command(action, value) {
    touch();
    const ok = await model.command(action, value);
    if (ok && action === "favorite") onNotice("Added to music favourites");
    if (ok && action === "sleep") onNotice(value ? "Sleep timer: " + value + " minutes" : "Sleep timer cleared");
    if (ok && action === "play_index") openControls();
    if (ok && action === "radio") { onNotice("Radio from this song"); close(); }
    render();
    return ok;
  }
  function applyMode() {
    root.setAttribute("data-mode", mode);
    root.classList.toggle("has-background", background && (mode === "album" || mode === "lyrics"));
    engine.setDrawing(mode === "visuals" || mode === "track" || background);
    model.wantLyrics(mode === "lyrics" || (overlay && mode !== "visuals"));
    onMode(mode);
  }
  function setMode(next) { mode = next; savePref("viewMode", mode); lyricsKey = ""; plainPage = 0; applyMode(); render(); }

  // The track's palette sets the fields; after 22:00 the whole poster steps down.
  function applyColours() {
    const late = new Date().getHours(); const isNight = late >= 22 || late < 6;
    if (live.palette === palette && isNight === night) return;
    palette = live.palette; night = isNight;
    const c = posterColours(palette);
    const dim = f => isNight ? onField(f.map(v => Math.round(v * 0.72))) : null;
    const a = dim(c.fieldA) || { field: c.fieldA, text: c.onA }, b = dim(c.fieldB) || { field: c.fieldB, text: c.onB };
    const style = document.documentElement.style;
    style.setProperty("--field-a", css(a.field)); style.setProperty("--on-a", css(a.text));
    style.setProperty("--field-b", css(b.field)); style.setProperty("--on-b", css(b.text));
    style.setProperty("--ground", css(c.ground));
    root.classList.toggle("night", isNight);
  }

  function heading(label) { const h = document.createElement("h3"); text(h, label); el(".panel-items").appendChild(h); }
  // adjust: true when left/right repeat the action, or its own left/right handler.
  function addRow(label, value, action, disabled, adjust) {
    const button = document.createElement("button"); button.className = "player-option";
    const name = document.createElement("span"), detail = document.createElement("span");
    text(name, label); text(detail, value); button.appendChild(name); button.appendChild(detail);
    button.disabled = !!disabled; button.addEventListener("click", () => { action(1); optionKey = ""; queueKey = ""; detailsKey = ""; render(); focusButton(); });
    button._change = adjust === true ? action : adjust || null; el(".panel-items").appendChild(button);
    return button;
  }
  function display(s) {
    const stateKey = JSON.stringify([panel, mode, background, overlay, s.lyrics.status, plainPage]);
    if (stateKey === optionKey) return;
    optionKey = stateKey; el(".panel-items").textContent = "";
    text(el(".player-panel h2"), "Display");
    text(el(".player-panel .panel-note"), "Saved on this TV.");
    VIEW_MODES.forEach(value => addRow(VIEW_LABELS[value], "", () => setMode(value)).classList.toggle("chosen", mode === value));
    heading("Extras");
    addRow("MilkDrop behind artwork and lyrics", background ? "On" : "Off", () => { background = !background; savePref("playerBackground", background); applyMode(); }, false, true);
    addRow("Lyrics over Visuals + track", overlay ? "On" : "Off", () => { overlay = !overlay; savePref("lyricsOverlay", overlay); applyMode(); }, false, true);
    if (s.lyrics.status === "plain") addRow("Lyrics page", plainPage + 1, dir => { plainPage = Math.max(0, plainPage + dir); lyricsKey = ""; }, false, true);
    if (s.lyrics.status === "error") addRow("Retry lyrics", "", () => model.retryLyrics());
  }
  async function readProviders() {
    if (providers) return;
    try { providers = await live.call("providers", {}); } catch (e) { providers = []; }
    detailsKey = ""; if (panel === "details") render();
  }
  // The back of the poster: what the song is and how it sounds, then what you can do with it.
  function details(s) {
    const item = s.queue && s.queue.current_item;
    const signature = JSON.stringify([item && item.queue_item_id, !!providers, s.connected, s.busy, s.queue && s.queue.display_name]);
    if (signature === detailsKey) return;
    detailsKey = signature; el(".panel-items").textContent = "";
    text(el(".player-panel h2"), s.track ? s.track.title : "Nothing playing");
    text(el(".player-panel .panel-note"), s.track ? [s.track.artist, s.queue.display_name].filter(Boolean).join(" · ") : "");
    const facts = document.createElement("dl"); facts.className = "details-facts";
    describeStream(item, providers).forEach(f => {
      const dt = document.createElement("dt"), dd = document.createElement("dd"); text(dt, f.label); text(dd, f.value); facts.appendChild(dt); facts.appendChild(dd);
    });
    if (facts.children.length) el(".panel-items").appendChild(facts);
    const disabled = !s.connected || s.busy || !s.track;
    addRow("Start radio from this song", "Replaces the queue", () => command("radio"), disabled);
    addRow("Add to favourites", "", () => command("favorite"), disabled);
  }
  function queue(s) {
    const q = s.queue || {}, p = s.player || {};
    const speakers = live.speakers ? live.speakers() : [];
    const signature = JSON.stringify([s.itemsState, s.items.map(i => [i.queue_item_id, i.name, i.available]), s.connected, s.busy, q.display_name, q.shuffle_enabled, q.smart_shuffle_active, q.repeat_mode, q.autoplay_enabled, q.crossfade_enabled, q.is_dynamic, p.volume_level, sleepIndex, queuePick && queuePick.queue_item_id, picking, live.preferred, speakers.length]);
    if (signature === queueKey) return;
    queueKey = signature; el(".panel-items").textContent = "";
    const disabled = !s.connected || s.busy;
    if (picking) {
      text(el(".player-panel h2"), "Play on");
      text(el(".player-panel .panel-note"), "Afterglow shows and controls this player’s music.");
      const choose = id => { savePref("preferredPlayer", id); live.setPreferred(id); picking = false; focus = 0; };
      addRow("Automatic", "Whatever is playing", () => choose(""), false).classList.toggle("chosen", !live.preferred);
      speakers.forEach(sp => addRow(sp.name, sp.group ? "Group" : "Speaker", () => choose(sp.id), false).classList.toggle("chosen", live.preferred === sp.id));
      return;
    }
    if (queuePick) {
      const track = trackInfo(queuePick, host);
      text(el(".player-panel h2"), track.title);
      text(el(".player-panel .panel-note"), [track.artist, "in the queue"].filter(Boolean).join(" · "));
      const id = queuePick.queue_item_id, done = () => { queuePick = null; focus = 0; };
      addRow("Play now", "", () => { done(); command("play_index", id); }, disabled);
      addRow("Play next", "", () => { done(); command("move_item", { id, shift: 0 }); }, disabled);
      addRow("Move up", "", () => { done(); command("move_item", { id, shift: -1 }); }, disabled);
      addRow("Move down", "", () => { done(); command("move_item", { id, shift: 1 }); }, disabled);
      addRow("Remove from the queue", "", () => { done(); command("delete_item", id); }, disabled);
      return;
    }
    text(el(".player-panel h2"), "Queue");
    text(el(".player-panel .panel-note"), s.itemsState === "loading" ? "Loading…" : s.itemsState === "error" ? "Couldn’t load the queue. Reopen to retry." : q.is_dynamic ? "Radio: songs keep coming" : "");
    if (speakers.length) addRow("Playing on", q.display_name || "Automatic", () => { picking = true; focus = 0; }, false);
    heading(s.items.length ? "Up next" : s.itemsState === "loading" ? "" : "Nothing queued after this song");
    s.items.forEach(item => {
      const track = trackInfo(item, host);
      addRow(track.title, track.artist || timeLabel(track.duration), () => { queuePick = item; focus = 0; }, item.available === false);
    });
    heading("Playback");
    addRow("Shuffle", q.smart_shuffle_active ? "Smart" : q.shuffle_enabled ? "On" : "Off", () => command("shuffle"), disabled || q.smart_shuffle_active || q.is_dynamic, true);
    addRow("Repeat", { off: "Off", all: "All", one: "One" }[q.repeat_mode || "off"], dir => { const values = ["off", "all", "one"]; command("repeat", values[(Math.max(0, values.indexOf(q.repeat_mode)) + dir + 3) % 3]); }, disabled || q.is_dynamic, true);
    addRow("Crossfade", q.crossfade_enabled ? "On" : "Off", () => command("crossfade"), disabled, true);
    addRow("Keep playing when the queue ends", q.autoplay_enabled ? "On" : "Off", () => command("autoplay"), disabled, true);
    addRow("Volume", p.volume_level == null ? "Unavailable" : p.volume_level + "%", dir => command("volume", p.volume_level + dir * 5), disabled || p.volume_level == null, true);
    const minutes = SLEEP_MINUTES[sleepIndex];
    addRow(minutes ? "Start a " + minutes + "-minute sleep timer" : "Clear the sleep timer", "Left and right change it", () => command("sleep", minutes), disabled,
      dir => { sleepIndex = (sleepIndex + dir + SLEEP_MINUTES.length) % SLEEP_MINUTES.length; });
  }
  function renderLyrics(s) {
    const index = lyricIndex(s.lyrics.lines, s.lyricPosition);
    const signature = trackKey + ":" + s.lyrics.status + ":" + index + ":" + plainPage;
    if (lyricsKey !== signature) {
      lyricsKey = signature; const box = el(".poster-lyrics"); box.textContent = "";
      const line = (cls, value) => { const p = document.createElement("p"); p.className = cls; text(p, value); box.appendChild(p); };
      if (s.lyrics.status === "timed") {
        const at = i => s.lyrics.lines[i] ? s.lyrics.lines[i].text : "";
        line("lyric-before", at(index - 1)); line("lyric-now", at(index)); line("lyric-after", at(index + 1));
      } else if (s.lyrics.status === "plain") {
        const lines = s.lyrics.plain.split(/\r?\n/).filter(Boolean);
        plainPage = Math.min(plainPage, Math.max(0, Math.ceil(lines.length / 4) - 1));
        line("lyric-plain", lines.slice(plainPage * 4, plainPage * 4 + 4).join("\n"));
        line("lyric-note", "Untimed lyrics · page " + (plainPage + 1) + " · change it in Display");
      } else {
        line("lyric-note", s.lyrics.status === "error" ? "Lyrics couldn’t load. Retry in Display." : s.lyrics.status === "missing" ? "No lyrics for this track" : s.track ? "Finding lyrics…" : "");
      }
    }
    const showOverlay = overlay && mode === "track" && s.lyrics.status === "timed";
    const current = s.lyrics.lines[index];
    text(el(".lyric-overlay"), showOverlay && current ? current.text : "");
  }
  function renderNext(s) {
    const list = el(".poster-next");
    const items = [s.next].concat((s.items || []).slice(1, 2)).filter(Boolean);
    const signature = JSON.stringify(items.map(t => t.title));
    if (list.dataset.key === signature) return;
    list.dataset.key = signature; list.textContent = "";
    if (!items.length) { const li = document.createElement("li"); text(li, "Nothing queued"); list.appendChild(li); }
    items.forEach(t => {
      const li = document.createElement("li"), name = document.createElement("strong"), by = document.createElement("span");
      text(name, t.title); text(by, t.artist || ""); li.appendChild(name); li.appendChild(by); list.appendChild(li);
    });
  }
  function render() {
    const s = model.snapshot(), track = s.track;
    applyColours();
    const nextTrackKey = s.queue ? s.queue.queue_id + ":" + (track ? track.id : "") : "";
    if (nextTrackKey !== trackKey) {
      trackKey = nextTrackKey; lyricsKey = ""; plainPage = 0;
      const poster = el(".poster"); poster.classList.remove("fresh"); void poster.offsetWidth; poster.classList.add("fresh");
    }
    const title = track ? track.title : "Ready when you are";
    text(el(".poster-title"), title);
    el(".poster-title").setAttribute("data-length", title.length > 50 ? "xlong" : title.length > 26 ? "long" : title.length > 12 ? "medium" : "short");
    text(el(".poster-artist"), track ? track.artist : "Play music in Music Assistant");
    text(el(".poster-album"), track ? track.album : "");
    text(el(".poster-target"), s.queue && s.queue.display_name || "Music Assistant");
    const paused = s.queue && s.queue.state === "paused";
    const badge = badgeOf(s.queue && s.queue.current_item);
    text(el(".poster-state"), !s.connected ? "Connecting…" : s.busy ? "Working…" : [paused ? "Paused" : "", badge].filter(Boolean).join(" · "));
    renderNext(s);
    const url = track && track.image || "";
    if (url !== artUrl) {
      artUrl = url; const box = el(".poster-art"); box.textContent = "";
      if (url) { const img = document.createElement("img"); img.alt = "Album artwork"; img.onerror = () => img.remove(); img.src = url; box.appendChild(img); }
    }
    const elapsed = timeLabel(s.position), total = track && track.duration ? timeLabel(track.duration) : "Live";
    text(el(".elapsed"), elapsed); text(el(".duration"), total);
    text(el(".control-track"), track ? track.title + (track.artist ? " · " + track.artist : "") : "No track playing");
    text(el(".control-time"), (paused ? "Paused · " : "") + elapsed + " / " + total);
    const progress = track && track.duration ? Math.min(100, s.position / track.duration * 100) : 0;
    el(".progress-track div").style.width = progress + "%";
    el(".progress-track").setAttribute("aria-valuenow", String(Math.round(progress)));
    const playing = s.queue && s.queue.state === "playing";
    const play = toolbar.children[1];
    if (play.getAttribute("aria-label") !== (playing ? "Pause" : "Play")) {
      play.innerHTML = icon(playing ? "pause" : "play") + "<span>" + (playing ? "Pause" : "Play") + "</span>";
      play.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    Array.from(toolbar.children).slice(0, 7).forEach((b, i) => b.disabled = !s.connected || s.busy || (i >= 3 && i <= 4 && (!track || !track.duration)) || (i >= 5 && !track));
    Array.from(nav.children).forEach(b => b.classList.toggle("current", b.dataset.nav === (panel === "queue" || panel === "browse" ? panel : "now")));
    text(el(".player-error"), s.error);
    if (mode === "lyrics" || overlay) renderLyrics(s);
    if (panel === "display") display(s);
    if (panel === "queue") queue(s);
    if (panel === "details") details(s);
    if (panel && panel !== "browse") focusButton();
  }
  applyMode(); render();
  return {
    get mode() { return mode; },
    get isOpen() { return !!panel; },
    open: openControls, close,
    setMode,
    reloadPrefs() { const next = loadPref("viewMode", "track"); if (VIEW_MODES.indexOf(next) >= 0) mode = next; background = loadPref("playerBackground", false); overlay = loadPref("lyricsOverlay", false); applyMode(); },
    start() { model.start(); if (!timer) timer = setInterval(() => { model.tick(); render(); if (panel === "controls" && Date.now() > hideAt) close(); }, 250); },
    stop() { clearInterval(timer); timer = 0; model.stop(); close(); },
    handleKey(name) {
      if (name === "playpause" || name === "play" || name === "pause") { command(name === "playpause" ? "play_pause" : name); return true; }
      if (!panel) return false;
      touch();
      if (panel === "browse") { browse.handleKey(name); return true; }
      if (name === "back" && panel === "queue" && (queuePick || picking)) { queuePick = null; picking = false; focus = 0; render(); return true; }
      if (name === "back") { if (panel === "controls") close(); else openControls(); return true; }
      const list = buttons();
      if (name === "ok") { if (list[focus] && !list[focus].disabled) list[focus].click(); }
      else if (panel === "controls") {
        if (name === "left" || name === "right") focus = (focus + (name === "left" ? -1 : 1) + list.length) % list.length;
        else if (name === "up" && row === "transport") { row = "nav"; focus = 1; }
        else if (name === "down" && row === "nav") { row = "transport"; focus = 1; }
      } else if (name === "up" || name === "down") focus = list.length ? (focus + (name === "up" ? -1 : 1) + list.length) % list.length : 0;
      else if ((name === "left" || name === "right") && list[focus] && !list[focus].disabled && list[focus]._change) { list[focus]._change(name === "left" ? -1 : 1); optionKey = ""; queueKey = ""; render(); }
      focusButton(); return true;
    }
  };
}
