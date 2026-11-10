'use strict';

// Better Lyrics (word/syllable-timed TTML) preferred over Riff's LRCLIB lyrics, offline:
// - Better Lyrics is a local fake server (RIFF_BETTERLYRICS_URL), reached through Riff's real
//   /api/lyrics-ttml route, its client (src/server/lyrics-sources.js) and the TTML parser (lyrics-ttml.js).
// - Riff's own lyrics lookup (/api/lyrics, /api/lyrics-words) is answered in the page, so its LRCLIB,
//   Musixmatch, Kugou and NetEase fallbacks never reach the internet. Duration matching for LRCLIB is
//   covered by test/lyrics-sources.test.js and test/lyrics-lrclib-server.test.js.
// The TTML samples (test/fixtures/betterlyrics) copy Better Lyrics' exact format with made-up lyrics.

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff, stubOpenDialog, writeToneWav, audioState } = require('./helpers');

test.describe.configure({ mode: 'serial' });

const FIX = path.join(__dirname, '..', 'test', 'fixtures', 'betterlyrics');
const read = (f) => fs.readFileSync(path.join(FIX, f), 'utf8');
const TTML = { word: read('word-synced.ttml'), line: read('line-synced.ttml'), malformed: read('malformed.ttml'), untimed: read('untimed.ttml') };

// What the fake Better Lyrics answers, by song title.
const BETTER = {
  'Glass Harbour': () => ({ status: 200, body: { ttml: TTML.word } }),
  'Line Song': () => ({ status: 200, body: { ttml: TTML.line } }),
  'Broken Song': () => ({ status: 200, body: { ttml: TTML.malformed } }),
  'Untimed Song': () => ({ status: 200, body: { ttml: TTML.untimed } }),
  'Missing Song': () => ({ status: 401, body: { error: 'API key required', message: 'Uncached queries require a valid API key via X-API-Key header' } }),
  'Nothing Song': () => ({ status: 401, body: { error: 'API key required' } }),
  'Error Song': () => ({ status: 500, body: { error: 'boom' } }),
  'Slow Song': () => ({ status: 200, body: { ttml: TTML.word }, delay: 3500 }),
  'Limited Song': () => ({ status: 429, body: { error: 'Too many requests' }, headers: { 'Retry-After': '2' } }),
  'Custom Song': () => ({ status: 200, body: { ttml: TTML.word } })
};
// Riff's own lookup (LRCLIB and the rest): line-timed LRC, at different times from the TTML so the source shows.
const LRC = '[00:03.00]LRC line one\n[00:05.50]LRC line two\n[00:08.00]LRC line three';
const RIFF = { 'Nothing Song': { success: true, lyrics: '' }, 'Custom Song': { success: true, lyrics: '[00:02.00]My own words\n[00:06.00]Second custom line', isCustom: true } };

let ctx;
let page;
let fake;
const requests = [];

