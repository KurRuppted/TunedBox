'use strict';

// Screenshots of right-click menus, pop-up menus, toasts and dialogs (Tunebox stage 8). Not a pass/fail test.
// Run: set RIFF_SCREENS=<label> then `npx playwright test screens-overlays`. Images land in e2e/screenshots/<label>/.

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
  await page.waitForTimeout(900);
  await captureWindow(ctx.app, path.join(outDir, `${name}.png`));
};

test.beforeAll(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const cover = (h1, h2) => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${h1} 70% 55%)"/><stop offset="1" stop-color="hsl(${h2} 65% 30%)"/></linearGradient></defs>` +
    `<rect width="300" height="300" fill="url(#g)"/></svg>`);
  const playlists = [
    { id: 'pl_seed0', name: 'Road Trip', tracks: [], cover: cover(200, 260) },
    { id: 'pl_seed1', name: 'Chill Walk to Work', tracks: [], cover: cover(150, 190) },
    { id: 'pl_seed2', name: 'Late Night Coding', tracks: [], cover: cover(280, 220) }
  ];
  ctx = await launchRiff({ maximize: true, seed: { riff_user_nickname: 'Solomon Vu', devsize_playlists: JSON.stringify(playlists) } });
  page = ctx.page;
  const files = ['Alpha Tone', 'Beta Tone', 'Gamma Tone', 'Delta Tone'].map((n, i) =>
    writeToneWav(path.join(ctx.profile.music, `${n}.wav`), { freq: 330 + i * 110 }));
  await stubOpenDialog(ctx.app, files);
  await go('nav-local');
  await go('btn-add-local');
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(4);
});

test.afterAll(async () => closeRiff(ctx));

test('capture menus, toasts and dialogs', async () => {
  // Right-click the second local track, at a point inside its row.
  const trackMenu = async () => {
    const box = await page.evaluate(() => {
      const r = document.querySelectorAll('#local-tracks-list .track-row')[1].getBoundingClientRect();
      return { x: Math.round(r.left + 360), y: Math.round(r.top + r.height / 2) };
    });
    await page.evaluate(({ x, y }) => {
      const row = document.querySelectorAll('#local-tracks-list .track-row')[1];
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    }, box);
    await page.waitForTimeout(300);
    return box;
  };
  const menuItem = (text) => page.evaluate((t) => {
    const b = [...document.querySelectorAll('.riff-ctx-menu .riff-ctx-item')].find((x) => x.textContent.trim() === t);
    if (b) b.click();
    return !!b;
  }, text);
  const showModal = (id) => page.evaluate((i) => {
    const m = document.getElementById(i);
    m.classList.remove('hidden');
    m.classList.add('visible');
  }, id);
  const hideModal = async (id) => {
    await page.evaluate((i) => {
      const m = document.getElementById(i);
      m.classList.remove('visible');
      m.classList.add('hidden');
    }, id);
    await page.waitForTimeout(300);
  };
  const closeMenu = async () => {
    await page.evaluate(() => { const m = document.querySelector('.riff-ctx-menu'); if (m) m.classList.remove('open'); });
    await page.waitForTimeout(200);
  };

  const run = async (suffix) => {
    await go('nav-local');
    await page.evaluate(() => { document.getElementById('main-content').scrollTop = 0; });

    // Track menu, with the pointer over its third item so the hover highlight shows.
    await trackMenu();
    const hover = await page.evaluate(() => {
      const r = document.querySelectorAll('.riff-ctx-menu .riff-ctx-item')[2].getBoundingClientRect();
      return { x: r.left + 40, y: r.top + r.height / 2 };
    });
    await page.mouse.move(hover.x, hover.y);
    await shot(`51-track-menu${suffix}`);

    await menuItem('Add to playlist');
    await shot(`52-add-to-playlist${suffix}`);
    await hideModal('add-to-playlist-modal');

    await trackMenu();
    await menuItem('Rename track');
    await shot(`53-rename-track${suffix}`);
    await page.evaluate(() => document.getElementById('btn-cancel-rename-track').click());
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      document.getElementById('delete-playlist-msg').textContent = 'Delete “Road Trip”? This can’t be undone.';
    });
    await showModal('delete-playlist-modal');
    await shot(`54-delete-playlist${suffix}`);
    await hideModal('delete-playlist-modal');

    await showModal('create-playlist-modal');
    await shot(`55-create-playlist${suffix}`);
    await hideModal('create-playlist-modal');

    // The sort pop-up menu on the collection toolbar.
    await go('local-sort-trigger');
    await shot(`56-sort-menu${suffix}`);
    await go('local-sort-trigger');
    await page.waitForTimeout(200);

    await page.evaluate(() => {
      window.showToast('Added to queue');
      window.showToast('Playlist pinned', 'success');
      window.showToast('Couldn’t load lyrics for this song', 'error');
    });
    await shot(`57-toasts${suffix}`);
    await closeMenu();
    await page.waitForTimeout(4500); // let the toasts go
  };

  await run('');
  if (await page.evaluate(() => !!(window.Tunebox && window.Tunebox.appearance))) {
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'light' }));
    await run('-light');
    await page.evaluate(() => window.Tunebox.appearance.set({ theme: 'dark' }));
  }
});
