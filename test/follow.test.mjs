import assert from "node:assert/strict";
import { test } from "node:test";
import { createFollow } from "../src/follow.js";

function harness(t, pinned = "", onTrack, onRemotePrefs, preferred = "") {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const sockets = [];
  class Fake {
    constructor(url) {
      this.url = url;
      this.sent = [];
      this.readyState = 1;
      sockets.push(this);
    }
    send(data) {
      this.sent.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
    }
    receive(message) {
      this.onmessage({ data: JSON.stringify(message) });
    }
    // Server greeting, then a successful login.
    login() {
      this.receive({ server_version: "2.10.5" });
      this.receive({ message_id: "auth", result: { authenticated: true } });
    }
    // A players snapshot: {id: {name, synced_to, ...}} or a list of ids.
    players(spec) {
      const ids = Array.isArray(spec) ? spec : Object.keys(spec);
      const result = ids.map((id) => Object.assign({ player_id: id, name: id, type: "player", available: true, enabled: true }, Array.isArray(spec) ? {} : spec[id]));
      this.receive({ message_id: "players", result });
    }
    // A queues snapshot, {id: state}. Also sends a matching players snapshot
    // for any id not yet described, so decisions can be made; settles the
    // debounce.
    queues(states, extraPlayers) {
      this.players(Object.assign({}, Object.fromEntries(Object.keys(states).map((id) => [id, {}])), extraPlayers || {}));
      this.receive({ message_id: "queues", result: Object.keys(states).map((id) => ({ queue_id: id, state: states[id] })) });
      t.mock.timers.tick(300);
    }
    event(name, id, data) {
      this.receive({ event: name, object_id: id, data });
      t.mock.timers.tick(300);
    }
  }
  const relay = {
    connects: [],
    state: "closed",
    connect(id) {
      this.connects.push(id);
      this.state = "open";
    },
  };
  const follow = createFollow({ host: "h", token: "tok", pinned, preferred, relay, WebSocketImpl: Fake, onTrack, onRemotePrefs, deviceId: "cx", sharedKeys: ["favorites"] });
  return { follow, relay, sockets, last: () => sockets[0].sent[sockets[0].sent.length - 1] };
}

test("a pinned player is connected straight away; the API is only used for track info", (t) => {
  const { follow, relay, sockets } = harness(t, "RINCON_PIN");
  follow.start();
  assert.deepEqual(relay.connects, ["RINCON_PIN"]);
  sockets[0].login();
  sockets[0].queues({ RINCON_PIN: "idle", other: "playing" });
  assert.deepEqual(relay.connects, ["RINCON_PIN"], "never switches away from the pinned player");
});

test("it logs in, asks for players and queues, and connects the relay to the playing queue", (t) => {
  const { follow, relay, sockets } = harness(t);
  follow.start();
  assert.equal(sockets[0].url, "ws://h:8095/ws");
  sockets[0].login();
  assert.deepEqual(sockets[0].sent.map((m) => m.command), ["auth", "auth/me", "players/all", "player_queues/all"]);
  assert.equal(sockets[0].sent[0].args.token, "tok");

  sockets[0].queues({ a: "idle", b: "idle" });
  assert.deepEqual(relay.connects, []);
  assert.equal(follow.state, "waiting");

  t.mock.timers.tick(10000);
  assert.equal(sockets[0].sent.length, 6, "both lists are fetched again");
  sockets[0].queues({ a: "idle", b: "playing", c: "playing" });
  assert.deepEqual(relay.connects, ["b"], "same start, so by name");
  assert.equal(follow.state, "watching");
  assert.deepEqual(follow.following, { queueId: "b", playerId: "b", name: "b", reason: "auto" });
});

test("nothing is decided until both lists have arrived", (t) => {
  const { follow, relay, sockets } = harness(t);
  follow.start();
  sockets[0].login();
  sockets[0].receive({ message_id: "queues", result: [{ queue_id: "a", state: "playing" }] });
  sockets[0].event("queue_updated", "a", { queue_id: "a", state: "playing" });
  assert.deepEqual(relay.connects, [], "no players yet");
  sockets[0].players(["a"]);
  t.mock.timers.tick(300);
  assert.deepEqual(relay.connects, ["a"]);
});

