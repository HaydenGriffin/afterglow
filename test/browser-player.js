// Run this expression in the built app at ?mock=1 (T3 preview_evaluate or DevTools).
// It operates only on demo music; refuses a live Music Assistant page.
(async () => {
  if (!new URLSearchParams(location.search).has('mock')) throw Error('Use ?mock=1');
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const key = code => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code }));
  const wait = (ms = 350) => new Promise(resolve => setTimeout(resolve, ms));
  const OK = 13, BACK = 27, LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40;
  const player = document.querySelector('#player');
  const title = () => document.querySelector('.poster-title').textContent;
  const rows = () => Array.from(document.querySelectorAll('.panel-items button'));
  const selected = () => document.querySelector('#player button.selected');
  async function closeAll() { for (let i = 0; i < 4 && (player.className.trim() || document.getElementById('menu').style.display === 'block'); i++) { key(BACK); await wait(); } }
  async function section(index) { await closeAll(); key(OK); await wait(); key(UP); key(LEFT); for (let i = 0; i < index; i++) key(RIGHT); await wait(100); key(OK); await wait(700); }

  // Queue: arrows move, OK on a song offers actions, Play now plays it.
  await section(2);
  assert(document.querySelector('.player-panel h2').textContent === 'Queue', 'Queue opens from the top strip');
  const initial = title();
  // Past Playing on / Play on this TV / Speakers together to the first song.
  for (let i = 0; i < 5; i++) key(DOWN);
  key(UP); key(UP); await wait();
  assert(title() === initial, 'Queue arrows must not start playback');
  const song = selected().firstChild.textContent;
  key(OK); await wait();
  assert(rows()[0].firstChild.textContent === 'Play now', 'A queued song offers Play now first');
  key(OK); await wait(600);
  assert(title() === song, 'Play now plays the chosen song');

  // An open panel keeps the pointer's scroll: unchanged ticks neither refocus nor scroll.
  await section(2);
  const list = document.querySelector('.panel-items');
  list.scrollTop = list.scrollHeight; const kept = list.scrollTop; await wait(800);
  assert(list.scrollTop === kept, 'An open panel must not scroll back on its own');

  // Speakers together ticks the group; one that cannot join is shown, not hidden.
  const row = label => rows().find(b => b.firstChild.textContent === label);
  row('Speakers together').click(); await wait();
  assert(document.querySelector('.player-panel h2').textContent === 'Speakers together', 'Speakers together opens from the queue');
  assert(row('Bedroom · Preview').disabled, 'A speaker that cannot join is listed as unavailable');
  assert(!row('Kitchen · Preview').classList.contains('chosen'), 'Kitchen starts on its own');
  row('Kitchen · Preview').click(); await wait(600);
  assert(row('Kitchen · Preview').classList.contains('chosen'), 'Kitchen joins the group');
  key(BACK); await wait();

  // Play on this TV moves the music here.
  row('Play on this TV').click(); await wait(600);
  assert(document.querySelector('.poster-target').textContent === 'This TV · Preview', 'The music moves to this TV');

  // Display: Album stops GPU drawing; Visuals only hides captions and draws again.
  await closeAll(); key(OK); await wait();
  document.querySelector('[aria-label="Display"]').click(); await wait();
  const pick = label => rows().find(b => b.firstChild.textContent === label).click();
  pick('Album'); await closeAll();
  const frames = window.vizmanDiagnostics().rendering.frames; await wait();
  assert(window.vizmanDiagnostics().rendering.frames === frames, 'Album mode must stop GPU drawing');
  key(OK); await wait(); document.querySelector('[aria-label="Display"]').click(); await wait(); pick('Visuals only'); await closeAll();
  assert(getComputedStyle(document.querySelector('#track')).display === 'none', 'Pure visuals must hide the track card');
  assert(getComputedStyle(document.querySelector('.lyric-overlay')).display === 'none', 'Pure visuals must hide lyric overlay');
  assert(window.vizmanDiagnostics().drawing, 'Visuals should resume drawing');

  // Browse: a favourite album can be added to the queue without leaving Browse.
  await section(0);
  assert(player.getAttribute('data-panel') === 'browse', 'Browse opens from the top strip');
  key(DOWN); key(DOWN); await wait(600); key(RIGHT); await wait();
  key(OK); await wait();
  const actions = Array.from(document.querySelectorAll('.browse-list strong')).map(s => s.textContent);
  assert(actions[0] === 'Play now' && actions.indexOf('Add to the queue') > 0, 'An album offers play, next and queue');
  key(DOWN); key(DOWN); key(OK); await wait(600);
  assert(player.getAttribute('data-panel') === 'browse' && document.querySelector('.browse-list .browse-thumb'), 'Adding returns to the list');

  // Search: above the categories; a real field takes the TV keyboard; Enter shows grouped results.
  key(LEFT); await wait(100);
  for (let i = 0; i < 12 && selected().textContent !== 'Search'; i++) { key(UP); await wait(100); }
  key(RIGHT); await wait(); key(OK); await wait();
  const field = document.querySelector('.browse-input');
  assert(document.activeElement === field, 'OK on the Search row focuses its text field');
  field.value = 'demo';
  field.dispatchEvent(new KeyboardEvent('keydown', { keyCode: OK, key: 'Enter', bubbles: true })); await wait(600);
  assert(document.activeElement !== field, 'Enter puts the keyboard away');
  const groups = Array.from(document.querySelectorAll('.browse-group')).map(g => g.textContent);
  assert(groups[0] === 'Artists' && groups.indexOf('Songs') > 0, 'Search results come grouped');
  key(DOWN); await wait(); key(OK); await wait();
  assert(document.querySelector('.browse-list strong').textContent === 'Play now', 'A search result offers its actions');
  key(BACK); await wait(); key(BACK); await wait();

  // Details: the back of the poster carries the stream's format.
  await closeAll(); key(OK); await wait(); document.querySelector('[aria-label="Details"]').click(); await wait(800);
  assert(/FLAC|OGG/.test(document.querySelector('.details-facts').textContent), 'Details show the stream format');
  await closeAll();

  // Idle: pause, and after half a minute the recent music is set as a poster; OK resumes.
  const idle = document.getElementById('idle'), paused = title();
  key(32); await wait(31500);
  assert(idle.classList.contains('shown'), 'Nothing playing shows the idle poster');
  assert(idle.querySelector('.idle-title').textContent === paused && idle.querySelector('.idle-hint').textContent === 'OK resumes', 'The paused song comes first');
  key(RIGHT); await wait();
  assert(idle.querySelector('.idle-title').textContent !== paused && idle.querySelectorAll('.idle-tile.selected').length === 1, 'Right moves along the strip');
  key(LEFT); await wait(); key(OK); await wait(1500);
  assert(!idle.classList.contains('shown'), 'OK resumes and the poster leaves');
  assert(document.documentElement.scrollWidth <= innerWidth, 'Screen must not overflow horizontally');
  return { passed: 20, viewport: [innerWidth, innerHeight] };
})()