test.beforeAll(async () => {
  fake = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const title = u.searchParams.get('s');
    requests.push({ title, d: u.searchParams.get('d'), al: u.searchParams.get('al') });
    const reply = (BETTER[title] || (() => ({ status: 401, body: {} })))();
    setTimeout(() => {
      res.writeHead(reply.status, Object.assign({ 'Content-Type': 'application/json' }, reply.headers || {}));
      res.end(JSON.stringify(reply.body));
    }, reply.delay || 0);
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  process.env.RIFF_BETTERLYRICS_URL = `http://127.0.0.1:${fake.address().port}/getLyrics`;
  // Nothing else may leave the machine: LRCLIB's duration match points at a closed port too.
  process.env.RIFF_LRCLIB_URL = 'http://127.0.0.1:9/api';

  // Lyrics in the right panel (Riff's default shows them only in full screen).
  ctx = await launchRiff({ seed: { riff_e2e_hooks: '1', riff_lyrics_fullscreen_only: '0' } });
  page = ctx.page;
  const file = writeToneWav(path.join(ctx.profile.music, 'Tone.wav'), { seconds: 120, freq: 330 });
  await stubOpenDialog(ctx.app, [file]);
  const domClick = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
  await domClick('nav-local');
  await domClick('btn-add-local');
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(1);
  await domClick('btn-play-local');
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  await page.evaluate(({ riff, lrc }) => {
    document.documentElement.requestFullscreen = () => Promise.resolve();
    // Riff's own lookup, answered here (see the top of the file).
    const realFetch = window.fetch;
    window.__riffLookups = [];
    window.fetch = (input, init) => {
      const url = String(input && input.url ? input.url : input);
      if (/\/api\/lyrics\?/.test(url)) {
        const u = new URL(url);
        window.__riffLookups.push({ title: u.searchParams.get('title'), album: u.searchParams.get('album'), duration: u.searchParams.get('duration') });
        const body = riff[u.searchParams.get('title')] || { success: true, lyrics: lrc };
        return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));
      }
      if (/\/api\/lyrics-words\?/.test(url)) return Promise.resolve(new Response(JSON.stringify({ success: false, lines: [] })));
      return realFetch(input, init);
    };
  }, { riff: RIFF, lrc: LRC });
});
test.afterAll(async () => {
  await closeRiff(ctx);
  await new Promise((r) => fake.close(r));
});

const load = (meta) => page.evaluate((m) => window.__riffLyricsTest.load(m), meta);
const source = () => page.evaluate(() => window.__riffLyricsTest.source());
const texts = () => page.evaluate(() => window.__riffLyricsTest.lines().map((l) => (l.isGap ? '·' : l.text)));
const at = (sec) => page.evaluate((s) => { const a = document.getElementById('native-audio'); a.pause(); a.currentTime = s; }, sec);
const status = () => page.evaluate(() => window.tbRiff.lyrics().kind);

test('the TTML parser reads Better Lyrics\' format: words, syllables, background vocals and times', async () => {
  const r = await page.evaluate((t) => {
    const out = {};
    const p = window.RiffTtml.parse(t.word);
    out.word = { wordSynced: p.wordSynced, syllableSynced: p.syllableSynced, lines: p.lines.map((l) => ({ time: l.time, endTime: l.endTime, text: l.text, words: l.words && l.words.map((w) => [w.text, w.start, w.end, w.syllables ? w.syllables.map((s) => [s.start, s.end, s.chars]) : null]) })) };
    const lp = window.RiffTtml.parse(t.line);
    out.line = { wordSynced: lp.wordSynced, times: lp.lines.map((l) => [l.time, l.endTime, l.text, !!l.words]) };
    const fail = (x) => { try { window.RiffTtml.parse(x); return 'parsed'; } catch (e) { return e.message; } };
    out.malformed = fail(t.malformed);
    out.untimed = fail(t.untimed);
    out.empty = fail('');
    out.html = fail('<html><body>hi</body></html>');
    out.times = ['27.395', '2:20.353', '01:02:03.5', '12.5s', '1500ms', 'nope'].map(window.RiffTtml.parseTime);
    return out;
  }, TTML);

  expect(r.word.wordSynced).toBe(true);
  expect(r.word.syllableSynced).toBe(true);
  const [l1, l2, l3, l4] = r.word.lines;
  expect(l1.text).toBe('Lights along the water');
  expect(l1.words).toEqual([
    ['Lights', 4, 4.3, null],
    ['along', 4.3, 5, [[4.3, 4.6, 1], [4.6, 5, 4]]],
    ['the', 5, 5.2, null],
    ['water', 5.2, 5.9, [[5.2, 5.5, 2], [5.5, 5.9, 3]]]
  ]);
  // Spaces inside spans split words too; background vocals "(home again)" are left out.
  expect(l2.text).toBe('Carry me home');
  expect(l2.words.map((w) => w[0])).toEqual(['Carry', 'me', 'home']);
  expect(l3.words).toEqual([['Tonight', 8, 9.5, null]]);
  expect([l4.time, l4.words.map((w) => w[0])]).toEqual([80, ['Glass', 'harbour']]);

  expect(r.line.wordSynced).toBe(false);
  expect(r.line.times).toEqual([[4, 6, 'Lights along the water', false], [6, 8, 'Carry me home', false], [20.5, 22, 'Tonight', false]]);
  expect(r.malformed).toBe('Malformed TTML');
  expect(r.untimed).toBe('TTML lyrics are not timed');
  expect(r.empty).toBe('Not a TTML document');
  expect(r.html).toBe('Not a TTML document');
  expect(r.times.slice(0, 5)).toEqual([27.395, 140.353, 3723.5, 12.5, 1.5]);
  expect(Number.isNaN(r.times[5])).toBe(true);
});

