// The rows this lane adds to Details (the back of the poster) and its
// Chapters page, as plain descriptions player-view.js turns into rows:
// { label, value, run, adjust, chosen }. run is OK; adjust, when present,
// is left (-1) and right (+1).
import { chapterAt, chaptersOf, clockLabel, isSpokenWord, linksOf, speedLabel, stepSpeed } from "./spoken-word.js";

// Go to the album / artists / podcast, then Speed and Chapters for spoken word.
export function detailsRows(s, { go, setSpeed, openChapters }) {
  const media = s.track && s.track.media;
  const rows = linksOf(media).map(link => ({ label: link.label, value: link.value, run: () => go(link.item) }));
  if (!isSpokenWord(media) || !s.track.duration) return rows;
  const speed = s.speed || 1;
  rows.push({ label: "Speed", value: speedLabel(speed), run: () => setSpeed(stepSpeed(speed, 1, true)), adjust: dir => setSpeed(stepSpeed(speed, dir)) });
  const chapters = chaptersOf(media);
  if (chapters.length) {
    const at = chapterAt(chapters, s.position);
    rows.push({ label: "Chapters", value: at >= 0 ? "Chapter " + (at + 1) + " of " + chapters.length : chapters.length + " chapters", run: openChapters });
  }
  return rows;
}

// One row per chapter, the playing one ticked; OK seeks to its start.
export function chapterRows(s, seek) {
  const chapters = chaptersOf(s.track && s.track.media), at = chapterAt(chapters, s.position);
  return chapters.map((c, i) => ({ label: c.name, value: clockLabel(c.start), run: () => seek(c.start), chosen: i === at }));
}

// Radio is built from songs; not from a book, an episode or a station.
export function offersRadio(s) {
  const media = s.track && s.track.media;
  return !media || (!isSpokenWord(media) && media.media_type !== "radio");
}
// What Details redraws on: the rows above change with these.
export function detailsKey(s) {
  const media = s.track && s.track.media;
  if (!isSpokenWord(media)) return "";
  return s.speed + ":" + chapterAt(chaptersOf(media), s.position);
}
