import { imageUrl, thumbOf } from "./playback.js";
import { detailOf } from "./browse-view.js";

// The idle poster: when nothing has played for a few seconds (half a minute
// after a pause), the screen sets
// what was played recently as a poster, the paused song first. Left and right
// move along the strip, OK plays (or resumes, or opens Browse); every other
// key keeps its usual meaning. On an OLED it stays calm: it drifts with the
// rest of the picture and steps down to a dim register after a few minutes
// without a key press; the first key then only wakes it.
export const IDLE_AFTER_MS = 8000;
export const PAUSED_IDLE_AFTER_MS = 30000; // a pause is often a short one
export const REST_AFTER_MS = 180000;
export const RECENT_LIMIT = 8;
export const CARRY_ON_LIMIT = 3; // audiobooks and episodes in progress, after the paused song
const RELOAD_MS = 60000;

export function nothingPlaying(playback) {
  const queue = playback && playback.queue;
  return !queue || queue.state !== "playing";
}

function pausedItem(playback) {
  const queue = playback && playback.queue, current = queue && queue.state === "paused" && queue.current_item;
  if (!current || !current.media_item) return null;
  return Object.assign({}, current.media_item, { image: current.image || thumbOf(current.media_item) });
}

// The strip: the paused song (Resume), a retry after an error, what was
// played recently (Play), and always Browse last, so OK never dead-ends.
// Audiobooks and episodes in progress (Carry on) follow the paused song.
export function idleTiles(playback, recent, state, inProgress) {
  const paused = pausedItem(playback), tiles = [];
  if (paused) tiles.push({ kind: "resume", item: paused });
  const shown = uri => tiles.some(t => t.item && t.item.uri === uri);
  (inProgress || []).forEach(item => { if (item && item.uri && !shown(item.uri) && tiles.length - (paused ? 1 : 0) < CARRY_ON_LIMIT) tiles.push({ kind: "carry", item }); });
  if (state === "error") tiles.push({ kind: "retry" });
  (recent || []).filter(item => item && item.uri && !shown(item.uri))
    .slice(0, RECENT_LIMIT).forEach(item => tiles.push({ kind: "play", item }));
  tiles.push({ kind: "browse" });
  return tiles;
}

// What the poster says for the chosen tile.
export function idleCopy(tile, state, hasRecent) {
  if (tile.kind === "resume") return { title: tile.item.name, detail: ["Paused"].concat(detailOf(tile.item).split(" · ").slice(1)).join(" · "), hint: "OK resumes" };
  if (tile.kind === "carry") return { title: tile.item.name, detail: (tile.item.media_type === "podcast_episode" ? "Episode" : "Audiobook") + " · Carry on listening", hint: "OK carries on" };
  if (tile.kind === "play") return { title: tile.item.name, detail: detailOf(tile.item), hint: "OK plays it" };
  if (tile.kind === "retry") return { title: "Nothing playing", detail: "Couldn’t load what you played", hint: "OK tries again" };
  if (state === "loading") return { title: "Nothing playing", detail: "Finding what you played…", hint: "OK opens Browse" };
  if (!hasRecent) return { title: "Nothing playing", detail: "Play something in Music Assistant and it shows here", hint: "OK opens Browse" };
  return { title: "Browse", detail: "Search, favourites, playlists and radio", hint: "OK opens Browse" };
}

function make(tag, cls, parent) { const node = document.createElement(tag); if (cls) node.className = cls; parent.appendChild(node); return node; }
function text(node, value) { const v = String(value == null ? "" : value); if (node.textContent !== v) node.textContent = v; }
function lengthOf(title) { return title.length > 50 ? "xlong" : title.length > 26 ? "long" : title.length > 12 ? "medium" : "short"; }

