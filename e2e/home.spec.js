'use strict';

// Tunebox Home (stage 5): the greeting, the Now Playing / Jump Back In banner and the section views all
// drive Riff's own playback, settings and cards.

const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { launchRiff, closeRiff, stubOpenDialog, writeToneWav, audioState } = require('./helpers');

test.describe.configure({ mode: 'serial' });

let ctx;
let page;

test.beforeAll(async () => {
  ctx = await launchRiff({ seed: { riff_user_nickname: 'Test Person' } });
  page = ctx.page;
  const files = ['Alpha', 'Beta', 'Gamma'].map((n, i) => writeToneWav(path.join(ctx.profile.music, `${n}.wav`), { freq: 330 + i * 110 }));
  await stubOpenDialog(ctx.app, files);
});
test.afterAll(async () => closeRiff(ctx));

const hero = () => page.locator('#tb-hero');

test('the greeting uses the time of day and your first name', async () => {
  await page.locator('#nav-discover').click();
  await expect(page.locator('#tb-greeting-text')).toHaveText(/^(Good morning|Good afternoon|Good evening|Up late)$/);
  await expect(page.locator('#tb-greeting-name')).toHaveText(', Test');
});

test('the banner appears once a song is loaded, and follows the player', async () => {
  // (Riff's bundled defaults already include a last-played song, so the banner may show from the start.)
  await page.locator('#nav-local').click();
  await page.locator('#btn-add-local').click();
  await expect(page.locator('#local-tracks-list .track-row')).toHaveCount(3);
  await page.locator('#btn-play-local').click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  await page.locator('#nav-discover').click();
  await expect(hero()).toBeVisible();
  await expect(page.locator('#tb-hero-title')).toHaveText(await page.locator('#playbar-title').innerText());
  await expect(page.locator('#tb-hero-label')).toHaveText('Now Playing');
});

test("the banner's play button pauses and resumes", async () => {
  await page.locator('#tb-hero-play').click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(true);
  await expect(page.locator('#tb-hero-label')).toHaveText('Jump Back In');
  await page.locator('#tb-hero-play').click();
  await expect.poll(async () => (await audioState(page)).paused).toBe(false);
  await expect(page.locator('#tb-hero-label')).toHaveText('Now Playing');
});

test("clicking the banner's progress bar seeks", async () => {
  const bar = await page.locator('#tb-hero-progress .tb-hero-bar').boundingBox();
  await page.mouse.click(bar.x + bar.width * 0.6, bar.y + bar.height / 2);
  await expect.poll(async () => (await audioState(page)).time).toBeGreaterThan(15);
  // The fill follows.
  await expect.poll(() => page.locator('#tb-hero-fill').evaluate((el) => parseFloat(el.style.width))).toBeGreaterThan(45);
});

test('Up Next lists the queue and plays a song from it', async () => {
  const items = page.locator('#tb-hero-next-list .tb-hero-next-item');
  await expect(items).toHaveCount(2);
  const target = (await items.nth(1).locator('.tb-hero-next-title').innerText()).trim();
  await items.nth(1).click();
  await expect(page.locator('#playbar-title')).toHaveText(target);
  await expect(page.locator('#tb-hero-title')).toHaveText(target);
});

test('previous and next go through the queue', async () => {
  // Riff's Previous goes back through what played; Next moves on in the queue. The banner follows both.
  const before = await page.locator('#tb-hero-title').innerText();
  await page.locator('#tb-hero-prev').click();
  await expect(page.locator('#tb-hero-title')).not.toHaveText(before);
  await expect(page.locator('#tb-hero-title')).toHaveText(await page.locator('#playbar-title').innerText());
  const middle = await page.locator('#tb-hero-title').innerText();
  await page.locator('#tb-hero-next-btn').click();
  await expect(page.locator('#tb-hero-title')).not.toHaveText(middle);
  await expect(page.locator('#tb-hero-title')).toHaveText(await page.locator('#playbar-title').innerText());
});