test("once frames flow it polls the watched queue for its track; after the stream ends it looks around again", (t) => {
  const tracks = [];
  const { follow, relay, sockets, last } = harness(t, "", (track) => tracks.push(track));
  follow.start();
  sockets[0].login();
  sockets[0].queues({ a: "playing" });
  follow.noteFrame();
  assert.equal(sockets[0].readyState, 1, "API socket stays open while streaming");
  assert.deepEqual(last(), { message_id: "queue", command: "player_queues/get", args: { queue_id: "a" } });

  sockets[0].receive({ message_id: "queue", result: { queue_id: "a", current_item: { queue_item_id: "i1", name: "x", media_item: { name: "Would?", artists: [{ name: "Alice In Chains" }], album: { name: "Dirt", year: 1992 }, metadata: { label: "Columbia" } } } } });
  assert.deepEqual(tracks, [{ id: "i1", title: "Would?", artist: "Alice In Chains", album: "Dirt", year: 1992, label: "Columbia" }]);
  sockets[0].receive({ message_id: "queue", result: { queue_id: "a", current_item: { queue_item_id: "i1", name: "x", media_item: { name: "Would?" } } } });
  assert.equal(tracks.length, 1, "the same item is not reported twice");

  t.mock.timers.tick(4000);
  assert.equal(last().command, "player_queues/get", "keeps asking about the track while streaming");

  // An event about the watched queue updates the track at once.
  sockets[0].event("queue_updated", "a", { queue_id: "a", state: "playing", current_item: { queue_item_id: "i2", name: "y", media_item: { name: "Rooster" } } });
  assert.equal(tracks[1].title, "Rooster");

  sockets[0].queues({ a: "idle", b: "playing" });
  assert.deepEqual(relay.connects, ["a"], "while frames flow, the relay decides");
  follow.noteEnd();
  t.mock.timers.tick(3000);
  assert.deepEqual(relay.connects, ["a", "b"], "after the stream ends, the other playing queue is taken");
});

test("a radio stream's single 'Artist - Title' string is split; no item means no track", (t) => {
  const tracks = [];
  const { follow, sockets } = harness(t, "", (track) => tracks.push(track));
  follow.start();
  sockets[0].login();
  sockets[0].queues({ r: "playing" });
  follow.noteFrame();
  sockets[0].receive({ message_id: "queue", result: { queue_id: "r", current_item: { queue_item_id: "s1", name: "Boards of Canada - Roygbiv" } } });
  assert.deepEqual(tracks[0], { id: "s1", title: "Roygbiv", artist: "Boards of Canada", album: "", year: "", label: "" });
  sockets[0].receive({ message_id: "queue", result: { queue_id: "r", current_item: null } });
  assert.equal(tracks[1], null);
});

test("a queue that claims to play but sends nothing is skipped until it stops", (t) => {
  const { follow, relay, sockets } = harness(t);
  follow.start();
  sockets[0].login();
  sockets[0].queues({ office: "playing", tv: "playing" });
  assert.deepEqual(relay.connects, ["office"]);

  t.mock.timers.tick(3000);
  sockets[0].queues({ office: "playing", tv: "playing" });
  assert.deepEqual(relay.connects, ["office"], "still within the grace period");

  t.mock.timers.tick(3000);
  sockets[0].queues({ office: "playing", tv: "playing" });
  assert.deepEqual(relay.connects, ["office", "tv"]);

  // office stops, then plays again: it gets another chance
  follow.noteFrame();
  follow.noteEnd();
  t.mock.timers.tick(3000);
  sockets[0].queues({ office: "idle", tv: "idle" });
  sockets[0].queues({ office: "playing", tv: "idle" });
  assert.deepEqual(relay.connects, ["office", "tv", "office"]);
});

