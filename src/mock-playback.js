// Local preview only (?mock=1). These commands never reach Music Assistant.
export function createMockPlayback() {
  const started = Date.now();
  let position = 24, at = started;
  const media = { media_type: "track", uri: "demo://track/1", name: "A quieter kind of evening", artists: [{ name: "Afterglow demo" }], album: { name: "Made for the room" }, duration: 240 };
  const item = { queue_item_id: "demo-1", name: media.name, duration: 240, media_item: media };
  const queue = { queue_id: "demo", display_name: "Living room · Preview", current_index: 0, current_item: item, next_item: { queue_item_id: "demo-2", name: "The lights settle", duration: 180 }, state: "playing", repeat_mode: "off" };
  const tracks = [item, queue.next_item, { queue_item_id: "demo-3", name: "Home, slowly", duration: 210 }];
  function select(index) { queue.current_index = Math.max(0, Math.min(tracks.length - 1, index)); queue.current_item = tracks[queue.current_index]; queue.next_item = tracks[queue.current_index + 1] || null; position = 0; at = Date.now(); }
  const player = { volume_level: 35 };
  return {
    get playback() { return { queue, player, connected: true, position: position + (queue.state === "playing" ? (Date.now() - at) / 1000 : 0) }; },
    async call(command, args) {
      if (command === "metadata/get_track_lyrics") return [null, "[00:00]An evening without hurry\n[00:20]A little room to breathe\n[00:35]The light across the ceiling\n[00:50]The music underneath\n[01:10]Let the world grow quiet\n[01:30]Stay a little while"];
      if (command === "player_queues/items") return tracks.slice(args.offset, args.offset + args.limit);
      if (command === "player_queues/play_pause") { position = this.playback.position; at = Date.now(); queue.state = queue.state === "playing" ? "paused" : "playing"; }
      if (command === "player_queues/play_index") select(tracks.findIndex(track => track.queue_item_id === args.index));
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