test('word- and syllable-timed Better Lyrics replace LRCLIB, with album and duration sent', async () => {
  await load({ title: 'Glass Harbour', artist: 'The Lanterns', album: 'Night Ferry', duration: 200.4 });
  await expect.poll(source).toBe('betterlyrics');
  expect(await texts()).toEqual(['Lights along the water', 'Carry me home', 'Tonight', '·', 'Glass harbour']);
  const sent = requests.find((q) => q.title === 'Glass Harbour');
  expect([sent.al, sent.d]).toEqual(['Night Ferry', '200']);
  expect(await page.evaluate(() => window.__riffLookups.at(-1))).toEqual({ title: 'Glass Harbour', album: 'Night Ferry', duration: '200.4' });

  // The bridge to the Tunebox views carries word and syllable timing in ms.
  const bridge = await page.evaluate(() => {
    const d = window.tbRiff.lyrics();
    const along = d.lines.find((l) => l.text.startsWith('Lights')).words[1];
    return { kind: d.kind, wordSynced: d.wordSynced, source: d.source, along };
  });
  expect(bridge).toMatchObject({ kind: 'synced', wordSynced: true, source: 'betterlyrics' });
  expect(bridge.along).toEqual({ text: 'along', start: 4300, end: 5000, syllables: [{ start: 4300, end: 4600, chars: 1 }, { start: 4600, end: 5000, chars: 4 }] });
});

test('the right panel sweeps by syllable', async () => {
  const panelOpen = () => page.evaluate(() => !document.getElementById('right-panel').classList.contains('hidden'));
  if (!(await panelOpen())) await page.evaluate(() => document.getElementById('btn-toggle-lyrics-panel').click());
  await expect.poll(panelOpen).toBe(true);
  // 4.8s: "a" (1 letter) is done and "long" (4 letters) is half sung → 3/5. An even sweep would say 0.71.
  await at(4.8);
  const p = () => page.evaluate(() => {
    const line = [...document.querySelectorAll('#right-panel .tb-lyric-line')].find((l) => l.textContent.trim().startsWith('Lights'));
    const words = line ? [...line.querySelectorAll('.tb-lyric-word')] : [];
    return words.map((w) => Number(w.style.getPropertyValue('--p') || 0).toFixed(2));
  });
  await expect.poll(p).toEqual(['1.00', '0.60', '0.00', '0.00']);
  // 5.65s: "wa" (2 letters) done, "ter" (3) at 3/8 → (2 + 1.125) / 5.
  await at(5.65);
  await expect.poll(async () => (await p())[3]).toBe('0.63');
});

