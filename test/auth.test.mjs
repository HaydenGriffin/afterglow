import assert from "node:assert/strict";
import { test } from "node:test";
import { renewIfDue, shouldForget } from "../src/auth.js";

const DAY = 86400000;
function tokens(expiresInDays) {
  return [{ name: "TV", is_long_lived: true, expires_at: new Date(Date.now() + expiresInDays * DAY).toISOString() }, { name: "Phone", is_long_lived: true, expires_at: new Date(Date.now() + DAY).toISOString() }];
}

test("a token with more than 30 days left is kept", async () => {
  const renewed = [];
  const result = await renewIfDue({
    auth: { host: "h", token: "old", tokenName: "TV" },
    listTokens: () => Promise.resolve(tokens(90)),
    renewToken: () => (renewed.push(1), Promise.resolve("fresh")),
    onFresh: () => {},
  });
  assert.equal(result, null);
  assert.deepEqual(renewed, []);
});

test("a token close to running out is renewed, and the fresh one handed over before the old is revoked", async () => {
  const handed = [];
  const result = await renewIfDue({
    auth: { host: "h", token: "old", tokenName: "TV" },
    listTokens: ({ token }) => (assert.equal(token, "old"), Promise.resolve(tokens(10))),
    renewToken: ({ host, token, tokenName, onCreated }) => {
      assert.deepEqual([host, token, tokenName], ["h", "old", "TV"]);
      onCreated("fresh");
      handed.push("revoked old");
      return Promise.resolve("fresh");
    },
    onFresh: (token) => handed.push("fresh " + token),
  });
  assert.equal(result, "fresh");
  assert.deepEqual(handed, ["fresh fresh", "revoked old"]);
});

test("a refusal only forgets the stored sign-in when it is for the stored token", () => {
  assert.equal(shouldForget({ token: "fresh" }, "fresh"), true);
  assert.equal(shouldForget({ token: "fresh" }, "old"), false, "a stale token refused never wipes a newer one");
  assert.equal(shouldForget({ token: "fresh" }, undefined), true, "signing out forgets whatever is stored");
  assert.equal(shouldForget(null, "old"), false);
});
