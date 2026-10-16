// The song-by-song lyrics tools of the player panels (docs/settings.md):
// keeping a timing for a song, choosing other lyrics from LRCLIB, and going
// to a line. The rows go into the Display panel's Lyrics section and the
// Details panel; "Choose lyrics" and "Go to a line" are their sub-pages.
import { firstArtist, lyricIndex, timeLabel } from "./playback.js";
import { searchCandidates as lrclibCandidates } from "./lrclib.js";
import { chooseLyrics, chosenLyrics, clearChoice, createTimingOffer, forgetTiming, keepTiming, keptTiming, lineSeekPosition, readSongs, SONGS_PREF } from "./song-lyrics.js";

const STEP_MS = 100, LIMIT_MS = 10000;
const LONGER_S = 10; // a candidate this much longer or shorter says so

// "With the music", "0.3 s later", "1.2 s earlier".
export function timingLabel(ms) {
  return ms ? (Math.abs(ms) / 1000).toFixed(1) + " s " + (ms > 0 ? "later" : "earlier") : "With the music";
}

// A candidate's second line: its length (and how far that is from the
// song's, beyond a few seconds), Timed/Plain, then the album, which is the
// part a narrow row may cut.
export function candidateDetail(c, duration) {
  const gap = duration > 0 && c.duration > 0 ? Math.round(c.duration - duration) : 0;
  const far = Math.abs(gap) > LONGER_S ? timeLabel(Math.abs(gap)) + (gap > 0 ? " longer" : " shorter") : "";
  return [c.duration ? timeLabel(c.duration) : "", far, c.timed ? "Timed" : "Plain", c.album].filter(Boolean).join(" · ");
}

// The song's identity for the store: its Music Assistant uri, "" for none.
export function songId(track) {
  const media = track && track.media;
  return media && media.media_type === "track" && typeof media.uri === "string" ? media.uri : "";
}

