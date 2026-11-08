'use strict';

// Playback regression tests: the redesign must keep every one of these passing.
// They drive the real Electron app with two generated local tracks, so they need no network.

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff, stubOpenDialog, writeToneWav, audioState } = require('./helpers');

test.describe.configure({ mode: 'serial' });

let ctx;
let page;
const TRACKS = ['Alpha Tone', 'Beta Tone'];

const title = () => page.locator('#playbar-title').textContent().then((s) => s.trim());
const clickById = (id) => page.evaluate((i) => document.getElementById(i).click(), id);

async function expectPlaying() {
  await expect.poll(async () => (await audioState(page)).paused, { timeout: 15_000 }).toBe(false);
  const start = (await audioState(page)).time;
  await expect.poll(async () => (await audioState(page)).time, { timeout: 10_000 }).toBeGreaterThan(start + 0.3);
}

test.beforeAll(async () => {
  ctx = await launchRiff();
  page = ctx.page;
  const files = TRACKS.map((name, i) => writeToneWav(path.join(ctx.profile.music, `${name}.wav`), { freq: 440 + i * 220 }));
  await stubOpenDialog(ctx.app, files);
});

test.afterAll(async () => closeRiff(ctx));

test('imports local files through Add files', async () => {
  // Navigation goes through the element IDs app.js relies on, which the redesign keeps.
  await clickById('nav-local');
  await expect(page.locator('#view-local')).toHaveClass(/active/);
  await clickById('btn-add-local');
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(2);
  for (const name of TRACKS) await expect(page.locator('#local-tracks-list')).toContainText(name);
});

test('plays a track and shows it in the player bar', async () => {
  await page.locator('#btn-play-local').click();
  await expectPlaying();
  expect(TRACKS).toContain(await title());
  expect((await audioState(page)).src).toMatch(/\.wav$/);
  await expect(page.locator('#time-current')).not.toHaveText('0:00');
});

test('pauses and resumes', async () => {
  await page.locator('#btn-play-pause').click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(true);
  const pausedAt = (await audioState(page)).time;
  await page.waitForTimeout(800);
  expect((await audioState(page)).time).toBeCloseTo(pausedAt, 1);
  await page.locator('#btn-play-pause').click();
  await expectPlaying();
});

test('skips to the next and previous track', async () => {
  const first = await title();
  await page.locator('#btn-next').click();
  await expect.poll(title).not.toBe(first);
  const second = await title();
  expect(TRACKS).toContain(second);
  await expectPlaying();
  await page.locator('#btn-prev').click();
  await expect.poll(title).toBe(first);
  await expectPlaying();
});

test('seeks with the progress bar', async () => {
  const box = await page.locator('#scrubber-track').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(12);
  expect((await audioState(page)).time).toBeLessThan(20);
  await expectPlaying();
});

test('changes the volume', async () => {
  await page.evaluate(() => {
    const v = document.getElementById('volume-slider');
    v.value = '0.3';
    v.dispatchEvent(new Event('input', { bubbles: true }));
    v.dispatchEvent(new Event('change', { bubbles: true }));
  });
  // Riff applies a squared volume curve.
  await expect.poll(() => page.evaluate(() => document.getElementById('native-audio').volume)).toBeCloseTo(0.09, 2);
  await expectPlaying();
});

test('toggles shuffle and repeat', async () => {
  for (const id of ['#btn-shuffle', '#btn-repeat']) {
    const btn = page.locator(id);
    await btn.click();
    await expect(btn).toHaveClass(/\bactive\b/);
  }
  // Turn both off again: repeat cycles through its modes, so click until it is no longer active.
  await page.locator('#btn-shuffle').click();
  await expect(page.locator('#btn-shuffle')).not.toHaveClass(/\bactive\b/);
  for (let i = 0; i < 3 && /\bactive\b/.test(await page.locator('#btn-repeat').getAttribute('class')); i++) {
    await page.locator('#btn-repeat').click();
  }
  await expect(page.locator('#btn-repeat')).not.toHaveClass(/\bactive\b/);
});

test('moves on to the next track when one ends', async () => {
  const before = await title();
  await page.evaluate(() => { const a = document.getElementById('native-audio'); a.currentTime = a.duration - 0.5; });
  await expect.poll(title, { timeout: 15_000 }).not.toBe(before);
  await expectPlaying();
});

test('lists the playing tracks in the queue', async () => {
  await clickById('nav-queue');
  await expect(page.locator('#view-queue')).toHaveClass(/active/);
  for (const name of TRACKS) await expect(page.locator('#view-queue')).toContainText(name);
});

test('keeps the lyrics panel working', async () => {
  const panel = page.locator('#right-panel');
  const wasHidden = /\bhidden\b/.test(await panel.getAttribute('class'));
  await page.locator('#btn-toggle-lyrics-panel').click();
  await expect.poll(async () => /\bhidden\b/.test(await panel.getAttribute('class'))).toBe(!wasHidden);
  await page.locator('#btn-toggle-lyrics-panel').click();
  await expect.poll(async () => /\bhidden\b/.test(await panel.getAttribute('class'))).toBe(wasHidden);
  await expectPlaying();
});
