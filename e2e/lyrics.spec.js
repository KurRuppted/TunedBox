'use strict';

// Tunebox's lyrics and Focus mode (tunebox/lyrics-view.js, tunebox/focus.js) on Riff.
// Riff loads lyrics from the network, so these tests hand the Tunebox views a fixed set of timed lines
// through window.tbRiff.lyrics() (the bridge they read) and move Riff's <audio> to chosen times.

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff, stubOpenDialog, writeToneWav, audioState } = require('./helpers');

test.describe.configure({ mode: 'serial' });

let ctx;
let page;

test.beforeAll(async () => {
  ctx = await launchRiff();
  page = ctx.page;
  const files = ['Song', 'Next one', 'Third'].map((n, i) => writeToneWav(path.join(ctx.profile.music, `${n}.wav`), { seconds: 40, freq: 330 + i * 110 }));
  await stubOpenDialog(ctx.app, files);
  // DOM clicks: they work whether or not the page has finished switching (tests can run with the window hidden).
  const domClick = (id) => page.evaluate((i) => document.getElementById(i).click(), id);
  await domClick('nav-local');
  await domClick('btn-add-local');
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(3);
  await domClick('btn-play-local');
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  // Twelve lines, two seconds apart from 4s; line 5 has word timing, the rest are estimated.
  await page.evaluate(() => {
    const lines = [];
    for (let i = 0; i < 12; i++) {
      const start = 4000 + i * 2000;
      const text = i === 3 ? '' : `Line ${i} with some words`;
      const words = i === 5 ? text.split(' ').map((w, k) => ({ text: w, start: start + k * 300, end: start + k * 300 + 280 })) : null;
      lines.push({ start, next: start + 2000, text, words, translation: '' });
    }
    // Focus mode asks for full screen; a test window that's hidden can't take the keyboard once full screen.
    document.documentElement.requestFullscreen = () => Promise.resolve();
    window.__realLyrics = window.tbRiff.lyrics;
    window.tbRiff.lyrics = () => ({ kind: 'synced', lines, wordSynced: false, lineMode: false, lead: 0, key: 'test-lyrics' });
    const a = document.getElementById('native-audio');
    a.pause();
    a.currentTime = 14.7; // line 5, in its third word
  });
});
test.afterAll(async () => closeRiff(ctx));

// A key for Focus mode. A window kept hidden (RIFF_HIDE_WINDOW) doesn't reliably get key presses, so there the
// key is sent as a DOM event to the same listeners; with a real window it's a real key press.
const press = (key) => process.env.RIFF_HIDE_WINDOW === '1'
  ? page.evaluate((k) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : 'Key' + k.toUpperCase(), bubbles: true, cancelable: true })), key)
  : page.keyboard.press(key);

const at = (sec) => page.evaluate((s) => { document.getElementById('native-audio').currentTime = s; }, sec);

test('right panel shows Tunebox lyrics in place of Riff\'s', async () => {
  const panelOpen = () => page.evaluate(() => !document.getElementById('right-panel').classList.contains('hidden'));
  if (!(await panelOpen())) await page.locator('#btn-toggle-lyrics-panel').click({ force: true });
  await expect.poll(panelOpen).toBe(true);
  // Riff's default is "Show lyrics only in fullscreen mode"; lyrics show in the panel with it off.
  await page.evaluate(() => { document.body.classList.remove('lyrics-fullscreen-only'); document.getElementById('right-panel').classList.remove('lyrics-empty'); });

  const host = page.locator('#right-panel .lyrics-section.tb-lyrics-host');
  await expect(host.locator('.tb-lyrics')).toHaveCount(1);
  await expect(host.locator('#lyrics-container')).toBeHidden();
  await expect.poll(() => host.locator('.tb-lyric-line').count()).toBeGreaterThan(10);
  await expect(host.locator('.tb-lyric-line.tb-active')).toHaveText(/^Line 5 with/);

  const s = await page.evaluate(() => {
    const lines = [...document.querySelectorAll('#right-panel .tb-lyric-line')];
    const active = document.querySelector('#right-panel .tb-lyric-line.tb-active');
    const cs = (e) => getComputedStyle(e);
    const words = [...active.querySelectorAll('.tb-lyric-word')].map((w) => Number(w.style.getPropertyValue('--p') || 0));
    const neighbour = lines[lines.indexOf(active) + 1];
    return {
      activeText: active.textContent.trim(),
      words,
      gap: !!document.querySelector('#right-panel .tb-lyric-line.tb-gap .tb-lyric-dots'),
      far: document.querySelectorAll('#right-panel .tb-lyric-line.tb-far').length,
      neighbourTransform: cs(neighbour).transform,
      font: cs(active).fontFamily,
      size: parseFloat(cs(active).fontSize),
      lineTiming: (document.querySelector('#right-panel .tb-lyrics-source') || {}).textContent,
      speed: (document.querySelectorAll('#right-panel .tb-lyrics-offset')[0] || {}).textContent,
      timing: (document.querySelectorAll('#right-panel .tb-lyrics-offset')[1] || {}).textContent,
    };
  });
  // The intro and the blank line become instrumental breaks; line 5 is being sung, word by word.
  expect(s.activeText).toBe('Line 5 with some words');
  expect(s.words[0]).toBe(1);
  expect(s.words[1]).toBe(1);
  expect(s.words[2]).toBeGreaterThan(0);
  expect(s.words[2]).toBeLessThan(1);
  expect(s.words[4]).toBe(0);
  expect(s.gap).toBe(true);
  // The 3D wheel: lines around the sung one tilt away; only three either side show.
  expect(s.neighbourTransform).toMatch(/^matrix3d/);
  expect(s.far).toBeGreaterThan(0);
  expect(s.font).toContain('Inter');
  expect(s.size).toBe(24);
  expect(s.lineTiming).toBe('Line timing');
  expect(s.speed).toBe('100%');
  expect(s.timing).toBe('In sync');

  // Clicking a line jumps there.
  // A DOM click: the lines are still sliding into place, so a click at a point can land on the wrong one.
  await page.locator('#right-panel .tb-lyric-line', { hasText: 'Line 8 with' }).evaluate((e) => e.click());
  await expect.poll(() => page.evaluate(() => Math.round(document.getElementById('native-audio').currentTime))).toBe(20);
  await at(14.7);
});