test("a stream that ends and resumes on the same queue is not mistaken for a silent one", (t) => {
  const { follow, relay, sockets } = harness(t);
  follow.start();
  sockets[0].login();
  sockets[0].queues({ a: "playing", b: "playing" });
  follow.noteFrame();
  t.mock.timers.tick(60000);
  follow.noteEnd(); // a pause, or the relay reconnecting
  t.mock.timers.tick(3000);
  sockets[0].queues({ a: "playing", b: "playing" });
  assert.deepEqual(relay.connects, ["a"], "a is kept: its 5 s start again at the end");
  follow.noteRelayOpen();
  t.mock.timers.tick(4000);
  sockets[0].queues({ a: "playing", b: "playing" });
  assert.deepEqual(relay.connects, ["a"], "and again when the relay logs in");
  t.mock.timers.tick(6000);
  sockets[0].queues({ a: "playing", b: "playing" });
  assert.deepEqual(relay.connects, ["a", "b"], "only after a real silence is it skipped");
});

test("a skipped queue is tried again while nothing else plays", (t) => {
  const { follow, relay, sockets } = harness(t);
  follow.start();
  sockets[0].login();
  sockets[0].queues({ a: "playing" });
  t.mock.timers.tick(6000);
  sockets[0].queues({ a: "playing" });
  assert.equal(follow.state, "waiting", "a sent nothing");
  t.mock.timers.tick(10000);
  sockets[0].queues({ a: "playing" });
  assert.equal(follow.state, "waiting", "not yet");
  t.mock.timers.tick(6000);
  sockets[0].queues({ a: "playing" });
  assert.equal(follow.state, "watching", "tried again after 15 s, on the socket that is still open");
  assert.deepEqual(relay.connects, ["a"]);
  t.mock.timers.tick(3000);
  sockets[0].queues({ a: "playing" });
  assert.equal(follow.state, "watching", "its 5 s start again");
  t.mock.timers.tick(3000);
  sockets[0].queues({ a: "playing" });
  assert.equal(follow.state, "waiting", "silent again: skipped, now for 30 s");
  t.mock.timers.tick(20000);
  sockets[0].queues({ a: "playing" });
  assert.equal(follow.state, "waiting");
  t.mock.timers.tick(11000);
  sockets[0].queues({ a: "playing" });
  assert.equal(follow.state, "watching");
  follow.noteFrame();
  assert.equal(follow.state, "watching", "frames at last");
});

test("the preferred speaker is taken when it starts, even mid-stream, and its group needs no reconnect", (t) => {
  const { follow, relay, sockets } = harness(t, "", null, null, "office");
  follow.start();
  sockets[0].login();
  sockets[0].queues({ office: "idle", kitchen: "playing" });
  follow.noteFrame();
  assert.deepEqual(relay.connects, ["kitchen"]);
  assert.equal(follow.following.reason, "auto");

  sockets[0].event("queue_updated", "office", { queue_id: "office", state: "playing" });
  assert.deepEqual(relay.connects, ["kitchen", "office"], "switched as soon as the event came");
  assert.deepEqual(follow.following, { queueId: "office", playerId: "office", name: "office", reason: "preferred" });

  // The office joins the kitchen's group: it now sounds the kitchen's queue.
  follow.noteFrame();
  sockets[0].event("player_updated", "office", { player_id: "office", name: "office", type: "player", available: true, synced_to: "kitchen" });
  sockets[0].event("queue_updated", "office", { queue_id: "office", state: "idle" });
  assert.deepEqual(relay.connects, ["kitchen", "office", "kitchen"]);
  assert.equal(follow.following.playerId, "office", "still the picked speaker");
  assert.equal(follow.following.queueId, "kitchen");

  // Picking the kitchen itself changes nothing on the wire.
  follow.setPreferred("kitchen");
  t.mock.timers.tick(300);
  assert.deepEqual(relay.connects, ["kitchen", "office", "kitchen"]);
  assert.equal(follow.following.playerId, "kitchen");
});

test("a preference set before the lists arrive applies once they do; progress events are ignored", (t) => {
  const { follow, relay, sockets } = harness(t);
  follow.start();
  follow.setPreferred("den");
  sockets[0].login();
  sockets[0].queues({ den: "playing", hall: "playing" }, { hall: {} });
  assert.deepEqual(relay.connects, ["den"]);
  assert.equal(follow.speakers().map((s) => s.id).join(","), "den,hall");
  for (let i = 0; i < 20; i++) sockets[0].event("queue_time_updated", "hall", 12.5 + i);
  assert.deepEqual(relay.connects, ["den"]);
});

