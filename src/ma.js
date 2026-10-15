// One-shot requests to Music Assistant's API socket (ws://host:8095/ws), for
// signing in and managing tokens. The streaming client lives in follow.js.
//   greeting {server_version} -> {message_id, command, args} -> {message_id, result | error_code, details}
import { authority } from "./relay.js";

const CONNECT_MS = 10000;
const CALL_MS = 15000;

export function connectApi(host, WebSocketImpl) {
  const Socket = WebSocketImpl || WebSocket;
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new Socket("ws://" + authority(host) + "/ws");
    } catch (e) {
      return reject(new Error("Could not open a connection to " + host));
    }
    const pending = {};
    let n = 0;
    let greeted = false;
    const timer = setTimeout(() => {
      if (greeted) return;
      ws.close();
      reject(new Error("No answer from " + host));
    }, CONNECT_MS);
    ws.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (!greeted && message.server_version) {
        greeted = true;
        clearTimeout(timer);
        resolve(api);
        return;
      }
      const waiting = pending[message.message_id];
      if (!waiting) return;
      delete pending[message.message_id];
      clearTimeout(waiting.timer);
      if (message.error_code !== undefined) waiting.reject(new Error(message.details || "error " + message.error_code));
      else waiting.resolve(message.result);
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      clearTimeout(timer);
      if (!greeted) reject(new Error("Could not connect to " + host));
      for (const id of Object.keys(pending)) {
        clearTimeout(pending[id].timer);
        pending[id].reject(new Error("Connection closed"));
        delete pending[id];
      }
    };
    const api = {
      call(command, args) {
        return new Promise((res, rej) => {
          const id = "c" + ++n;
          const timeout = setTimeout(() => {
            delete pending[id];
            rej(new Error("No reply to " + command));
          }, CALL_MS);
          pending[id] = { resolve: res, reject: rej, timer: timeout };
          ws.send(JSON.stringify({ message_id: id, command, args: args || {} }));
        });
      },
      close() {
        try {
          ws.close();
        } catch (e) {
          // already closed
        }
      },
    };
  });
}

// The token list carries no token text: a token just made is told by being
// the newest long-lived one in its name. Its id is kept, so renewal and
// sign-out touch that token alone even when another TV shows the same name.
function newestNamed(tokens, name) {
  const named = (tokens || []).filter((t) => t.name === name && t.is_long_lived);
  named.sort((a, b) => (String(a.created_at || "") < String(b.created_at || "") ? 1 : -1));
  return named[0] || null;
}

// Signs in with a username and password and comes back with a long-lived
// token in this device's name. The session token the login hands out is
// revoked again, so the account shows one token per TV.
export async function signIn({ host, username, password, deviceName, WebSocketImpl }) {
  const api = await connectApi(host, WebSocketImpl);
  try {
    const login = await api.call("auth/login", { username, password, device_name: deviceName });
    if (!login || !login.success) throw new Error((login && login.error) || "Sign-in failed");
    await api.call("auth", { token: login.access_token });
    const token = await api.call("auth/token/create", { name: deviceName });
    let made = null;
    try {
      const tokens = await api.call("auth/tokens");
      made = newestNamed(tokens, deviceName);
      for (const t of tokens || []) if (t.name === deviceName && !t.is_long_lived) await api.call("auth/token/revoke", { token_id: t.token_id });
    } catch (e) {
      // the session token expires on its own
    }
    const auth = { host, token, user: (login.user && login.user.username) || username, tokenName: deviceName };
    if (made) auth.tokenId = made.token_id;
    return auth;
  } finally {
    api.close();
  }
}

// The account's tokens, as seen with this token.
export async function listTokens({ host, token, WebSocketImpl }) {
  const api = await connectApi(host, WebSocketImpl);
  try {
    await api.call("auth", { token });
    return (await api.call("auth/tokens")) || [];
  } finally {
    api.close();
  }
}

// Forgets this TV on the account: its own token when its id is known, else
// (a sign-in from before ids were kept) every token in its name.
export async function signOut({ host, token, tokenName, tokenId, WebSocketImpl }) {
  const api = await connectApi(host, WebSocketImpl);
  try {
    await api.call("auth", { token });
    const tokens = (await api.call("auth/tokens")) || [];
    for (const t of tokens) if (tokenId ? t.token_id === tokenId : t.name === tokenName) await api.call("auth/token/revoke", { token_id: t.token_id });
  } finally {
    api.close();
  }
}

// A fresh long-lived token in the same name, with the old one revoked.
// onCreated gets the fresh token before anything is revoked, so whatever runs
// on the old one can move over first. Revoked: the old token by its id when
// known, else the long-lived ones in this name made before the fresh one;
// never the fresh one. Resolves with { token, tokenId } (the fresh token's).
export async function renewToken({ host, token, tokenName, tokenId, onCreated, WebSocketImpl }) {
  const api = await connectApi(host, WebSocketImpl);
  try {
    await api.call("auth", { token });
    const fresh = await api.call("auth/token/create", { name: tokenName });
    if (onCreated) onCreated(fresh);
    await api.call("auth", { token: fresh });
    const tokens = (await api.call("auth/tokens")) || [];
    const made = newestNamed(tokens, tokenName);
    const madeAt = String((made && made.created_at) || "");
    const old = tokens.filter((t) => made && t.token_id !== made.token_id &&
      (tokenId ? t.token_id === tokenId : t.name === tokenName && t.is_long_lived && String(t.created_at || "") < madeAt));
    for (const t of old) await api.call("auth/token/revoke", { token_id: t.token_id });
    return { token: fresh, tokenId: made ? made.token_id : "" };
  } finally {
    api.close();
  }
}

// A player's Sendspin playback delay, a Music Assistant player setting
// (positive plays earlier). Music Assistant sends it on to the player, so the
// setting there is the one source of truth.
export async function getPlayerDelay({ host, token, playerId, WebSocketImpl }) {
  const api = await connectApi(host, WebSocketImpl);
  try {
    await api.call("auth", { token });
    const config = await api.call("config/players/get", { player_id: playerId });
    const entry = config && config.values && config.values.sendspin_static_delay;
    return entry ? Number(entry.value != null ? entry.value : entry.default_value) || 0 : 0;
  } finally {
    api.close();
  }
}

export async function setPlayerDelay({ host, token, playerId, delayMs, WebSocketImpl }) {
  const api = await connectApi(host, WebSocketImpl);
  try {
    await api.call("auth", { token });
    await api.call("config/players/save", { player_id: playerId, values: { sendspin_static_delay: delayMs } });
  } finally {
    api.close();
  }
}
