'use strict';

// The Tunebox window frame (stage 3): every sidebar and toolbar control still reaches Riff's feature,
// and the frame stays put.

const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff } = require('./helpers');

test.describe.configure({ mode: 'serial' });

let ctx;
let page;
const PLAYLISTS = [
  { id: 'pl_t1', name: 'Road Trip', tracks: [] },
  { id: 'pl_t2', name: 'Focus', tracks: [] },
  { id: 'pl_t3', name: 'Late Night', tracks: [] }
];

test.beforeAll(async () => {
  // Albums is hidden by default in Riff (Settings → show Albums); show it so every row can be tested.
  ctx = await launchRiff({ seed: { devsize_playlists: JSON.stringify(PLAYLISTS), riff_user_nickname: 'Test Person', riff_show_albums: '1' } });
  page = ctx.page;
});
test.afterAll(async () => closeRiff(ctx));

const activeView = () => page.evaluate(() => document.querySelector('.content-view.active')?.id);

test('the sidebar has Tunebox groups in order', async () => {
  const places = await page.$$eval('#tb-side-places > *', (els) => els.map((e) => e.id));
  expect(places).toEqual(['nav-discover', 'tb-nav-now-playing', 'nav-queue']);
  const library = await page.$$eval('#tb-side-library > .nav-item', (els) => els.map((e) => e.id).sort());
  expect(library).toEqual(['nav-albums', 'nav-favorites', 'nav-history', 'nav-local']);
  await expect(page.locator('#tb-side-library .tb-side-heading')).toHaveText('Library');
  await expect(page.locator('.sb-your-lib-header .tb-side-heading-label')).toHaveText('Playlists');
  await expect(page.locator('#tb-account-name')).toHaveText('Test Person');
});

test('sidebar rows open their pages', async () => {
  for (const [nav, view] of [
    ['nav-favorites', 'view-favorites'], ['nav-albums', 'view-albums'], ['nav-local', 'view-local'],
    ['nav-history', 'view-history'], ['nav-queue', 'view-queue'], ['nav-discover', 'view-discover']
  ]) {
    await page.locator('#' + nav).click();
    await expect.poll(activeView).toBe(view);
    await expect(page.locator('#' + nav)).toHaveClass(/\bactive\b/);
  }
});

test('playlists are listed and open', async () => {
  for (const pl of PLAYLISTS) {
    await expect(page.locator(`#sidebar-library-feed .sb-lib-row[data-playlist-id="${pl.id}"]`)).toBeVisible();
  }
  await page.locator('#sidebar-library-feed .sb-lib-row[data-playlist-id="pl_t2"]').click();
  await expect.poll(activeView).toBe('view-playlist-detail');
  // The toolbar's back button follows the playlist page's own back button.
  await expect(page.locator('#tb-btn-back')).toBeEnabled();
  await page.locator('#nav-discover').click();
  await expect(page.locator('#tb-btn-back')).toBeDisabled();
});

test('searching playlists filters the list', async () => {
  await page.locator('.sb-your-lib-header').hover();
  await page.locator('#btn-sb-lib-search').click();
  await expect(page.locator('#sb-lib-search-input')).toBeVisible();
  await page.locator('#sb-lib-search-input').fill('late');
  await expect(page.locator('#sidebar-library-feed .sb-lib-row[data-playlist-id="pl_t3"]')).toBeVisible();
  await expect(page.locator('#sidebar-library-feed .sb-lib-row[data-playlist-id="pl_t1"]')).toBeHidden();
  await page.locator('#btn-sb-lib-search').click();
  await expect(page.locator('#sidebar-library-feed .sb-lib-row[data-playlist-id="pl_t1"]')).toBeVisible();
});

test('+ opens the new playlist menu', async () => {
  await page.locator('#btn-sb-create-pill').click();
  await expect(page.locator('#sb-create-popover')).toBeVisible();
  await expect(page.locator('#btn-popover-playlist')).toBeVisible();
  await page.locator('#nav-discover').click(); // clicking elsewhere closes it
  await expect(page.locator('#sb-create-popover')).toBeHidden();
});

test('Now Playing opens and closes the right panel', async () => {
  const open = () => page.evaluate(() => !document.getElementById('right-panel').classList.contains('hidden'));
  const before = await open();
  await page.locator('#tb-nav-now-playing').click();
  await expect.poll(open).toBe(!before);
  await expect(page.locator('#tb-nav-now-playing')).toHaveClass(before ? /^(?!.*\bactive\b)/ : /\bactive\b/);
  await page.locator('#tb-nav-now-playing').click();
  await expect.poll(open).toBe(before);
});

test('the sidebar hides and shows, and remembers', async () => {
  await page.locator('#tb-btn-sidebar').click();
  await expect(page.locator('html')).toHaveClass(/\btb-sidebar-hidden\b/);
  await expect(page.locator('#tb-btn-sidebar')).toHaveAttribute('title', 'Show sidebar');
  expect(await page.evaluate(() => localStorage.getItem('tunebox.sidebarHidden'))).toBe('1');
  await page.locator('#tb-btn-sidebar').click();
  await expect(page.locator('html')).not.toHaveClass(/\btb-sidebar-hidden\b/);
});

test('the account row opens Settings → Account', async () => {
  await page.locator('#tb-account').click();
  await expect(page.locator('#view-settings')).toHaveClass(/\bactive\b/);
  await expect(page.locator('#settings-nav-account')).toHaveClass(/\bactive\b/);
  await page.keyboard.press('Escape');
});

test('the window frame never scrolls away', async () => {
  await page.evaluate(() => { document.body.scrollTop = 200; document.documentElement.scrollTop = 200; });
  await expect.poll(() => page.evaluate(() => document.body.scrollTop + document.documentElement.scrollTop)).toBe(0);
  // The floating dock (stage 4) sits 14px above the bottom of the window.
  const box = await page.locator('#playbar').boundingBox();
  const vh = await page.evaluate(() => innerHeight);
  expect(Math.round(box.y + box.height)).toBe(vh - 14);
});

test('Windows gets native caption buttons', async () => {
  test.skip(process.platform !== 'win32', 'Windows only');
  await expect(page.locator('html')).toHaveClass(/\btb-native-controls\b/);
  await expect(page.locator('#titlebar')).toBeHidden();
  // Riff's own window buttons stay in the page for app.js.
  expect(await page.evaluate(() => ['btn-minimize', 'btn-maximize', 'btn-close'].every((id) => !!document.getElementById(id)))).toBe(true);
  // Riff's mini-player buttons moved into the toolbar.
  await expect(page.locator('#tb-toolbar-end #btn-mini-player')).toBeVisible();
});

test("Riff's show/hide settings for Albums and My files still apply", async () => {
  await expect(page.locator('#nav-albums')).toBeVisible();
  await page.evaluate(() => document.body.classList.add('hide-albums-tab'));
  await expect(page.locator('#nav-albums')).toBeHidden();
  await page.evaluate(() => document.body.classList.remove('hide-albums-tab'));
  await page.evaluate(() => document.getElementById('nav-local').classList.add('nav-collapsed'));
  await expect(page.locator('#nav-local')).toBeHidden();
  await page.evaluate(() => document.getElementById('nav-local').classList.remove('nav-collapsed'));
  await expect(page.locator('#nav-local')).toBeVisible();
});
