'use strict';

// Lyrics sources used the way Tunebox uses them (Tunebox's src/main/lyrics.ts):
//   - Better Lyrics: word- and syllable-timed TTML. Preferred when it has the song.
//   - LRCLIB, matched on title, artist, album and duration, so a radio edit, live or music-video
//     version (whose timestamps are seconds off) isn't picked for the album version.
//
// Better Lyrics serves songs it has cached to anyone; uncached songs need an API key (401) and every
// client is rate limited (429). Riff has no key, so misses fall back to LRCLIB and nothing tries to get
// around the limits: misses are remembered, and a 429 pauses lookups for as long as the server asks.

const BETTER_LYRICS_URL = process.env.RIFF_BETTERLYRICS_URL || 'https://api.betterlyrics.org/getLyrics';
const LRCLIB_URL = process.env.RIFF_LRCLIB_URL || 'https://lrclib.net/api';
const USER_AGENT = 'Riff (desktop music player)';
const TIMEOUT_MS = 10000;
/** Versions further than this from the playing song are a different cut of it. */
const DURATION_TOLERANCE_SEC = 3;

const MISS_TTL_MS = 6 * 60 * 60 * 1000; // a song Better Lyrics doesn't have: don't ask again for 6 hours
const ERROR_TTL_MS = 2 * 60 * 1000; // network trouble: try again in a couple of minutes
const DEFAULT_BACKOFF_MS = 5 * 60 * 1000; // a 429 without Retry-After
const EXHAUSTED_BACKOFF_MS = 60 * 1000; // x-ratelimit-remaining hit 0
const MAX_CACHE = 300;