test('all three views agree on the line being sung: Riff\'s, the right panel and Focus mode', async () => {
  await page.evaluate(() => { try { localStorage.setItem('tunebox.focusLayout', 'lyrics'); } catch (e) { /* */ } });
  await page.evaluate(() => window.Tunebox.focus.open());
  await expect(page.locator('.tb-focus')).toHaveCount(1);
  for (const [sec, line] of [[4.5, 'Lights along the water'], [6.9, 'Carry me home'], [8.4, 'Tonight'], [81, 'Glass harbour']]) {
    await at(sec);
    await expect.poll(() => page.evaluate(() => {
      const a = document.querySelector('#right-panel .tb-lyric-line.tb-active');
      const f = document.querySelector('.tb-focus .tb-lyric-line.tb-active');
      return [a && a.textContent.trim(), f && f.textContent.trim()];
    })).toEqual([line, line]);
    expect(await page.evaluate((s) => window.__riffLyricsTest.riffLineAt(s), sec)).toBe(line);
  }
  // Stage: the phrase being sung is the same line, its words timed by Better Lyrics.
  await page.evaluate(() => window.Tunebox.focus.close());
  await page.evaluate(() => { try { localStorage.setItem('tunebox.focusLayout', 'stage'); } catch (e) { /* */ } });
  await page.evaluate(() => window.Tunebox.focus.open());
  await at(6.5);
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll('.tb-focus .tb-stage-word')].map((w) => w.textContent.trim()).join(' '))).toMatch(/Carry me home/i);
  await page.evaluate(() => window.Tunebox.focus.close());
  await expect(page.locator('.tb-focus')).toHaveCount(0);
});

test('timing offset moves Better Lyrics timing; word speed only changes estimated words', async () => {
  const progress = (word) => page.evaluate((w) => {
    const el = [...document.querySelectorAll('#right-panel .tb-lyric-word')].find((x) => x.textContent.trim() === w);
    return el ? Number(el.style.getPropertyValue('--p') || 0) : null;
  }, word);
  const key = (k) => page.evaluate((x) => window.dispatchEvent(new KeyboardEvent('keydown', { key: x, bubbles: true })), k);
  await at(4.075); // a quarter of the way through "Lights" (4.0–4.3s)
  await expect.poll(() => progress('Lights')).toBeCloseTo(0.25, 1);
  await key(']'); // lyrics one step (0.25s) earlier: "Lights" is done and "along" has started
  await expect.poll(() => page.evaluate(() => window.Tunebox.lyricsView.offset)).toBe(250);
  await expect.poll(() => progress('Lights')).toBe(1);
  await expect.poll(() => progress('along')).toBeCloseTo(0.05, 1);
  await key('[');
  await expect.poll(() => page.evaluate(() => window.Tunebox.lyricsView.offset)).toBe(0);

  // Real word timing ignores word speed…
  await key('.');
  await expect.poll(() => page.evaluate(() => window.Tunebox.lyricsView.speed)).toBeCloseTo(1.1, 5);
  await expect.poll(() => progress('Lights')).toBeCloseTo(0.25, 1);
  await key(',');
  await expect.poll(() => page.evaluate(() => window.Tunebox.lyricsView.speed)).toBeCloseTo(1, 5);

  // …but paces line-timed lyrics, whose words are estimated.
  await load({ title: 'Line Song', artist: 'The Lanterns', duration: 200 });
  await expect.poll(source).toBe('betterlyrics');
  const lastEnd = () => page.evaluate(() => {
    const d = window.tbRiff.lyrics();
    const line = window.Tunebox.lyricsView.rawLines(d).find((l) => l.text === 'Tonight'); // room to spare in its slot, so the pace shows
    return Math.round(line.words[line.words.length - 1].end);
  });
  const before = await lastEnd();
  await key('.');
  await expect.poll(lastEnd).toBeLessThan(before);
  await key(',');
  await expect.poll(lastEnd).toBe(before);
});

test('line-timed Better Lyrics keep line timing and show "Line timing"', async () => {
  expect(await texts()).toEqual(['Lights along the water', 'Carry me home', '·', 'Tonight']);
  const d = await page.evaluate(() => { const x = window.tbRiff.lyrics(); return { wordSynced: x.wordSynced, words: x.lines.map((l) => l.words) }; });
  expect(d.wordSynced).toBe(false);
  expect(d.words.every((w) => w === null)).toBe(true);
  await at(21);
  await expect(page.locator('#right-panel .tb-lyric-line.tb-active')).toHaveText(/Tonight/);
  await expect(page.locator('#right-panel .tb-lyrics-sync')).toContainText('Line timing');
});

