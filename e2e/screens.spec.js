'use strict';

// Screenshots of each main screen for design reviews (not a pass/fail test).
// Run: set RIFF_SCREENS=<label> then `npx playwright test screens`; images land in e2e/screenshots/<label>/.
// Search and Home need the internet; local playback does not.

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

// A small library so the sidebar has playlists to show (names like the Tunebox reference screenshots;
// covers are generated gradients, so nothing is fetched).
const cover = (h1, h2) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="hsl(${h1} 70% 55%)"/><stop offset="1" stop-color="hsl(${h2} 65% 30%)"/></linearGradient></defs>` +
  `<rect width="120" height="120" fill="url(#g)"/></svg>`);
const PLAYLISTS = [
  ['Catch', 200, 260], ['Jammin a car 🚙', 20, 340], ['Beat Ups', 280, 220], ['Khalid & Bruno Favorites', 40, 10],
  ['Love Mix for the User', 330, 300], ['Top 50 with Delilah', 180, 120], ['Chill Walk to Work', 150, 190],
  ['All Time Listened Songs', 100, 160], ['Anime Rap Songs', 0, 40], ['sad lofi 💔 lofi chill', 260, 300],
  ['valorant', 350, 10], ['Just a chill guy', 210, 240], ['Vibes 🎮 🌌', 240, 280], ['Blinding Lights', 5, 30], ['Sleep 😴', 230, 250]
].map(([name, h1, h2], i) => ({ id: `pl_seed${i}`, name, tracks: [], cover: cover(h1, h2) }));

test.beforeAll(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  ctx = await launchRiff({
    maximize: true,
    seed: { devsize_playlists: JSON.stringify(PLAYLISTS), riff_user_nickname: 'Solomon Vu' }
  });
  page = ctx.page;
  const files = ['Alpha Tone', 'Beta Tone', 'Gamma Tone'].map((n, i) =>
    writeToneWav(path.join(ctx.profile.music, `${n}.wav`), { freq: 330 + i * 110 }));
  await stubOpenDialog(ctx.app, files);
  await go('nav-local');
  await go('btn-add-local');
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(3);
  await page.locator('#btn-play-local').click();
  await page.waitForTimeout(1500);
});

test.afterAll(async () => closeRiff(ctx));

test('capture screens', async () => {
  await go('nav-discover');
  await page.waitForTimeout(4000); // Home loads recommendations from the network
  // With the Tunebox banner (stage 5 onwards), play a Trending song so it shows real artwork.
  if (await page.evaluate(() => !!document.getElementById('tb-hero'))) {
    const played = await page.evaluate(() => {
      const card = document.querySelector('#sp-trend > .sp-card');
      if (!card) return false;
      card.click(); // brings it to the middle of the cover flow
      card.click(); // plays it
      return true;
    });
    if (played) await page.waitForTimeout(9000); // the song streams in
    await page.evaluate(() => { document.getElementById('main-content').scrollTop = 0; });
  }
  await shot('01-home');
  if (await page.evaluate(() => !!document.getElementById('tb-hero'))) {
    await page.evaluate(() => { document.getElementById('main-content').scrollTop = 480; });
    await shot('01b-home-sections');
    await page.evaluate(() => { const s = document.querySelector('#sp-trend-sec .tb-view-switch button[data-view="grid"]'); if (s) s.click(); });
    await page.evaluate(() => { document.getElementById('sp-trend-sec').scrollIntoView({ block: 'start' }); });
    await shot('01c-home-grid');
    await page.evaluate(() => { const s = document.querySelector('#sp-trend-sec .tb-view-switch button[data-view="list"]'); if (s) s.click(); });
    await shot('01d-home-list');
    await page.evaluate(() => { const s = document.querySelector('#sp-trend-sec .tb-view-switch button[data-view="flow"]'); if (s) s.click(); });
    await page.evaluate(() => { document.getElementById('main-content').scrollTop = 0; });
  }

  await go('nav-local');
  await shot('02-local-files');

  await go('nav-queue');
  await shot('03-queue');

  await go('nav-favorites');
  await shot('04-favorites');

  await go('nav-history');
  await shot('05-history');

  await page.locator('#search-input').fill('Lauv I Like Me Better');
  await page.locator('#search-input').press('Enter');
  await page.waitForTimeout(6000);
  await shot('06-search');
  // Scrolled: the Tunebox toolbar turns to glass over the page.
  await page.evaluate(() => { document.getElementById('main-content').scrollTop = 500; });
  await shot('06b-search-scrolled');
  await page.evaluate(() => { document.getElementById('main-content').scrollTop = 0; });

  // Settings opens from the account row's gear (Riff's own Settings button) since stage 3.
  await go('btn-sb-settings');
  await shot('07-settings');
  await page.keyboard.press('Escape');

  await go('nav-discover');
  // Open (Riff opens it by itself when a song starts), capture, then close.
  const panelOpen = () => page.evaluate(() => !document.getElementById('right-panel').classList.contains('hidden'));
  if (!(await panelOpen())) await page.locator('#btn-toggle-lyrics-panel').click();
  await shot('08-lyrics-panel');
  await page.locator('#btn-toggle-lyrics-panel').click();
  await shot('08b-panel-closed');

  // The light theme, when the Tunebox look is present (stage 2 onwards).
  const hasTunebox = await page.evaluate(() => !!(window.Tunebox && window.Tunebox.appearance));
  if (hasTunebox) {
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'light' }));
    await go('nav-discover');
    await shot('11-light-home');
    await go('nav-local');
    await shot('12-light-local-files');
    await go('btn-sb-settings');
    await shot('13-light-settings');
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'dark' }));
  }

  // The Tunebox window frame (stage 3 onwards).
  const hasShell = await page.evaluate(() => !!document.getElementById('tb-btn-sidebar'));
  if (hasShell) {
    await page.keyboard.press('Escape'); // close Settings
    await go('nav-discover');

    await page.locator('#tb-btn-sidebar').click();
    await shot('15-sidebar-hidden');
    await page.locator('#tb-btn-sidebar').click();

    await page.locator('#btn-sb-create-pill').click();
    await shot('16-new-playlist-menu');
    await page.evaluate(() => document.getElementById('sb-create-popover').classList.add('hidden'));

    // The Tunebox search button above the dock, opened (stage 4 onwards).
    if (await page.evaluate(() => !!document.getElementById('tb-search-float'))) {
      await go('nav-discover');
      await page.locator('#search-icon-btn').click();
      await page.locator('#search-input').pressSequentially('Lauv', { delay: 30 });
      await shot('18-search-open');
      await page.locator('#search-input').press('Escape');
      // The dock with the pointer over the track (Riff's extra track actions show).
      await page.locator('#playbar .track-meta').hover();
      await page.locator('#scrubber-track').hover();
      await shot('19-dock-hover');
      await page.mouse.move(600, 300);
      await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'light' }));
      await page.locator('#search-icon-btn').click();
      await shot('20-light-dock-search');
      await page.locator('#search-input').press('Escape');
      await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'dark' }));
    }

    // The mini player stays on top of other windows, so it's left out of background (page) captures.
    if (process.env.RIFF_CAPTURE !== 'page') {
      await go('btn-mini-player');
      await page.waitForTimeout(2000); // the window shrinks to the mini player
      await shot('17-mini-player');
      await go('btn-mini-player');
      await page.waitForTimeout(2000);
    }
  }
});
