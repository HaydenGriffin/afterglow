// Remote control input. webOS does not move focus on arrow keys by itself, so
// every key is handled here by keyCode. While a text field has focus (the
// sign-in form) keys are left to it, except Back, which leaves the field.

const NAMES = {
  37: "left",
  38: "up",
  39: "right",
  40: "down",
  13: "ok",
  461: "back",
  27: "back",
  8: "back",
  403: "red",
  404: "green",
  405: "yellow",
  406: "blue",
  // Keyboard stand-ins for the colour keys, for the page in a browser.
  70: "yellow", // F: favorite
  76: "blue", // L: list
  82: "red", // R: trim earlier
  71: "green", // G: trim later
};

export function keyName(event) {
  if (event.key === "GoBack") return "back";
  return NAMES[event.keyCode] || "";
}

export function isTyping(target) {
  return !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA");
}

export function installKeys(handler) {
  window.addEventListener("keydown", (event) => {
    const name = keyName(event);
    if (!name) return;
    if (isTyping(event.target)) return; // login.js handles Enter and Back on its inputs
    event.preventDefault();
    handler(name);
  });
}

export function exitApp() {
  const system = window.webOSSystem || window.PalmSystem;
  if (system && typeof system.platformBack === "function") system.platformBack();
  else window.close();
}
