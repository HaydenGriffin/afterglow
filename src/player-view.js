import { loadPref, savePref } from "./settings.js";
import { createPlayback, lyricIndex, timeLabel, trackInfo, VIEW_LABELS, VIEW_MODES, volumeOf } from "./playback.js";
import { css, posterTheme } from "./poster-colour.js";
import { createBrowse } from "./browse-view.js";
import { describeStream } from "./stream-details.js";
import { createKaraoke } from "./karaoke.js";
import { FIRST_ENABLED, focusRow } from "./focus.js";
import { KIND_PREF, LOOK_PREFS, LOOK_ROWS, OVERLAY_LABELS, overlayKind, overlayLook, placeOverlay, stepKind, stepLook } from "./lyric-overlay.js";
import { createProgressSmoother, progressTransform } from "./progress.js";
import { createScrollCue } from "./scroll-cue.js";

// Drawn UI runs at 4 Hz, independently of the visualizer. Text only changes
// when its value changes; artwork is requested once per URL at 512 pixels.
// The progress bar alone moves every animation frame (progress.js) while the
// song plays in Album or Lyrics.
const NAV = [["browse", "Browse"], ["now", "Now playing"], ["queue", "Queue"], ["settings", "Settings"]];
const SLEEP_MINUTES = [0, 15, 30, 45, 60, 90];

