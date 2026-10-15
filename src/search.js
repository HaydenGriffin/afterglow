// Search in Browse: what to ask Music Assistant (music/search) and how to
// set out the answer, a few results per kind, in a fixed order.
export const SEARCH_LIMIT = 8; // per kind
export const SEARCH_GROUPS = [["artists", "Artists"], ["albums", "Albums"], ["tracks", "Songs"], ["playlists", "Playlists"]];
const MEDIA_TYPES = ["artist", "album", "track", "playlist"];
const MAX_QUERY = 100;

// Spaces collapsed and trimmed; long dictation cut short.
export function cleanQuery(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, MAX_QUERY);
}

export function searchArgs(query) {
  return { search_query: query, media_types: MEDIA_TYPES.slice(), limit: SEARCH_LIMIT };
}

// Music Assistant's SearchResults as non-empty groups of playable items.
export function groupResults(result) {
  return SEARCH_GROUPS.map(([key, label]) => ({
    label,
    items: (result && Array.isArray(result[key]) ? result[key] : []).filter(x => x && x.uri).slice(0, SEARCH_LIMIT),
  })).filter(group => group.items.length);
}

// Groups as one list with a heading before each group's first item.
export function flattenGroups(groups) {
  const items = [], headings = {};
  groups.forEach(group => { headings[items.length] = group.label; group.items.forEach(item => items.push(item)); });
  return { items, headings };
}
