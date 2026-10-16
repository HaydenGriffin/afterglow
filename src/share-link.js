// Scan to save: the public page of the playing song, for a phone to open, and
// its QR code. The link is one of Music Assistant's provider mappings (2.10
// ProviderMapping.url), and only a public streaming service's own https page:
// never a library:// uri, a token or an address on the home network.
import { qrcodegen } from "./vendor/qrcodegen.js";

// Stable order after the service the song played from.
export const SERVICES = [
  ["spotify", "Spotify", "spotify.com"],
  ["tidal", "Tidal", "tidal.com"],
  ["apple_music", "Apple Music", "apple.com"],
  ["ytmusic", "YouTube Music", "youtube.com"],
  ["deezer", "Deezer", "deezer.com"],
  ["qobuz", "Qobuz", "qobuz.com"],
  ["soundcloud", "SoundCloud", "soundcloud.com"],
];
export const MAX_URL = 300;
const SECRET_PARAM = /(^|[?&])[^=&]*(token|key|auth|sig|session)[^=&]*=/i;

// Whether a url is the service's own public https page.
export function isPublicUrl(url, domain) {
  const m = /^https:\/\/([^/?#]+)([/?#].*)?$/.exec(String(url || ""));
  if (!m || String(url).length > MAX_URL) return false;
  const host = m[1].toLowerCase();
  if (/[@:]/.test(host)) return false; // user info or a port
  if (host !== domain && host.slice(-domain.length - 1) !== "." + domain) return false;
  const query = (m[2] || "").split("#")[0];
  const at = query.indexOf("?");
  return at < 0 || !SECRET_PARAM.test(query.slice(at));
}

// The link to show for a queue item, or null: { url, service }.
export function shareLink(item) {
  const media = item && item.media_item;
  const mappings = media && Array.isArray(media.provider_mappings) ? media.provider_mappings : [];
  const played = String((item && item.streamdetails && item.streamdetails.provider) || "");
  const playedDomain = played.split("--")[0];
  const order = (domain) => SERVICES.findIndex((s) => s[0] === domain);
  const found = mappings
    .filter((m) => m && order(m.provider_domain) >= 0 && isPublicUrl(m.url, SERVICES[order(m.provider_domain)][2]))
    .map((m) => ({
      m,
      rank: [
        played && m.provider_instance === played ? 0 : 1,
        playedDomain && m.provider_domain === playedDomain ? 0 : 1,
        order(m.provider_domain),
        String(m.provider_instance || ""),
        String(m.url),
      ],
    }));
  found.sort((a, b) => {
    for (let i = 0; i < a.rank.length; i++) if (a.rank[i] !== b.rank[i]) return a.rank[i] < b.rank[i] ? -1 : 1;
    return 0;
  });
  if (!found.length) return null;
  const best = found[0].m;
  return { url: best.url, service: SERVICES[order(best.provider_domain)][1] };
}

// The code's module grid: { size, dark(x, y) }. Byte mode, error correction
// Low raised while the version stays the same, automatic mask.
export function qrModules(text) {
  const code = qrcodegen.QrCode.encodeText(String(text), qrcodegen.QrCode.Ecc.LOW);
  return { size: code.size, dark: (x, y) => code.getModule(x, y) };
}

export const QUIET = 4; // modules of paper round the code

// An SVG of flat ink squares on paper, a quiet zone inside the paper. One
// path, each row's runs of dark modules as rectangles.
export function qrSvg(text) {
  const grid = qrModules(text), n = grid.size + 2 * QUIET;
  let d = "";
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!grid.dark(x, y)) continue;
      let run = 1;
      while (x + run < grid.size && grid.dark(x + run, y)) run++;
      d += "M" + (x + QUIET) + " " + (y + QUIET) + "h" + run + "v1h-" + run + "z";
      x += run - 1;
    }
  }
  return '<svg class="share-code" viewBox="0 0 ' + n + " " + n + '" shape-rendering="crispEdges" aria-hidden="true">' +
    '<rect width="' + n + '" height="' + n + '" style="fill:var(--paper)"/><path style="fill:var(--ink)" d="' + d + '"/></svg>';
}

// Details: the facts and, when the song has a public page, the code beside them.
export function appendDetailsTop(parent, facts, item) {
  const link = shareLink(item);
  if (!link) {
    if (facts.children.length) parent.appendChild(facts);
    return null;
  }
  const row = document.createElement("div");
  row.className = "details-top";
  if (facts.children.length) row.appendChild(facts);
  const block = document.createElement("div");
  block.className = "share-block";
  block.innerHTML = qrSvg(link.url);
  const label = document.createElement("p"), service = document.createElement("p");
  label.className = "share-label"; label.textContent = "Scan to open on your phone";
  service.className = "share-service"; service.textContent = link.service;
  block.appendChild(label); block.appendChild(service);
  row.appendChild(block);
  parent.appendChild(row);
  return link;
}