export function createPlayerView({ root, live, host, engine, onSettings, onMode, onNotice }) {
  let lyricsOffsetMs = loadPref("lyricsOffsetMs", 0);
  let onlineLyrics = loadPref("onlineLyrics", true); // Off: nothing is asked of lrclib.net
  const model = createPlayback({ live, host, lyricsSearch: live.mock ? null : undefined, onlineLyrics: () => onlineLyrics, lyricsOffset: () => lyricsOffsetMs });
  let mode = loadPref("viewMode", "track");
  if (VIEW_MODES.indexOf(mode) < 0) mode = "track";
  let background = loadPref("playerBackground", false);
  // Lyrics over Visuals + track: "off", "line" or "stage", and each overlay's own look.
  let overlay = overlayKind(loadPref(KIND_PREF, false));
  const looks = { line: overlayLook("line", loadPref(LOOK_PREFS.line, null)), stage: overlayLook("stage", loadPref(LOOK_PREFS.stage, null)) };
  let overlayContext = { cardPx: 0, message: false }; // what main.js says the overlay must keep clear of
  let panel = "", row = "transport", focus = 1, timer = 0, hideAt = 0, trackKey = "", artUrl = "", lyricsKey = "", queueKey = "", optionKey = "";
  let sleepIndex = 2, plainPage = 0, palette = null, night = null;
  let queuePick = null, picking = false, grouping = false, providers = null, detailsKey = "";
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
      '<div class="poster-meta"><p class="poster-song"></p><p class="poster-artist"></p><p class="poster-album"></p></div>' +
      '<div class="poster-up-next"><h2>Up next</h2><ol class="poster-next"></ol></div>' +
      '<div class="poster-progress"><span class="elapsed">0:00</span><div class="progress-track" role="progressbar" aria-label="Track progress"><div></div></div><span class="duration">0:00</span></div>' +
    '</section><div class="lyric-overlay"><p class="lyric-overlay-line"></p></div>' +
    '<nav class="player-nav" aria-label="Afterglow"></nav>' +
    '<section class="player-controls" aria-label="Playback controls"><div class="control-heading"><span class="control-track"></span><span class="control-time"></span></div>' +
      '<div class="transport"></div></section>' +
    '<section class="player-browse" aria-label="Browse"></section>' +
    '<section class="player-panel" aria-label="Player options"><header><h2></h2><p class="panel-note"></p></header><div class="scroll-frame"><div class="panel-items"></div></div></section>' +
    '<p class="player-error" role="status"></p>';
  const el = selector => root.querySelector(selector);
  function text(node, value) { const v = String(value == null ? "" : value); if (node.textContent !== v) node.textContent = v; }
  const nav = el(".player-nav"), toolbar = el(".transport");
  const panelCue = createScrollCue(el(".panel-items"), el(".player-panel .scroll-frame"));
  const overlayLayer = el(".lyric-overlay"), overlayLine = el(".lyric-overlay-line");
  const bar = el(".progress-track div");
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
    ["back", "Back 10 s", () => command("seek_by", -10)],
    ["forward", "Ahead 10 s", () => command("seek_by", 10)],
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

  const karaoke = createKaraoke(() => model.snapshot().lyricPosition);
  // The one place Browse and the idle poster start music.
  function playMedia(media, option) { return command("play_media", { media, option }); }
  const browse = createBrowse({
    element: el(".player-browse"), live, host,
    play: playMedia,
    target: () => { const t = model.snapshot().target; return t ? t.name : "no speaker yet"; },
    onNotice, onLeave: toNow => toNow ? close() : openControls()
  });
  function touch() { hideAt = Date.now() + 9000; }
  function buttons() {
    if (panel !== "controls") return Array.from(el(".panel-items").querySelectorAll("button"));
    return Array.from((row === "nav" ? nav : toolbar).children);
  }
  function focusButton() {
    const list = buttons(); focus = focusRow(root, list, focus);
    if (list[focus] && panel !== "controls") panelCue.reveal(list[focus]);
  }
  function close() {
    if (panel === "browse") browse.close();
    panel = ""; queuePick = null; picking = grouping = false; model.wantQueue(false);
    root.classList.remove("controls-open", "panel-open"); root.removeAttribute("data-panel");
    if (root.contains(document.activeElement)) document.activeElement.blur();
  }
  function openControls() {
    if (panel === "browse") browse.close();
    panel = "controls"; row = "transport"; focus = 1; queuePick = null; picking = grouping = false; model.wantQueue(false);
    root.classList.add("controls-open"); root.classList.remove("panel-open"); root.removeAttribute("data-panel"); touch(); render(); focusButton();
  }
  function openPanel(which) {
    panel = which; focus = FIRST_ENABLED; optionKey = ""; queueKey = ""; detailsKey = ""; queuePick = null; picking = grouping = false;
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
    model.wantLyrics(mode === "lyrics" || (overlay !== "off" && mode !== "visuals"));
    applyOverlayLook();
    onMode(mode);
  }
  // The overlay's look as attributes for player.css, then its place.
  function applyOverlayLook() {
    const kind = overlay === "off" ? "line" : overlay, look = looks[kind];
    overlayLayer.setAttribute("data-kind", kind);
    LOOK_ROWS.forEach(([field]) => overlayLayer.setAttribute("data-" + field, look[field]));
    placeLyricOverlay();
  }
  // Middle needs the box's height to centre it, so only Middle measures.
  function placeLyricOverlay() {
    const look = looks[overlay === "off" ? "line" : overlay];
    const vh = typeof window !== "undefined" && window.innerHeight ? 100 / window.innerHeight : 0;
    const height = look.position === "middle" && overlayLine.textContent ? (overlayLine.offsetHeight || 0) * vh : 0;
    const at = placeOverlay({ position: look.position, height, card: overlayContext.cardPx ? overlayContext.cardPx * vh : null, message: overlayContext.message });
    const top = at.top != null ? at.top + "vh" : "", bottom = at.bottom != null ? at.bottom + "vh" : "";
    if (overlayLine.style.top !== top) overlayLine.style.top = top;
    if (overlayLine.style.bottom !== bottom) overlayLine.style.bottom = bottom;
  }
  function setOverlayText(value) {
    if (overlayLine.textContent === value) return;
    text(overlayLine, value); overlayLayer.classList.toggle("has-line", !!value);
    if (value) placeLyricOverlay();
  }
  function setLook(field, direction) {
    looks[overlay] = stepLook(looks[overlay], field, direction);
    savePref(LOOK_PREFS[overlay], looks[overlay]);
    applyOverlayLook();
  }
  function setMode(next) { karaoke.show(null); mode = next; savePref("viewMode", mode); lyricsKey = ""; plainPage = 0; applyMode(); render(); }

  // The track's palette sets the fields (neutral with no track drawn, so the
  // empty poster does not keep the last song's colours); after 22:00 the
  // whole poster steps down.
  function applyColours(hasTrack) {
    const late = new Date().getHours(); const isNight = late >= 22 || late < 6;
    const next = hasTrack ? live.palette : null;
    if (next === palette && isNight === night) return;
    palette = next; night = isNight;
    const c = posterTheme(palette, isNight);
    const style = document.documentElement.style;
    style.setProperty("--field-a", css(c.fieldA)); style.setProperty("--on-a", css(c.onA));
    style.setProperty("--field-b", css(c.fieldB)); style.setProperty("--on-b", css(c.onB));
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
    const stateKey = JSON.stringify([panel, mode, background, overlay, looks[overlay], s.lyrics.status, plainPage, lyricsOffsetMs, onlineLyrics]);
    if (stateKey === optionKey) return false;
    optionKey = stateKey; el(".panel-items").textContent = "";
    text(el(".player-panel h2"), "Display");
    text(el(".player-panel .panel-note"), "Saved on this TV.");
    VIEW_MODES.forEach(value => addRow(VIEW_LABELS[value], "", () => setMode(value)).classList.toggle("chosen", mode === value));
    if (mode === "lyrics" || overlay !== "off") {
      heading("Lyrics");
      addRow("Lyrics timing", lyricsOffsetMs ? (Math.abs(lyricsOffsetMs) / 1000).toFixed(1) + " s " + (lyricsOffsetMs > 0 ? "later" : "earlier") : "With the music",
        dir => { lyricsOffsetMs = Math.max(-10000, Math.min(10000, lyricsOffsetMs + dir * 100)); savePref("lyricsOffsetMs", lyricsOffsetMs); }, false, true);
      if (lyricsOffsetMs) addRow("Reset lyrics timing", "", () => { lyricsOffsetMs = 0; savePref("lyricsOffsetMs", 0); });
      addRow("Online lyrics", onlineLyrics ? "On" : "Off", () => {
        onlineLyrics = !onlineLyrics; savePref("onlineLyrics", onlineLyrics);
        if (onlineLyrics && model.snapshot().lyrics.status === "missing") model.retryLyrics();
      }, false, true);
      if (s.lyrics.status === "error" || s.lyrics.status === "missing") addRow("Retry lyrics", "", () => model.retryLyrics());
    }
    heading("Extras");
    addRow("MilkDrop behind artwork and lyrics", background ? "On" : "Off", () => { background = !background; savePref("playerBackground", background); applyMode(); }, false, true);
    addRow("Lyrics over Visuals + track", OVERLAY_LABELS[overlay], dir => { overlay = stepKind(overlay, dir); savePref(KIND_PREF, overlay); applyMode(); }, false, true);
    // Position, Background and Size act on the overlay chosen above.
    if (overlay !== "off") LOOK_ROWS.forEach(([field, label, , names]) => addRow(label, names[looks[overlay][field]], dir => setLook(field, dir), false, true));
    if (s.lyrics.status === "plain") addRow("Lyrics page", plainPage + 1, dir => { plainPage = Math.max(0, plainPage + dir); lyricsKey = ""; }, false, true);
    return true;
  }
  async function readProviders() {
    if (providers) return;
    // A failure is not kept: the next look at the details asks again.
    try { providers = await live.call("providers", {}); } catch (e) { return; }
    detailsKey = ""; if (panel === "details") render();
  }
  // The back of the poster: what the song is and how it sounds, then what you can do with it.
  function details(s) {
    const item = s.queue && s.queue.current_item;
    const signature = JSON.stringify([item && item.queue_item_id, !!providers, s.connected, s.busy, s.queue && s.queue.display_name]);
    if (signature === detailsKey) return false;
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
    return true;
  }
  function setPreferred(id) { savePref("preferredPlayer", id); live.setPreferred(id); }
  // Moves what the target plays to a speaker and makes that speaker the target.
  function moveTo(id, autoPlay) {
    const t = model.snapshot().target, value = { from: t.queueId, to: id };
    if (autoPlay) value.autoPlay = true;
    command("transfer", value).then(ok => { if (ok) onNotice("Moved the music"); });
    setPreferred(id);
  }
  // Play on: choosing a speaker moves the music there when it has none of its own.
  function playOn(speakers, disabled) {
    text(el(".player-panel h2"), "Play on");
    text(el(".player-panel .panel-note"), "Afterglow shows and controls this speaker’s music.");
    const own = live.ownPlayer || "";
    const choose = id => {
      const plan = id && live.transferPlan ? live.transferPlan(id) : null;
      if (plan && !disabled) moveTo(id); else setPreferred(id);
      picking = false; focus = FIRST_ENABLED;
    };
    addRow("Automatic", "Whatever is playing", () => choose(""), false).classList.toggle("chosen", !live.preferred);
    speakers.forEach(sp => {
      const moves = !disabled && live.transferPlan && live.transferPlan(sp.id);
      const kind = sp.id === own ? "This TV" : sp.group ? "Group" : "Speaker";
      addRow(sp.name, moves ? kind + " · moves the music here" : kind, () => choose(sp.id), false).classList.toggle("chosen", live.preferred === sp.id);
    });
  }
  // Speakers together: a tick for each speaker sounding the target's music.
  function together(t, options, disabled) {
    text(el(".player-panel h2"), "Speakers together");
    text(el(".player-panel .panel-note"), "Ticked speakers play " + (t ? t.name : "this speaker") + "’s music.");
    options.forEach(o => {
      const detail = o.leader ? "Leads the group" : o.allowed ? "" : o.member ? "Always in the group" : "Can’t join";
      addRow(o.name, detail, () => command("group", o.member ? { remove: o.id } : { add: o.id }), disabled || !o.allowed).classList.toggle("chosen", o.member);
    });
  }
  function queue(s) {
    const t = s.target, q = t && t.queue || {}, level = volumeOf(t && t.player);
    const speakers = live.speakers ? live.speakers() : [];
    const options = live.groupOptions ? live.groupOptions() : [];
    const own = live.ownPlayer || "";
    const moveHere = !!own && !!t && t.queueId !== own && !!live.transferPlan && !!live.transferPlan(own, true);
    const plans = picking && live.transferPlan ? speakers.map(sp => !!live.transferPlan(sp.id)) : [];
    const signature = JSON.stringify([s.itemsState, s.items.map(i => [i.queue_item_id, i.name, i.available]), t && t.connected, t && t.queueId, t && t.name, q.shuffle_enabled, q.smart_shuffle_active, q.repeat_mode, q.autoplay_enabled, q.crossfade_enabled, q.is_dynamic, level, sleepIndex, queuePick && queuePick.queue_item_id, picking, grouping, live.preferred, speakers.map(sp => sp.id), plans, options, moveHere]);
    if (signature === queueKey) return false;
    queueKey = signature; el(".panel-items").textContent = "";
    const disabled = !t || !t.connected;
    if (picking) { playOn(speakers, disabled); return true; }
    if (grouping) { together(t, options, disabled); return true; }
    if (queuePick) {
      const track = trackInfo(queuePick, host);
      text(el(".player-panel h2"), track.title);
      text(el(".player-panel .panel-note"), [track.artist, "in the queue"].filter(Boolean).join(" · "));
      const id = queuePick.queue_item_id, done = () => { queuePick = null; focus = FIRST_ENABLED; };
      addRow("Play now", "", () => { done(); command("play_index", id); }, disabled);
      addRow("Play next", "", () => { done(); command("move_item", { id, shift: 0 }); }, disabled);
      addRow("Move up", "", () => { done(); command("move_item", { id, shift: -1 }); }, disabled);
      addRow("Move down", "", () => { done(); command("move_item", { id, shift: 1 }); }, disabled);
      addRow("Remove from the queue", "", () => { done(); command("delete_item", id); }, disabled);
      return true;
    }
    text(el(".player-panel h2"), "Queue");
    text(el(".player-panel .panel-note"), !t ? "No speakers found in Music Assistant." : s.itemsState === "loading" ? "Loading…" : s.itemsState === "error" ? "Couldn’t load the queue. Reopen to retry." : q.is_dynamic ? "Radio: songs keep coming" : "");
    if (speakers.length) addRow("Playing on", t ? t.name : "Automatic", () => { picking = true; focus = FIRST_ENABLED; }, false);
    if (moveHere) addRow("Play on this TV", "Moves the music here", () => moveTo(own, true), disabled);
    const members = options.filter(o => o.member).length;
    if (options.some(o => o.allowed)) addRow("Speakers together", members > 1 ? members + " speakers" : "Just this one", () => { grouping = true; focus = FIRST_ENABLED; }, disabled);
    heading(s.items.length ? "Up next" : s.itemsState === "loading" ? "" : "Nothing queued after this song");
    s.items.forEach(item => {
      const track = trackInfo(item, host);
      addRow(track.title, track.artist || timeLabel(track.duration), () => { queuePick = item; focus = FIRST_ENABLED; }, item.available === false);
    });
    heading("Playback");
    addRow("Shuffle", q.smart_shuffle_active ? "Smart" : q.shuffle_enabled ? "On" : "Off", () => command("shuffle"), disabled || q.smart_shuffle_active || q.is_dynamic, true);
    addRow("Repeat", { off: "Off", all: "All", one: "One" }[q.repeat_mode || "off"], dir => command("repeat", dir), disabled || q.is_dynamic, true);
    addRow("Crossfade", q.crossfade_enabled ? "On" : "Off", () => command("crossfade"), disabled, true);
    addRow("Keep playing when the queue ends", q.autoplay_enabled ? "On" : "Off", () => command("autoplay"), disabled, true);
    addRow("Volume", level == null ? "Unavailable" : level + "%", dir => command("volume_by", dir * 5), disabled || level == null, true);
    const minutes = SLEEP_MINUTES[sleepIndex];
    addRow(minutes ? "Start a " + minutes + "-minute sleep timer" : "Clear the sleep timer", "Left and right change it", () => command("sleep", minutes), disabled,
      dir => { sleepIndex = (sleepIndex + dir + SLEEP_MINUTES.length) % SLEEP_MINUTES.length; });
    return true;
  }
  const plainLines = s => s.lyrics.plain.split(/\r?\n/).filter(Boolean);
  const plainPages = s => Math.max(1, Math.ceil(plainLines(s).length / 4));
  function renderLyrics(s) {
    const index = lyricIndex(s.lyrics.lines, s.lyricPosition);
    const signature = trackKey + ":" + s.lyrics.status + ":" + index + ":" + plainPage;
    if (lyricsKey !== signature) {
      lyricsKey = signature; const box = el(".poster-lyrics"); box.textContent = ""; karaoke.show(null);
      const line = (cls, value) => { const p = document.createElement("p"); p.className = cls; text(p, value); box.appendChild(p); };
      if (s.lyrics.status === "timed") {
        const at = i => s.lyrics.lines[i] ? s.lyrics.lines[i].text : "";
        line("lyric-before", at(index - 1)); line("lyric-now", at(index)); line("lyric-after", at(index + 1));
        if (mode === "lyrics") karaoke.show(box.children[1], s.lyrics.lines[index]);
      } else if (s.lyrics.status === "plain") {
        const lines = plainLines(s);
        plainPage = Math.min(plainPage, plainPages(s) - 1);
        line("lyric-plain", lines.slice(plainPage * 4, plainPage * 4 + 4).join("\n"));
        line("lyric-note", "Untimed lyrics · page " + (plainPage + 1) + " of " + plainPages(s) + " · arrows turn the page");
      } else {
        line("lyric-note", s.lyrics.status === "error" ? "Lyrics unavailable. Retrying shortly…" : s.lyrics.status === "missing" ? "No lyrics for this track" : s.track ? "Finding lyrics…" : "");
      }
    }
    karaoke.update();
    const showOverlay = overlay !== "off" && mode === "track" && s.lyrics.status === "timed";
    const current = s.lyrics.lines[index];
    setOverlayText(showOverlay && current ? current.text : "");
  }
  function renderNext(s) {
    const list = el(".poster-next");
    // The queue list belongs to the target; it only extends Next when that is what is drawn.
    const items = [s.next].concat(s.target && s.target.drawn ? (s.items || []).slice(1, 2) : []).filter(Boolean);
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
    applyColours(!!track);
    const nextTrackKey = s.queue ? s.queue.queue_id + ":" + (track ? track.id : "") : "";
    if (nextTrackKey !== trackKey) {
      trackKey = nextTrackKey; lyricsKey = ""; plainPage = 0;

    }
    const title = track ? track.title : "Ready when you are";
    text(el(".poster-title"), title);
    const length = title.length > 50 ? "xlong" : title.length > 26 ? "long" : title.length > 12 ? "medium" : "short";
    el(".poster-title").setAttribute("data-length", length);
    // Lyrics keep the song and artist beneath the complete cover.
    text(el(".poster-song"), title); el(".poster-song").setAttribute("data-length", length);
    text(el(".poster-artist"), track ? track.artist : "Play music in Music Assistant");
    text(el(".poster-album"), track ? track.album : "");
    text(el(".poster-target"), s.queue && s.queue.display_name || "Music Assistant");
    const paused = s.queue && s.queue.state === "paused";

    text(el(".poster-state"), !s.connected && !(s.target && s.target.connected) ? "Connecting…" : s.busy ? "Working…" : paused ? "Paused" : "");
    renderNext(s);
    const url = track && track.image || "";
    if (url !== artUrl) {
      artUrl = url; const box = el(".poster-art"); box.textContent = "";
      if (url) { const img = document.createElement("img"); img.alt = "Album artwork"; img.onerror = () => img.remove(); img.src = url; box.appendChild(img); }
    }
    const elapsed = timeLabel(s.position), total = track && track.duration ? timeLabel(track.duration) : "Live";
    text(el(".elapsed"), elapsed); text(el(".duration"), total);
    // The transport acts on the target, which a chosen idle speaker can make differ from the poster.
    const t = s.target, tt = t && t.track, tPosition = t && t.drawn ? s.position : t ? t.position : 0;
    const tPaused = t && t.queue && t.queue.state === "paused";
    text(el(".control-track"), tt ? tt.title + (tt.artist ? " · " + tt.artist : "") + (t.drawn ? "" : " · " + t.name) : t ? "Nothing playing on " + t.name : "Finding speakers…");
    text(el(".control-time"), (tPaused ? "Paused · " : "") + timeLabel(tPosition) + " / " + (tt && tt.duration ? timeLabel(tt.duration) : "Live"));
    const progress = track && track.duration ? Math.min(100, s.position / track.duration * 100) : 0;
    el(".progress-track").setAttribute("aria-valuenow", String(Math.round(progress)));
    progressSong = trackKey; progressDuration = track && track.duration || 0; progressPlaying = !!(s.queue && s.queue.state === "playing");
    if (!progressRaf) { drawProgress(s.position); runProgress(); }
    const playing = t && t.queue && t.queue.state === "playing";
    const play = toolbar.children[1];
    if (play.getAttribute("aria-label") !== (playing ? "Pause" : "Play")) {
      play.innerHTML = icon(playing ? "pause" : "play") + "<span>" + (playing ? "Pause" : "Play") + "</span>";
      play.setAttribute("aria-label", playing ? "Pause" : "Play");
    }
    Array.from(toolbar.children).slice(0, 7).forEach((b, i) => b.disabled = !t || !t.connected || (i >= 3 && i <= 4 && (!tt || !tt.duration)) || (i >= 5 && !track));
    Array.from(nav.children).forEach(b => b.classList.toggle("current", b.dataset.nav === (panel === "queue" || panel === "browse" ? panel : "now")));
    text(el(".player-error"), s.error);
    if (mode === "lyrics" || overlay !== "off") renderLyrics(s);
    else setOverlayText("");
    // Panels are only refocused when rebuilt, so a pointer can scroll a long queue.
    const rebuilt = panel === "display" ? display(s) : panel === "queue" ? queue(s) : panel === "details" ? details(s) : false;
    if (panel === "controls" || rebuilt) focusButton();
  }

  // The bar's fill: the smoothed position as a transform, every frame while
  // the song plays in Album or Lyrics with the poster's progress in view.
  const motion = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
  const smoother = createProgressSmoother({ reduced: () => !!(motion && motion.matches) });
  let progressSong = "", progressDuration = 0, progressPlaying = false, progressRaf = 0;
  function drawProgress(position) {
    const shown = smoother.next({ target: position, playing: progressPlaying, song: progressSong, at: Date.now() });
    const value = progressTransform(shown, progressDuration);
    if (bar.style.transform !== value) bar.style.transform = value;
  }
  function progressWanted() {
    return !!timer && progressPlaying && progressDuration > 0 && (mode === "album" || mode === "lyrics") && panel !== "controls";
  }
  function runProgress() {
    if (!progressRaf && progressWanted() && typeof requestAnimationFrame === "function") progressRaf = requestAnimationFrame(progressFrame);
  }
  function progressFrame() {
    progressRaf = 0;
    if (!progressWanted()) return;
    const p = live.playback;
    drawProgress(Math.min(progressDuration, Math.max(0, p && p.position || 0)));
    runProgress();
  }
  function stopProgress() { if (progressRaf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(progressRaf); progressRaf = 0; }

  applyMode(); render();
  return {
    get mode() { return mode; },
    get isOpen() { return !!panel; },
    open: openControls, close,
    playMedia, resume: () => command("play"), openBrowse: () => openPanel("browse"),
    setMode,
    snapshot: () => model.snapshot(),
    command,
    // Turn the page of untimed lyrics; returns { page, pages } (1-based) or null.
    pageLyrics(by) {
      const s = model.snapshot();
      if (s.lyrics.status !== "plain") return null;
      const pages = plainPages(s);
      plainPage = Math.max(0, Math.min(pages - 1, plainPage + by)); lyricsKey = ""; optionKey = ""; render();
      return { page: plainPage + 1, pages };
    },
    reloadPrefs() {
      lyricsOffsetMs = loadPref("lyricsOffsetMs", 0); onlineLyrics = loadPref("onlineLyrics", true); const next = loadPref("viewMode", "track"); if (VIEW_MODES.indexOf(next) >= 0) mode = next; background = loadPref("playerBackground", false);
      overlay = overlayKind(loadPref(KIND_PREF, false)); looks.line = overlayLook("line", loadPref(LOOK_PREFS.line, null)); looks.stage = overlayLook("stage", loadPref(LOOK_PREFS.stage, null));
      applyMode();
    },
    // What the lyric overlay keeps clear of: the track card's height (px, 0
    // while it is hidden) and whether the "Waiting for music" line shows.
    setOverlayContext(context) {
      if (context.cardPx === overlayContext.cardPx && context.message === overlayContext.message) return;
      overlayContext = { cardPx: context.cardPx || 0, message: !!context.message };
      placeLyricOverlay();
    },
    start() { model.start(); if (!timer) timer = setInterval(() => { model.tick(); render(); if (panel === "controls" && Date.now() > hideAt) close(); }, 250); },
    stop() { clearInterval(timer); timer = 0; stopProgress(); model.stop(); close(); },
    handleKey(name) {
      const media = { playpause: "play_pause", play: "play", pause: "pause", stop: "pause", fastforward: "next", rewind: "previous" }[name];
      if (media) { command(media); return true; }
      if (!panel) return false;
      touch();
      if (panel === "browse") { browse.handleKey(name); return true; }
      if (name === "back" && panel === "queue" && (queuePick || picking || grouping)) { queuePick = null; picking = grouping = false; focus = FIRST_ENABLED; queueKey = ""; render(); return true; }
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
