// Local preview only (?mock=1). These commands never reach Music Assistant.
import { commandTarget, groupOptions, speakersOf, transferPlan } from "./pick.js";

// Demo tracks carry synthetic covers and palettes so the poster can be judged
// with real-looking colour; every name says "demo" so none passes for real music.
const COVERS = {
  cobalt: '<rect width="600" height="600" fill="#2846c8"/><circle cx="420" cy="230" r="150" fill="#e3c84b"/><rect x="60" y="430" width="480" height="18" fill="#ebe7de"/>',
  teal: '<rect width="600" height="600" fill="#127876"/><rect x="0" y="300" width="600" height="300" fill="#f2aabe"/><circle cx="300" cy="300" r="120" fill="#06201f"/>',
  green: '<rect width="600" height="600" fill="#ece4c8"/><rect x="80" y="80" width="200" height="440" fill="#205c3a"/><rect x="320" y="260" width="200" height="260" fill="#205c3a"/>',
  violet: '<rect width="600" height="600" fill="#603cb4"/><path d="M0 420 Q150 320 300 420 T600 420 V600 H0z" fill="#bee650"/><circle cx="440" cy="160" r="70" fill="#f2efe6"/>',
  red: '<rect width="600" height="600" fill="#121417"/><rect x="60" y="60" width="480" height="480" fill="#c81e32"/><rect x="60" y="280" width="480" height="40" fill="#f0ece4"/>',
  sky: '<rect width="600" height="600" fill="#bcd7ef"/><circle cx="300" cy="600" r="260" fill="#1d3557"/><rect x="0" y="120" width="600" height="14" fill="#1d3557"/>',
};
const PALETTES = {
  cobalt: { primary: [40, 70, 200], accent: [227, 200, 75], background_dark: [10, 14, 40], background_light: [222, 226, 240] },
  teal: { primary: [18, 120, 118], accent: [242, 170, 190], background_dark: [6, 30, 30] },
  green: { primary: [32, 92, 58], accent: [236, 228, 200], background_dark: [10, 26, 16] },
  violet: { primary: [96, 60, 180], accent: [190, 230, 80], background_dark: [20, 12, 40] },
  red: { primary: [200, 30, 50], accent: [240, 236, 228], background_dark: [30, 6, 10] },
  sky: { primary: [29, 53, 87], accent: [188, 215, 239], background_dark: [8, 14, 24] },
};
const TRACKS = [
  ["A quieter kind of evening", "Afterglow demo", "Made for the room", 240, "cobalt"],
  ["The lights settle", "Afterglow demo", "Made for the room", 180, "teal"],
  ["Home, slowly", "The Demo Ensemble", "Short evenings", 210, "green"],
  ["Everything we said on the long drive back from the coast", "Demo Field Recordings", "Coastline (demo)", 412, "violet"],
  ["Śpiewaj ciszej", "Zespół demo", "Wieczór (demo)", 198, "red"],
  ["Low tide", "Demo Field Recordings", "Coastline (demo)", 264, "sky"],
  ["Second kettle", "The Demo Ensemble", "Short evenings", 172, "green"],
];
const ALBUMS = [["Made for the room", "Afterglow demo", "cobalt", 2025], ["Short evenings", "The Demo Ensemble", "green", 2023], ["Coastline (demo)", "Demo Field Recordings", "violet", 2024], ["Wieczór (demo)", "Zespół demo", "red", 2022]];
const PLAYLISTS = [["Sunday kitchen (demo)", "sky"], ["Late, quiet (demo)", "cobalt"], ["Weekend picks (demo)", "red"]];
// Speakers as Music Assistant describes them. The living room plays; the
// kitchen and this TV can join it, the bedroom (another system) cannot.
function demoPlayers() {
  const speaker = (id, name, extra) => Object.assign({ player_id: id, name, type: "player", provider: "sendspin--demo", available: true, enabled: true,
    volume_level: 30, group_members: [], can_group_with: ["sendspin--demo"], supported_features: ["set_members", "volume_set"] }, extra);
  return {
    "demo-home": speaker("demo-home", "Home speakers · Preview", { type: "group", provider: "universal_group--demo", group_members: ["demo-living", "demo-kitchen"], can_group_with: [], supported_features: [] }),
    "demo-living": speaker("demo-living", "Living room · Preview", { volume_level: 35 }),
    "demo-kitchen": speaker("demo-kitchen", "Kitchen · Preview", { volume_level: 20 }),
    "demo-tv": speaker("demo-tv", "This TV · Preview", { volume_level: 50 }),
    "demo-bedroom": speaker("demo-bedroom", "Bedroom · Preview", { provider: "sonos--demo", can_group_with: ["sonos--demo"] }),
  };
}