// prefs: { load(key, fallback), save(key, value) }; device(): the Lyrics timing
// preference, setDevice(ms) changes it; seek(position) and closePanel() act on
// the player; search(query): LRCLIB candidates (lrclib.js searchCandidates).
export function createLyricsTools({ model, prefs, device, setDevice, online, onNotice, seek, closePanel, search = lrclibCandidates, now = Date.now }) {
  let songs = readSongs(prefs.load(SONGS_PREF, []));
  const offer = createTimingOffer();
  let page = ""; // "", "choose" (Display) or "lines" (Details)
  let pageSong = "", focusLine = false;
  let found = { song: "", state: "idle", list: [] };

  function save(next) { if (next !== songs) { songs = next; prefs.save(SONGS_PREF, songs); } }
  const songKey = s => (s.queue && s.track ? s.queue.queue_id + ":" + s.track.id : "");
  const kept = (track, lyrics) => keptTiming(songs, songId(track), lyrics && lyrics.sum);
  const clamp = ms => Math.max(-LIMIT_MS, Math.min(LIMIT_MS, ms));

  // The timing that places this song's lyrics: the one kept for it, else the device's.
  function offsetFor(track, lyrics) {
    const ms = kept(track, lyrics);
    return ms === null ? device() : ms;
  }
  function pending(s) {
    return offer.pending({ deviceMs: device(), kept: kept(s.track, s.lyrics), timed: s.lyrics.status === "timed", id: songId(s.track) });
  }
  // Left/right on Lyrics timing: the kept timing while there is one, else the device's.
  function stepTiming(s, dir) {
    const ms = kept(s.track, s.lyrics);
    if (ms !== null) save(keepTiming(songs, songId(s.track), s.lyrics.sum, clamp(ms + dir * STEP_MS), now()));
    else setDevice(clamp(device() + dir * STEP_MS));
  }
  function keep(s) {
    save(keepTiming(songs, songId(s.track), s.lyrics.sum, device(), now()));
    setDevice(offer.base); offer.answer();
    onNotice("Timing kept for this song");
  }
  function canChoose(s) {
    return online() && !!songId(s.track) && ["timed", "plain", "missing", "error"].indexOf(s.lyrics.status) >= 0;
  }
  function sourceLabel(s) {
    if (chosenLyrics(songs, songId(s.track))) return "Chosen for this song";
    return { ma: "From Music Assistant", lrclib: "From lrclib.net", chosen: "From lrclib.net" }[s.lyrics.source] || "";
  }
  function find(s) {
    const song = songKey(s), track = s.track;
    found = { song, state: "loading", list: [] };
    search({ title: track.title, artist: firstArtist(track.media), duration: track.duration })
      .then(list => { if (found.song === song) found = { song, state: "ready", list }; })
      .catch(() => { if (found.song === song) found = { song, state: "error", list: [] }; });
  }
  function open(which, s) {
    page = which; pageSong = songKey(s); focusLine = which === "lines";
    if (which === "choose") find(s);
  }
  function pick(s, c) {
    model.useLyrics(c);
    save(chooseLyrics(songs, songId(s.track), c.id, c.sum, now()));
    onNotice("Lyrics chosen for this song");
    page = "";
  }
  function automatic(s) {
    const id = songId(s.track), had = chosenLyrics(songs, id);
    save(clearChoice(songs, id, now()));
    if (had) { model.retryLyrics(); onNotice("Lyrics back to automatic"); }
    page = "";
  }

  function choosePage(s, ui) {
    ui.title("Choose lyrics");
    ui.note({ loading: "Searching lrclib.net…", error: "lrclib.net is busy. Try again shortly.",
      ready: found.list.length ? "Pick the lyrics for this song. Your pick is kept." : "lrclib.net has no other lyrics for this song." }[found.state] || "");
    const chosen = chosenLyrics(songs, songId(s.track));
    ui.addRow("Automatic", "Music Assistant, else the best match", () => automatic(s)).classList.toggle("chosen", !chosen);
    found.list.forEach(c => ui.addRow(c.title + " · " + c.artist, candidateDetail(c, s.track.duration), () => pick(s, c)).classList.toggle("chosen", c.id === chosen));
    if (found.state === "error") ui.addRow("Try again", "", () => find(s));
  }
  function linesPage(s, ui) {
    ui.title("Go to a line");
    ui.note(s.track.title + " · plays from the line you pick");
    const lines = s.lyrics.lines, offset = offsetFor(s.track, s.lyrics);
    const current = lyricIndex(lines, s.lyricPosition);
    // The line on screen is ticked, or in a gap the last one sung before it.
    const rows = [];
    let sung = -1;
    lines.forEach((line, i) => {
      if (!line.text.trim()) return;
      if (i <= current) sung = rows.length;
      const at = lineSeekPosition(line.at, offset, s.track.duration);
      rows.push(ui.addRow(line.text, timeLabel(at), () => { page = ""; seek(at); closePanel(); }, !s.connected));
    });
    if (sung >= 0) rows[sung].classList.add("chosen");
    if (focusLine) { focusLine = false; ui.setFocus(Math.max(0, sung)); }
  }

  return {
    get page() { return page; },
    offsetFor,
    lyricsChoice: uri => chosenLyrics(songs, uri),
    choiceGone(uri) { save(clearChoice(songs, uri, now())); },
    // Every render: the offer follows the song; a sub-page closes when the song changes.
    tick(s) {
      offer.song(songKey(s), device());
      if (page && songKey(s) !== pageSong) page = "";
    },
    // What the rows depend on, for the panels' "rebuild only on change" keys.
    key(s) {
      return [page, kept(s.track, s.lyrics), pending(s), chosenLyrics(songs, songId(s.track)), s.lyrics.source, s.lyrics.sum, found.state, found.list.length, device()];
    },
    // Display → Lyrics: Lyrics timing and what goes with it (spec rows 1-4).
    timingRows(s, ui) {
      const ms = kept(s.track, s.lyrics);
      ui.addRow("Lyrics timing", timingLabel(ms === null ? device() : ms), dir => stepTiming(s, dir), false, true);
      if (pending(s)) {
        ui.heading("Keep this timing for this song?");
        ui.addRow("Keep", "Other songs: " + timingLabel(offer.base), () => keep(s));
        ui.addRow("Not now", "", () => offer.answer());
      }
      if (ms !== null) ui.addRow("Forget timing for this song", "Timing: kept for this song", () => {
        save(forgetTiming(songs, songId(s.track), now())); onNotice("Timing forgotten for this song");
      });
      else if (device()) ui.addRow("Reset lyrics timing", "", () => setDevice(0));
    },
    // Display → Lyrics, after Online lyrics.
    chooseRow(s, ui) {
      if (canChoose(s)) ui.addRow("Choose other lyrics", sourceLabel(s), () => open("choose", s));
    },
    // Details, after its actions.
    lineRow(s, ui) {
      if (s.lyrics.status === "timed" && s.track && s.track.duration > 0) ui.addRow("Go to a line", "", () => open("lines", s), !s.connected);
    },
    // Draws the open sub-page of `panel` into ui; false when there is none.
    drawPage(panel, s, ui) {
      if (page === "choose" && panel === "display" && s.track) { choosePage(s, ui); return true; }
      if (page === "lines" && panel === "details" && s.track) { linesPage(s, ui); return true; }
      return false;
    },
    back() { page = ""; },
    // Settings restored from the account: the offer measures from the restored timing.
    reload() { songs = readSongs(prefs.load(SONGS_PREF, [])); offer.song("", device()); },
  };
}