export function createIdle({ element, live, host, play, resume, onBrowse, now = Date.now }) {
  element.textContent = "";
  const art = make("div", "idle-art", element), where = make("p", "idle-target", element), status = make("p", "idle-state", element);
  const title = make("h1", "idle-title", element), field = make("div", "idle-field", element);
  const detail = make("p", "idle-detail", field), hint = make("p", "idle-hint", field), strip = make("ol", "idle-strip", element);
  let showing = false, quietSince = 0, lastKey = 0, loadedAt = 0, generation = 0;
  let state = "idle", recent = [], inProgress = [], tiles = [], focus = 0, stripKey = "", artUrl = null, note = "";

  async function load() {
    const gen = ++generation;
    state = "loading"; render();
    const reading = live.call("music/recently_played_items", { limit: RECENT_LIMIT + 2, fully_played_only: false });
    // In-progress spoken word is a bonus: a server that cannot say leaves it out.
    live.call("music/in_progress_items", { limit: CARRY_ON_LIMIT + 2 })
      .then(r => { if (gen === generation) { inProgress = Array.isArray(r) ? r : []; render(); } }, () => {});
    try {
      const result = await reading;
      if (gen !== generation) return;
      recent = Array.isArray(result) ? result : []; state = "ready"; loadedAt = now();
    } catch (e) { if (gen !== generation) return; state = "error"; }
    render();
  }
  function show() {
    showing = true; lastKey = now(); focus = 0; note = "";
    element.classList.add("shown");
    if (state !== "ready" || now() - loadedAt > RELOAD_MS) load();
  }
  function hide() {
    showing = false; generation++; note = "";
    if (state === "loading") state = "idle";
    element.classList.remove("shown", "rest");
  }
  async function activate(tile) {
    if (tile.kind === "browse") return onBrowse();
    if (tile.kind === "retry") return load();
    note = tile.kind === "resume" ? "Resuming…" : "Starting…"; render();
    const ok = await (tile.kind === "resume" ? resume() : play(tile.item.uri, "replace"));
    note = ok ? "" : "Couldn’t start it. OK tries again"; render();
  }

  function buildStrip() {
    strip.textContent = "";
    tiles.forEach((tile, i) => {
      const button = make("button", "idle-tile idle-" + tile.kind, make("li", "", strip));
      button.tabIndex = -1;
      button.setAttribute("aria-label", tile.item ? tile.item.name : tile.kind === "retry" ? "Try again" : "Browse");
      const url = tile.item ? imageUrl(thumbOf(tile.item), host, 160) : "";
      if (url) { const img = make("img", "", button); img.alt = ""; img.onerror = () => img.remove(); img.src = url; }
      else if (!tile.item) make("span", "idle-word", button).textContent = tile.kind === "retry" ? "Try again" : "Browse";
      button.addEventListener("click", () => { focus = i; lastKey = now(); element.classList.remove("rest"); render(); activate(tiles[i]); });
    });
  }
  function render() {
    if (!showing) return;
    const playback = live.playback, queue = playback && playback.queue;
    tiles = idleTiles(playback, recent, state, inProgress);
    const key = state + "|" + tiles.map(t => t.kind + ":" + (t.item ? t.item.uri : "")).join(",");
    if (key !== stripKey) { stripKey = key; buildStrip(); }
    focus = Math.max(0, Math.min(focus, tiles.length - 1));
    Array.from(strip.children).forEach((li, i) => li.firstChild.classList.toggle("selected", i === focus));
    const tile = tiles[focus], copy = idleCopy(tile, state, tiles.some(t => t.kind === "play"));
    // Only the paused song has a palette from Music Assistant; any other tile is
    // set on the neutral fields rather than wearing that song's colours.
    element.classList.toggle("neutral", tile.kind !== "resume");
    text(where, queue && queue.display_name || "Music Assistant");
    text(status, queue && queue.state === "paused" ? "Paused" : "Nothing playing");
    text(title, copy.title); title.setAttribute("data-length", lengthOf(copy.title));
    text(detail, copy.detail); text(hint, note || copy.hint);
    const url = tile.item ? imageUrl(thumbOf(tile.item), host, 512) : "";
    if (url !== artUrl) {
      artUrl = url; art.textContent = "";
      if (url) { const img = make("img", "", art); img.alt = ""; img.onerror = () => img.remove(); img.src = url; }
    }
  }

  return {
    get showing() { return showing; },
    // Called about once a second; `allowed` is false while anything else is on screen.
    update(allowed) {
      if (!nothingPlaying(live.playback)) quietSince = 0;
      else if (!quietSince) quietSince = now();
      const queue = live.playback && live.playback.queue;
      const wait = queue && queue.state === "paused" ? PAUSED_IDLE_AFTER_MS : IDLE_AFTER_MS;
      const want = !!allowed && !!quietSince && now() - quietSince >= wait;
      if (want && !showing) show();
      else if (!want && showing) hide();
      if (!showing) return;
      const hour = new Date(now()).getHours();
      element.classList.toggle("night", hour >= 22 || hour < 6);
      element.classList.toggle("rest", now() - lastKey >= REST_AFTER_MS);
      render();
    },
    // Returns true when the key was used: OK, left and right only.
    handleKey(name) {
      if (!showing) return false;
      const resting = element.classList.contains("rest");
      lastKey = now(); element.classList.remove("rest");
      if (name !== "ok" && name !== "left" && name !== "right") return false;
      if (resting) return true; // the first press only wakes the screen
      if (name === "ok") activate(tiles[focus]);
      else { focus = Math.max(0, Math.min(tiles.length - 1, focus + (name === "left" ? -1 : 1))); render(); }
      return true;
    },
  };
}
