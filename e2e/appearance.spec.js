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

test('retired accent controls are hidden and Settings → Theme leads to Appearance', async () => {
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.tb-retired')].map((e) => getComputedStyle(e).display));
  // Stage 2 retired six theme controls; stage 3 adds Classic sidebar and the Home button picture.
  expect(hidden.length).toBeGreaterThanOrEqual(6);
  expect(new Set(hidden)).toEqual(new Set(['none']));
  // app.js still finds the controls it wires up.
  for (const id of ['slider-theme-intensity', 'slider-theme-hue', 'settings-custom-color-input', 'btn-intensity-bg']) {
    expect(await page.evaluate((i) => !!document.getElementById(i), id)).toBe(true);
  }
  // Stage 7: the accent and the rest moved to the Appearance sheet, which Settings → Theme opens.
  await expect(page.locator('#tb-setting-appearance')).toContainText('Appearance');
  await expect(page.locator('#tb-btn-open-appearance')).toHaveCount(1);
});

test('the Appearance sheet changes the accent, mode and text size, and saves themes', async () => {
  const look = () => page.evaluate(() => window.Tunebox.appearance.get());
  const before = await look();
  await page.evaluate(() => window.Tunebox.appearancePanel.open('general'));
  const sheet = page.locator('#tb-appearance');
  await expect(sheet).toBeVisible();

  // Accent: the purple swatch.
  await sheet.locator('.tb-swatch[title="Purple"]').click({ force: true });
  expect((await look()).accent).toBe('purple');
  await expect(sheet.locator('.tb-swatch[title="Purple"]')).toHaveClass(/\bon\b/);

  // Mode: Light, then back.
  await sheet.locator('.tb-segmented button', { hasText: 'Light' }).click({ force: true });
  expect((await look()).theme).toBe('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Text size: Interface at its smallest, then Reset.
  await sheet.locator('.tb-size-row input[type="range"]').first().evaluate((el) => {
    el.value = el.min;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect((await look()).textSizes.ui).toBeCloseTo(0.7);
  await sheet.locator('button', { hasText: 'Reset' }).click({ force: true });
  expect((await look()).textSizes.ui).toBe(1);

  // Themes: save the current look, see it listed, delete it.
  await sheet.locator('.tb-sheet-tabs button', { hasText: 'Themes' }).click({ force: true });
  await sheet.locator('.tb-theme-input').first().fill('Test Look', { force: true });
  await sheet.locator('button', { hasText: 'Save Current Look' }).click({ force: true });
  await expect(sheet.locator('.tb-theme-name', { hasText: 'Test Look' })).toHaveCount(1);
  await sheet.locator('.tb-theme-card', { hasText: 'Test Look' }).locator('button', { hasText: 'Delete' }).click({ force: true });
  await expect(sheet.locator('.tb-theme-name', { hasText: 'Test Look' })).toHaveCount(0);

  // Escape closes it; put the look back for the other tests.
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.evaluate((b) => window.Tunebox.appearance.set(b), before);
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

test('the Appearance Home tab puts a background behind Home', async () => {
  await page.evaluate(() => document.getElementById('nav-discover').click());
  await expect(page.locator('#view-discover')).toHaveClass(/\bactive\b/);
  await page.evaluate(() => window.Tunebox.appearancePanel.open('home'));
  const sheet = page.locator('#tb-appearance');
  await expect(sheet.locator('.tb-sheet-tabs button.on')).toHaveText('Home');
  const gradients = await page.evaluate(() => window.Tunebox.appearance.GRADIENTS.map((g) => g.label));
  expect(await sheet.locator('.tb-bg-tile > span:last-child').allTextContents()).toEqual(['None', ...gradients, 'Now Playing', 'My Picture']);
  await expect(sheet.locator('.tb-sheet-note', { hasText: 'Edit Home' })).toHaveCount(1);

  // A gradient: drawn under the whole page, the same size as it, and it stays put while Home scrolls.
  const bg = page.locator('#tb-home-bg');
  await sheet.locator('.tb-bg-tile').nth(1).click({ force: true });
  await expect(bg).toBeVisible();
  const rects = () => page.evaluate(() => {
    const r = (e) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); };
    return { bg: r(document.getElementById('tb-home-bg')), main: r(document.getElementById('main-content')) };
  });
  let r = await rects();
  expect(r.bg).toEqual(r.main);
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('main-content')).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await bg.locator('.tb-home-bg-layer').evaluate((e) => e.style.backgroundImage)).toContain('gradient');
  await page.evaluate(() => { document.getElementById('main-content').scrollTop = 300; });
  expect((await rects()).bg).toEqual(r.main);

  // My Picture: a chosen picture is stored and shown, faded by the Fade slider.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
  await sheet.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png });
  await expect.poll(() => page.evaluate(() => window.Tunebox.appearance.get().background)).toBe('custom');
  await expect(bg).toHaveClass(/\bphoto\b/);
  expect(await bg.locator('.tb-home-bg-layer').evaluate((e) => e.style.backgroundImage)).toContain('data:image/jpeg');
  await expect(sheet.locator('.tb-bg-tile[data-bg="custom"]')).toHaveClass(/\bon\b/);
  await sheet.locator('.tb-dim-control input').evaluate((i) => { i.value = '0.6'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await expect.poll(() => bg.locator('.tb-home-bg-dim').evaluate((e) => e.style.opacity)).toBe('0.6');

  // Other pages don't get it; None takes it away and gives the page its window colour back.
  await page.evaluate(() => document.getElementById('nav-queue').click());
  await expect(bg).toBeHidden();
  await page.evaluate(() => document.getElementById('nav-discover').click());
  await expect(bg).toBeVisible();
  await sheet.locator('.tb-bg-tile[data-bg="none"]').click({ force: true });
  await expect(bg).toBeHidden();
  expect(await page.evaluate(() => getComputedStyle(document.getElementById('main-content')).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await page.evaluate(() => window.Tunebox.appearancePanel.close());
});
