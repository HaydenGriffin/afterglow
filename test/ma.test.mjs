import assert from "node:assert/strict";
import { test } from "node:test";
import { connectApi, renewToken, signIn, signOut } from "../src/ma.js";

// A Music Assistant API socket that answers from a table of command -> result.
function fakeServer(answers) {
  const sockets = [];
  class Fake {
    constructor(url) {
      this.url = url;
      this.sent = [];
      sockets.push(this);
      setTimeout(() => this.onmessage({ data: JSON.stringify({ server_version: "2.10.5" }) }), 0);
    }
    send(data) {
      const message = JSON.parse(data);
      this.sent.push(message);
      const answer = answers[message.command];
      const reply = typeof answer === "function" ? answer(message.args, this.sent) : answer;
      setTimeout(() => {
        if (reply && reply.error_code) this.onmessage({ data: JSON.stringify(Object.assign({ message_id: message.message_id }, reply)) });
        else this.onmessage({ data: JSON.stringify({ message_id: message.message_id, result: reply === undefined ? null : reply }) });
      }, 0);
    }
    close() {
      this.closed = true;
      if (this.onclose) this.onclose({});
    }
  }
  return { Fake, sockets };
}

test("connectApi resolves after the greeting and rejects a call the server refuses", async () => {
  const { Fake, sockets } = fakeServer({ "auth/me": { error_code: 401, details: "Authentication required" }, "auth/providers": [{ id: "builtin" }] });
  const api = await connectApi("h", Fake);
  assert.equal(sockets[0].url, "ws://h:8095/ws");
  assert.deepEqual(await api.call("auth/providers"), [{ id: "builtin" }]);
  await assert.rejects(api.call("auth/me"), /Authentication required/);
  api.close();
  assert.equal(sockets[0].closed, true);
});

test("signing in logs in, mints a long-lived token in the TV's name, and revokes the session token", async () => {
  const { Fake, sockets } = fakeServer({
    "auth/login": (args) => (args.password === "pw" ? { success: true, access_token: "session", user: { username: "michael" } } : { success: false, error: "Invalid username or password" }),
    auth: { authenticated: true },
    "auth/token/create": "longlived",
    "auth/tokens": [
      { token_id: "t1", name: "Afterglow on TV (abc)", is_long_lived: false },
      { token_id: "t2", name: "Afterglow on TV (abc)", is_long_lived: true },
      { token_id: "t3", name: "Phone", is_long_lived: false },
    ],
    "auth/token/revoke": null,
  });
  await assert.rejects(signIn({ host: "h", username: "michael", password: "no", deviceName: "Afterglow on TV (abc)", WebSocketImpl: Fake }), /Invalid username or password/);
  assert.equal(sockets[0].closed, true, "the socket is closed after a failure");

  const auth = await signIn({ host: "h", username: "michael", password: "pw", deviceName: "Afterglow on TV (abc)", WebSocketImpl: Fake });
  assert.deepEqual(auth, { host: "h", token: "longlived", user: "michael", tokenName: "Afterglow on TV (abc)", tokenId: "t2" });
  const commands = sockets[1].sent.map((m) => m.command);
  assert.deepEqual(commands, ["auth/login", "auth", "auth/token/create", "auth/tokens", "auth/token/revoke"]);
  assert.deepEqual(sockets[1].sent[0].args, { username: "michael", password: "pw", device_name: "Afterglow on TV (abc)" });
  assert.deepEqual(sockets[1].sent[1].args, { token: "session" });
  assert.deepEqual(sockets[1].sent[4].args, { token_id: "t1" }, "only the short-lived token in our name goes");
  assert.equal(sockets[1].closed, true);
});

test("signing out revokes every token in the TV's name and nothing else", async () => {
  const { Fake, sockets } = fakeServer({
    auth: { authenticated: true },
    "auth/tokens": [
      { token_id: "t1", name: "Afterglow on TV (abc)", is_long_lived: true },
      { token_id: "t2", name: "Afterglow on TV (abc)", is_long_lived: true },
      { token_id: "t3", name: "Afterglow on TV (xyz)", is_long_lived: true },
    ],
    "auth/token/revoke": null,
  });
  await signOut({ host: "h", token: "longlived", tokenName: "Afterglow on TV (abc)", WebSocketImpl: Fake });
  const revoked = sockets[0].sent.filter((m) => m.command === "auth/token/revoke").map((m) => m.args.token_id);
  assert.deepEqual(revoked, ["t1", "t2"]);
});