test("the API is reopened after a drop even when the stream ends meanwhile", (t) => {
  const { follow, relay, sockets } = harness(t);
  follow.start();
  sockets[0].login();
  sockets[0].queues({ a: "playing" });
  follow.noteFrame();
  sockets[0].onclose();
  follow.noteEnd();
  t.mock.timers.tick(3000);
  assert.equal(sockets.length, 2, "a new API socket");
  sockets[1].login();
  sockets[1].queues({ a: "idle", b: "playing" });
  assert.deepEqual(relay.connects, ["a", "b"]);
});

test("a rejected login stops the polling", (t) => {
  const { follow, sockets } = harness(t);
  follow.start();
  sockets[0].receive({ server_version: "2.10.5" });
  sockets[0].receive({ message_id: "auth", result: { authenticated: false } });
  assert.equal(follow.state, "rejected");
  t.mock.timers.tick(60000);
  assert.equal(sockets.length, 1);
});

test("an API socket that never answers the login is reopened", (t) => {
  const { follow, sockets } = harness(t);
  follow.start();
  sockets[0].receive({ server_version: "2.10.5" }); // login sent, no reply
  t.mock.timers.tick(10000);
  assert.equal(sockets.length, 2);
  assert.equal(sockets[0].readyState, 3);
});

test("preferences are read from the account and saved back, shared ones on top and the rest per TV", (t) => {
  const remote = [];
  const { follow, sockets } = harness(t, "", null, (shared, device) => remote.push([shared, device]));
  follow.start();
  follow.savePrefs({ favorites: ["a"], trim: 25 }); // before login: must wait
  sockets[0].login();
  t.mock.timers.tick(5000);
  assert.ok(!sockets[0].sent.some((m) => m.command === "auth/user/update"), "nothing saved before the remote copy is known");

  sockets[0].receive({ message_id: "me", result: { user_id: "u", preferences: { theme: "dark", vizman: { favorites: ["x", "y"], devices: { cx: { trim: 50 }, other: { trim: 0 } } } } } });
  assert.deepEqual(remote, [[{ favorites: ["x", "y"], favoritesMeta: { x: { on: true, at: 0 }, y: { on: true, at: 0 } } }, { trim: 50 }]], "this TV's own settings are handed over, not another TV's");
  const save = sockets[0].sent.find((m) => m.command === "auth/user/update");
  assert.deepEqual(save.args.preferences, {
    theme: "dark",
    vizman: { favorites: ["x", "y", "a"], devices: { cx: { trim: 25 }, other: { trim: 0 } } },
  }, "other preferences and other TVs are kept; favorites merged");
  sockets[0].receive({ message_id: "save", result: { preferences: save.args.preferences } });

  // A save first re-reads the account and merges: another TV added "z" and
  // removed "y" meanwhile, this one removes "x" and adds "b".
  follow.savePrefs({ favorites: ["y", "a", "b"] });
  t.mock.timers.tick(1500);
  const reread = sockets[0].sent[sockets[0].sent.length - 1];
  assert.equal(reread.command, "auth", "logs in again before saving, which refreshes the server's copy of the user");
  sockets[0].receive({ message_id: "auth", result: { authenticated: true } });
  assert.equal(sockets[0].sent[sockets[0].sent.length - 1].command, "auth/me");
  const pollsBefore = sockets[0].sent.filter((m) => m.command === "player_queues/all").length;
  t.mock.timers.tick(1);
  assert.equal(sockets[0].sent.filter((m) => m.command === "player_queues/all").length, pollsBefore, "re-login does not restart the polling");
  sockets[0].receive({ message_id: "me", result: { preferences: { theme: "dark", vizman: { favorites: ["x", "a", "z"], devices: {} } } } });
  const saves = sockets[0].sent.filter((m) => m.command === "auth/user/update");
  assert.deepEqual(saves[1].args.preferences.vizman.favorites, ["a", "z", "b"]);

  t.mock.timers.tick(60000);
  assert.ok(sockets[0].sent.filter((m) => m.command === "auth").length >= 3, "the account is re-read every minute for other TVs' changes");
});

