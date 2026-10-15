// Keeping the TV signed in: Music Assistant's long-lived tokens do not renew
// themselves, so ours is replaced before it runs out (ma.js does the calls).

const RENEW_WITHIN_MS = 30 * 86400000;

// Renews the token in auth.tokenName when the soonest of them expires within
// 30 days. onFresh gets the fresh token before the old one is revoked, so
// everything running on the old one can move over first. Resolves with the
// fresh token, or null when none was needed.
export function renewIfDue({ auth, listTokens, renewToken, onFresh, now }) {
  const clock = now || Date.now;
  return listTokens({ host: auth.host, token: auth.token }).then((tokens) => {
    const ours = tokens.filter((t) => t.name === auth.tokenName && t.is_long_lived);
    if (!ours.length) return null;
    const soonest = Math.min.apply(null, ours.map((t) => Date.parse(t.expires_at) || Infinity));
    if (soonest - clock() > RENEW_WITHIN_MS) return null;
    return renewToken({ host: auth.host, token: auth.token, tokenName: auth.tokenName, onCreated: onFresh });
  });
}

// Whether a refusal of `rejected` should forget the stored sign-in: never
// when a newer token has been stored since. No token means sign out anyway.
export function shouldForget(stored, rejected) {
  if (!stored) return false;
  return !rejected || stored.token === rejected;
}
