// Run this expression in the built app at ?mock=1 (T3 preview_evaluate or DevTools).
// It operates only on demo music; refuses a live Music Assistant page.
(async () => {
  if (!new URLSearchParams(location.search).has('mock')) throw Error('Use ?mock=1');
  const assert = (ok, message) => { if (!ok) throw Error(message); };
  const key = code => window.dispatchEvent(new KeyboardEvent('keydown', { keyCode: code }));
  const wait = () => new Promise(resolve => setTimeout(resolve, 350));
  // Start with panels closed, then use the actual remote event handler.
  document.querySelectorAll('.panel-close').forEach(button => { if (button.offsetParent) button.click(); });
  if (document.querySelector('#player').classList.contains('controls-open')) key(27);
  key(13);
  document.querySelector('[aria-label="Up next"]').click();
  await wait();
  const initial = document.querySelector('.control-track').textContent;
  key(39); key(37); await wait();
  assert(document.querySelector('.control-track').textContent === initial, 'Queue arrows must not start playback');
  key(13); await wait();
  assert(document.querySelector('.control-track').textContent !== initial, 'OK should play the selected item');
  document.querySelector('[aria-label="Display"]').click();
  const select = label => Array.from(document.querySelectorAll('.panel-items button')).find(button => button.firstChild.textContent === label).click();
  select('Album'); key(27); key(27); await wait();
  const frames = window.vizmanDiagnostics().rendering.frames; await wait();
  assert(window.vizmanDiagnostics().rendering.frames === frames, 'Album mode must stop GPU drawing');
  key(13); document.querySelector('[aria-label="Display"]').click(); select('Visuals only'); key(27); key(27);
  assert(getComputedStyle(document.querySelector('#track')).display === 'none', 'Pure visuals must hide the track card');
  assert(getComputedStyle(document.querySelector('.lyric-overlay')).display === 'none', 'Pure visuals must hide lyric overlay');
  assert(window.vizmanDiagnostics().drawing, 'Visuals should resume drawing');
  assert(document.documentElement.scrollWidth <= innerWidth, 'Screen must not overflow horizontally');
  return { passed: 6, viewport: [innerWidth, innerHeight] };
})()
