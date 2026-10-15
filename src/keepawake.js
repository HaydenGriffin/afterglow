// Keeps the webOS screensaver from covering the visualizer.
//
// webOS has no public switch for this. The TV's power service announces each
// screensaver start to registered clients, and a reply of ack:false calls it
// off (the method Kodi, RetroArch, Immich and Moonfin use on webOS). The veto
// is only ever a reply to an announcement; nothing is sent unprompted.

const POWER = "luna://com.webos.service.tvpower/power/";
const MAX_ATTEMPTS = 3;
const RETRY_MS = 2000;

export function createKeepAwake(shouldHold) {
  const Bridge = window.WebOSServiceBridge || window.PalmServiceBridge;
  // Both bridges are kept referenced: a collected bridge drops its call.
  let subscription = null;
  let reply = null;
  let attempts = 0;
  let name = "";
  let status = Bridge ? "not started" : "unavailable (not on webOS)";
  let vetoes = 0;

  function respond(timestamp) {
    const hold = shouldHold();
    if (hold) vetoes++;
    // A fresh bridge per reply: a second call on the subscription's bridge
    // would replace the subscription.
    reply = new Bridge();
    reply.onservicecallback = () => {};
    reply.call(POWER + "responseScreenSaverRequest", JSON.stringify({ clientName: name, ack: !hold, timestamp }));
  }

  function register() {
    attempts++;
    // The service keeps a name registered until the TV restarts and refuses it
    // a second time, so every launch registers under a new one.
    name = "io.github.haydengriffin.afterglow." + Date.now().toString(36);
    status = "registering";
    subscription = new Bridge();
    subscription.onservicecallback = (payload) => {
      let message;
      try {
        message = typeof payload === "string" ? JSON.parse(payload) : payload;
      } catch (e) {
        return;
      }
      if (!message) return;
      if (message.returnValue === false) {
        status = "refused: " + (message.errorText || message.errorCode || "unknown");
        if (attempts < MAX_ATTEMPTS) setTimeout(register, RETRY_MS);
        return;
      }
      // An announcement carries a timestamp. webOS 4 omits the "state" field
      // newer versions send, so the timestamp is what identifies one.
      if (message.timestamp !== undefined) respond(message.timestamp);
      else status = "registered";
    };
    subscription.call(POWER + "registerScreenSaverRequest", JSON.stringify({ subscribe: true, clientName: name }));
  }

  return {
    start() {
      if (Bridge && !subscription) register();
    },
    get status() {
      return vetoes ? status + ", " + vetoes + " vetoed" : status;
    },
  };
}