test("dated favorites: a save merges newest-per-preset with the account, even a stale one", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const sockets = [];
  class Fake {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 1; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
  }
  const relay = { connects: [], state: "closed", connect(id) { this.connects.push(id); this.state = "open"; } };
  const seen = [];
  const follow = createFollow({ host: "h", token: "tok", pinned: "p", relay, WebSocketImpl: Fake, deviceId: "cx", sharedKeys: ["favoritesMeta"], onRemotePrefs: (s) => seen.push(s) });
  follow.start();
  sockets[0].receive({ server_version: "2.10.5" });
  sockets[0].receive({ message_id: "auth", result: { authenticated: true } });
  // an account from before the timestamps: a plain list
  sockets[0].receive({ message_id: "me", result: { preferences: { vizman: { favorites: ["old"] } } } });
  assert.deepEqual(seen[0], { favoritesMeta: { old: { on: true, at: 0 } } }, "a plain list is read as dated favorites");

  // this device removed "old" at 500 and added "new" at 600
  follow.savePrefs({ favoritesMeta: { old: { on: false, at: 500 }, new: { on: true, at: 600 } } });
  t.mock.timers.tick(1500);
  sockets[0].receive({ message_id: "auth", result: { authenticated: true } });
  // the server answers with a stale copy in which another device re-added "old" at 700 and added "z" at 100
  sockets[0].receive({ message_id: "me", result: { preferences: { vizman: { favoritesMeta: { old: { on: true, at: 700 }, z: { on: true, at: 100 } } } } } });
  const save = sockets[0].sent.filter((m) => m.command === "auth/user/update").pop();
  assert.deepEqual(save.args.preferences.vizman.favoritesMeta, {
    old: { on: true, at: 700 }, // their later change wins
    z: { on: true, at: 100 },
    new: { on: true, at: 600 },
  });
});

test("Music Assistant's own favorites list is folded in and written back", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  t.mock.timers.setTime(5000);
  const sockets = [];
  class Fake {
    constructor(url) { this.url = url; this.sent = []; this.readyState = 1; sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; }
    receive(message) { this.onmessage({ data: JSON.stringify(message) }); }
  }
  const relay = { state: "closed", connect() { this.state = "open"; } };
  const seen = [];
  const follow = createFollow({ host: "h", token: "tok", pinned: "p", relay, WebSocketImpl: Fake, deviceId: "cx", sharedKeys: ["favoritesMeta"], onRemotePrefs: (s) => seen.push(s.favoritesMeta) });
  follow.start();
  sockets[0].receive({ server_version: "2.10.5" });
  sockets[0].receive({ message_id: "auth", result: { authenticated: true } });
  // the web interface added "web" and removed "gone" since the app last mirrored ["gone", "keep"]
  sockets[0].receive({ message_id: "me", result: { preferences: {
    visualizer_favorites: ["keep", "web"],
    vizman: { mirrored: ["gone", "keep"], favoritesMeta: { gone: { on: true, at: 1 }, keep: { on: true, at: 1 } } },
  } } });
  assert.deepEqual(seen[0], { gone: { on: false, at: 5000 }, keep: { on: true, at: 1 }, web: { on: true, at: 5000 } });

  follow.savePrefs({ favoritesMeta: { gone: { on: false, at: 5000 }, keep: { on: true, at: 1 }, web: { on: true, at: 5000 }, tv: { on: true, at: 6000 } } });
  t.mock.timers.tick(1500);
  sockets[0].receive({ message_id: "auth", result: { authenticated: true } });
  sockets[0].receive({ message_id: "me", result: { preferences: {
    visualizer_favorites: ["keep", "web"],
    vizman: { mirrored: ["gone", "keep"], favoritesMeta: { gone: { on: true, at: 1 }, keep: { on: true, at: 1 } } },
  } } });
  const save = sockets[0].sent.filter((m) => m.command === "auth/user/update").pop();
  assert.deepEqual(save.args.preferences.visualizer_favorites, ["keep", "tv", "web"], "the plain list the web interface reads");
  assert.deepEqual(save.args.preferences.vizman.mirrored, ["keep", "tv", "web"]);
  assert.equal(save.args.preferences.vizman.favoritesMeta.gone.on, false);
});
