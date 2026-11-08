'use strict';

// Screenshots of each main screen for design reviews (not a pass/fail test).
// Run: set RIFF_SCREENS=<label> then `npx playwright test screens`; images land in e2e/screenshots/<label>/.
// Search and Home need the internet; local playback does not.

const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff, stubOpenDialog, writeToneWav } = require('./helpers');

const label = process.env.RIFF_SCREENS;
test.skip(!label, 'Set RIFF_SCREENS=<label> to capture review screenshots.');
test.describe.configure({ mode: 'serial' });

const outDir = path.join(__dirname, 'screenshots', label || 'unused');
let ctx;
let page;

const go = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
const shot = async (name) => {
  await page.waitForTimeout(1200); // let transitions and images settle
  // Electron's own capture: Riff zooms the page, which throws off Playwright's screenshot size.
  const png = await ctx.app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(png, 'base64'));
};

test.beforeAll(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  ctx = await launchRiff({ maximize: true });
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
  await shot('01-home');

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

  await go('nav-settings');
  await shot('07-settings');

  await go('nav-discover');
  await page.locator('#btn-toggle-lyrics-panel').click();
  await shot('08-lyrics-panel');
  await page.locator('#btn-toggle-lyrics-panel').click();

  // The light theme, when the Tunebox look is present (stage 2 onwards).
  const hasTunebox = await page.evaluate(() => !!(window.Tunebox && window.Tunebox.appearance));
  if (hasTunebox) {
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'light' }));
    await go('nav-discover');
    await shot('11-light-home');
    await go('nav-local');
    await shot('12-light-local-files');
    await go('nav-settings');
    await shot('13-light-settings');
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'dark' }));
  }
});