const focus = page => page.locator('.tb-focus');
const layoutOf = () => page.evaluate(() => window.Tunebox.focus.layout());

test('the full-screen lyrics button opens Tunebox Focus mode on Stage', async () => {
  await page.evaluate(() => localStorage.removeItem('tunebox.focusLayout'));
  await page.locator('#btn-playbar-karaoke').click({ force: true });
  await expect(focus(page)).toHaveCount(1);
  // Riff's own karaoke screen stays closed; its button shows Focus as open.
  await expect(page.locator('#tv-karaoke')).toBeHidden();
  await expect(page.locator('#btn-playbar-karaoke')).toHaveClass(/\bactive\b/);
  expect(await layoutOf()).toBe('stage');

  const chips = await page.locator('.tb-focus-top .tb-focus-chip').allInnerTexts();
  // Stage has Tunebox's own chips; Riff's lyric tools appear in the layouts that show lyrics.
  expect(chips.map((c) => c.replace(/\s+/g, ' ').trim())).toEqual(['Stage L', 'Customize', 'Exit Esc']);
  // Tunebox's frosted chips (Riff's button styles don't leak in).
  const chip = await page.locator('.tb-focus-chip').first().evaluate((e) => { const c = getComputedStyle(e); return { pad: c.paddingLeft, bg: c.backgroundColor, size: c.fontSize }; });
  expect(chip.pad).toBe('12px');
  expect(chip.bg).toBe('rgba(255, 255, 255, 0.08)');
  expect(chip.size).toBe('12.5px');

  // Stage: the art, clock, the phrase being sung, the Playing Next wall, the edge equalizer, the dock.
  const stage = page.locator('.tb-stage');
  // The test songs have no cover, so there's no art layer (as in Tunebox); the vignette is still there.
  await expect(stage.locator('.tb-stage-art')).toHaveCount((await page.evaluate(() => window.tbRiff.current().thumb)) ? 1 : 0);
  await expect(stage.locator('.tb-stage-vignette')).toHaveCount(1);
  await expect(stage.locator('.tb-stage-time')).not.toHaveText('');
  await expect.poll(() => stage.locator('.tb-stage-phrase:not(.tb-exiting) .tb-stage-word').count()).toBe(5);
  expect(await stage.locator('.tb-stage-phrase:not(.tb-exiting) .tb-stage-word.tb-shown').count()).toBe(3);
  await expect(stage.locator('.tb-stage-word.tb-gold')).toHaveCount(1);
  await expect(stage.locator('.tb-stage-list-item.tb-current .tb-stage-list-title')).toHaveText('Song');
  await expect(stage.locator('button.tb-stage-list-item')).toHaveCount(2);
  await expect(stage.locator('canvas.tb-stage-eq-bars')).toHaveCount(1);
  await expect(stage.locator('.tb-stage-frame i')).toHaveCount(44);
  await expect(page.locator('.tb-focus-dock')).toHaveCount(1);
});

