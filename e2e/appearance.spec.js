'use strict';

// Tunebox appearance inside Riff: the Settings → Theme toggle drives the Tunebox mode, retired Riff
// theme controls stay hidden, and the theme fonts are bundled.

const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff } = require('./helpers');

test.describe.configure({ mode: 'serial' });

let ctx;
let page;

test.beforeAll(async () => {
  ctx = await launchRiff();
  page = ctx.page;
  await page.evaluate(() => document.getElementById('nav-settings').click());
  await page.evaluate(() => document.querySelector('.settings-nav-btn[data-cat="theme"], [data-cat="theme"].settings-nav-btn')?.click());
});

test.afterAll(async () => closeRiff(ctx));

const htmlTheme = () => page.evaluate(() => document.documentElement.dataset.theme);
const clickMode = (mode) => page.evaluate((m) => document.querySelector(`.theme-mode-btn[data-theme-mode="${m}"]`).click(), mode);
const activeModes = () => page.evaluate(() =>
  [...document.querySelectorAll('.theme-mode-btn[data-theme-mode]')].filter((b) => b.classList.contains('active')).map((b) => b.dataset.themeMode));

test('opens dark by default', async () => {
  expect(await htmlTheme()).toBe('dark');
  expect(await activeModes()).toEqual(['dark']);
});

test('the Settings toggle switches the Tunebox theme', async () => {
  await clickMode('light');
  await expect.poll(htmlTheme).toBe('light');
  expect(await page.evaluate(() => window.Tunebox.appearance.get().theme)).toBe('light');
  expect(await page.evaluate(() => document.body.getAttribute('data-theme'))).toBe('light');
  expect(await activeModes()).toEqual(['light']);

  await clickMode('system');
  expect(await page.evaluate(() => window.Tunebox.appearance.get().theme)).toBe('system');
  const systemDark = await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches);
  await expect.poll(htmlTheme).toBe(systemDark ? 'dark' : 'light');
  expect(await activeModes()).toEqual(['system']);

  await clickMode('dark');
  await expect.poll(htmlTheme).toBe('dark');
  expect(await activeModes()).toEqual(['dark']);
});

test('retired accent controls are hidden and the notice is shown', async () => {
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.tb-retired')].map((e) => getComputedStyle(e).display));
  expect(hidden.length).toBe(6);
  expect(new Set(hidden)).toEqual(new Set(['none']));
  // app.js still finds the controls it wires up.
  for (const id of ['slider-theme-intensity', 'slider-theme-hue', 'settings-custom-color-input', 'btn-intensity-bg']) {
    expect(await page.evaluate((i) => !!document.getElementById(i), id)).toBe(true);
  }
  await expect(page.locator('.tb-appearance-notice')).toContainText('Appearance panel');
});

test('Paper and Neon theme fonts are bundled', async () => {
  const loaded = await page.evaluate(async () => {
    await Promise.all(['400 16px "Fraunces Variable"', 'italic 400 16px "Fraunces Variable"', '600 16px "Oswald Variable"', '600 16px "Inter Variable"']
      .map((f) => document.fonts.load(f, 'Tunebox')));
    return ['400 16px "Fraunces Variable"', 'italic 400 16px "Fraunces Variable"', '600 16px "Oswald Variable"', '600 16px "Inter Variable"']
      .map((f) => document.fonts.check(f, 'Tunebox'));
  });
  expect(loaded).toEqual([true, true, true, true]);
});

test('applying the Paper and Neon themes switches the font', async () => {
  const fontFor = (id) => page.evaluate((presetId) => {
    const t = window.Tunebox.themes.PRESETS.find((p) => p.id === presetId);
    window.Tunebox.themes.apply(t);
    return getComputedStyle(document.body).fontFamily;
  }, id);
  expect(await fontFor('paper')).toContain('Fraunces Variable');
  expect(await fontFor('neon')).toContain('Oswald Variable');
  expect(await fontFor('tunebox')).toContain('Inter Variable');
  await expect.poll(htmlTheme).toBe('dark');
});
