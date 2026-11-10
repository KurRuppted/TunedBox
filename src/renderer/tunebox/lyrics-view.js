/* Tunebox's synced lyrics view (tunebox-design/4-now-playing: components/Lyrics.tsx, lib/lrc.ts and
   lib/lyricStyle.ts), ported to plain JS for Riff.
   The lyrics come from Riff (window.tbRiff.lyrics(): its loaded lines, word timing and translations) and the
   time from Riff's <audio>. Tunebox draws them: a 3D wheel of lines, each word revealed left to right as it's
   sung, instrumental breaks as three dots, and timing controls that appear on hover.

   Tunebox.lyricsView.create(host, { align: 'left' | 'center', className }) → { el, destroy() }
   Tunebox.lyricsView.offset / .speed: the shared timing settings (Timing −/+ and Word speed −/+). */
(function () {
  'use strict';

  const BROWSE_MS = 3000;
  const INTRO_MIN_MS = 3000;
  const GAP_MIN_MS = 2500;
  const LONG_BREAK_MS = 5000;
  const SCROLL_MS = 650;
  const OFFSET_STEP_MS = 250;
  const SPEED_STEP = 0.1;
  const SPEED_RANGE = [0.5, 2];
  const OFFSET_KEY = 'tunebox.lyricsOffset';
  const SPEED_KEY = 'tunebox.wordSpeed';

  const riff = () => window.tbRiff || null;
  const look = () => (window.Tunebox && window.Tunebox.appearance ? window.Tunebox.appearance.get() : {});
  const audio = () => document.getElementById('native-audio');

  // ---------- Settings shared by every lyrics view (lib/lyrics.ts: lyricsOffset, wordSpeed) ----------
  const listeners = new Set();
  const readNum = (key, fallback) => { try { const v = Number(localStorage.getItem(key)); return Number.isFinite(v) && localStorage.getItem(key) !== null ? v : fallback; } catch (e) { return fallback; } };
  const settings = {
    offset: readNum(OFFSET_KEY, 0),
    speed: Math.min(SPEED_RANGE[1], Math.max(SPEED_RANGE[0], readNum(SPEED_KEY, 1)))
  };
  function setSetting(name, value) {
    if (name === 'speed') value = Math.round(Math.min(SPEED_RANGE[1], Math.max(SPEED_RANGE[0], value)) * 100) / 100;
    if (name === 'offset') value = Math.round(value);
    settings[name] = value;
    try { localStorage.setItem(name === 'speed' ? SPEED_KEY : OFFSET_KEY, String(value)); } catch (e) { /* applies until the app closes */ }
    listeners.forEach((l) => l(name));
  }

  // [ and ] move the lyrics earlier/later, , and . slow down/speed up the words (Lyrics.tsx SyncKeys).
  // Only while a view is showing synced lyrics.
  let keyUsers = 0;
  window.addEventListener('keydown', (e) => {
    if (!keyUsers) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t && t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '[') setSetting('offset', settings.offset - OFFSET_STEP_MS);
    else if (e.key === ']') setSetting('offset', settings.offset + OFFSET_STEP_MS);
    else if (e.key === ',') setSetting('speed', settings.speed - SPEED_STEP);
    else if (e.key === '.') setSetting('speed', settings.speed + SPEED_STEP);
  });

  // ---------- lib/lrc.ts ----------
  const MS_PER_UNIT = 230;
  const LAST_WORD_HOLD = 1.2;
  const GAP_USE = 0.9;
  const LINE_LEAD_MS = 150;
  const MIN_LINE_MS = 300;

  function syllables(word) {
    const latin = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!latin) return Math.max(1, [...word.replace(/[\s\p{P}]/gu, '')].length / 2);
    let count = (latin.match(/[aeiouy]+/g) || []).length;
    if (count > 1 && latin.endsWith('e') && !latin.endsWith('le')) count--;
    return Math.max(1, count);
  }
  const weight = (token) => syllables(token) + 0.35 + (/[,;:.!?…]$/.test(token) ? 0.3 : 0);

  /** Spread a line's words over its time slot, giving longer words more time. */
  function estimateWords(text, start, next, speed = 1) {
    const tokens = text.split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const weights = tokens.map(weight);
    weights[weights.length - 1] += LAST_WORD_HOLD;
    const total = weights.reduce((a, b) => a + b, 0);
    const gap = Math.max(0, next - start);
    const natural = (total * MS_PER_UNIT) / speed + LINE_LEAD_MS;
    const span = Math.max(Math.min(gap * GAP_USE, natural), Math.min(gap, MIN_LINE_MS));
    let t = start;
    return tokens.map((tok, i) => {
      const duration = (weights[i] / total) * span;
      const word = { text: tok, start: t, end: t + duration };
      t += duration;
      return word;
    });
  }

  const clamp01 = (n) => Math.min(1, Math.max(0, n));
  const wordProgress = (w, t) => clamp01((t - w.start) / Math.max(1, w.end - w.start));

  /** Index of the line playing at time t, or -1 before the first line. */
  function findLine(lines, t) {
    let lo = 0, hi = lines.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lines[mid].start <= t) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return found;
  }

  /** Riff's lines → Tunebox lines: word timing from Riff when it has it, otherwise estimated. */
  function toLines(data, speed) {
    return data.lines.map((l) => {
      const words = !l.text ? [] : (l.words && l.words.length ? l.words : estimateWords(l.text, l.start, l.next, speed));
      return { start: l.start, end: words.length ? words[words.length - 1].end : l.start, text: l.text, words, translation: l.translation };
    });
  }

  const gapLine = (start, gapEnd) => ({ start, end: start, text: '', words: [], gapEnd });

  /** Turns blank lines, the intro and long silences into "instrumental" lines, dropping ones too short to show. */
  function withGaps(lines) {
    const out = [];
    const first = lines.find((l) => l.words.length);
    if (first && first.start > INTRO_MIN_MS) out.push(gapLine(0, first.start));
    lines.forEach((line, i) => {
      const next = lines[i + 1];
      if (!line.words.length) {
        const end = next ? next.start : line.start;
        if (end - line.start >= GAP_MIN_MS && out[out.length - 1] && out[out.length - 1].words.length) out.push(gapLine(line.start, end));
        return;
      }
      out.push(line);
      if (next && next.words.length && next.start - line.end > LONG_BREAK_MS) out.push(gapLine(line.end + 400, next.start));
    });
    return out;
  }

  // ---------- lib/lyricStyle.ts: the lyric font and colours from Appearance ----------
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  function colorVars(c) {
    return {
      '--lyric-sung': c.sung,
      '--lyric-unsung': `color-mix(in srgb, ${c.unsung} 38%, transparent)`,
      '--lyric-glow': c.sung,
      '--lyric-hl-1': `color-mix(in srgb, ${c.highlight} 30%, white)`,
      '--lyric-hl-2': `color-mix(in srgb, ${c.highlight} 80%, white)`,
      '--lyric-hl-3': `color-mix(in srgb, ${c.highlight} 80%, black)`,
      '--lyric-hl-4': `color-mix(in srgb, ${c.highlight} 45%, white)`,
      '--lyric-hl-glow': c.highlight
    };
  }
  function albumColors(colors) {
    const main = colors[0];
    const second = colors[1] || colors[0];
    const tint = (c, k) => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
    return { sung: hex(tint(main, 0.55)), unsung: hex(tint(main, 0.35)), highlight: hex(second) };
  }
  const albumCache = new Map();
  /** { vars, customFont } for the current look; `art` is the cover (for Album colours); `onReady` reruns once they're known. */
  function lyricStyle(art, onReady) {
    const lk = look();
    const app = window.Tunebox && window.Tunebox.appearance;
    const vars = {};
    const customFont = lk.lyricFont && lk.lyricFont !== 'default' && !(lk.lyricFont === 'custom' && !(lk.lyricCustomFont || '').trim());
    if (customFont && app) vars['--lyric-font'] = app.stackFor(lk.lyricFont, lk.lyricCustomFont);
    if (lk.lyricColorMode === 'custom' && lk.lyricColors) Object.assign(vars, colorVars(lk.lyricColors));
    else if (lk.lyricColorMode === 'album' && art && app && app.coverColors) {
      if (albumCache.has(art)) { const c = albumCache.get(art); if (c) Object.assign(vars, colorVars(c)); }
      else {
        albumCache.set(art, null);
        app.coverColors(art).then((c) => { albumCache.set(art, c && c.length ? albumColors(c) : null); if (onReady) onReady(); }, () => {});
      }
    }
    return { vars, customFont: !!customFont };
  }
  const STYLE_VARS = ['--lyric-font', '--lyric-sung', '--lyric-unsung', '--lyric-glow', '--lyric-hl-1', '--lyric-hl-2', '--lyric-hl-3', '--lyric-hl-4', '--lyric-hl-glow'];
  function applyVars(el, vars) {
    STYLE_VARS.forEach((k) => { if (!(k in vars)) el.style.removeProperty(k); });
    Object.keys(vars).forEach((k) => el.style.setProperty(k, vars[k]));
  }

  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  // ---------- The view ----------
  function create(host, opts = {}) {
    const align = opts.align || 'left';
    const root = make('div', 'tb-lyrics' + (opts.className ? ' ' + opts.className : ''));
    host.appendChild(root);
    let alive = true;
    let key = null;
    let data = null;
    let display = [];
    let lineEls = [], wordEls = [], dotEls = [];
    let scrollEl = null;
    let active = -2;
    let browsing = false;
    let browseTimer = 0;
    let frame = 0;
    let scrollFrame = 0;
    let poll = 0;
    let synced = false;
    let art = '';

    // Look: lyric font/colours and the wheel settings (Lyrics.tsx `wheel`).
    function applyLook() {
      const lk = look();
      const wa = lk.wheelAlign || 'auto';
      const centred = wa === 'auto' ? align === 'center' : wa === 'center';
      root.classList.toggle('tb-center', centred);
      const cur = riff() && riff().current();
      art = (cur && cur.thumb) || '';
      applyVars(root, lyricStyle(art, () => alive && applyLook()).vars);
      const tilt = lk.wheelTilt == null ? 1 : lk.wheelTilt;
      root.style.setProperty('--wheel-blur', `${0.8 * (lk.wheelBlur == null ? 1 : lk.wheelBlur)}px`);
      root.style.setProperty('--wheel-tilt', `${13 * tilt}deg`);
      root.style.setProperty('--wheel-depth', `${45 * tilt}px`);
      root.style.setProperty('--wheel-space', String(lk.wheelSpacing == null ? 1 : lk.wheelSpacing));
      root.style.setProperty('--wheel-fade', (0.55 / ((lk.wheelLines || 3) + 0.4)).toFixed(3));
      if (opts.onLook) opts.onLook(root);
    }
    const visible = () => look().wheelLines || 3;

    function status(text) {
      root.appendChild(make('p', 'tb-lyrics-status', text));
    }

    function build() {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(scrollFrame);
      root.textContent = '';
      lineEls = []; wordEls = []; dotEls = []; scrollEl = null; active = -2; display = [];
      if (synced) { keyUsers--; synced = false; }
      if (!data || data.kind === 'none') {
        status(riff() && riff().current() ? 'No lyrics for this song' : 'Nothing playing');
      } else if (data.kind === 'loading') status('Finding lyrics…');
      else if (data.kind === 'plain') {
        scrollEl = make('div', 'tb-lyrics-scroll');
        data.text.split('\n').forEach((l) => scrollEl.appendChild(make('p', 'tb-lyric-line tb-plain', l || ' ')));
        root.appendChild(scrollEl);
      } else if (data.kind === 'synced') {
        buildSynced();
        buildSyncBar();
        synced = true;
        keyUsers++;
        frame = requestAnimationFrame(tick);
      }
      root.classList.toggle('tb-has-lyrics', !!data && (data.kind === 'synced' || data.kind === 'plain'));
      if (opts.onState) opts.onState(data ? data.kind : 'none');
    }

    function buildSynced() {
      display = withGaps(toLines(data, settings.speed));
      scrollEl = make('div', 'tb-lyrics-scroll');
      scrollEl.addEventListener('wheel', onBrowse, { passive: true });
      display.forEach((line, li) => {
        const lineEl = make('div', 'tb-lyric-line' + (line.words.length ? '' : ' tb-gap'));
        lineEl.addEventListener('click', () => riff() && riff().seek(Math.max(0, line.start - settings.offset - (data.lead || 0))));
        if (!line.words.length) {
          const dots = make('span', 'tb-lyric-dots');
          for (let i = 0; i < 3; i++) { const d = make('i'); d.style.setProperty('--i', String(i)); dots.appendChild(d); }
          dotEls[li] = dots;
          lineEl.appendChild(dots);
        } else {
          wordEls[li] = line.words.map((w, wi) => {
            const span = make('span', 'tb-lyric-word', w.text);
            span.dataset.text = w.text;
            lineEl.appendChild(span);
            if (wi < line.words.length - 1) lineEl.appendChild(document.createTextNode(' '));
            return span;
          });
          if (line.translation) lineEl.appendChild(make('div', 'tb-lyric-translation', line.translation));
        }
        lineEls[li] = lineEl;
        scrollEl.appendChild(lineEl);
      });
      root.appendChild(scrollEl);
      setActive(-1);
    }

    // The hover controls under the lyrics: "Line timing" when words are estimated, Word speed, Timing.
    let offsetLabel = null, speedLabel = null;
    function buildSyncBar() {
      const bar = make('div', 'tb-lyrics-sync tb-fades');
      const btn = (title, text, fn) => { const b = make('button', '', text); b.type = 'button'; b.title = title; b.addEventListener('click', fn); return b; };
      if (!data.wordSynced) {
        const src = make('span', 'tb-lyrics-source', 'Line timing');
        src.title = 'Only line timing is available for this song, so the words in each line are estimated.';
        bar.appendChild(src);
        const g = make('span', 'tb-sync-group');
        g.append(make('span', '', 'Word speed'),
          btn('Words slower  ,', '−', () => setSetting('speed', settings.speed - SPEED_STEP)),
          speedLabel = make('span', 'tb-lyrics-offset'),
          btn('Words faster  .', '+', () => setSetting('speed', settings.speed + SPEED_STEP)));
        bar.appendChild(g);
      } else speedLabel = null;
      const g = make('span', 'tb-sync-group');
      g.append(make('span', '', 'Timing'),
        btn('Lyrics later  [', '−', () => setSetting('offset', settings.offset - OFFSET_STEP_MS)),
        offsetLabel = make('span', 'tb-lyrics-offset'),
        btn('Lyrics earlier  ]', '+', () => setSetting('offset', settings.offset + OFFSET_STEP_MS)));
      bar.appendChild(g);
      root.appendChild(bar);
      labels();
    }
    function labels() {
      if (offsetLabel) offsetLabel.textContent = settings.offset === 0 ? 'In sync' : `${settings.offset > 0 ? '+' : ''}${(settings.offset / 1000).toFixed(1)}s`;
      if (speedLabel) speedLabel.textContent = `${Math.round(settings.speed * 100)}%`;
    }

    // Classes and --d/--s for every line, as SyncedLyrics renders them when the sung line changes.
    function setActive(index) {
      if (index === active) return;
      const prev = active;
      if (wordEls[prev]) wordEls[prev].forEach((w) => w.style.removeProperty('--p'));
      if (dotEls[prev]) dotEls[prev].style.removeProperty('--p');
      active = index;
      const shown = visible();
      const hideDistance = shown + 1, maxDistance = shown + 1;
      const focus = Math.max(0, active);
      lineEls.forEach((el, li) => {
        const dist = Math.max(-maxDistance, Math.min(maxDistance, li - focus));
        el.classList.toggle('tb-active', li === active);
        el.classList.toggle('tb-past', li < active);
        el.classList.toggle('tb-far', Math.abs(li - focus) >= hideDistance);
        el.style.setProperty('--d', String(Math.abs(dist)));
        el.style.setProperty('--s', String(dist));
      });
      if (!browsing) scrollToActive();
    }
    function scrollToActive() {
      const el = lineEls[Math.max(0, active)];
      if (!scrollEl || !el) return;
      easedScroll(el.offsetTop - scrollEl.clientHeight * 0.4 + el.offsetHeight / 2);
    }
    function easedScroll(top) {
      cancelAnimationFrame(scrollFrame);
      const box = scrollEl;
      const from = box.scrollTop;
      const distance = top - from;
      if (Math.abs(distance) < 1) return;
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / SCROLL_MS);
        box.scrollTop = from + distance * (1 - Math.pow(1 - k, 3));
        if (k < 1) scrollFrame = requestAnimationFrame(step);
      };
      scrollFrame = requestAnimationFrame(step);
    }
    function onBrowse() {
      browsing = true;
      if (scrollEl) scrollEl.classList.add('tb-browsing');
      cancelAnimationFrame(scrollFrame);
      clearTimeout(browseTimer);
      browseTimer = setTimeout(() => {
        browsing = false;
        if (scrollEl) scrollEl.classList.remove('tb-browsing');
        scrollToActive();
      }, BROWSE_MS);
    }

    // Progress is written straight to the DOM every frame.
    function tick() {
      if (!alive) return;
      const a = audio();
      // Hidden (the panel closed, lyrics only in full screen): nothing to draw.
      if (!root.offsetParent) { frame = requestAnimationFrame(tick); return; }
      if (a && display.length) {
        const t = (a.currentTime || 0) * 1000 + settings.offset + (data.lead || 0);
        const index = findLine(display, t);
        if (index !== active) setActive(index);
        const line = display[index];
        if (line && line.words.length) {
          const els = wordEls[index];
          line.words.forEach((w, i) => { if (els && els[i]) els[i].style.setProperty('--p', (data.lineMode ? 1 : wordProgress(w, t)).toFixed(3)); });
        } else if (line && line.gapEnd) {
          const p = clamp01((t - line.start) / Math.max(1, line.gapEnd - line.start));
          if (dotEls[index]) dotEls[index].style.setProperty('--p', p.toFixed(3));
        }
      }
      frame = requestAnimationFrame(tick);
    }

    // Rebuild when Riff's lyrics change (new song, word timing arriving, translations, Word/Line mode).
    function check() {
      const r = riff();
      const next = r && r.lyrics ? r.lyrics() : null;
      const nextKey = next ? next.key + '|' + (next.kind === 'synced' ? '' : next.kind) : 'none';
      const cur = r && r.current();
      if ((cur && cur.thumb || '') !== art) applyLook();
      if (nextKey === key) return;
      key = nextKey;
      data = next;
      build();
    }

    const onSetting = (name) => {
      labels();
      // A new word speed re-times the estimated words.
      if (name === 'speed' && data && data.kind === 'synced' && !data.wordSynced) { build(); }
    };
    listeners.add(onSetting);
    const unsubscribe = window.Tunebox && window.Tunebox.appearance ? window.Tunebox.appearance.subscribe(() => {
      applyLook();
      if (active >= 0) { const a = active; active = -2; setActive(a); }
    }) : () => {};

    applyLook();
    check();
    poll = setInterval(check, 400);

    return {
      el: root,
      refresh: () => { applyLook(); key = null; check(); },
      destroy() {
        alive = false;
        clearInterval(poll);
        clearTimeout(browseTimer);
        cancelAnimationFrame(frame);
        cancelAnimationFrame(scrollFrame);
        listeners.delete(onSetting);
        unsubscribe();
        if (synced) keyUsers--;
        root.remove();
      }
    };
  }

  // The right panel's lyrics: Tunebox's view in place of Riff's (Riff's container stays, hidden, and keeps working).
  function mountPanel() {
    const section = document.querySelector('#right-panel .lyrics-section');
    if (!section || section.classList.contains('tb-lyrics-host')) return;
    section.classList.add('tb-lyrics-host');
    create(section, { align: 'left', className: 'tb-panel-lyrics' });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
  else mountPanel();

  window.Tunebox = Object.assign(window.Tunebox || {}, {
    lyricsView: {
      create,
      findLine,
      estimateWords,
      wordProgress,
      lines: (data) => withGaps(toLines(data, settings.speed)),
      rawLines: (data) => toLines(data, settings.speed),
      get offset() { return settings.offset; },
      get speed() { return settings.speed; },
      lyricStyle
    }
  });
})();
