import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPresentationTrim, createPlayback, parseLyrics, lyricIndex, trackInfo, timeLabel } from '../src/playback.js';

function harness() {
  const pending = [], calls = [];
  const q = { queue_id: 'group', state: 'playing', current_index: 3, current_item: { queue_item_id: 'one', duration: 120, media_item: { media_type: 'track', name: 'Song', uri: 'library://track/1' } } };
  const live = { playback: { queue: q, connected: true, position: 20 }, call(command, args) { calls.push({ command, args }); return new Promise((resolve, reject) => pending.push({ resolve, reject })); } };
  return { model: createPlayback({ live, host: 'ma' }), live, q, calls, pending };
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
  assert.deepEqual(h.calls[0],{command:'player_queues/items',args:{queue_id:'group',offset:4,limit:12}});
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
  return { model: createPlayback({ live, host: 'ma' }), live, calls, pending };
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