test('Lyrics opens the now-playing panel', async () => {
  const open = () => page.evaluate(() => !document.getElementById('right-panel').classList.contains('hidden'));
  if (await open()) await page.locator('#btn-toggle-lyrics-panel').click();
  await expect.poll(open).toBe(false);
  await page.locator('#tb-hero-lyrics').click();
  await expect.poll(open).toBe(true);
});

test("Edit Home opens Riff's Home settings", async () => {
  await page.locator('#tb-btn-edit-home').click();
  await expect(page.locator('#view-settings')).toHaveClass(/\bactive\b/);
  await expect(page.locator('[data-adv="my_wave"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('#nav-discover').click();
});

test('sections switch between cover flow, grid and list, and remember it', async () => {
  // Stand-in cards (Riff fills this row from the internet), each recording its own click.
  await page.evaluate(() => {
    window.__cardClicks = [];
    const sec = document.getElementById('sp-trend-sec');
    sec.hidden = false;
    sec.style.display = '';
    const row = document.getElementById('sp-trend');
    row._lastHomeSig = 'test';
    row.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const card = document.createElement('div');
      card.className = 'sp-card';
      card.innerHTML = `<div class="sp-card-cover"></div><div class="sp-card-title sp-fade">Card ${i}</div><div class="sp-card-sub sp-fade">Sub ${i}</div>`;
      card.addEventListener('click', () => window.__cardClicks.push(i));
      row.appendChild(card);
    }
  });
  const section = page.locator('#sp-trend-sec');
  const cards = page.locator('#sp-trend > .sp-card');
  const clicks = () => page.evaluate(() => window.__cardClicks.slice());

  await expect(section).toHaveAttribute('data-view', 'flow');
  await expect(cards.nth(0)).toHaveClass(/\btb-flow-center\b/);
  await expect(page.locator('#sp-trend-sec .tb-flow-title')).toHaveText('Card 0');
  // A side cover comes to the middle without doing anything else… (sent straight to the card: the middle
  // of a far cover sits behind the nearer ones, as in any cover flow)
  await cards.nth(2).dispatchEvent('click');
  await expect(cards.nth(2)).toHaveClass(/\btb-flow-center\b/);
  await expect(page.locator('#sp-trend-sec .tb-flow-title')).toHaveText('Card 2');
  expect(await clicks()).toEqual([]);
  // …and the middle one does what Riff's card does.
  await cards.nth(2).click();
  expect(await clicks()).toEqual([2]);
  // Arrow keys move the flow.
  await page.locator('#sp-trend-sec .tb-flow-wrap').focus();
  await page.keyboard.press('ArrowRight');
  await expect(cards.nth(3)).toHaveClass(/\btb-flow-center\b/);

  await section.hover();
  await page.locator('#sp-trend-sec .tb-view-switch button[data-view="grid"]').click();
  await expect(section).toHaveAttribute('data-view', 'grid');
  await cards.nth(0).click();
  expect(await clicks()).toEqual([2, 0]);
  const gridCols = await page.locator('#sp-trend').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(gridCols).toBeGreaterThan(1);

  await page.locator('#sp-trend-sec .tb-view-switch button[data-view="list"]').click();
  await expect(section).toHaveAttribute('data-view', 'list');
  await cards.nth(4).click();
  expect(await clicks()).toEqual([2, 0, 4]);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('tunebox.homeViews')))).toMatchObject({ trend: 'list' });

  await page.locator('#sp-trend-sec .tb-view-switch button[data-view="flow"]').click();
  await expect(section).toHaveAttribute('data-view', 'flow');
});

test('Home uses the Tunebox page width and greeting style', async () => {
  const width = await page.locator('#view-discover').evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(1160.5);
  await expect(page.locator('.tb-greeting')).toHaveCSS('font-size', '26px');
  await expect(page.locator('#sp-quick-sec > h2')).toBeHidden();
});
