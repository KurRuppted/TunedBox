'use strict';

// The Tunebox player dock and search (stage 4): the dock floats over the page, and every control in it
// and in the search button still reaches Riff's feature.

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff, stubOpenDialog, writeToneWav, audioState } = require('./helpers');

test.describe.configure({ mode: 'serial' });

let ctx;
let page;

test.beforeAll(async () => {
  ctx = await launchRiff();
  page = ctx.page;
  const files = ['One', 'Two'].map((n, i) => writeToneWav(path.join(ctx.profile.music, `${n}.wav`), { freq: 330 + i * 110 }));
  await stubOpenDialog(ctx.app, files);
  await page.locator('#nav-local').click();
  await page.locator('#btn-add-local').click();
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(2);
  await page.locator('#btn-play-local').click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
});
test.afterAll(async () => closeRiff(ctx));

// Where the content column runs (between the sidebar and the right panel).
const column = () => page.evaluate(() => {
  const main = document.getElementById('main-content').getBoundingClientRect();
  return { left: main.left, right: main.right };
});

test('the dock floats 14px above the bottom, centred over the page, at most 1000px wide', async () => {
  const box = await page.locator('#playbar').boundingBox();
  const vh = await page.evaluate(() => innerHeight);
  expect(Math.round(box.y + box.height)).toBe(vh - 14);
  expect(box.width).toBeLessThanOrEqual(1000.5);
  const col = await column();
  expect(Math.abs((box.x - col.left) - (col.right - (box.x + box.width)))).toBeLessThan(2);
  const style = await page.locator('#playbar').evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(style).toBe('14px');
});

test('the dock re-centres when the sidebar hides', async () => {
  await page.locator('#tb-btn-sidebar').click();
  await page.waitForTimeout(400);
  const box = await page.locator('#playbar').boundingBox();
  const col = await column();
  expect(Math.abs((box.x - col.left) - (col.right - (box.x + box.width)))).toBeLessThan(2);
  await page.locator('#tb-btn-sidebar').click();
  await page.waitForTimeout(400);
});

test('the page scrolls underneath the dock', async () => {
  const layoutBottom = await page.evaluate(() => document.querySelector('.app-layout').getBoundingClientRect().bottom);
  expect(Math.round(layoutBottom)).toBe(await page.evaluate(() => innerHeight));
});

test('track title, artist and the Tunebox heart', async () => {
  await expect(page.locator('#playbar-title')).toHaveText(/One|Two/);
  const art = await page.locator('#playbar-artwork-wrapper').boundingBox();
  expect(Math.round(art.width)).toBe(44);
  await page.locator('#btn-toggle-fav').click();
  await expect(page.locator('#fav-icon')).toHaveAttribute('fill', 'currentColor');
  const [heart, accent] = await page.evaluate(() => [
    getComputedStyle(document.getElementById('btn-toggle-fav')).color,
    getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  ]);
  expect(heart).not.toBe('');
  expect(accent).not.toBe('');
  await page.locator('#btn-toggle-fav').click();
  await expect(page.locator('#fav-icon')).toHaveAttribute('fill', 'none');
});

test("Riff's extra track actions appear when the pointer is over the track", async () => {
  const opacity = () => page.locator('#btn-edit-current-track').evaluate((el) => getComputedStyle(el).opacity);
  await page.mouse.move(5, 5);
  await expect.poll(opacity).toBe('0');
  await page.locator('#playbar .track-meta').hover();
  await expect.poll(opacity).toBe('1');
});

