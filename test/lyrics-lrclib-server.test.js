'use strict';

// server.js's LRCLIB lookup (fetchLrcLib → fetchLyricsDirect) with a duration: it must take the version
// whose length matches the song, not the first one LRCLIB lists. Runs against a local fake LRCLIB
// (RIFF_LRCLIB_URL), so it's offline.

const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const versions = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'betterlyrics', 'lrclib-versions.json'), 'utf8'));

test('fetchLrcLib with a duration skips other cuts of the song', async (t) => {
  const seen = [];
  const fake = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    seen.push(u.pathname + u.search);
    res.setHeader('Content-Type', 'application/json');
    // /get answers with the music-video cut (as LRCLIB can when the album name doesn't match); /search lists them all.
    if (u.pathname === '/api/get') return res.end(JSON.stringify(versions[0]));
    if (u.pathname === '/api/search') return res.end(JSON.stringify(versions));
    res.statusCode = 404;
    res.end('{}');
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  t.after(() => fake.close());

  process.env.RIFF_LRCLIB_URL = `http://127.0.0.1:${fake.address().port}/api`;
  delete require.cache[require.resolve('../src/server/lyrics-sources')];
  delete require.cache[require.resolve('../src/server/server')];
  const { fetchLrcLib } = require('../src/server/server');

  const lyrics = await fetchLrcLib('Glass Harbour', 'The Lanterns - Topic', { duration: 200.3, album: 'Night Ferry' });
  assert.match(lyrics, /^\[00:13\.45\] Lights along the water/);
  assert.ok(seen[0].startsWith('/api/get?'));
  assert.match(seen[0], /album_name=Night\+Ferry/);
  assert.match(seen[0], /artist_name=The\+Lanterns(&|$)/); // " - Topic" dropped
  assert.ok(seen.some((s) => s.startsWith('/api/search?')));
});
