// Tonight's programme as a page of the idle poster: the evening's songs set
// as a concert programme, with Keep it as a playlist and Back. The idle
// poster offers it (a tile before Browse) once the queue has played a few
// songs in the last hours; it never opens by itself. Data: programme.js.
import { confirmationFor } from "./playlists.js";
import { createSessionLog, eveningOf, headline, historyArgs, offerDetail, offered, programmeColumns, programmeSongs, queueItemsArgs, summary } from "./programme.js";

function make(tag, cls, parent) { const node = document.createElement(tag); if (cls) node.className = cls; if (parent) parent.appendChild(node); return node; }
function text(node, value) { const v = String(value == null ? "" : value); if (node.textContent !== v) node.textContent = v; }

const KEEP_KEY = "programme";

// live: { call }; playlists: playlists.js createPlaylists.
export function createProgramme({ live, playlists, now = Date.now, log = createSessionLog({ now }) }) {
  const page = make("section", "programme");
  page.setAttribute("aria-label", "Programme");
  const target = make("p", "programme-target", page), count = make("p", "programme-count", page);
  const word = make("h1", "programme-word", page), date = make("p", "programme-date", page);
  const actions = make("div", "programme-actions", page), list = make("div", "programme-list", page);
  const columns = [make("ol", "programme-col", list), make("ol", "programme-col", list)];
  const keep = make("button", "", actions), back = make("button", "", actions);
  [keep, back].forEach(b => { b.tabIndex = -1; make("span", "", b); make("span", "", b); });
  text(keep.firstChild, "Keep it as a playlist"); text(back.firstChild, "Back");
  let isOpen = false, focus = 0, queueId = "", queueName = "", history = [], loaded = "", generation = 0;
  let queueItems = null, songs = [], listKey = "";

  function songsNow() { return programmeSongs({ history, log: log.entries, queueId, queueItems, nowMs: now() }); }
  function render() {
    if (!isOpen) return;
    songs = songsNow();
    const head = headline(now());
    text(target, queueName || "Music Assistant"); text(count, summary(songs));
    text(word, head.word); text(date, head.date);
    const key = JSON.stringify(songs.map(s => [s.uri, s.artist, s.at]));
    if (key !== listKey) {
      listKey = key;
      programmeColumns(songs).forEach((rows, i) => {
        const ol = columns[i]; ol.textContent = "";
        rows.forEach(r => {
          const li = make("li", r.more ? "programme-more" : "", ol);
          text(make("span", "programme-number", li), r.number);
          const words = make("span", "programme-words", li);
          text(make("strong", "", words), r.title); text(make("span", "", words), r.artist);
          text(make("span", "programme-time", li), r.time);
        });
      });
    }
    const done = confirmationFor(playlists.job, KEEP_KEY, now());
    text(keep.lastChild, done ? done.text : "");
    keep.classList.toggle("chosen", !!(done && done.tick));
    [keep, back].forEach((b, i) => { b.classList.toggle("selected", i === focus); b.tabIndex = i === focus ? 0 : -1; });
  }
  async function loadQueueItems(id) {
    try {
      const result = await live.call("player_queues/items", queueItemsArgs(id));
      if (id === queueId && isOpen) { queueItems = Array.isArray(result) ? result : []; render(); }
    } catch (e) { /* the log's artists are enough */ }
  }
  function keepIt() {
    if (!songs.length) return;
    // Named for the evening, as the page heads it: half past one is still the night before.
    const head = headline(now());
    playlists.keep(songs.map(s => s.uri), head.word, KEEP_KEY, eveningOf(now()));
    render();
  }
  playlists.listen(() => render());
  keep.addEventListener("click", () => { focus = 0; keepIt(); });
  back.addEventListener("click", () => { isOpen = false; page.classList.remove("shown"); });
  return {
    get isOpen() { return isOpen; },
    element: page, // the idle poster mounts it
    get log() { return log; },
    observe(queue) { log.observe(queue); },
    // The idle poster appeared: read the queue's played history (once a minute at most).
    async refresh(queue) {
      const entries = log.entries;
      queueId = queue && queue.queue_id || (entries.length ? entries[entries.length - 1].queueId : "");
      queueName = queue && queue.display_name || queueName;
      if (!queueId) return;
      const stamp = queueId + ":" + Math.floor(now() / 60000);
      if (stamp === loaded) return;
      loaded = stamp;
      const gen = ++generation;
      try {
        const result = await live.call("music/recently_played_items", historyArgs(queueId, now()));
        if (gen === generation) history = Array.isArray(result) ? result : [];
      } catch (e) { if (gen === generation) history = null; } // the log alone, then
    },
    // { word, detail } while it is on offer, else null.
    tile() {
      if (!queueId) return null;
      const list = songsNow();
      return offered(list) ? { word: headline(now()).word, detail: offerDetail(list, queueName) } : null;
    },
    open() { isOpen = true; focus = 0; listKey = ""; queueItems = null; page.classList.add("shown"); render(); loadQueueItems(queueId); },
    close() { isOpen = false; page.classList.remove("shown"); },
    render,
    // Every key while open: up/down between the actions, OK acts, Back closes.
    handleKey(name) {
      if (name === "back" || (name === "ok" && focus === 1)) { this.close(); return true; }
      if (name === "ok") keepIt();
      else if (name === "up" || name === "down" || name === "left" || name === "right") focus = name === "up" || name === "left" ? 0 : 1;
      render();
      return true;
    },
  };
}