test('the progress bar is drawn in the Tunebox style', async () => {
  const style = await page.evaluate(() => window.Tunebox.player.scrubberStyle());
  expect(style.track).toMatch(/^rgba?\(/);
  expect(style.fill).toMatch(/^rgba?\(/);
  // Times are always shown, as in Tunebox.
  await expect(page.locator('#time-current')).toHaveCSS('opacity', '1');
  // Tunebox defaults for Riff's bar settings: knob on hover, plain play button, no visualizer in the bar.
  expect(await page.evaluate(() => ['riff_progress_knob', 'riff_play_btn_bg', 'riff_bar_wave'].map((k) => localStorage.getItem(k))))
    .toEqual(['true', 'false', '0']);
  await expect(page.locator('body')).toHaveClass(/\bplay-btn-nobg\b/);
});

test('the volume slider fills to its value', async () => {
  await page.locator('#volume-slider').fill('0.4');
  await expect.poll(() => page.locator('#volume-slider').evaluate((el) => el.style.getPropertyValue('--tb-pct'))).toBe('40%');
  // Riff setting the value from code (mouse wheel) also updates the fill.
  await page.locator('.volume-control-group').hover();
  await page.mouse.wheel(0, -100);
  await expect.poll(() => page.locator('#volume-slider').evaluate((el) => el.style.getPropertyValue('--tb-pct'))).toBe('45%');
});

test('the round search button opens into a field and searches', async () => {
  const wrap = page.locator('#tb-search-float .search-box-wrapper');
  const boxWidth = () => page.locator('#tb-search-float .search-box').evaluate((el) => el.getBoundingClientRect().width);
  await expect(wrap).not.toHaveClass(/\btb-open\b/);
  expect(Math.round(await boxWidth())).toBe(40);
  // It sits on top of the dock's right end.
  const [btn, dock] = [await page.locator('#search-icon-btn').boundingBox(), await page.locator('#playbar').boundingBox()];
  expect(Math.round(btn.y + btn.height)).toBe(Math.round(dock.y));
  expect(Math.round(btn.x + btn.width)).toBe(Math.round(dock.x + dock.width));

  await page.locator('#search-icon-btn').click();
  await expect(page.locator('#search-input')).toBeFocused();
  await expect(wrap).toHaveClass(/\btb-open\b/);
  await expect.poll(async () => Math.round(await boxWidth())).toBe(320);

  await page.locator('#search-input').fill('tone');
  await page.locator('#search-input').press('Enter');
  await expect(page.locator('#search-results-container')).toBeVisible();
  // With a search in it, the field stays open after it loses focus.
  await page.locator('#nav-queue').click();
  await expect(wrap).toHaveClass(/\btb-open\b/);
  // Clear returns to an empty, closed field.
  await page.locator('#search-input').focus();
  await page.locator('#search-clear-btn').click();
  await expect(page.locator('#search-input')).toHaveValue('');
  await page.locator('#nav-queue').click();
  await expect(wrap).not.toHaveClass(/\btb-open\b/);
});

test('Escape closes the search field and Ctrl+K opens it', async () => {
  const wrap = page.locator('#tb-search-float .search-box-wrapper');
  await page.locator('#nav-discover').click();
  await page.keyboard.press('Control+KeyK');
  await expect(page.locator('#search-input')).toBeFocused();
  await expect(wrap).toHaveClass(/\btb-open\b/);
  await page.locator('#search-input').fill('abc');
  await page.locator('#search-input').press('Escape');
  await expect(page.locator('#search-input')).toHaveValue('');
  await expect(wrap).not.toHaveClass(/\btb-open\b/);
});

test('dock buttons still work', async () => {
  // Now playing panel, full-screen lyrics and the audio editor are Riff's own.
  const panelOpen = () => page.evaluate(() => !document.getElementById('right-panel').classList.contains('hidden'));
  const before = await panelOpen();
  await page.locator('#btn-toggle-lyrics-panel').click();
  await expect.poll(panelOpen).toBe(!before);
  await page.locator('#btn-toggle-lyrics-panel').click();
  await expect.poll(panelOpen).toBe(before);
  const setPanel = async (open) => {
    if ((await panelOpen()) !== open) await page.locator('#btn-toggle-lyrics-panel').click();
    await expect.poll(panelOpen).toBe(open);
    await page.waitForTimeout(500);
  };
  // With the panel open, the dock stays centred in what's left of the page. Its slide is switched off:
  // a hidden test window (RIFF_HIDE_WINDOW) doesn't run CSS transitions, so it would never arrive.
  await page.addStyleTag({ content: '#tb body:not(.mini) #playbar#playbar { transition: none !important; }' });
  await setPanel(true);
  const box = await page.locator('#playbar').boundingBox();
  const col = await column();
  expect(col.right).toBeLessThan(await page.evaluate(() => innerWidth) - 100);
  expect(Math.abs((box.x - col.left) - (col.right - (box.x + box.width)))).toBeLessThan(2);
  // Closed, the panel leaves no strip: the page reaches the window's edge.
  await setPanel(false);
  await expect.poll(async () => Math.round((await column()).right)).toBe(await page.evaluate(() => innerWidth));
  await setPanel(before);
});

test('the search settings made obsolete by the search button are retired', async () => {
  await expect(page.locator('#setting-search-pos-row')).toBeHidden();
  await expect(page.locator('#btn-home-next-to-search')).toBeHidden();
});