// "Song - Remastered 2011" / "Song (feat. X)" rarely match LRCLIB titles exactly.
function cleanTitle(title) {
  return String(title || '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s*[([](feat|ft|with)\.?\s[^)\]]*[)\]]/gi, '')
    .trim();
}

const validDuration = (sec) => (Number.isFinite(sec) && sec > 0 ? sec : 0);

/**
 * The best LRCLIB entry for a song `durationSec` long: synced lyrics within the tolerance (closest
 * first), then an instrumental marker within it. Null when nothing is close enough, or when the
 * duration isn't known (the caller then falls back to its old title/artist lookup).
 */
function pickLrclibEntry(entries, durationSec) {
  const sec = validDuration(durationSec);
  if (!sec || !Array.isArray(entries)) return null;
  const close = entries
    .filter((e) => e && Number.isFinite(e.duration) && Math.abs(e.duration - sec) <= DURATION_TOLERANCE_SEC)
    .sort((a, b) => Math.abs(a.duration - sec) - Math.abs(b.duration - sec));
  return close.find((e) => e.syncedLyrics) || close.find((e) => e.instrumental) || null;
}

/** Entries ordered by how close their length is to the song's (unknown lengths keep their order, last). */
function rankByDuration(entries, durationSec) {
  const sec = validDuration(durationSec);
  if (!sec || !Array.isArray(entries)) return Array.isArray(entries) ? entries : [];
  const dist = (e) => (e && Number.isFinite(e.duration) ? Math.abs(e.duration - sec) : Infinity);
  return entries.map((e, i) => [e, i]).sort((a, b) => dist(a[0]) - dist(b[0]) || a[1] - b[1]).map(([e]) => e);
}

async function getJson(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return { status: res.status, body: null };
  return { status: res.status, body: await res.json() };
}

/**
 * LRCLIB matched on duration (Tunebox's fetchLrclib). Returns the chosen entry, or null when the
 * duration is unknown, nothing is within the tolerance, or LRCLIB can't be reached.
 */
async function fetchLrclibMatched({ title, artist, album, durationSec }, { fetchImpl = fetch, baseUrl = LRCLIB_URL } = {}) {
  const sec = validDuration(durationSec);
  if (!sec || !title) return null;
  try {
    // LRCLIB's own match: title, artist, album and duration (it allows ±2s).
    const params = new URLSearchParams({ track_name: title, artist_name: artist || '', duration: String(Math.round(sec)) });
    if (album) params.set('album_name', album);
    const exact = await getJson(fetchImpl, `${baseUrl}/get?${params}`);
    const e = exact.body;
    if (e && Number.isFinite(e.duration) && Math.abs(e.duration - sec) <= DURATION_TOLERANCE_SEC && (e.syncedLyrics || e.instrumental)) return e;

    const search = await getJson(fetchImpl, `${baseUrl}/search?${new URLSearchParams({ track_name: cleanTitle(title) || title, artist_name: artist || '' })}`);
    return pickLrclibEntry(search.body, sec);
  } catch (err) {
    return null;
  }
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const lookupKey = (q) => [norm(q.title), norm(q.artist), norm(q.album), Math.round(validDuration(q.durationSec))].join('|');

/**
 * A Better Lyrics client with its own cache and rate-limit backoff. lookup() never throws; it
 * resolves to one of:
 *   { status: 'ok', ttml }          the TTML document, exactly as sent
 *   { status: 'miss' }              not available (uncached without a key, or not found)
 *   { status: 'rate-limited' }      asked to slow down; nothing is sent until the backoff ends
 *   { status: 'error' }             network failure, timeout or a response that isn't TTML
 */
function createBetterLyricsClient({ fetchImpl = (...a) => fetch(...a), baseUrl = BETTER_LYRICS_URL, now = () => Date.now() } = {}) {
  const cache = new Map(); // key -> { result, until }
  const inFlight = new Map();
  let backoffUntil = 0;

  const remember = (key, result, ttl) => {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(key, { result, until: ttl === Infinity ? Infinity : now() + ttl });
    return result;
  };

  async function request(q, key) {
    const params = new URLSearchParams({ s: q.title || '', a: q.artist || '', al: q.album || '', d: String(Math.round(validDuration(q.durationSec))) });
    let res;
    try {
      res = await fetchImpl(`${baseUrl}?${params}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (err) {
      return remember(key, { status: 'error' }, ERROR_TTL_MS);
    }
    const header = (name) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null);
    if (res.status === 429) {
      const retry = Number(header('retry-after'));
      backoffUntil = now() + (Number.isFinite(retry) && retry > 0 ? retry * 1000 : DEFAULT_BACKOFF_MS);
      return { status: 'rate-limited' };
    }
    if (header('x-ratelimit-remaining') === '0') backoffUntil = Math.max(backoffUntil, now() + EXHAUSTED_BACKOFF_MS);
    if (res.status === 401 || res.status === 403 || res.status === 404) return remember(key, { status: 'miss' }, MISS_TTL_MS);
    if (!res.ok) return remember(key, { status: 'error' }, ERROR_TTL_MS);
    let body;
    try { body = await res.json(); } catch (err) { return remember(key, { status: 'error' }, ERROR_TTL_MS); }
    // Keep the document exactly as sent (Better Lyrics asks that it not be reformatted).
    const ttml = body && typeof body.ttml === 'string' && body.ttml.includes('<tt') ? body.ttml : null;
    if (!ttml) return remember(key, { status: 'miss' }, MISS_TTL_MS);
    return remember(key, { status: 'ok', ttml }, Infinity);
  }

  function lookup(q) {
    if (!q || !q.title) return Promise.resolve({ status: 'miss' });
    const key = lookupKey(q);
    const hit = cache.get(key);
    if (hit && hit.until > now()) return Promise.resolve(hit.result);
    if (hit) cache.delete(key);
    if (now() < backoffUntil) return Promise.resolve({ status: 'rate-limited' });
    if (inFlight.has(key)) return inFlight.get(key);
    const p = request(q, key).finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  }

  return { lookup, get backoffUntil() { return backoffUntil; }, clear() { cache.clear(); backoffUntil = 0; } };
}

const betterLyrics = createBetterLyricsClient();

module.exports = {
  BETTER_LYRICS_URL,
  LRCLIB_URL,
  DURATION_TOLERANCE_SEC,
  cleanTitle,
  pickLrclibEntry,
  rankByDuration,
  fetchLrclibMatched,
  createBetterLyricsClient,
  fetchBetterLyrics: (q) => betterLyrics.lookup(q)
};
