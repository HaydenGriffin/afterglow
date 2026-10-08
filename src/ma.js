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
    try {
      const tokens = await api.call("auth/tokens");
      for (const t of tokens || []) if (t.name === deviceName && !t.is_long_lived) await api.call("auth/token/revoke", { token_id: t.token_id });
    } catch (e) {
      // the session token expires on its own
    }
    return { host, token, user: (login.user && login.user.username) || username, tokenName: deviceName };
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

// Forgets this TV on the account: every token in its name is revoked.
export async function signOut({ host, token, tokenName, WebSocketImpl }) {
  const api = await connectApi(host, WebSocketImpl);
  try {
    await api.call("auth", { token });
    const tokens = (await api.call("auth/tokens")) || [];
    for (const t of tokens) if (t.name === tokenName) await api.call("auth/token/revoke", { token_id: t.token_id });
  } finally {
    api.close();
  }
}

// A fresh long-lived token in the same name, with the old one revoked.
export async function renewToken({ host, token, tokenName, WebSocketImpl }) {
  const api = await connectApi(host, WebSocketImpl);
  try {
    await api.call("auth", { token });
    const fresh = await api.call("auth/token/create", { name: tokenName });
    await api.call("auth", { token: fresh });
    // The list carries no token text, so every long-lived token in this name
    // but the newest (the fresh one) is revoked.
    const tokens = (await api.call("auth/tokens")) || [];
    const ours = tokens.filter((t) => t.name === tokenName && t.is_long_lived).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    for (const t of ours.slice(1)) await api.call("auth/token/revoke", { token_id: t.token_id });
    return fresh;
  } finally {
    api.close();
  }
}
