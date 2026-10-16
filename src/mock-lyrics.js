// Local preview only (?mock=1): LRCLIB as the demo sees it, so "Choose other
// lyrics" has versions to list. Nothing here reaches lrclib.net.
import { lyricCandidates } from "./lrclib.js";

const WORDS = "[00:00]An evening without hurry\n[00:20]A little room to breathe\n[00:35]The light across the ceiling\n[00:50]The music underneath\n[01:10]Let the world grow quiet\n[01:30]Stay a little while";
const RESULTS = [
  { id: 9001, trackName: "A quieter kind of evening", artistName: "Afterglow demo", albumName: "Made for the room", duration: 240, syncedLyrics: WORDS, plainLyrics: "" },
  { id: 9002, trackName: "A quieter kind of evening", artistName: "Afterglow demo", albumName: "Made for the room (demo edition)", duration: 241, syncedLyrics: WORDS.replace("[00:20]", "[00:18]").replace("[00:35]", "[00:33]"), plainLyrics: "" },
  { id: 9003, trackName: "A quieter kind of evening (live)", artistName: "Afterglow demo", albumName: "Live at the demo hall", duration: 312, syncedLyrics: "[00:00]Good evening, demo hall\n" + WORDS.replace(/\[0(\d):(\d\d)\]/g, (m, a, b) => "[0" + (Number(a) + 1) + ":" + b + "]"), plainLyrics: "" },
  { id: 9004, trackName: "A quieter kind of evening", artistName: "Afterglow demo", albumName: "Short evenings", duration: 238, syncedLyrics: "", plainLyrics: WORDS.replace(/\[\d\d:\d\d\]/g, "") },
  { id: 9005, trackName: "A quieter kind of evening", artistName: "Afterglow demo", albumName: "Made for the room", duration: 240, instrumental: true, syncedLyrics: "", plainLyrics: "" },
];

export async function mockCandidates(query) {
  await new Promise(resolve => setTimeout(resolve, 400));
  return lyricCandidates(RESULTS, query);
}

export async function mockLyricsGet(id) {
  const r = RESULTS.find(x => x.id === id);
  return r ? { plain: r.plainLyrics, lrc: r.syncedLyrics } : null;
}
