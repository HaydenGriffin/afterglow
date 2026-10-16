import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPresentationTrim, createPlayback, parseLyrics, lyricIndex, trackInfo, timeLabel } from '../src/playback.js';

function harness() {
  const pending = [], calls = [];
  const q = { queue_id: 'group', state: 'playing', current_index: 3, current_item: { queue_item_id: 'one', duration: 120, media_item: { media_type: 'track', name: 'Song', uri: 'library://track/1' } } };
  const live = { playback: { queue: q, connected: true, position: 20 }, call(command, args) { calls.push({ command, args }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } };
  return { model: createPlayback({ live, host: 'ma', lyricsSearch: null }), live, q, calls, pending };
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('timed lyrics handle repeated timestamps, fractional seconds, offset and unsorted lines', () => {
  const lines = parseLyrics('[ar:Test]\n[offset:-100]\n[00:12.50]Second\n[00:01.2][00:05.123]First');
  assert.deepEqual(lines, [{at:1.3,text:'First'},{at:5.223,text:'First'},{at:12.6,text:'Second'}]);
  assert.equal(lyricIndex(lines, 0), -1);
  assert.equal(lyricIndex(lines, 5.223), 1);
  assert.equal(lyricIndex(lines, 99), 2);
  assert.deepEqual(parseLyrics('Untimed lyrics'), []);
});
test('artwork uses bounded MA imageproxy and rejects non-http external schemes', () => {
  const item = { name: 'Radio', image: { proxy_id:'a'.repeat(64) } };
  assert.equal(trackInfo(item, 'ma').image, 'http://ma:8095/imageproxy/'+'a'.repeat(64)+'?size=512');
  item.image = { path:'javascript:alert(1)', remotely_accessible:true };
  assert.equal(trackInfo(item, 'ma').image, '');
  assert.equal(timeLabel(125), '2:05');
});
test('a book names its authors and an episode its podcast where a song names its artist and album', () => {
  const book = trackInfo({ media_item: { media_type: 'audiobook', name: 'Book', authors: [{ name: 'A. Writer' }, { name: 'B. Writer' }] } }, 'ma');
  assert.equal(book.artist, 'A. Writer, B. Writer');
  const episode = trackInfo({ media_item: { media_type: 'podcast_episode', name: 'Ep 1', podcast: { name: 'The Show' } } }, 'ma');
  assert.equal(episode.album, 'The Show');
});
test('lyrics fetched only when wanted; stale song responses cannot overwrite current lyrics', async () => {
  const h = harness(); h.model.tick(); assert.equal(h.calls.length,0);
  h.model.wantLyrics(true); h.model.tick(); assert.equal(h.calls.length,1);
  h.q.current_item = {queue_item_id:'two',media_item:{media_type:'track',uri:'library://track/2'}};
  h.model.tick(); assert.equal(h.calls.length,2);
  h.pending[1].resolve([null,'[00:01]New']); await settle();
  h.pending[0].resolve([null,'[00:01]Old']); await settle();
  assert.equal(h.model.snapshot().lyrics.lines[0].text,'New');
  h.model.tick(); assert.equal(h.calls.length,2);
});
test('lyrics errors are retryable, missing lyrics are not repeatedly fetched', async () => {
  const h = harness();h.model.wantLyrics(true);h.model.tick();h.pending[0].reject(Error('offline'));await settle();
  assert.equal(h.model.snapshot().lyrics.status,'error');h.model.tick();assert.equal(h.calls.length,1);
  h.model.retryLyrics();h.model.tick();h.pending[1].resolve([null,null]);await settle();
  assert.equal(h.model.snapshot().lyrics.status,'missing');h.model.tick();assert.equal(h.calls.length,2);
});
test('queue requests are bounded and late old-queue replies are ignored', async () => {
  const h=harness();h.model.wantQueue(true);h.model.tick();
  assert.deepEqual(h.calls[0],{command:'player_queues/items',args:{queue_id:'group',offset:4,limit:25}});
  h.model.tick();assert.equal(h.calls.length,1);
  h.live.playback={...h.live.playback,queue:{...h.q,queue_id:'other'}};h.model.tick();
  h.pending[0].resolve([{queue_item_id:'old'}]);await settle();assert.deepEqual(h.model.snapshot().items,[]);
  h.pending[1].resolve([{queue_item_id:'new'}]);await settle();assert.equal(h.model.snapshot().items[0].queue_item_id,'new');
});
test('commands capture the displayed queue, clamp seeks and serialize writes without false success', async () => {
  const h=harness();const first=h.model.command('seek',999);
  assert.deepEqual(h.calls[0],{command:'player_queues/seek',args:{queue_id:'group',position:120}});
  const second=h.model.command('next');assert.equal(h.calls.length,1,'waits for the write in flight');
  h.pending[0].reject(Error('refused'));assert.equal(await first,false);await settle();
  assert.equal(h.model.snapshot().error,'refused');assert.equal(h.calls[1].command,'player_queues/next','then sends the next one');
  h.pending[1].resolve(null);assert.equal(await second,true);assert.equal(h.model.snapshot().busy,false);
  h.live.playback.connected=false;assert.equal(await h.model.command('next'),false);assert.equal(h.calls.length,2);
});
test('queue selections use stable item IDs; sleep timer belongs to the group', async () => {
  const h=harness();let p=h.model.command('play_index','item-27');assert.equal(h.calls[0].args.index,'item-27');h.pending[0].resolve(null);assert.equal(await p,true);
  p=h.model.command('sleep',30);assert.deepEqual(h.calls[1],{command:'players/sleep_timer/set',args:{player_id:'group',seconds:1800}});h.pending[1].resolve(null);await p;
});
test('suspend discards asynchronous metadata; resume can fetch it again', async () => {
  const h=harness();h.model.wantLyrics(true);h.model.tick();h.model.stop();h.pending[0].resolve([null,'[00:01]Old']);await settle();
  assert.equal(h.model.snapshot().lyrics.status,'idle');h.model.start();h.model.tick();assert.equal(h.calls.length,2);
});

test('visual trim shifts lyrics later without double-applying speaker compensation or shifting seek targets', async () => {
  const h=harness();h.live.playback.lyricPosition=applyPresentationTrim(h.live.playback.position,75);
  assert.equal(h.model.snapshot().position,20);assert.equal(h.model.snapshot().lyricPosition,19.925);
  assert.equal(applyPresentationTrim(0.02,75),0);assert.equal(applyPresentationTrim(20,-75),20.075);
  const p=h.model.command('seek',h.model.snapshot().position+10);
  assert.equal(h.calls[0].args.position,30);h.pending[0].resolve(null);await p;
});
test('browse and queue edits send Music Assistant 2.10 arguments on the current queue', async () => {
  const h = harness(); const send = async (action, value) => { const p = h.model.command(action, value); h.pending[h.pending.length - 1].resolve(null); return p; };
  assert.equal(await send('play_media', { media: 'library://album/12', option: 'next' }), true);
  assert.deepEqual(h.calls[0], { command: 'player_queues/play_media', args: { queue_id: 'group', media: 'library://album/12', option: 'next' } });
  await send('radio');
  assert.deepEqual(h.calls[1], { command: 'player_queues/play_media', args: { queue_id: 'group', media: 'radio_playlist://playlist/library://track/1', option: 'replace' } });
  await send('move_item', { id: 'q7', shift: 0 });
  assert.deepEqual(h.calls[2], { command: 'player_queues/move_item', args: { queue_id: 'group', queue_item_id: 'q7', pos_shift: 0 } });
  await send('delete_item', 'q7');
  assert.deepEqual(h.calls[3], { command: 'player_queues/delete_item', args: { queue_id: 'group', item_id_or_index: 'q7' } });
  assert.equal(await h.model.command('play_media', { media: '', option: 'replace' }), false, 'nothing to play is refused locally');
  assert.equal(h.calls.length, 4);
});

function targeted(target) {
  const pending = [], calls = [];
  const live = { playback: null, target, call(command, args) { calls.push({ command, args }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } };
  return { model: createPlayback({ live, host: 'ma', lyricsSearch: null }), live, calls, pending };
}
const answer = async (h, i) => { await settle(); h.pending[i].resolve(null); await settle(); };

test('from a cold start commands go to the target, not a dead end', async () => {
  const h = targeted({ queueId: 'tv', playerId: 'tv', name: 'TV', reason: 'this-tv', connected: true, queue: { queue_id: 'tv', state: 'idle' }, player: { player_id: 'tv', volume_level: 20 } });
  assert.equal(h.model.snapshot().queue, null);
  assert.equal(h.model.snapshot().target.name, 'TV');
  const p = h.model.command('play_media', { media: 'library://album/1', option: 'replace' });
  assert.deepEqual(h.calls[0], { command: 'player_queues/play_media', args: { queue_id: 'tv', media: 'library://album/1', option: 'replace' } });
  await answer(h, 0); assert.equal(await p, true);
  h.live.target = null;
  assert.equal(await h.model.command('play'), false);
  assert.match(h.model.snapshot().error, /No speaker/);
});

test('a chosen speaker takes commands while another queue is drawn', async () => {
  const h = harness();
  h.live.target = { queueId: 'den', playerId: 'den', name: 'Den', reason: 'chosen', connected: true, queue: { queue_id: 'den', state: 'idle', shuffle_enabled: true }, player: { player_id: 'den', volume_level: 10 } };
  h.model.command('shuffle');
  assert.deepEqual(h.calls[0], { command: 'player_queues/shuffle', args: { queue_id: 'den', shuffle_enabled: false } });
  h.model.wantQueue(true); h.model.tick(); await answer(h, 0);
  assert.equal(h.calls[1].args.queue_id, 'den', 'the queue panel reads the target');
});

test('held volume and quick seeks coalesce into the latest value after the write in flight', async () => {
  const h = harness();
  h.live.playback.player = { player_id: 'group', volume_level: 30 };
  const presses = [1, 2, 3, 4].map(() => h.model.command('volume_by', 5));
  assert.deepEqual(h.calls.map(c => c.args.volume_level), [35]);
  await answer(h, 0);
  assert.deepEqual(h.calls.map(c => c.args.volume_level), [35, 50], 'three waiting presses sent once, from the value just set');
  await answer(h, 1);
  assert.deepEqual(await Promise.all(presses), [true, true, true, true]);
  h.model.command('seek_by', -10); h.model.command('seek_by', -10); h.model.command('seek_by', -10);
  assert.equal(h.calls[2].args.position, 10);
  await answer(h, 2);
  assert.equal(h.calls[3].args.position, 0, 'from the seek just sent, clamped');
  await answer(h, 3);
});

test('toggles pressed in a row are queued and flip from the value just sent', async () => {
  const h = harness();
  h.q.shuffle_enabled = false; h.q.repeat_mode = 'off';
  h.model.command('shuffle'); h.model.command('shuffle'); h.model.command('repeat', 1); h.model.command('repeat', 1);
  await answer(h, 0); await answer(h, 1); await answer(h, 2); await answer(h, 3);
  assert.deepEqual(h.calls.map(c => c.args.shuffle_enabled === undefined ? c.args.repeat_mode : c.args.shuffle_enabled), [true, false, 'all', 'one']);
});

test('a group sets the volume of every member', async () => {
  const h = harness();
  h.live.playback.player = { player_id: 'group', volume_level: 80, group_volume: 40, group_members: ['group', 'kitchen'] };
  h.model.command('volume_by', 5);
  assert.deepEqual(h.calls[0], { command: 'players/cmd/group_volume', args: { player_id: 'group', volume_level: 45 } });
  await answer(h, 0);
  h.live.playback.player = { player_id: 'group', type: 'player', volume_level: 80, group_members: [] };
  h.model.command('volume', 50);
  assert.deepEqual(h.calls[1], { command: 'players/cmd/volume_set', args: { player_id: 'group', volume_level: 50 } });
});

test('transfer and grouping send Music Assistant 2.10 arguments for the target', async () => {
  const h = harness();
  h.model.command('transfer', { to: 'tv', autoPlay: true });
  assert.deepEqual(h.calls[0], { command: 'player_queues/transfer', args: { source_queue_id: 'group', target_queue_id: 'tv', auto_play: true } });
  await answer(h, 0);
  h.model.command('transfer', { to: 'den' });
  assert.deepEqual(h.calls[1].args, { source_queue_id: 'group', target_queue_id: 'den' }, 'Music Assistant keeps the paused or playing state');
  await answer(h, 1);
  h.model.command('transfer', { from: 'kitchen', to: 'den' });
  assert.equal(h.calls[2].args.source_queue_id, 'kitchen', 'a named source wins over the target');
  await answer(h, 2);
  h.model.command('group', { add: 'den' });
  assert.deepEqual(h.calls[3], { command: 'players/cmd/set_members', args: { target_player: 'group', player_ids_to_add: ['den'] } });
  await answer(h, 3);
  h.model.command('group', { remove: 'den' });
  assert.deepEqual(h.calls[4], { command: 'players/cmd/set_members', args: { target_player: 'group', player_ids_to_remove: ['den'] } });
});

test('joining names the leader, and one speaker of a group steps from the level last sent to it', async () => {
  const h = harness();
  h.model.command('group', { add: 'tv', leader: 'living' });
  assert.deepEqual(h.calls[0], { command: 'players/cmd/set_members', args: { target_player: 'living', player_ids_to_add: ['tv'] } }, 'the leader named wins over the target');
  await answer(h, 0);
  h.model.command('member_volume', { id: 'kitchen', level: 20, by: 5 });
  assert.deepEqual(h.calls[1], { command: 'players/cmd/volume_set', args: { player_id: 'kitchen', volume_level: 25 } });
  await answer(h, 1);
  h.model.command('member_volume', { id: 'kitchen', level: 20, by: 5 });
  assert.equal(h.calls[2].args.volume_level, 30, 'a report that has not caught up is not built on');
  await answer(h, 2);
  h.model.command('member_volume', { id: 'den', level: 98, by: 5 });
  assert.deepEqual(h.calls[3].args, { player_id: 'den', volume_level: 100 }, 'another speaker starts from its own level, at most 100');
  await answer(h, 3);
  h.model.command('member_volume', { id: 'den', level: 98, by: -5 });
  assert.equal(h.calls[4].args.volume_level, 95, 'down again from the 100 sent');
  await answer(h, 4);
  h.model.command('member_volume', { id: 'hall', level: 3, by: -5 });
  assert.equal(h.calls[5].args.volume_level, 0, 'at least 0');
});

test('skips pressed while one is in flight collapse into one pending skip per direction', async () => {
  const h = harness();
  const first = h.model.command('next');
  const more = [h.model.command('next'), h.model.command('next'), h.model.command('previous'), h.model.command('previous'), h.model.command('next')];
  assert.equal(h.calls.length, 1, 'one skip in flight');
  h.pending[0].resolve(null);
  assert.equal(await first, true);
  await settle();
  assert.deepEqual(h.calls.map((c) => c.command), ['player_queues/next', 'player_queues/next']);
  h.pending[1].resolve(null);
  await settle();
  assert.deepEqual(h.calls.map((c) => c.command), ['player_queues/next', 'player_queues/next', 'player_queues/previous']);
  h.pending[2].resolve(null);
  assert.deepEqual(await Promise.all(more), [true, true, true, true, true], 'every press hears back');
  assert.equal(h.calls.length, 3);
});
const queued = (from, count) => Array.from({ length: count }, (_, i) => ({ queue_item_id: 'q' + (from + i) }));
test('Up next reads further pages on request, one at a time, and stops at a short page', async () => {
  const h = harness(); h.q.items = 200; h.model.wantQueue(true); h.model.tick();
  h.pending[0].resolve(queued(0, 25)); await settle();
  assert.equal(h.model.snapshot().queueMore, true);
  h.model.moreQueue(); h.model.moreQueue();
  assert.equal(h.calls.length, 2, 'never two pages at once');
  assert.deepEqual(h.calls[1].args, { queue_id: 'group', offset: 29, limit: 25 });
  assert.equal(h.model.snapshot().queueTail, 'loading');
  h.pending[1].resolve(queued(25, 10)); await settle();
  const s = h.model.snapshot();
  assert.equal(s.items.length, 35); assert.equal(s.queueMore, false); assert.equal(s.queueTail, '');
  h.model.moreQueue(); assert.equal(h.calls.length, 2);
});
test('a failed page waits for a retry; a changed first page drops later ones', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const h = harness(); h.model.wantQueue(true); h.model.tick();
  h.pending[0].resolve(queued(0, 25)); await settle();
  h.model.moreQueue(); h.pending[1].reject(Error('offline')); await settle();
  assert.equal(h.model.snapshot().queueTail, 'error');
  h.model.moreQueue(); assert.equal(h.calls.length, 2, 'not again by itself');
  h.model.moreQueue(true); h.pending[2].resolve(queued(25, 25)); await settle();
  assert.equal(h.model.snapshot().items.length, 50);
  t.mock.timers.tick(6000); h.model.tick();
  h.pending[3].resolve(queued(0, 25)); await settle();
  assert.equal(h.model.snapshot().items.length, 50, 'an unchanged first page keeps the rest');
  t.mock.timers.tick(6000); h.model.tick();
  h.pending[4].resolve([{ queue_item_id: 'moved' }].concat(queued(0, 24))); await settle();
  assert.equal(h.model.snapshot().items.length, 25, 'a changed one drops them');
});
test('speed is sent as Music Assistant 2.10 takes it and shown from the queue', async () => {
  const h = harness(); h.q.playback_speed = 1.25;
  assert.equal(h.model.snapshot().speed, 1.25);
  const done = h.model.command('speed', 1.5);
  assert.deepEqual(h.calls[0], { command: 'player_queues/set_playback_speed', args: { queue_id: 'group', speed: 1.5 } });
  h.pending[0].resolve(null); assert.equal(await done, true);
});
