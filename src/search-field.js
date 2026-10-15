// The Search row in Browse: a real text input, so the TV's on-screen keyboard
// and the Magic Remote's voice input attach to it. keys.js leaves keys alone
// while it has focus, so Enter and Back are handled here: Enter searches and
// puts the keyboard away, Back just puts it away. Text that stops changing
// for a moment (voice input often sends no Enter) searches by itself, and so
// does the keyboard closing.
const PAUSE_MS = 1000;
const LENS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"><path d="M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5L21 21"/></svg>';

export function createSearchField({ onFocus, onSubmit, onLeave }) {
  const row = document.createElement("div"), icon = document.createElement("span"), input = document.createElement("input");
  row.className = "browse-search"; row.tabIndex = -1;
  icon.className = "browse-search-icon"; icon.innerHTML = LENS;
  input.type = "text"; input.className = "browse-input";
  input.setAttribute("placeholder", "Artist, album or song");
  input.setAttribute("aria-label", "Search Music Assistant");
  input.setAttribute("autocomplete", "off"); input.setAttribute("spellcheck", "false");
  row.appendChild(icon); row.appendChild(input);
  let pause = 0;
  const typing = () => document.activeElement === input;

  function submit() { clearTimeout(pause); pause = 0; onSubmit(input.value); }
  function leave(search) { input.blur(); if (search) submit(); onLeave(); }
  input.addEventListener("keydown", event => {
    if (event.keyCode === 13 || event.key === "Enter") { event.preventDefault(); leave(true); }
    else if (event.keyCode === 461 || event.keyCode === 27 || event.key === "GoBack") { event.preventDefault(); leave(false); }
  });
  input.addEventListener("input", () => { clearTimeout(pause); pause = setTimeout(submit, PAUSE_MS); });
  input.addEventListener("focus", onFocus);
  row.addEventListener("click", () => { if (!typing()) input.focus(); });
  // webOS reports its keyboard closing (its own hide key, or OK on Done).
  document.addEventListener("keyboardStateChange", event => {
    if (event.detail && event.detail.visibility === false && typing()) leave(true);
  });

  return {
    row, input,
    get typing() { return typing(); },
    reset() { clearTimeout(pause); pause = 0; input.value = ""; input.blur(); },
  };
}
