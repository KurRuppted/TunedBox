'use strict';

// Screenshots of Queue, History, search results and Settings (Tunebox stage 7). Not a pass/fail test.
// Run: set RIFF_SCREENS=<label> then `npx playwright test screens-pages` (`npx playwright test screens`
// runs every screenshot spec). Images land in e2e/screenshots/<label>/. Search needs the internet.

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
  await page.waitForTimeout(1200);
  await captureWindow(ctx.app, path.join(outDir, `${name}.png`));
};

const cover = (h1, h2) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
  `<stop offset="0" stop-color="hsl(${h1} 70% 55%)"/><stop offset="1" stop-color="hsl(${h2} 65% 30%)"/></linearGradient></defs>` +
  `<rect width="300" height="300" fill="url(#g)"/></svg>`);

const HISTORY = [
  ['Midnight Drive', 'Neon Coast', 214, 200, 260], ['Paper Planes', 'Juniper Lane', 187, 20, 340],
  ['Slow Motion', 'The Weekend Club', 243, 280, 220], ['Gold Rush', 'Marlow', 199, 40, 10],
  ['Ocean Eyes Again', 'Delilah Rae', 226, 190, 230], ['Static', 'Kid Arcade', 171, 330, 300],
  ['Late Checkout', 'Sunday Service Band', 255, 150, 190], ['Wildfire', 'Ember & Ash', 208, 10, 40]
].map(([title, artist, duration, h1, h2], i) => ({
  id: `histtrack${i}`, title, artist, duration, thumbnail: cover(h1, h2), platform: 'youtube', playedAt: Date.now() - i * 3600e3
}));

test.beforeAll(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  ctx = await launchRiff({
    maximize: true,
    seed: { devsize_history: JSON.stringify(HISTORY), riff_user_nickname: 'Solomon Vu' }
  });
  page = ctx.page;
  const files = ['Alpha Tone', 'Beta Tone', 'Gamma Tone'].map((n, i) =>
    writeToneWav(path.join(ctx.profile.music, `${n}.wav`), { freq: 330 + i * 110 }));
  await stubOpenDialog(ctx.app, files);
  await go('nav-local');
  await go('btn-add-local');
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(3);
  await go('btn-play-local');
  await page.waitForTimeout(1500);
});

test.afterAll(async () => closeRiff(ctx));

test('capture queue, history, search and settings', async () => {
  const top = () => page.evaluate(() => { document.getElementById('main-content').scrollTop = 0; });
  const settings = async (cat) => {
    await page.evaluate((c) => {
      const view = document.getElementById('view-settings');
      if (!view.classList.contains('modal-open')) document.getElementById('btn-sb-settings').click();
      const tab = document.querySelector(`.settings-nav-btn[data-cat="${c}"]`);
      if (tab) tab.click();
      const pane = document.querySelector('#view-settings .settings-pane');
      if (pane) pane.scrollTop = 0;
    }, cat);
  };
  // Riff's close button (Escape would close an open menu first).
  const closeSettings = async () => {
    await page.evaluate(() => { const b = document.querySelector('#view-settings .settings-modal-close-btn'); if (b) b.click(); });
    await page.waitForTimeout(1000);
  };

  await go('nav-queue');
  await top();
  await shot('31-queue');

  await go('nav-history');
  await top();
  await shot('32-history');

  await go('nav-discover');
  await page.locator('#search-input').fill('Lauv', { force: true });
  await page.locator('#search-input').press('Enter');
  await page.waitForTimeout(6000);
  await top();
  await shot('33-search');
  await page.evaluate(() => { document.getElementById('main-content').scrollTop = 900; });
  await shot('33b-search-scrolled');
  await top();

  for (const [cat, name] of [['interface', '34-settings-interface'], ['theme', '35-settings-theme'], ['tracks', '36-settings-tracks'],
    ['integrations', '37-settings-integrations'], ['storage', '38-settings-storage'], ['advanced', '39-settings-advanced'],
    ['about', '40-settings-about'], ['account', '41-settings-account']]) {
    await settings(cat);
    await shot(name);
  }
  // A pop-up menu open (interface language).
  await settings('interface');
  await page.evaluate(() => { const t = document.querySelector('#view-settings .settings-section:not(.cat-hidden) .m3-dropdown-trigger'); if (t) t.click(); });
  await shot('42-settings-menu-open');
  await page.evaluate(() => { const t = document.querySelector('#view-settings .settings-section:not(.cat-hidden) .m3-dropdown-trigger'); if (t) t.click(); });
  await page.waitForTimeout(300);
  await closeSettings();

  // Riff's own screens: the audio editor and full-screen lyrics.
  await go('btn-open-settings');
  await shot('48-audio-editor');
  await go('btn-close-settings');
  await page.waitForTimeout(400);
  await go('btn-playbar-karaoke');
  await shot('50-fullscreen-lyrics');
  await go('btn-playbar-karaoke'); // the same button closes it
  await page.waitForTimeout(400);

  // The Appearance sheet (from Home's appearance button).
  await go('nav-discover');
  await page.evaluate(() => window.Tunebox.appearancePanel.open('general'));
  await shot('45-appearance-general');
  await page.evaluate(() => { document.querySelector('#tb-appearance .tb-sheet').scrollTop = 600; });
  await shot('45b-appearance-general-scrolled');
  await page.evaluate(() => window.Tunebox.appearancePanel.open('themes'));
  await shot('46-appearance-themes');
  await page.evaluate(() => window.Tunebox.appearancePanel.close());

  if (await page.evaluate(() => !!(window.Tunebox && window.Tunebox.appearance))) {
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'light' }));
    await settings('interface');
    await shot('43-light-settings');
    await closeSettings();
    await go('nav-queue');
    await top();
    await shot('44-light-queue');
    await page.evaluate(() => window.Tunebox.appearancePanel.open('general'));
    await shot('47-light-appearance');
    await page.evaluate(() => window.Tunebox.appearancePanel.close());
    await go('btn-open-settings');
    await shot('49-light-audio-editor');
    await go('btn-close-settings');
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'dark' }));
  }
});