test("renewing hands the fresh token over before the old one is revoked", async () => {
  const order = [];
  const { Fake, sockets } = fakeServer({
    auth: { authenticated: true },
    "auth/token/create": "fresh",
    "auth/tokens": [
      { token_id: "t1", name: "TV", is_long_lived: true, created_at: "2026-01-01" },
      { token_id: "t2", name: "TV", is_long_lived: true, created_at: "2026-10-15" },
    ],
    "auth/token/revoke": (args) => (order.push("revoke " + args.token_id), null),
  });
  const renewed = await renewToken({ host: "h", token: "old", tokenName: "TV", WebSocketImpl: Fake, onCreated: (token) => order.push("created " + token) });
  assert.deepEqual(renewed, { token: "fresh", tokenId: "t2" });
  assert.deepEqual(order, ["created fresh", "revoke t1"]);
  assert.equal(sockets[0].closed, true);
});

// Two TVs that show the same name: A (tokens a…) and B (token b1).
const sameName = (fresh) => [
  { token_id: "a1", name: "Afterglow on TV (abc)", is_long_lived: true, created_at: "2026-01-01T00:00:00" },
  { token_id: "b1", name: "Afterglow on TV (abc)", is_long_lived: true, created_at: "2026-02-01T00:00:00" },
].concat(fresh ? [{ token_id: fresh, name: "Afterglow on TV (abc)", is_long_lived: true, created_at: "2026-10-15T00:00:00" }] : []);

test("signing in reports the id of the token it made, so it can be told from a namesake's", async () => {
  const { Fake } = fakeServer({
    "auth/login": { success: true, access_token: "session", user: { username: "michael" } },
    auth: { authenticated: true },
    "auth/token/create": "longlived",
    "auth/tokens": sameName("a2"),
    "auth/token/revoke": null,
  });
  const auth = await signIn({ host: "h", username: "michael", password: "pw", deviceName: "Afterglow on TV (abc)", WebSocketImpl: Fake });
  assert.equal(auth.tokenId, "a2");
});

test("renewing on one of two TVs with the same name revokes only its own old token", async () => {
  const { Fake, sockets } = fakeServer({
    auth: { authenticated: true },
    "auth/token/create": "fresh",
    "auth/tokens": sameName("a2"),
    "auth/token/revoke": null,
  });
  const renewed = await renewToken({ host: "h", token: "old", tokenName: "Afterglow on TV (abc)", tokenId: "a1", WebSocketImpl: Fake });
  assert.deepEqual(renewed, { token: "fresh", tokenId: "a2" });
  const revoked = sockets[0].sent.filter((m) => m.command === "auth/token/revoke").map((m) => m.args.token_id);
  assert.deepEqual(revoked, ["a1"], "B's token and the fresh one stay");
});

test("renewing never revokes the fresh token, even when it cannot tell its own old one", async () => {
  const { Fake, sockets } = fakeServer({
    auth: { authenticated: true },
    "auth/token/create": "fresh",
    "auth/tokens": sameName("a2"),
    "auth/token/revoke": null,
  });
  await renewToken({ host: "h", token: "old", tokenName: "Afterglow on TV (abc)", WebSocketImpl: Fake });
  const revoked = sockets[0].sent.filter((m) => m.command === "auth/token/revoke").map((m) => m.args.token_id);
  assert.equal(revoked.indexOf("a2"), -1);
});

test("signing out with a known token id revokes that token only", async () => {
  const { Fake, sockets } = fakeServer({ auth: { authenticated: true }, "auth/tokens": sameName("a2"), "auth/token/revoke": null });
  await signOut({ host: "h", token: "t", tokenName: "Afterglow on TV (abc)", tokenId: "a2", WebSocketImpl: Fake });
  const revoked = sockets[0].sent.filter((m) => m.command === "auth/token/revoke").map((m) => m.args.token_id);
  assert.deepEqual(revoked, ["a2"]);
});
