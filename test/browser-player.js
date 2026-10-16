// Run this expression in the built app at ?mock=1 (T3 preview_evaluate or DevTools).
// It operates only on demo music; refuses a live Music Assistant page.
(async () => {
  if (!new URLSearchParams(location.search).has('mock')) throw Error('Use ?mock=1');
  let passed = 0;
  const assert = (ok, message) => { if (!ok) throw Error(message); passed++; };
  const key = code => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code }));
  const wait = (ms = 350) => new Promise(resolve => setTimeout(resolve, ms));
  // Waits for a condition rather than a fixed time, so a busy machine is not a failure.
  const until = async (check, ms = 5000) => { const end = Date.now() + ms; while (!check() && Date.now() < end) await wait(100); return check(); };
  const OK = 13, BACK = 27, LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40;
  const player = document.querySelector('#player');
  const title = () => document.querySelector('.poster-title').textContent;
  const rows = () => Array.from(document.querySelectorAll('.panel-items button'));
  const selected = () => document.querySelector('#player button.selected');
  // Only what Back closes counts: the player keeps other classes (night, has-background), and Back with
  // nothing open asks to leave the app.
  const anyOpen = () => player.classList.contains('controls-open') || player.classList.contains('panel-open') || document.getElementById('menu').style.display === 'block';
  async function closeAll() { for (let i = 0; i < 4 && anyOpen(); i++) { key(BACK); await wait(); } }
  async function section(index) { await closeAll(); key(OK); await wait(); key(UP); key(LEFT); for (let i = 0; i < index; i++) key(RIGHT); await wait(100); key(OK); await wait(700); }

  // Queue: arrows move, OK on a song offers actions, Play now plays it.
  await section(2);
  assert(document.querySelector('.player-panel h2').textContent === 'Queue', 'Queue opens from the top strip');
  const initial = title();
  // Past Playing on / Join / Move here / Speakers together to the first song.
  for (let i = 0; i < 6; i++) key(DOWN);
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
  // Volume for each speaker: the group's members with a volume of their own.
  const volumes = () => rows().filter(b => /%$/.test(b.lastChild.textContent)).map(b => b.firstChild.textContent + ' ' + b.lastChild.textContent);
  row('Hallway · Preview').click(); await wait(600);
  assert(volumes().join() === 'Kitchen · Preview 20%,Living room · Preview 35%', 'One volume row per member, none for fixed volume: ' + volumes().join());
  const kitchenVolume = () => rows().filter(b => b.firstChild.textContent === 'Kitchen · Preview')[1];
  kitchenVolume().focus(); for (let i = 0; i < 30 && selected() !== kitchenVolume(); i++) { key(DOWN); await wait(40); }
  key(RIGHT); await wait(600);
  assert(kitchenVolume().lastChild.textContent === '25%', 'Right steps one speaker up by 5');
  row('Hallway · Preview').click(); await wait(600);
  key(BACK); await wait();

  // Play on says what each speaker plays, and offers Join and Move here first.
  row('Playing on').click(); await wait();
  const detail = label => row(label).lastChild.textContent;
  assert(detail('Bedroom · Preview').indexOf('Paused · Low tide — Demo Field Recordings') === 0, 'A paused speaker shows its song');
  assert(detail('Kitchen · Preview') === detail('Living room · Preview'), 'A member plays its leader’s song');
  assert(rows()[0].firstChild.textContent === 'Join Living room · Preview' && rows()[1].firstChild.textContent === 'Move here', 'Join, then Move here, on top');
  // Join adds this TV to the group and picks it; neither offer stays.
  rows()[0].click(); await wait(600);
  assert(document.querySelector('.player-panel h2').textContent === 'Queue', 'Join goes back to the queue');
  assert(row('Playing on').lastChild.textContent === 'This TV · Preview' && !row('Move here'), 'This TV now plays the living room’s music');
  // Leave again and follow Automatic: Move here comes back.
  row('Speakers together').click(); await wait(); row('This TV · Preview').click(); await wait(600); key(BACK); await wait();
  row('Playing on').click(); await wait(); row('Automatic').click(); await wait(600);

  // Move here moves the music to this TV.
  row('Move here').click(); await wait(600);
  assert(document.querySelector('.poster-target').textContent === 'This TV · Preview', 'The music moves to this TV');

  // Display: Album stops GPU drawing; Visuals only hides captions and draws again.
  await closeAll(); key(OK); await wait();
  document.querySelector('[aria-label="Display"]').click(); await wait();
  const pick = label => rows().find(b => b.firstChild.textContent === label).click();
  pick('Album'); await closeAll();
  const frames = window.afterglowDiagnostics().rendering.frames; await wait();
  assert(window.afterglowDiagnostics().rendering.frames === frames, 'Album mode must stop GPU drawing');
  key(OK); await wait(); document.querySelector('[aria-label="Display"]').click(); await wait(); pick('Visuals only'); await closeAll();
  assert(getComputedStyle(document.querySelector('#track')).display === 'none', 'Pure visuals must hide the track card');
  assert(getComputedStyle(document.querySelector('.lyric-overlay')).display === 'none', 'Pure visuals must hide lyric overlay');
  assert(window.afterglowDiagnostics().drawing, 'Visuals should resume drawing');

  // Lists longer than their sheet say so: "More" below, then above once scrolled; the focused row keeps a row beyond it.
  await section(2);
  const frame = document.querySelector('.player-panel .scroll-frame');
  assert(frame.classList.contains('more-below') && !frame.classList.contains('more-above'), 'A long queue shows More below');
  for (let i = 0; i < 9; i++) { key(DOWN); await wait(60); }
  const box = frame.getBoundingClientRect(), focused = selected().getBoundingClientRect();
  assert(focused.bottom + focused.height <= box.bottom + 2, 'The focused row keeps one row of context above the cue');
  assert(frame.classList.contains('more-above'), 'Scrolled down, More shows above');
  for (let i = 0; i < 30 && selected() !== rows()[rows().length - 1]; i++) { key(DOWN); await wait(40); }
  assert(!frame.classList.contains('more-below'), 'At the last row More below goes');

  // Lyrics over Visuals + track: One line and Stage, each with its own Position, Background and Size.
  await closeAll(); key(OK); await wait(); document.querySelector('[aria-label="Display"]').click(); await wait();
  pick('Visuals + track'); await wait();
  const option = label => rows().find(b => b.firstChild.textContent === label);
  const shows = label => option(label) && option(label).lastChild.textContent;
  async function choose(label, value) { for (let i = 0; i < 4 && shows(label) !== value; i++) { option(label).click(); await wait(80); } assert(shows(label) === value, label + ' reaches ' + value); }
  await choose('Lyrics over Visuals + track', 'Off');
  assert(!option('Position'), 'No look rows while the overlay is Off');
  await choose('Lyrics over Visuals + track', 'One line');
  assert(shows('Position') === 'Bottom' && shows('Background') === 'Box' && shows('Size') === 'Medium', 'One line starts at Bottom, Box, Medium');
  await choose('Position', 'Middle'); await choose('Background', 'None');
  await choose('Lyrics over Visuals + track', 'Stage');
  assert(shows('Position') === 'Middle' && shows('Background') === 'Box', 'Stage keeps its own look');
  await choose('Position', 'Top'); await choose('Size', 'Large');
  await choose('Lyrics over Visuals + track', 'One line');
  assert(shows('Position') === 'Middle' && shows('Background') === 'None', 'Changing Stage did not move One line');
  await closeAll(); await wait(1500);
  const line = document.querySelector('.lyric-overlay-line'), layer = document.querySelector('.lyric-overlay');
  assert(layer.classList.contains('has-line') && getComputedStyle(layer).visibility === 'visible', 'The overlay shows as soon as the panel closes');
  const middle = line.getBoundingClientRect();
  assert(Math.abs((middle.top + middle.bottom) / 2 - innerHeight / 2) < 3, 'Middle is the vertical centre');
  assert(/rgba?\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(line).backgroundColor) && getComputedStyle(line).textShadow !== 'none', 'None: text only, with a soft dark edge');
  // Bottom stacks above the track card, which a new song brings up.
  key(OK); await wait(); document.querySelector('[aria-label="Display"]').click(); await wait();
  await choose('Position', 'Bottom'); await choose('Background', 'Box');
  await closeAll(); key(OK); await wait(); document.querySelector('[aria-label="Next"]').click(); await wait(600); await closeAll(); await wait(1500);
  const card = document.getElementById('track');
  assert(card.classList.contains('shown'), 'A new song shows the track card');
  assert(line.getBoundingClientRect().bottom <= card.getBoundingClientRect().top - 4, 'One line at Bottom stacks above the track card');
  assert(getComputedStyle(layer).opacity === getComputedStyle(card).opacity, 'Dim track info dims the overlay with the card');

  // Smooth progress: the bar's fill is a transform that moves between frames.
  key(OK); await wait(); document.querySelector('[aria-label="Display"]').click(); await wait();
  await choose('Lyrics over Visuals + track', 'Off');
  pick('Album'); await closeAll(); await wait(500);
  const fill = document.querySelector('.progress-track div');
  const scale = () => Number(/scaleX\(([\d.]+)\)/.exec(fill.style.transform)[1]);
  const before = scale(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); await wait(60);
  assert(scale() > before && !fill.style.width, 'The progress bar moves every frame by transform');
  key(OK); await wait(); document.querySelector('[aria-label="Display"]').click(); await wait(); pick('Visuals only'); await closeAll();

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
  // Scan to save: the song's public page as a code beside the facts.
  const share = document.querySelector('.details-top .share-block');
  assert(share && share.querySelector('svg.share-code path').getAttribute('d').length > 100, 'Details show a Scan to save code');
  assert(share.querySelector('.share-label').textContent === 'Scan to open on your phone' && share.querySelector('.share-service').textContent === 'Spotify', 'The code is labelled with its service');
  const code = share.getBoundingClientRect(), factsBox = document.querySelector('.details-facts').getBoundingClientRect();
  assert(code.left >= factsBox.right && Math.abs(code.width - innerHeight * 0.26) < 2, 'The code sits beside the facts, 26vh wide');
  await closeAll();

  // Check my setup: Settings, last section; it runs at once and lists pass and fail with next steps.
  await closeAll(); key(OK); await wait(); key(UP); key(LEFT); key(RIGHT); key(RIGHT); key(RIGHT); await wait(100); key(OK); await wait(500);
  key(UP); key(UP); await wait();
  assert(document.querySelector('#menu .row.focus').firstChild.textContent === 'Check my setup', 'Check my setup sits at the end of Settings');
  key(OK); await wait(200);
  const setup = document.getElementById('setup');
  assert(getComputedStyle(setup).display === 'block' && setup.querySelector('.setup-note').textContent === 'Checking…', 'It opens and starts checking');
  await wait(2000);
  const setupRows = Array.from(setup.querySelectorAll('.setup-row')).map(r => r.querySelector('.setup-line').firstChild.textContent);
  assert(setupRows[0] === 'Music Assistant' && setupRows[setupRows.length - 1] === 'Check again', 'Rows run from Music Assistant to Check again');
  assert(setup.querySelector('.setup-row.busy .setup-next').textContent === 'LRCLIB is busy. Lyrics are tried again by themselves.', 'Busy lyrics say what happens next');
  key(BACK); await wait();
  assert(getComputedStyle(setup).display === 'none' && document.getElementById('menu').style.display === 'block', 'Back returns to Settings');
  assert(document.querySelector('#menu .row.focus').lastChild.textContent !== 'Not run', 'Settings shows the result');
  await closeAll();

  // Lyrics tools: keep a timing for this song, choose other lyrics, go to a line.
  key(OK); await wait(); document.querySelector('[aria-label="Display"]').click(); await wait();
  pick('Lyrics'); await wait(1500);
  const heads = () => Array.from(document.querySelectorAll('.panel-items h3')).map(h => h.textContent);
  option('Lyrics timing')._change(1); await wait(400);
  assert(heads().indexOf('Keep this timing for this song?') >= 0 && option('Not now'), 'Changing the timing offers to keep it for the song');
  option('Keep').click(); await wait(400);
  assert(shows('Forget timing for this song') === 'Timing: kept for this song' && shows('Lyrics timing') === '0.1 s later', 'Keep: the song keeps its timing');
  option('Forget timing for this song').click(); await wait(400);
  assert(shows('Lyrics timing') === 'With the music', 'Forget: back to the device timing');
  option('Choose other lyrics').click(); await wait(1200);
  assert(document.querySelector('.player-panel h2').textContent === 'Choose lyrics' && rows().length >= 4 && rows()[0].classList.contains('chosen'), 'Choose lyrics lists versions, Automatic ticked');
  assert(rows().some(b => / longer · /.test(b.lastChild.textContent)), 'A much longer version says so');
  rows()[1].click(); await wait(400);
  assert(shows('Choose other lyrics') === 'Chosen for this song', 'A pick is kept for the song');
  option('Choose other lyrics').click(); await wait(1200); rows()[0].click(); await wait(1500);
  await closeAll(); key(OK); await wait(); document.querySelector('[aria-label="Details"]').click(); await wait(800);
  option('Go to a line').click(); await wait(400);
  assert(document.querySelector('.player-panel h2').textContent === 'Go to a line' && selected() && selected().classList.contains('chosen'), 'Go to a line focuses the line on screen');
  const last = rows()[rows().length - 1], target = last.lastChild.textContent;
  last.click(); await wait(800);
  assert(!player.classList.contains('panel-open') && document.querySelector('.elapsed').textContent === target, 'Picking a line plays from it');
  key(OK); await wait(); document.querySelector('[aria-label="Display"]').click(); await wait(); pick('Visuals only'); await closeAll();

  // The whole library: All albums reads more as the focus nears its end, with only a window of rows in the page.
  await section(0);
  const browseRows = () => Array.from(document.querySelectorAll('.browse-list button'));
  const focusedName = () => document.querySelector('.browse-list .selected strong').textContent;
  for (let i = 0; i < 14 && selected().textContent !== 'All albums'; i++) { key(DOWN); await wait(150); }
  await wait(500); key(RIGHT); await wait();
  for (let i = 0; i < 400 && focusedName() !== 'Shelf 127 (demo)'; i++) { key(DOWN); await wait(20); }
  assert(focusedName() === 'Shelf 127 (demo)', 'Paging reaches past the first page: ' + focusedName());
  assert(browseRows().length <= 81, 'Only a window of rows is in the page');
  assert(document.querySelector('.player-browse .scroll-frame').classList.contains('more-below'), 'More still shows below');

  // Continue listening: the book in progress carries on; Details offers Speed and Chapters.
  key(LEFT); await wait(100);
  for (let i = 0; i < 14 && selected().textContent !== 'Continue listening'; i++) { key(UP); await wait(150); }
  await wait(500); key(RIGHT); await wait(); key(OK); await wait(); key(OK);
  assert(await until(() => /lighthouse keeper/.test(title())), 'Play now starts the book');
  await closeAll(); key(OK); await wait(); document.querySelector('[aria-label="Details"]').click();
  await until(() => row('Speed'));
  assert(row('Speed') && row('Chapters') && !row('Start radio from this song'), 'A book offers Speed and Chapters, not radio');
  assert(row('Chapters').lastChild.textContent === 'Chapter 4 of 24', 'It resumed in its fourth chapter');
  row('Speed').click();
  await until(() => row('Speed') && row('Speed').lastChild.textContent === '1.25×');
  assert(row('Speed').lastChild.textContent === '1.25×', 'Speed steps up');
  row('Chapters').click(); await wait();
  assert(document.querySelector('.player-panel h2').textContent === 'Chapters' && rows()[3].classList.contains('chosen'), 'Chapters tick the playing one');
  rows()[1].click();
  await until(() => rows()[1] && rows()[1].classList.contains('chosen'));
  assert(rows()[1].classList.contains('chosen'), 'A chapter plays from its start');
  key(BACK); await wait();
  assert(document.querySelector('.player-panel h2').textContent !== 'Chapters', 'Back returns to Details');

  // Go to the album from Details, and back.
  await section(0);
  for (let i = 0; i < 14 && selected().textContent !== 'Favourite albums'; i++) { key(DOWN); await wait(150); }
  await wait(500); key(RIGHT); await wait(); key(OK); await wait(); key(OK);
  await until(() => !/lighthouse keeper/.test(title()));
  await closeAll(); key(OK); await wait(); document.querySelector('[aria-label="Details"]').click();
  assert(await until(() => row('Go to the album')), 'A song from an album offers Go to the album');
  const album = row('Go to the album').lastChild.textContent;
  row('Go to the album').click();
  await until(() => player.getAttribute('data-panel') === 'browse' && document.querySelector('.browse-title').textContent === album);
  assert(player.getAttribute('data-panel') === 'browse' && document.querySelector('.browse-title').textContent === album, 'Go to the album opens its songs');
  key(BACK); await wait();
  assert(player.getAttribute('data-panel') === 'details', 'Back returns to Details');
  await closeAll();

  // Playlists: a song goes into one from Details; the queue is saved as one, named without a keyboard.
  await closeAll(); key(OK); await wait(); document.querySelector('[aria-label="Details"]').click();
  await until(() => row('Add to a playlist'));
  row('Add to a playlist').click(); await until(() => row('Sunday kitchen (demo)'));
  assert(document.querySelector('.player-panel h2').textContent === 'Add to a playlist', 'Add to a playlist opens the picker');
  assert(rows()[0].firstChild.textContent === 'New playlist' && /^As “Playlist · \d+ \w{3}”$/.test(rows()[0].lastChild.textContent), 'New playlist comes first, named for today');
  row('Sunday kitchen (demo)').click();
  await until(() => row('Add to a playlist') && /^Added/.test(row('Add to a playlist').lastChild.textContent));
  assert(/^Added to “Sunday kitchen \(demo\)”$/.test(row('Add to a playlist').lastChild.textContent) && row('Add to a playlist').classList.contains('chosen'), 'The row confirms with a tick');
  await section(2);
  row('Save as a playlist').click();
  await until(() => row('Save as a playlist') && /^Saved/.test(row('Save as a playlist').lastChild.textContent));
  assert(/^Saved as “Queue · \d+ \w{3}”/.test(row('Save as a playlist').lastChild.textContent), 'The queue is saved under a made-up name');
  await closeAll();

  // Idle: pause, and after half a minute the recent music is set as a poster; OK resumes.
  const idle = document.getElementById('idle');
  key(32); await wait(600);
  const paused = title();
  await wait(25000);
  assert(!idle.classList.contains('shown'), 'A pause is given half a minute before the poster');
  assert(await until(() => idle.classList.contains('shown'), 20000), 'Nothing playing shows the idle poster');
  assert(idle.querySelector('.idle-title').textContent === paused && idle.querySelector('.idle-hint').textContent === 'OK resumes', 'The paused song comes first');
  key(RIGHT); await wait();
  assert(idle.querySelector('.idle-title').textContent !== paused && idle.querySelectorAll('.idle-tile.selected').length === 1, 'Right moves along the strip');
  // Tonight's (or today's) programme is offered just before Browse, and opens only on request.
  const programme = idle.querySelector('.programme');
  assert(!programme.classList.contains('shown'), 'The programme never opens by itself');
  for (let i = 0; i < 12 && !idle.querySelector('.idle-tile.selected.idle-programme'); i++) { key(RIGHT); await wait(100); }
  assert(/’s programme$/.test(idle.querySelector('.idle-title').textContent), 'The programme tile is on offer');
  key(OK); await wait(800);
  assert(programme.classList.contains('shown') && programme.querySelectorAll('.programme-col li').length >= 3, 'The programme lists the evening');
  key(BACK); await wait();
  assert(!programme.classList.contains('shown') && idle.classList.contains('shown'), 'Back returns to the idle poster');
  for (let i = 0; i < 12; i++) key(LEFT);
  await wait(); key(OK); await wait(1500);
  assert(!idle.classList.contains('shown'), 'OK resumes and the poster leaves');
  assert(document.documentElement.scrollWidth <= innerWidth, 'Screen must not overflow horizontally');
  // Visuals & presets: Change preset offers Each song and On big moments; Cover art in the visuals toggles.
  await closeAll(); await section(3);
  const menuRow = label => Array.from(document.querySelectorAll('#menu .row')).find(r => r.firstChild.textContent === label);
  const menuValue = label => menuRow(label).lastChild.textContent;
  // A slow browser (software GL on a busy machine) can switch MilkDrop off as "too slow on this TV",
  // which hides the preset rows; say so rather than fail on a missing row.
  const milkdropOff = menuRow('MilkDrop') && /^off/.test(menuValue('MilkDrop')) ? menuValue('MilkDrop') : '';
  if (!milkdropOff) {
    const seen = [];
    for (let i = 0; i < 6; i++) { seen.push(menuValue('Change preset')); menuRow('Change preset').click(); await wait(60); }
    assert(['Each song', 'On big moments', 'Never', 'Every 2 min'].every(v => seen.indexOf(v) >= 0), 'Change preset offers the timers, Each song and On big moments: ' + seen.join(', '));
    for (let i = 0; i < 6 && menuValue('Change preset') !== 'Every 2 min'; i++) { menuRow('Change preset').click(); await wait(60); }
    assert(menuValue('Cover art in the visuals') === 'On', 'Cover art in the visuals is on by default');
    menuRow('Cover art in the visuals').click(); await wait(60);
    assert(menuValue('Cover art in the visuals') === 'Off', 'Cover art in the visuals turns off');
    menuRow('Cover art in the visuals').click(); await wait(60);
    // Shuffled Previous returns to the preset shown before.
    await closeAll();
    const shownPreset = () => window.afterglowDiagnostics().preset;
    const first = shownPreset(); key(UP); await wait(); const second = shownPreset(); key(UP); await wait();
    key(DOWN); await wait();
    assert(shownPreset() === second, 'Previous returns to the preset shown before');
    key(DOWN); await wait();
    assert(shownPreset() === first, 'and the one before that');
  }
  return Object.assign({ passed, viewport: [innerWidth, innerHeight] }, milkdropOff ? { skipped: 'Visuals & presets checks: MilkDrop ' + milkdropOff } : {});
})()
