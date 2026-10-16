// Audiobooks and podcast episodes: what Details offers while one plays
// (Speed, Chapters), the Go to rows for any song, and Browse's detail lines
// for spoken word. Shared wording with the PS5 app (.lanes/_brief/R2-browse.md).

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
export const MAX_CHAPTERS = 300;
const MAX_ARTIST_LINKS = 3;

// Music Assistant 2.10 changes speed only for these, and only with a duration.
export function isSpokenWord(media) {
  return !!media && (media.media_type === "audiobook" || media.media_type === "podcast_episode");
}
export function speedLabel(speed) { return String(Math.round((Number(speed) || 1) * 100) / 100) + "×"; }
// Left and right stop at the ends; OK (wrap) steps up and starts again after 2×.
export function stepSpeed(current, direction, wrap) {
  const at = SPEEDS.reduce((best, s, i) => Math.abs(s - current) < Math.abs(SPEEDS[best] - current) ? i : best, 1);
  const next = at + direction;
  if (wrap) return SPEEDS[(next + SPEEDS.length) % SPEEDS.length];
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, next))];
}
// The speed a queue plays at: the queue's own field, else its current item's.
export function speedOf(queue) {
  const value = queue && (queue.playback_speed || (queue.current_item && queue.current_item.extra_attributes && queue.current_item.extra_attributes.playback_speed));
  return Number(value) > 0 ? Number(value) : 1;
}

// metadata.chapters: [{ position, name, start, end }] in seconds; two or more make a list.
export function chaptersOf(media) {
  const list = (media && media.metadata && media.metadata.chapters) || [];
  if (!Array.isArray(list)) return [];
  const out = list.filter(c => c && Number.isFinite(Number(c.start)) && Number(c.start) >= 0)
    .map((c, i) => ({ name: String(c.name || "").trim() || "Chapter " + (i + 1), start: Math.floor(Number(c.start)) }))
    .sort((a, b) => a.start - b.start).slice(0, MAX_CHAPTERS);
  return out.length >= 2 ? out : [];
}
// The chapter playing at `position` seconds (-1 before the first).
export function chapterAt(chapters, position) {
  let found = -1;
  chapters.forEach((c, i) => { if (c.start <= position + 0.5) found = i; });
  return found;
}
export function clockLabel(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0)), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  const ss = String(s % 60).padStart(2, "0");
  return h ? h + ":" + String(m).padStart(2, "0") + ":" + ss : m + ":" + ss;
}

// Where Details can go from the playing item: its album, up to three artists,
// or an episode's podcast. Only items Music Assistant gave ids for.
export function linksOf(media) {
  if (!media) return [];
  const usable = x => x && x.item_id && x.provider && x.name;
  const link = (x, mediaType, label) => ({ label, value: mediaType === "artist" ? "" : x.name,
    item: { item_id: String(x.item_id), provider: x.provider, media_type: mediaType, name: x.name, uri: x.uri || "" } });
  if (media.media_type === "podcast_episode") return usable(media.podcast) ? [link(media.podcast, "podcast", "Go to the podcast")] : [];
  if (media.media_type !== "track") return [];
  const out = [];
  if (usable(media.album)) out.push(link(media.album, "album", "Go to the album"));
  (media.artists || []).filter(usable).slice(0, MAX_ARTIST_LINKS).forEach(a => out.push(link(a, "artist", "Go to " + a.name)));
  return out;
}

// Browse's second line for spoken word, after the kind (PS5 item_subtitle).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) return "";
  return Number(m[3]) + " " + MONTHS[m[2] - 1] + " " + m[1];
}
function shortDuration(seconds) {
  if (!(seconds > 0)) return "";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? minutes + " min" : Math.floor(minutes / 60) + " h" + (minutes % 60 ? " " + (minutes % 60) + " min" : "");
}
const names = list => (Array.isArray(list) ? list : []).map(a => typeof a === "string" ? a : a && a.name).filter(Boolean).join(", ");
export function spokenDetail(item) {
  if (item.media_type === "audiobook") return names(item.authors);
  if (item.media_type === "podcast_episode") return [shortDate(item.metadata && item.metadata.release_date), shortDuration(item.duration)].filter(Boolean).join(" · ");
  if (item.media_type === "podcast") {
    const n = Number(item.total_episodes) || 0;
    return [String(item.publisher || "").trim(), n > 0 ? n + (n === 1 ? " episode" : " episodes") : ""].filter(Boolean).join(" · ");
  }
  return "";
}