test('malformed or untimed TTML falls back to Riff\'s lyrics', async () => {
  for (const title of ['Broken Song', 'Untimed Song']) {
    await load({ title, artist: 'The Lanterns', duration: 200 });
    await expect.poll(texts).toEqual(['LRC line one', 'LRC line two', 'LRC line three']);
    expect(await source()).toBe('riff');
    expect(await status()).toBe('synced');
  }
});

test('a song Better Lyrics doesn\'t have (401) or a server error falls back to Riff\'s lyrics', async () => {
  for (const title of ['Missing Song', 'Error Song']) {
    await load({ title, artist: 'The Lanterns', duration: 200 });
    await expect.poll(texts).toEqual(['LRC line one', 'LRC line two', 'LRC line three']);
    expect(await source()).toBe('riff');
  }
  // The miss is remembered: playing it again doesn't ask Better Lyrics again.
  const asked = requests.filter((q) => q.title === 'Missing Song').length;
  await load({ title: 'Missing Song', artist: 'The Lanterns', duration: 200 });
  await expect.poll(texts).toEqual(['LRC line one', 'LRC line two', 'LRC line three']);
  expect(requests.filter((q) => q.title === 'Missing Song').length).toBe(asked);
});

test('no lyrics anywhere: the views say so and nothing breaks', async () => {
  await load({ title: 'Nothing Song', artist: 'The Lanterns', duration: 200 });
  await expect.poll(status).toBe('none');
  expect(await texts()).toEqual([]);
});

test('custom lyrics win over Better Lyrics', async () => {
  await load({ title: 'Custom Song', artist: 'The Lanterns', duration: 200 });
  await expect.poll(texts).toEqual(['My own words', 'Second custom line']);
  await page.waitForTimeout(800);
  expect(await source()).toBe('riff');
  expect(await texts()).toEqual(['My own words', 'Second custom line']);
});

test('a slow Better Lyrics answer: Riff\'s lyrics show first, then switch', async () => {
  await load({ title: 'Slow Song', artist: 'The Lanterns', duration: 200 });
  await expect.poll(texts, { timeout: 3000 }).toEqual(['LRC line one', 'LRC line two', 'LRC line three']);
  expect(await source()).toBe('riff');
  await expect.poll(source, { timeout: 8000 }).toBe('betterlyrics');
  expect((await texts())[0]).toBe('Lights along the water');
  await at(4.5);
  await expect(page.locator('#right-panel .tb-lyric-line.tb-active')).toHaveText(/Lights along the water/);
});

test('rate limited (429): falls back, and pauses Better Lyrics lookups until Retry-After', async () => {
  await load({ title: 'Limited Song', artist: 'The Lanterns', duration: 200 });
  await expect.poll(texts).toEqual(['LRC line one', 'LRC line two', 'LRC line three']);
  expect(await source()).toBe('riff');
  // During the pause, another song isn't asked for at all.
  const before = requests.length;
  await load({ title: 'Line Song again', artist: 'The Lanterns', duration: 200 });
  await expect.poll(texts).toEqual(['LRC line one', 'LRC line two', 'LRC line three']);
  expect(requests.length).toBe(before);
  // After it, lookups resume.
  await page.waitForTimeout(2200);
  await load({ title: 'Glass Harbour', artist: 'The Lanterns', album: 'Night Ferry', duration: 230 });
  await expect.poll(source).toBe('betterlyrics');
});

test('playback carries on through every lyrics failure', async () => {
  await page.evaluate(() => document.getElementById('native-audio').play());
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  const t0 = (await audioState(page)).time;
  for (const title of ['Error Song', 'Broken Song', 'Slow Song', 'Missing Song', 'Nothing Song']) await load({ title, artist: 'X', duration: 200 });
  await page.waitForTimeout(1500);
  const after = await audioState(page);
  expect(after.paused).toBe(false);
  expect(after.time).toBeGreaterThan(t0 + 1);
  expect(await page.evaluate(() => document.getElementById('native-audio').error)).toBe(null);
});