const cover = key => ({ type: "thumb", path: "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">' + COVERS[key] + "</svg>"), remotely_accessible: true });
const albumOf = name => ALBUMS.find(a => a[0] === name);
const ARTISTS = [...new Set(TRACKS.map(t => t[1]))];
// Songs carry their album's and artist's ids, as Music Assistant sends them (Details' Go to rows).
function track([name, artist, album, duration, art], i) {
  const year = (albumOf(album) || [])[3], albumId = String(ALBUMS.indexOf(albumOf(album)) + 1), artistId = String(ARTISTS.indexOf(artist) + 1);
  return { item_id: String(i + 1), provider: "library", media_type: "track", uri: "library://track/" + (i + 1), name, duration, favorite: i % 2 === 0,
    artists: [{ item_id: artistId, provider: "library", uri: "library://artist/" + artistId, name: artist }],
    album: { item_id: albumId, provider: "library", uri: "library://album/" + albumId, name: album, year }, metadata: { images: [cover(art)] }, demoArt: art };
}
// Long lists, to show Browse and the queue paging: 400 songs in one playlist, 150 more albums.
const ARTS = Object.keys(COVERS);
const LONG_DRIVE = Array.from({ length: 400 }, (_, i) => track(["Long drive, part " + (i + 1) + " (demo)", "Demo Field Recordings", "Coastline (demo)", 150 + (i * 37) % 120, ARTS[i % ARTS.length]], 100 + i));
const MORE_ALBUMS = Array.from({ length: 150 }, (_, i) => ({ item_id: String(ALBUMS.length + i + 1), provider: "library", media_type: "album", uri: "library://album/" + (ALBUMS.length + i + 1),
  name: "Shelf " + (i + 1) + " (demo)", year: 2000 + (i % 25), artists: [{ name: "The Demo Ensemble" }], metadata: { images: [cover(ARTS[i % ARTS.length])] } }));
// Spoken word: podcasts with episodes, audiobooks with chapters; one of each is in progress.
const chapters = (count, length) => Array.from({ length: count }, (_, i) => ({ position: i + 1, name: i === 0 ? "Opening credits" : "Chapter " + i + " (demo)", start: i * length, end: (i + 1) * length }));
const PODCASTS = [["Quiet hour (demo)", "Demo Radio", "teal", 12], ["Kitchen table talks (demo)", "The Demo Ensemble", "red", 6]];
const BOOKS = [["The lighthouse keeper's year (demo)", "A. Demo Writer", "sky", 24, 900], ["Notes from a slow river (demo)", "B. Example", "green", 9, 1500]];
const PODCAST_ITEMS = PODCASTS.map(([name, publisher, art, total], i) => ({ item_id: String(i + 1), provider: "library", media_type: "podcast", uri: "library://podcast/" + (i + 1), name, publisher, total_episodes: total, favorite: true, metadata: { images: [cover(art)] }, demoArt: art }));
function episodes(podcast) {
  const index = PODCAST_ITEMS.indexOf(podcast);
  return Array.from({ length: podcast.total_episodes }, (_, i) => ({ item_id: "p" + podcast.item_id + "e" + (i + 1), provider: "library", media_type: "podcast_episode", uri: "library://podcast_episode/p" + podcast.item_id + "e" + (i + 1),
    name: "Episode " + (podcast.total_episodes - i) + ": " + ["Morning light", "Second kettle", "Low tide", "The long way home"][i % 4] + " (demo)", duration: 1500 + i * 120 + index * 300,
    podcast: { item_id: podcast.item_id, provider: "library", uri: podcast.uri, name: podcast.name }, metadata: { images: podcast.metadata.images, release_date: "2026-" + String(10 - (i % 9)).padStart(2, "0") + "-0" + (1 + i % 9) + "T00:00:00+00:00",
      chapters: i === 0 ? chapters(4, 400) : [] }, demoArt: podcast.demoArt }));
}
const BOOK_ITEMS = BOOKS.map(([name, author, art, count, length], i) => ({ item_id: String(i + 1), provider: "library", media_type: "audiobook", uri: "library://audiobook/" + (i + 1), name, favorite: i === 0,
  authors: [{ name: author }], duration: count * length, resume_position_ms: i === 0 ? 3 * length * 1000 + 200000 : 0, metadata: { images: [cover(art)], chapters: chapters(count, length) }, demoArt: art }));
const LIBRARY = {
  track: TRACKS.map(track),
  album: ALBUMS.map(([name, artist, art, year], i) => ({ item_id: String(i + 1), provider: "library", media_type: "album", uri: "library://album/" + (i + 1), name, year, favorite: i < 2, artists: [{ name: artist }], metadata: { images: [cover(art)] } })).concat(MORE_ALBUMS),
  podcast: PODCAST_ITEMS,
  audiobook: BOOK_ITEMS,
  playlist: PLAYLISTS.concat([["Long drive (demo)", "violet"]]).map(([name, art], i) => ({ item_id: String(i + 1), provider: "library", media_type: "playlist", uri: "library://playlist/" + (i + 1), name, favorite: i < 2, metadata: { images: [cover(art)] } })),
  artist: [...new Set(TRACKS.map(t => t[1]))].map((name, i) => ({ item_id: String(i + 1), provider: "library", media_type: "artist", uri: "library://artist/" + (i + 1), name, favorite: i === 0, metadata: { images: [cover(Object.keys(COVERS)[i])] } })),
  radio: [{ item_id: "1", provider: "library", media_type: "radio", uri: "library://radio/1", name: "Demo FM", favorite: true, metadata: { images: [cover("sky")] } }],
};
function tracksFor(uri) {
  const [, kind, id] = /^library:\/\/(\w+)\/(\w+)$/.exec(uri) || [];
  if (kind === "track") return LIBRARY.track.filter(t => t.item_id === id);
  if (kind === "album") return id > ALBUMS.length ? LIBRARY.track.slice(0, 3) : LIBRARY.track.filter(t => t.album.name === ALBUMS[id - 1][0]);
  if (kind === "playlist") return id === "4" ? LONG_DRIVE : LIBRARY.track.filter((t, i) => (i + Number(id)) % 2 === 0);
  if (kind === "audiobook") return BOOK_ITEMS.filter(b => b.item_id === id);
  if (kind === "podcast") return episodes(PODCAST_ITEMS[id - 1]).slice(0, 1);
  if (kind === "podcast_episode") return PODCAST_ITEMS.map(episodes).reduce((a, b) => a.concat(b), []).filter(e => e.item_id === id);
  if (kind === "artist" && Number(id) > LIBRARY.artist.length) return [];
  if (kind === "artist") { const name = LIBRARY.artist[id - 1].name; return LIBRARY.track.filter(t => t.artists[0].name === name); }
  return LIBRARY.track.slice(0, 3);
}

// Search by name across the demo library. "fail" fails, to show the error state.
function search(args) {
  const q = String(args.search_query || "").toLowerCase();
  if (q === "fail") throw new Error("Demo search failed");
  const found = kind => LIBRARY[kind].filter(i => i.name.toLowerCase().indexOf(q) >= 0 || (i.artists || []).some(a => a.name.toLowerCase().indexOf(q) >= 0)).slice(0, args.limit || 25);
  return { artists: found("artist"), albums: found("album"), tracks: found("track"), playlists: found("playlist"), radio: [] };
}

// What the idle poster and Browse show as played lately: every kind, each with a cover.
function recentlyPlayed() {
  return [LIBRARY.album[2], LIBRARY.track[4], LIBRARY.playlist[0], LIBRARY.album[0], LIBRARY.artist[1], LIBRARY.radio[0], LIBRARY.album[1], LIBRARY.playlist[2]]
    .map(i => Object.assign({ image: i.metadata.images[0] }, i));
}

let sequence = 0;
function queueItem(media) {
  const quality = media.item_id % 3 === 0 ? ["flac", 96000, 24, "hi_res"] : media.item_id % 3 === 1 ? ["flac", 44100, 16, "lossless"] : ["ogg", 44100, 16, "lossy"];
  return { queue_item_id: "demo-" + ++sequence, name: media.name, duration: media.duration, media_item: Object.assign({}, media, { metadata: media.metadata }), demoPalette: PALETTES[media.demoArt],
    streamdetails: { provider: quality[0] === "ogg" ? "spotify--demo" : "filesystem--demo", item_id: media.item_id,
      audio_format: { content_type: quality[0], sample_rate: quality[1], bit_depth: quality[2], bit_rate: quality[0] === "ogg" ? 320 : 0 },
      audio_processing: { input_fidelity: { quality: quality[3] } } } };
}

// The track card's fields, as follow.js trackOf gives them.
function trackOf(item) {
  if (!item) return null;
  const media = item.media_item;
  const people = media.artists || media.authors || [];
  return { id: item.queue_item_id, title: media.name, artist: people.map(a => a.name).join(", "), album: media.album ? media.album.name : media.podcast ? media.podcast.name : "",
    year: media.album && media.album.year || "", label: "Demo Records" };
}

export function createMockPlayback() {
  let tracks = LIBRARY.track.slice(0, 5).map(queueItem);
  let position = 24, at = Date.now(), preferred = "", own = "demo-tv";
  let trackListener = null, announced = ""; // the track card's song (main.js showTrackCard)
  const players = demoPlayers();
  const queues = {};
  for (const id in players) queues[id] = { queue_id: id, display_name: players[id].name, state: "idle", current_item: null, repeat_mode: "off", items: 0 };
  // The music: one queue object, moved between speakers by a transfer.
  const queue = queues["demo-living"];
  Object.assign(queue, { current_index: 0, current_item: tracks[0], next_item: tracks[1], state: "playing" });
  // A book or episode carries on where it was left, as Music Assistant resumes it.
  function select(index) { queue.current_index = Math.max(0, Math.min(tracks.length - 1, index)); refresh(); position = (queue.current_item.media_item.resume_position_ms || 0) / 1000; at = Date.now(); }
  function refresh() {
    queue.current_item = tracks[queue.current_index]; queue.next_item = tracks[queue.current_index + 1] || null; queue.items = tracks.length;
    const id = queue.current_item ? queue.current_item.queue_item_id : "";
    if (id !== announced) { announced = id; if (trackListener) trackListener(trackOf(queue.current_item)); }
  }
  function insert(items, where) { tracks.splice(where, 0, ...items); refresh(); }
  const page = (list, args) => list.slice(args.offset || 0, (args.offset || 0) + (args.limit || 500));
  const target = () => commandTarget({ players, queues, preferred, current: queue.queue_id, last: "", own });
  function moveMusic(to) {
    if (!queues[to] || to === queue.queue_id) return;
    const from = queue.queue_id;
    queues[from] = { queue_id: from, display_name: players[from].name, state: "idle", current_item: null, repeat_mode: "off", items: 0 };
    queues[to] = queue;
    Object.assign(queue, { queue_id: to, display_name: players[to].name });
    for (const id of players[from].group_members.slice(1)) setMember(from, id, false);
  }
  function setMember(leader, id, on) {
    const lead = players[leader], member = players[id];
    lead.group_members = lead.group_members.filter(m => m !== id && m !== leader);
    if (on) lead.group_members.push(id);
    if (lead.group_members.length) lead.group_members.unshift(leader);
    member.synced_to = on ? leader : null;
    const levels = lead.group_members.map(m => players[m].volume_level);
    lead.group_volume = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : lead.volume_level;
  }
  return {
    mock: true, // no lyrics lookups outside the demo
    get playback() { return { queue, player: players[queue.queue_id], connected: true, position: position + (queue.state === "playing" ? (Date.now() - at) / 1000 : 0) }; },
    get palette() { return queue.current_item.demoPalette; },
    get track() { return trackOf(queue.current_item); },
    onTrack(fn) { trackListener = fn; announced = queue.current_item ? queue.current_item.queue_item_id : ""; },
    speakers() { return speakersOf(players); },
    get preferred() { return preferred; },
    get following() { return { name: players[queue.queue_id].name, playerId: queue.queue_id, queueId: queue.queue_id, reason: "auto" }; },
    get target() {
      const t = target();
      return t ? Object.assign({ name: players[t.playerId].name, queue: queues[t.queueId], player: players[t.queueId], connected: true }, t) : null;
    },
    get ownPlayer() { return own; },
    setOwnPlayer(id) { own = id || ""; },
    setPreferred(id) { preferred = id || ""; },
    groupOptions() { const t = target(); return t ? groupOptions(players, t.queueId) : []; },
    transferPlan(id, stopped) { const t = target(); return t ? transferPlan({ players, queues, from: t.queueId, to: id, stopped }) : null; },
    async call(command, args) {
      args = args || {};
      const library = /^music\/(\w+)s\/library_items$/.exec(command);
      // Later pages take a moment, as on a real server, so "Loading more…" can be seen.
      if ((library && args.offset > 0) || (command === "player_queues/items" && args.offset > queue.current_index + 1)) await new Promise(resolve => setTimeout(resolve, 300));
      if (library) return page((LIBRARY[library[1]] || []).filter(i => !args.favorite || i.favorite), args);
      if (command === "music/recently_played_items") return recentlyPlayed().slice(0, args.limit || 10);
      if (command === "music/search") return search(args);
      if (command === "music/albums/album_tracks") return tracksFor("library://album/" + args.item_id);
      if (command === "music/playlists/playlist_tracks") return tracksFor("library://playlist/" + args.item_id);
      if (command === "music/artists/artist_tracks") return tracksFor("library://artist/" + args.item_id);
      if (command === "music/podcasts/podcast_episodes") return episodes(PODCAST_ITEMS[args.item_id - 1] || PODCAST_ITEMS[0]);
      if (command === "music/in_progress_items") return [BOOK_ITEMS[0], episodes(PODCAST_ITEMS[0])[1]].map(i => ({ item_id: i.item_id, provider: "library", media_type: i.media_type, uri: i.uri, name: i.name, image: i.metadata.images[0] })).slice(0, args.limit || 10);
      if (command === "player_queues/set_playback_speed") { queue.playback_speed = args.speed; return null; }
      if (command === "providers") return [{ instance_id: "spotify--demo", domain: "spotify", name: "Spotify (demo)" }, { instance_id: "filesystem--demo", domain: "filesystem_local", name: "Music folder (demo)" }];
      if (command === "metadata/get_track_lyrics") return [null, "[00:00]An evening without hurry\n[00:20]<00:20.0>A <00:20.6>little <00:21.4>room <00:22.4>to <00:23.0>breathe\n[00:35]<00:35.0>The <00:35.5>light <00:36.4>across <00:37.4>the <00:37.8>ceiling\n[00:50]The music underneath\n[01:10]Let the world grow quiet\n[01:30]Stay a little while"];
      if (command === "player_queues/items") return args.queue_id === queue.queue_id ? tracks.slice(args.offset, args.offset + args.limit) : [];
      if (command === "player_queues/transfer") {
        if (queues[args.source_queue_id] !== queue) throw new Error("Nothing to move on that speaker (demo).");
        moveMusic(args.target_queue_id);
        if (args.auto_play) { queue.state = "playing"; at = Date.now(); }
        return null;
      }
      if (command === "players/cmd/set_members") {
        (args.player_ids_to_add || []).forEach(id => setMember(args.target_player, id, true));
        (args.player_ids_to_remove || []).forEach(id => setMember(args.target_player, id, false));
        return null;
      }
      if (command === "players/cmd/group_volume") {
        const lead = players[args.player_id];
        lead.group_members.forEach(id => { players[id].volume_level = args.volume_level; });
        lead.group_volume = args.volume_level;
        return null;
      }
      if (command === "players/cmd/volume_set") { players[args.player_id].volume_level = args.volume_level; return null; }
      // Play on an idle speaker starts the music there.
      if (command === "player_queues/play_media" && args.queue_id !== queue.queue_id) { moveMusic(args.queue_id); queue.state = "playing"; }
      if (/^player_queues\//.test(command) && args.queue_id && args.queue_id !== queue.queue_id) return null; // an idle speaker: nothing to change
      if (command === "player_queues/play_media") {
        const radio = /^radio_playlist:\/\/playlist\//.test(args.media);
        const items = (radio ? LIBRARY.track.slice().reverse() : tracksFor(args.media)).map(queueItem);
        queue.is_dynamic = radio;
        if (args.option === "replace") { tracks = items; select(0); }
        else if (args.option === "play") { insert(items, queue.current_index + 1); select(queue.current_index + 1); }
        else if (args.option === "next") insert(items, queue.current_index + 1);
        else insert(items, tracks.length);
      }
      if (command === "player_queues/move_item") {
        const from = tracks.findIndex(t => t.queue_item_id === args.queue_item_id);
        if (from > queue.current_index) {
          const [item] = tracks.splice(from, 1);
          const to = args.pos_shift === 0 ? queue.current_index + 1 : Math.max(queue.current_index + 1, Math.min(tracks.length, from + args.pos_shift));
          tracks.splice(to, 0, item); refresh();
        }
      }
      if (command === "player_queues/delete_item") { const i = tracks.findIndex(t => t.queue_item_id === args.item_id_or_index); if (i > queue.current_index) { tracks.splice(i, 1); refresh(); } }
      if (command === "player_queues/play" || command === "player_queues/pause") {
        const next = command === "player_queues/play" ? "playing" : "paused";
        if (queue.state !== next) { position = this.playback.position; at = Date.now(); queue.state = next; }
      }
      if (command === "player_queues/play_pause") { position = this.playback.position; at = Date.now(); queue.state = queue.state === "playing" ? "paused" : "playing"; }
      if (command === "player_queues/play_index") select(tracks.findIndex(t => t.queue_item_id === args.index));
      if (command === "player_queues/next") select(queue.current_index + 1);
      if (command === "player_queues/previous") select(queue.current_index - 1);
      if (command === "player_queues/seek") { position = args.position; at = Date.now(); }
      if (command === "player_queues/shuffle") queue.shuffle_enabled = args.shuffle_enabled;
      if (command === "player_queues/repeat") queue.repeat_mode = args.repeat_mode;
      if (command === "player_queues/autoplay") queue.autoplay_enabled = args.autoplay_enabled;
      if (command === "player_queues/crossfade") queue.crossfade_enabled = args.crossfade_enabled;
      return null;
    }
  };
}
