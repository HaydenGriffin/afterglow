// Local preview only (?mock=1). These commands never reach Music Assistant.
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
// In the order pick.js gives: groups first, then speakers by name.
const SPEAKERS = [{ id: "demo-home", name: "Home speakers · Preview", group: true }, { id: "demo-kitchen", name: "Kitchen · Preview" }, { id: "demo-living", name: "Living room · Preview" }];

const cover = key => ({ type: "thumb", path: "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">' + COVERS[key] + "</svg>"), remotely_accessible: true });
const albumOf = name => ALBUMS.find(a => a[0] === name);
function track([name, artist, album, duration, art], i) {
  const year = (albumOf(album) || [])[3];
  return { item_id: String(i + 1), provider: "library", media_type: "track", uri: "library://track/" + (i + 1), name, duration, favorite: i % 2 === 0,
    artists: [{ name: artist }], album: { name: album, year }, metadata: { images: [cover(art)] }, demoArt: art };
}
const LIBRARY = {
  track: TRACKS.map(track),
  album: ALBUMS.map(([name, artist, art, year], i) => ({ item_id: String(i + 1), provider: "library", media_type: "album", uri: "library://album/" + (i + 1), name, year, favorite: i < 2, artists: [{ name: artist }], metadata: { images: [cover(art)] } })),
  playlist: PLAYLISTS.map(([name, art], i) => ({ item_id: String(i + 1), provider: "library", media_type: "playlist", uri: "library://playlist/" + (i + 1), name, favorite: i < 2, metadata: { images: [cover(art)] } })),
  artist: [...new Set(TRACKS.map(t => t[1]))].map((name, i) => ({ item_id: String(i + 1), provider: "library", media_type: "artist", uri: "library://artist/" + (i + 1), name, favorite: i === 0, metadata: { images: [cover(Object.keys(COVERS)[i])] } })),
  radio: [{ item_id: "1", provider: "library", media_type: "radio", uri: "library://radio/1", name: "Demo FM", favorite: true, metadata: { images: [cover("sky")] } }],
};
function tracksFor(uri) {
  const [, kind, id] = /^library:\/\/(\w+)\/(\w+)$/.exec(uri) || [];
  if (kind === "track") return LIBRARY.track.filter(t => t.item_id === id);
  if (kind === "album") return LIBRARY.track.filter(t => t.album.name === ALBUMS[id - 1][0]);
  if (kind === "playlist") return LIBRARY.track.filter((t, i) => (i + Number(id)) % 2 === 0);
  if (kind === "artist") { const name = LIBRARY.artist[id - 1].name; return LIBRARY.track.filter(t => t.artists[0].name === name); }
  return LIBRARY.track.slice(0, 3);
}

let sequence = 0;
function queueItem(media) {
  const quality = media.item_id % 3 === 0 ? ["flac", 96000, 24, "hi_res"] : media.item_id % 3 === 1 ? ["flac", 44100, 16, "lossless"] : ["ogg", 44100, 16, "lossy"];
  return { queue_item_id: "demo-" + ++sequence, name: media.name, duration: media.duration, media_item: Object.assign({}, media, { metadata: media.metadata }), demoPalette: PALETTES[media.demoArt],
    streamdetails: { provider: quality[0] === "ogg" ? "spotify--demo" : "filesystem--demo", item_id: media.item_id,
      audio_format: { content_type: quality[0], sample_rate: quality[1], bit_depth: quality[2], bit_rate: quality[0] === "ogg" ? 320 : 0 },
      audio_processing: { input_fidelity: { quality: quality[3] } } } };
}

export function createMockPlayback() {
  let tracks = LIBRARY.track.slice(0, 5).map(queueItem);
  let position = 24, at = Date.now(), preferred = "";
  const queue = { queue_id: "demo", display_name: SPEAKERS[2].name, current_index: 0, current_item: tracks[0], next_item: tracks[1], state: "playing", repeat_mode: "off" };
  function select(index) { queue.current_index = Math.max(0, Math.min(tracks.length - 1, index)); refresh(); position = 0; at = Date.now(); }
  function refresh() { queue.current_item = tracks[queue.current_index]; queue.next_item = tracks[queue.current_index + 1] || null; queue.items = tracks.length; }
  function insert(items, where) { tracks.splice(where, 0, ...items); refresh(); }
  const player = { volume_level: 35 };
  const page = (list, args) => list.slice(args.offset || 0, (args.offset || 0) + (args.limit || 500));
  return {
    get playback() { return { queue, player, connected: true, position: position + (queue.state === "playing" ? (Date.now() - at) / 1000 : 0) }; },
    get palette() { return queue.current_item.demoPalette; },
    speakers() { return SPEAKERS; },
    get preferred() { return preferred; },
    get following() { return { name: queue.display_name, playerId: preferred || SPEAKERS[2].id }; },
    setPreferred(id) { preferred = id; queue.display_name = (SPEAKERS.find(s => s.id === id) || SPEAKERS[2]).name; },
    async call(command, args) {
      args = args || {};
      const library = /^music\/(\w+)s\/library_items$/.exec(command);
      if (library) return page((LIBRARY[library[1]] || []).filter(i => !args.favorite || i.favorite), args);
      if (command === "music/recently_played_items") return LIBRARY.album.slice(0, 2).concat(LIBRARY.playlist.slice(0, 1)).map(i => Object.assign({ image: i.metadata.images[0] }, i)).slice(0, args.limit || 10);
      if (command === "music/albums/album_tracks") return tracksFor("library://album/" + args.item_id);
      if (command === "music/playlists/playlist_tracks") return tracksFor("library://playlist/" + args.item_id);
      if (command === "providers") return [{ instance_id: "spotify--demo", domain: "spotify", name: "Spotify (demo)" }, { instance_id: "filesystem--demo", domain: "filesystem_local", name: "Music folder (demo)" }];
      if (command === "metadata/get_track_lyrics") return [null, "[00:00]An evening without hurry\n[00:20]A little room to breathe\n[00:35]The light across the ceiling\n[00:50]The music underneath\n[01:10]Let the world grow quiet\n[01:30]Stay a little while"];
      if (command === "player_queues/items") return tracks.slice(args.offset, args.offset + args.limit);
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
      if (command === "player_queues/play_pause") { position = this.playback.position; at = Date.now(); queue.state = queue.state === "playing" ? "paused" : "playing"; }
      if (command === "player_queues/play_index") select(tracks.findIndex(t => t.queue_item_id === args.index));
      if (command === "player_queues/next") select(queue.current_index + 1);
      if (command === "player_queues/previous") select(queue.current_index - 1);
      if (command === "player_queues/seek") { position = args.position; at = Date.now(); }
      if (command === "player_queues/shuffle") queue.shuffle_enabled = args.shuffle_enabled;
      if (command === "player_queues/repeat") queue.repeat_mode = args.repeat_mode;
      if (command === "player_queues/autoplay") queue.autoplay_enabled = args.autoplay_enabled;
      if (command === "player_queues/crossfade") queue.crossfade_enabled = args.crossfade_enabled;
      if (command === "players/cmd/volume_set") player.volume_level = args.volume_level;
      return null;
    }
  };
}