test('Customize on Stage opens Tunebox\'s Stage settings', async () => {
  await page.locator('.tb-focus-chip', { hasText: 'Customize' }).click({ force: true });
  const sheet = page.locator('#tb-appearance');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.tb-sheet-tabs button.on')).toHaveText('Stage');
  await expect(sheet.locator('.tb-eq-live canvas')).toHaveCount(2);
  await sheet.locator('.tb-segmented button', { hasText: 'Wave' }).click({ force: true });
  await sheet.locator('.tb-bg-tile', { hasText: 'Album Colors' }).click({ force: true });
  expect(await page.evaluate(() => { const l = window.Tunebox.appearance.get(); return [l.eqStyle, l.eqMode]; })).toEqual(['wave', 'artwork']);
  // Esc closes just the sheet, not Focus mode.
  await press('Escape');
  await expect(sheet).toBeHidden();
  await expect(page.locator('.tb-focus')).toHaveCount(1);
  await page.evaluate(() => window.Tunebox.appearance.set({ eqStyle: 'bars', eqMode: 'rainbow' }));
});

test('L cycles the layouts and they keep Tunebox\'s pieces', async () => {
  await press('l');
  expect(await layoutOf()).toBe('split');
  await expect(page.locator('.tb-focus-layout .tb-focus-stage .tb-focus-cover, .tb-focus-layout .tb-focus-stage .tb-art-placeholder')).toHaveCount(1);
  await expect(page.locator('.tb-focus-layout .tb-focus-lyrics .tb-lyric-line.tb-active')).toHaveText(/Line 5/);
  await expect(page.locator('.tb-focus-clock')).toBeVisible();
  // Riff's lyric tools join the chips where lyrics show.
  const chips = (await page.locator('.tb-focus-top .tb-focus-chip').allInnerTexts()).map((c) => c.replace(/\s+/g, ' ').trim());
  expect(chips).toEqual(expect.arrayContaining(['Edit', 'Sync', 'Customize', 'Cover + lyrics L', 'Exit Esc']));
  expect(chips).toContain((await page.locator('#btn-lyrics-mode').innerText()).trim());

  await press('l');
  expect(await layoutOf()).toBe('lyrics');
  await expect(page.locator('.tb-lyrics.tb-focus-lyrics-full.tb-center')).toHaveCount(1);
  expect(parseFloat(await page.locator('.tb-focus-lyrics-full .tb-lyric-line.tb-active').evaluate((e) => getComputedStyle(e).fontSize))).toBe(54);
  await expect(page.locator('.tb-focus-dock')).toHaveCount(1);

  await press('l');
  expect(await layoutOf()).toBe('cover');
  await expect(page.locator('.tb-focus-layout .tb-focus-lyrics')).toHaveCount(0);
  await expect(page.locator('.tb-focus-controls')).toHaveCount(1);

  await press('l');
  expect(await layoutOf()).toBe('stage');
  expect(await page.evaluate(() => localStorage.getItem('tunebox.focusLayout'))).toBe('stage');
});

test('Customize opens Riff\'s lyric settings as a Tunebox sheet', async () => {
  await press('l'); // Cover + lyrics
  await page.locator('.tb-focus-chip[data-tb-customize]').click({ force: true });
  const sheet = page.locator('.tb-focus #tvk-panel');
  await expect(sheet).toHaveClass(/\bopen\b/);
  // Only the settings that change these lyrics.
  await expect(sheet.locator('#tvk-size')).toBeAttached();
  await expect(sheet.locator('#tvk-anim-group')).toBeHidden();
  await press('Escape'); // closes the sheet first
  await expect(sheet).not.toHaveClass(/\bopen\b/);
  await expect(focus(page)).toHaveCount(1);
});

test('Esc leaves Focus mode and hands everything back to Riff', async () => {
  await press('Escape');
  await expect(focus(page)).toHaveCount(0);
  await expect(page.locator('#btn-playbar-karaoke')).not.toHaveClass(/\bactive\b/);
  // The Customize sheet goes back to Riff's karaoke screen.
  await expect(page.locator('#tv-karaoke #tvk-panel')).toHaveCount(1);
  // The same button opens it again.
  await page.locator('#btn-playbar-karaoke').click({ force: true });
  await expect(focus(page)).toHaveCount(1);
  await page.locator('.tb-focus-chip', { hasText: 'Exit' }).click({ force: true });
  await expect(focus(page)).toHaveCount(0);
  await page.evaluate(() => { window.tbRiff.lyrics = window.__realLyrics; });
});
