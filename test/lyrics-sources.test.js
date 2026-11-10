'use strict';

// Better Lyrics and duration-matched LRCLIB (src/server/lyrics-sources.js), offline: every request goes to
// a fake fetch. The LRCLIB entries mirror a real search for one song, which returned the album cut
// (200s, lyrics from 0:13), a music-video cut (263s, from 0:35), a single (261s) and a live recording.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pickLrclibEntry, rankByDuration, fetchLrclibMatched, createBetterLyricsClient, cleanTitle } = require('../src/server/lyrics-sources');

const FIXTURES = path.join(__dirname, 'fixtures', 'betterlyrics');
const versions = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'lrclib-versions.json'), 'utf8'));
const wordTtml = fs.readFileSync(path.join(FIXTURES, 'word-synced.ttml'), 'utf8');

/** A fake fetch: `routes` maps a URL test to a response { status, body, headers }. Records every URL. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    for (const [match, reply] of routes) {
      if (match(url)) {
        if (reply instanceof Error) throw reply;
        const r = typeof reply === 'function' ? reply(url) : reply;
        const headers = new Map(Object.entries(r.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
        return {
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          headers: { get: (k) => (headers.has(k.toLowerCase()) ? headers.get(k.toLowerCase()) : null) },
          json: async () => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body)
        };
      }
    }
    return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({}) };
  };
  impl.calls = calls;
  return impl;
}

test('LRCLIB: picks the version within 3 seconds of the song, closest first', () => {
  const album = pickLrclibEntry(versions, 200);
  assert.strictEqual(album.duration, 200);
  assert.match(album.syncedLyrics, /^\[00:13\.45\]/);
  // The music-video cut is only chosen for a song that long.
  assert.strictEqual(pickLrclibEntry(versions, 263).duration, 263);
  assert.strictEqual(pickLrclibEntry(versions, 202.4).duration, 203);
});

test('LRCLIB: nothing close enough, or no duration, means no duration match', () => {
  assert.strictEqual(pickLrclibEntry(versions, 230), null);
  assert.strictEqual(pickLrclibEntry(versions, 0), null);
  assert.strictEqual(pickLrclibEntry(versions, NaN), null);
  assert.strictEqual(pickLrclibEntry(null, 200), null);
});

test('LRCLIB: the old lookup now prefers the closest length, and keeps its order without one', () => {
  assert.deepStrictEqual(rankByDuration(versions, 200).slice(0, 2).map((e) => e.duration), [200, 200]);
  assert.strictEqual(rankByDuration(versions, 255)[0].duration, 254);
  assert.deepStrictEqual(rankByDuration(versions, 0).map((e) => e.duration), versions.map((e) => e.duration));
});

test('LRCLIB matched lookup: exact match on title, artist, album and duration', async () => {
  const fetchImpl = fakeFetch([[(u) => u.includes('/get?'), { status: 200, body: versions[2] }]]);
  const entry = await fetchLrclibMatched({ title: 'Glass Harbour', artist: 'The Lanterns', album: 'Night Ferry', durationSec: 200 }, { fetchImpl, baseUrl: 'http://lrclib.test/api' });
  assert.strictEqual(entry.duration, 200);
  const url = new URL(fetchImpl.calls[0]);
  assert.strictEqual(url.searchParams.get('album_name'), 'Night Ferry');
  assert.strictEqual(url.searchParams.get('duration'), '200');
  assert.strictEqual(fetchImpl.calls.length, 1);
});

test('LRCLIB matched lookup: a different version from /get goes to search, which picks the right one', async () => {
  const fetchImpl = fakeFetch([
    [(u) => u.includes('/get?'), { status: 200, body: versions[0] }], // the 263s music-video cut
    [(u) => u.includes('/search?'), { status: 200, body: versions }]
  ]);
  const entry = await fetchLrclibMatched({ title: 'Glass Harbour (feat. Someone)', artist: 'The Lanterns', album: '', durationSec: 200 }, { fetchImpl, baseUrl: 'http://lrclib.test/api' });
  assert.strictEqual(entry.duration, 200);
  assert.strictEqual(new URL(fetchImpl.calls[1]).searchParams.get('track_name'), 'Glass Harbour');
});

test('LRCLIB matched lookup: no duration, no version close enough, or LRCLIB down → null (old lookup takes over)', async () => {
  const none = fakeFetch([]);
  assert.strictEqual(await fetchLrclibMatched({ title: 'X', artist: 'Y', durationSec: 0 }, { fetchImpl: none }), null);
  assert.strictEqual(none.calls.length, 0);
  const far = fakeFetch([[(u) => u.includes('/search?'), { status: 200, body: versions }]]);
  assert.strictEqual(await fetchLrclibMatched({ title: 'X', artist: 'Y', durationSec: 230 }, { fetchImpl: far, baseUrl: 'http://l/api' }), null);
  const down = fakeFetch([[() => true, new Error('ECONNREFUSED')]]);
  assert.strictEqual(await fetchLrclibMatched({ title: 'X', artist: 'Y', durationSec: 200 }, { fetchImpl: down, baseUrl: 'http://l/api' }), null);
});

test('cleanTitle drops "- Remastered" and featured artists', () => {
  assert.strictEqual(cleanTitle('Glass Harbour - Remastered 2011'), 'Glass Harbour');
  assert.strictEqual(cleanTitle('Glass Harbour (feat. Someone)'), 'Glass Harbour');
  assert.strictEqual(cleanTitle('Glass Harbour [ft. A & B]'), 'Glass Harbour');
});

const BL = 'http://betterlyrics.test/getLyrics';
const q = { title: 'Glass Harbour', artist: 'The Lanterns', album: 'Night Ferry', durationSec: 200.4 };

test('Better Lyrics: returns the TTML exactly as sent, and caches it', async () => {
  const fetchImpl = fakeFetch([[(u) => u.startsWith(BL), { status: 200, body: { ttml: wordTtml } }]]);
  const client = createBetterLyricsClient({ fetchImpl, baseUrl: BL });
  const r = await client.lookup(q);
  assert.deepStrictEqual(r, { status: 'ok', ttml: wordTtml });
  const url = new URL(fetchImpl.calls[0]);
  assert.deepStrictEqual([url.searchParams.get('s'), url.searchParams.get('a'), url.searchParams.get('al'), url.searchParams.get('d')], ['Glass Harbour', 'The Lanterns', 'Night Ferry', '200']);
  await client.lookup(q);
  assert.strictEqual(fetchImpl.calls.length, 1);
});

test('Better Lyrics: an uncached song (401, API key required) is a miss, remembered for hours', async () => {
  let t = 0;
  const fetchImpl = fakeFetch([[(u) => u.startsWith(BL), { status: 401, body: { error: 'API key required' } }]]);
  const client = createBetterLyricsClient({ fetchImpl, baseUrl: BL, now: () => t });
  assert.deepStrictEqual(await client.lookup(q), { status: 'miss' });
  t += 60 * 60 * 1000;
  assert.deepStrictEqual(await client.lookup(q), { status: 'miss' });
  assert.strictEqual(fetchImpl.calls.length, 1);
  t += 6 * 60 * 60 * 1000;
  await client.lookup(q);
  assert.strictEqual(fetchImpl.calls.length, 2);
});

test('Better Lyrics: 429 pauses every lookup for Retry-After, then asks again', async () => {
  let t = 0;
  let limited = true;
  const fetchImpl = fakeFetch([[(u) => u.startsWith(BL), () => (limited ? { status: 429, headers: { 'Retry-After': '30' }, body: {} } : { status: 200, body: { ttml: wordTtml } })]]);
  const client = createBetterLyricsClient({ fetchImpl, baseUrl: BL, now: () => t });
  assert.deepStrictEqual(await client.lookup(q), { status: 'rate-limited' });
  assert.deepStrictEqual(await client.lookup({ ...q, title: 'Another song' }), { status: 'rate-limited' });
  assert.strictEqual(fetchImpl.calls.length, 1); // nothing sent during the pause
  t += 31 * 1000;
  limited = false;
  assert.strictEqual((await client.lookup(q)).status, 'ok');
  assert.strictEqual(fetchImpl.calls.length, 2);
});

test('Better Lyrics: 429 without Retry-After waits five minutes; an exhausted quota pauses a minute', async () => {
  let t = 0;
  const fetchImpl = fakeFetch([
    [(u) => u.includes('s=Limited'), { status: 429, body: {} }],
    [(u) => u.startsWith(BL), { status: 200, headers: { 'x-ratelimit-remaining': '0' }, body: { ttml: wordTtml } }]
  ]);
  const client = createBetterLyricsClient({ fetchImpl, baseUrl: BL, now: () => t });
  assert.strictEqual((await client.lookup(q)).status, 'ok'); // still answered…
  assert.strictEqual(client.backoffUntil, 60 * 1000); // …but the next minute is left alone
  t = 61 * 1000;
  await client.lookup({ ...q, title: 'Limited' });
  assert.strictEqual(client.backoffUntil, t + 5 * 60 * 1000);
});

test('Better Lyrics: network errors, timeouts, server errors and non-TTML answers are handled', async () => {
  const cases = [
    [new Error('socket hang up'), 'error'],
    [{ status: 500, body: {} }, 'error'],
    [{ status: 200, body: { ttml: 'not ttml at all' } }, 'miss'],
    [{ status: 200, body: { nothing: true } }, 'miss'],
    [{ status: 200, body: '{"ttml": ' }, 'error'] // a cut-off response
  ];
  for (const [reply, status] of cases) {
    const client = createBetterLyricsClient({ fetchImpl: fakeFetch([[() => true, reply]]), baseUrl: BL });
    assert.deepStrictEqual(await client.lookup(q), { status }, JSON.stringify(reply.message || reply));
  }
  // Errors are retried after a couple of minutes, not hours.
  let t = 0;
  const flaky = fakeFetch([[() => true, new Error('offline')]]);
  const client = createBetterLyricsClient({ fetchImpl: flaky, baseUrl: BL, now: () => t });
  await client.lookup(q);
  t += 3 * 60 * 1000;
  await client.lookup(q);
  assert.strictEqual(flaky.calls.length, 2);
});

test('Better Lyrics: lookups for the same song share one request; an empty title asks nothing', async () => {
  const fetchImpl = fakeFetch([[(u) => u.startsWith(BL), { status: 200, body: { ttml: wordTtml } }]]);
  const client = createBetterLyricsClient({ fetchImpl, baseUrl: BL });
  const [a, b] = await Promise.all([client.lookup(q), client.lookup(q)]);
  assert.strictEqual(a, b);
  assert.strictEqual(fetchImpl.calls.length, 1);
  assert.deepStrictEqual(await client.lookup({ title: '' }), { status: 'miss' });
  assert.strictEqual(fetchImpl.calls.length, 1);
});
