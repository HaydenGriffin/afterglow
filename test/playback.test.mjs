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
  assert.deepEqual(lines, [{at:1.1,text:'First'},{at:5.023,text:'First'},{at:12.4,text:'Second'}]);
  assert.equal(lyricIndex(lines, 0), -1);
  assert.equal(lyricIndex(lines, 5.023), 1);
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
  assert.equal(await h.model.command('next'),false);assert.equal(h.calls.length,1);
  h.pending[0].reject(Error('refused'));assert.equal(await first,false);
  assert.equal(h.model.snapshot().error,'refused');assert.equal(h.model.snapshot().busy,false);
  h.live.playback.connected=false;assert.equal(await h.model.command('next'),false);assert.equal(h.calls.length,1);
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
