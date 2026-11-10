'use strict';

// Screenshots of the collection pages (Tunebox stage 6): a playlist, Liked Songs, My files, the saved
// Albums page, an album and an artist. Not a pass/fail test.
// Run: set RIFF_SCREENS=<label> then `npx playwright test screens-browse` (`npx playwright test screens`
// runs this and the main screens). Images land in e2e/screenshots/<label>/.
// The playlist, Liked Songs and Albums pages use made-up songs with generated covers (no internet);
// the album and artist pages come from a search, so they need the internet.

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff, stubOpenDialog, writeToneWav, captureWindow } = require('./helpers');

const label = process.env.RIFF_SCREENS;
test.skip(!label, 'Set RIFF_SCREENS=<label> to capture review screenshots.');
test.describe.configure({ mode: 'serial' });

const outDir = path.join(__dirname, 'screenshots', label || 'unused');
let ctx;
let page;

const go = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
const shot = async (name) => {
  await page.waitForTimeout(1200); // let transitions and images settle
  await captureWindow(ctx.app, path.join(outDir, `${name}.png`));
};

const cover = (h1, h2) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="hsl(${h1} 70% 55%)"/><stop offset="1" stop-color="hsl(${h2} 65% 30%)"/></linearGradient></defs>` +
  `<rect width="300" height="300" fill="url(#g)"/></svg>`);

const SONGS = [
  ['Midnight Drive', 'Neon Coast', 'Afterglow', 214, 200, 260],
  ['Paper Planes', 'Juniper Lane', 'Paper Planes', 187, 20, 340],
  ['Slow Motion', 'The Weekend Club', 'Daylight Savings', 243, 280, 220],
  ['Gold Rush', 'Marlow', 'Gold Rush', 199, 40, 10],
  ['Ocean Eyes Again', 'Delilah Rae', 'Blue Hour', 226, 190, 230],
  ['Static', 'Kid Arcade', 'Static', 171, 330, 300],
  ['Late Checkout', 'Sunday Service Band', 'Hotel Lobby', 255, 150, 190],
  ['Wildfire', 'Ember & Ash', 'Wildfire', 208, 10, 40],
  ['Neon Hearts', 'Neon Coast', 'Afterglow', 232, 260, 300],
  ['Rain Check', 'Juniper Lane', 'Rain Check', 195, 210, 240],
  ['Daydreamer', 'Lumen', 'Polaroids', 219, 100, 160],
  ['Long Way Home', 'Marlow', 'Highway Songs', 248, 0, 30]
].map(([title, artist, album, duration, h1, h2], i) => ({
  id: `seedtrack${String(i).padStart(2, '0')}`,
  title, artist, album, duration,
  thumbnail: cover(h1, h2),
  platform: 'youtube',
  addedAt: Date.UTC(2026, 9, 1 + i)
}));

const PLAYLISTS = [
  { id: 'pl_seed0', name: 'Catch', tracks: SONGS, cover: cover(200, 260) },
  { id: 'pl_seed1', name: 'Chill Walk to Work', tracks: SONGS.slice(0, 4), cover: cover(150, 190) }
];

const ALBUMS = [
  ['Afterglow', 'Neon Coast', 200, 260], ['Daylight Savings', 'The Weekend Club', 280, 220], ['Blue Hour', 'Delilah Rae', 190, 230],
  ['Hotel Lobby', 'Sunday Service Band', 150, 190], ['Polaroids', 'Lumen', 100, 160], ['Highway Songs', 'Marlow', 0, 30],
  ['Static', 'Kid Arcade', 330, 300], ['Wildfire', 'Ember & Ash', 10, 40]
].map(([title, artist, h1, h2], i) => ({ id: `alb_seed${i}`, title, artist, cover: cover(h1, h2), type: 'Album', year: '2025' }));

test.beforeAll(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  ctx = await launchRiff({
    maximize: true,
    seed: {
      devsize_playlists: JSON.stringify(PLAYLISTS),
      devsize_favorites: JSON.stringify(SONGS),
      riff_saved_albums: JSON.stringify(ALBUMS),
      riff_user_nickname: 'Solomon Vu'
    }
  });
  page = ctx.page;
  const files = ['Alpha Tone', 'Beta Tone', 'Gamma Tone'].map((n, i) =>
    writeToneWav(path.join(ctx.profile.music, `${n}.wav`), { freq: 330 + i * 110 }));
  await stubOpenDialog(ctx.app, files);
  await go('nav-local');
  await go('btn-add-local');
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(3);
  // A local song plays, so its row shows the playing dot.
  await go('btn-play-local');
  await page.waitForTimeout(1500);
});

test.afterAll(async () => closeRiff(ctx));

test('capture collection pages', async () => {
  // The sidebar's playlist row (the visible one; Riff keeps another copy of the list).
  const openPlaylist = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.evaluate(() => {
        const rows = [...document.querySelectorAll('.sb-lib-row[data-playlist-id="pl_seed0"]')];
        const row = rows.find((r) => r.offsetParent) || rows[0];
        if (row) row.click();
      });
      const open = await page.waitForSelector('#view-playlist-detail.active', { timeout: 3000 }).then(() => true, () => false);
      if (open) return;
    }
    throw new Error('The playlist page did not open');
  };
  const top = () => page.evaluate(() => { document.getElementById('main-content').scrollTop = 0; });

  await openPlaylist();
  await top();
  await shot('21-playlist');
  // Pointer over a song: the striped row lights up and its buttons show.
  await page.locator('#playlist-tracks-list .track-row').nth(2).hover({ force: true });
  await shot('21b-playlist-row-hover');
  await page.mouse.move(600, 140);

  await go('nav-favorites');
  await top();
  await shot('22-liked-songs');

  await go('nav-local');
  await top();
  await shot('23-my-files');

  if (await page.evaluate(() => !!document.getElementById('nav-albums'))) {
    await go('nav-albums');
  } else {
    await page.evaluate(() => { const b = document.querySelector('[data-view="albums"]'); if (b) b.click(); });
  }
  await top();
  await shot('24-albums');

  // A real album and its artist, from a search.
  await page.locator('#search-input').fill('Lauv', { force: true });
  await page.locator('#search-input').press('Enter');
  await page.waitForTimeout(6000);
  const opened = await page.evaluate(() => {
    const card = document.querySelector('#view-discover .search-album-card:not(.search-playlist-card)');
    if (!card) return false;
    card.click();
    return true;
  });
  if (opened) {
    await page.waitForTimeout(5000); // the album's songs load
    await top();
    await shot('25-album');
    await page.evaluate(() => { const b = document.getElementById('album-detail-artist'); (b.firstElementChild || b).click(); });
    await page.waitForTimeout(6000); // the artist page loads
    await top();
    await shot('26-artist');
  }

  // Light theme
  if (await page.evaluate(() => !!(window.Tunebox && window.Tunebox.appearance))) {
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'light' }));
    if (opened) await shot('26b-light-artist');
    await openPlaylist();
    await top();
    await shot('27-light-playlist');
    if (opened) {
      await page.evaluate(() => { const b = document.getElementById('tb-btn-back'); if (b && !b.disabled) b.click(); });
    }
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'dark' }));
  }
});
