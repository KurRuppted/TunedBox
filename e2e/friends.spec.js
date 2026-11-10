'use strict';

// Tunebox's Friends panel (tunebox/friends.js): the look only. Riff has no friends service, so it shows
// Tunebox's "isn't set up" state. The toolbar button and Ctrl+Shift+F show and hide it, and the toolbar
// and dock make room for it.

const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff } = require('./helpers');

test.describe.configure({ mode: 'serial' });

let ctx;
let page;
test.beforeAll(async () => { ctx = await launchRiff(); page = ctx.page; });
test.afterAll(async () => closeRiff(ctx));

const panel = () => page.locator('#tb-friends');
const button = () => page.locator('#tb-btn-friends');
const right = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tb-right').trim());

test('closed at first, with the friends button in the toolbar', async () => {
  // Riff's now-playing panel starts open; closed, the Friends panel's width is all that counts.
  if (!(await page.evaluate(() => document.getElementById('right-panel').classList.contains('hidden')))) await page.evaluate(() => document.getElementById('btn-toggle-lyrics-panel').click());
  await expect(page.locator('#right-panel')).toHaveClass(/(^|\s)hidden(\s|$)/);
  await expect(panel()).toBeHidden();
  await expect(button()).toBeVisible();
  expect(await button().getAttribute('title')).toBe('Show friends (Ctrl+Shift+F)');
  await expect.poll(right).toBe('0px');
});

test('the button opens Tunebox\'s panel at the right edge, and the toolbar and dock make room', async () => {
  await button().click({ force: true });
  await expect(panel()).toBeVisible();
  await expect(button()).toBeHidden();
  await expect(panel().locator('h2')).toHaveText('Friends');
  await expect(panel().locator('.tb-friends-empty b')).toHaveText('Friends isn’t set up in Riff yet.');
  const box = await panel().boundingBox();
  const vw = await page.evaluate(() => innerWidth);
  expect(Math.round(box.width)).toBe(288);
  expect(Math.round(box.x + box.width)).toBe(vw);
  await expect.poll(right).toBe('288px');
  // The page ends where the panel starts.
  const mainRight = await page.evaluate(() => Math.round(document.getElementById('main-content').getBoundingClientRect().right));
  expect(mainRight).toBe(Math.round(box.x));
  expect(await page.evaluate(() => localStorage.getItem('tunebox.friendsOpen'))).toBe('1');
});

test('with the now-playing panel open too, both count', async () => {
  const rp = page.locator('#right-panel');
  if (await rp.evaluate((e) => e.classList.contains('hidden'))) await page.evaluate(() => document.getElementById('btn-toggle-lyrics-panel').click());
  await expect(rp).not.toHaveClass(/\bhidden\b/);
  await expect.poll(async () => {
    const w = await page.evaluate(() => document.getElementById('right-panel').offsetWidth + document.getElementById('tb-friends').offsetWidth);
    return (await right()) === `${w}px`;
  }).toBe(true);
  const order = await page.evaluate(() => [document.getElementById('right-panel').getBoundingClientRect().right, document.getElementById('tb-friends').getBoundingClientRect().left].map(Math.round));
  expect(order[0]).toBeLessThanOrEqual(order[1] + 1);
  await page.evaluate(() => document.getElementById('btn-toggle-lyrics-panel').click());
  await expect(rp).toHaveClass(/\bhidden\b/);
});

test('× and Ctrl+Shift+F hide and show it', async () => {
  await panel().locator('.tb-friends-close').click({ force: true });
  await expect(panel()).toBeHidden();
  await expect(button()).toBeVisible();
  await expect.poll(right).toBe('0px');
  expect(await page.evaluate(() => localStorage.getItem('tunebox.friendsOpen'))).toBe('0');
  const ctrlShiftF = () => page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true })));
  await ctrlShiftF();
  await expect(panel()).toBeVisible();
  await ctrlShiftF();
  await expect(panel()).toBeHidden();
});
