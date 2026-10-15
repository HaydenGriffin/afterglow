import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback } from '../src/playback.js';
const settle = () => new Promise(r => setImmediate(r));
const track = id => ({queue_item_id:id,duration:350,media_item:{media_type:'track',uri:'library://track/'+id,name:'Song',artists:[{name:'Artist'}],album:{name:'Album'}}});
function setup(call, search) {
  const queue={queue_id:'tv',state:'playing',current_item:track('one')};
  const live={playback:{queue,connected:true,position:20},call};
  const model=createPlayback({live,host:'ma',lyricsSearch:search});
  model.wantLyrics(true);model.tick();return {model,queue};
}
test('lyrics fallback still runs when Music Assistant rejects the request',async()=>{
  const {model}=setup(async()=>{throw Error('timeout');},async()=>({lrc:'[00:01]Found',plain:''}));
  await settle();assert.equal(model.snapshot().lyrics.status,'timed');
});
test('a slow Music Assistant lookup cannot block the fallback indefinitely',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {model}=setup(()=>new Promise(()=>{}),async()=>({lrc:'[00:01]Found',plain:''}));
  t.mock.timers.tick(5000);await settle();assert.equal(model.snapshot().lyrics.status,'timed');
});
test('leaving a song does not start its fallback after a late failure',async()=>{
  let reject,asked=0;
  const {model,queue}=setup(()=>new Promise((_,no)=>{reject=no;}),async()=>{asked++;return null;});
  model.stop();reject(Error('late'));await settle();assert.equal(asked,0);
});
test('retry invalidates a cached no-lyrics result',async()=>{
  let found=false;
  const {model}=setup(async()=>[null,null],async()=>found?{lrc:'[00:01]Found',plain:''}:null);
  await settle();assert.equal(model.snapshot().lyrics.status,'missing');
  found=true;model.retryLyrics();model.tick();await settle();assert.equal(model.snapshot().lyrics.status,'timed');
});
test('provider errors stay retryable instead of being cached as missing',async()=>{
  let calls=0;
  const {model}=setup(async()=>[null,null],async()=>{calls++;throw Error('rate limited');});
  await settle();assert.equal(model.snapshot().lyrics.status,'error');
  model.retryLyrics();model.tick();await settle();assert.equal(calls,2);
});
test('lyrics timing adjusts the words without moving playback or seek targets',async()=>{
  let offset=300, sought;
  const live={playback:{queue:{queue_id:'tv',state:'playing',current_item:track('one')},connected:true,position:20,lyricPosition:19.925},call:async(_,args)=>{sought=args.position;}};
  const model=createPlayback({live,host:'ma',lyricsOffset:()=>offset});
  assert.equal(model.snapshot().lyricPosition,19.625);
  assert.equal(model.snapshot().position,20);
  await model.command('seek_by',10);assert.equal(sought,30);
  offset=-500;assert.equal(model.snapshot().lyricPosition,20.425);
});
test('temporary failures get one delayed automatic retry, without hammering the provider',async()=>{
  let time=1000,calls=0;
  const live={playback:{queue:{queue_id:'tv',state:'playing',current_item:track('one')},connected:true,position:20},call:async()=>{calls++;throw Error('unavailable');}};
  const model=createPlayback({live,host:'ma',lyricsSearch:null,now:()=>time});
  model.wantLyrics(true);model.tick();await settle();
  assert.equal(model.snapshot().lyrics.retryAt,31000);
  time=30999;model.tick();await settle();assert.equal(calls,1);
  time=31000;model.tick();await settle();assert.equal(calls,2);
  assert.equal(model.snapshot().lyrics.retryAt,0);
  time=100000;model.tick();await settle();assert.equal(calls,2);
});
test('a Music Assistant failure followed by an LRCLIB miss stays retryable', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let time = 1000, maCalls = 0;
  const queue = { queue_id: 'tv', state: 'playing', current_item: track('one') };
  const live = { playback: { queue, connected: true, position: 20 }, call: () => { maCalls++; return new Promise(() => {}); } };
  const model = createPlayback({ live, host: 'ma', now: () => time, lyricsSearch: async () => null });
  model.wantLyrics(true); model.tick();
  t.mock.timers.tick(5000); await settle();
  assert.equal(model.snapshot().lyrics.status, 'error', 'a timeout is not a clean miss');
  assert.equal(model.snapshot().lyrics.retryAt, 31000);
  time = 31000; model.tick(); await settle();
  assert.equal(maCalls, 2, 'tried again after the cooldown');
});
