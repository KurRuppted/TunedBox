/* Tunebox Home behaviour (stage 5). Loaded after app.js. Riff still builds Home's content and does all
   the playing; this adds Tunebox's pieces around it:
   - the greeting, with Edit Home and appearance buttons (they open Riff's matching settings)
   - the "Now Playing / Jump Back In" banner, mirroring Riff's player bar (window.tbRiff for the queue
     and lyrics)
   - cover flow / grid / list views for Riff's rows, chosen per section and remembered */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const view = $('view-discover');
  if (!view) return;
  const riff = () => window.tbRiff || null;
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* not saved */ } }
  };
  const isHome = () => view.classList.contains('active');

  // ---------- Greeting ----------
  function greeting() {
    const h = new Date().getHours();
    return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }
  function syncGreeting() {
    const text = $('tb-greeting-text');
    const nameEl = $('tb-greeting-name');
    if (text) text.textContent = greeting();
    // Riff's profile name (Settings → Account); its placeholder "User" isn't a name.
    const full = ((($('settings-nav-account-name') || {}).textContent) || '').trim();
    const first = full && full !== 'User' ? full.split(/\s+/)[0] : '';
    if (nameEl) nameEl.textContent = first ? ', ' + first : '';
  }

  // Opens Riff's Settings on a section, then optionally points at one setting.
  function openSettings(cat, focusSelector) {
    const open = $('btn-sb-settings');
    if (open) open.click();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const tab = document.querySelector(`.settings-nav-btn[data-cat="${cat}"]`);
      if (tab) tab.click();
      if (!focusSelector) return;
      setTimeout(() => {
        const target = document.querySelector(focusSelector);
        const item = target && (target.closest('.setting-item') || target);
        if (!item) return;
        item.scrollIntoView({ block: 'center', behavior: 'smooth' });
        item.classList.remove('tb-flash');
        void item.offsetWidth;
        item.classList.add('tb-flash');
        setTimeout(() => item.classList.remove('tb-flash'), 1700);
      }, 120);
    }));
  }
  const editHome = $('tb-btn-edit-home');
  if (editHome) editHome.addEventListener('click', () => openSettings('advanced', '[data-adv="my_wave"]'));
  const lookBtn = $('tb-btn-home-appearance');
  if (lookBtn) lookBtn.addEventListener('click', () => openSettings('theme'));

  // ---------- Now Playing / Jump Back In ----------
  const hero = $('tb-hero');
  const audio = $('native-audio');
  const el = {
    art: $('tb-hero-art'), backdrop: $('tb-hero-backdrop'), label: $('tb-hero-label'), title: $('tb-hero-title'),
    artist: $('tb-hero-artist'), album: $('tb-hero-album'), lyric: $('tb-hero-lyric'), time: $('tb-hero-time'),
    duration: $('tb-hero-duration'), fill: $('tb-hero-fill'), progress: $('tb-hero-progress'),
    next: $('tb-hero-next'), nextList: $('tb-hero-next-list'), play: $('tb-hero-play')
  };
  const click = (id) => { const b = $(id); if (b) b.click(); };

  let lastArt = null;
  function setGlow(src) {
    if (src === lastArt) return;
    lastArt = src;
    const vars = ['--glow-1', '--glow-2', '--glow-3'];
    const clear = () => vars.forEach((v) => view.style.removeProperty(v));
    const colours = window.Tunebox && window.Tunebox.appearance && window.Tunebox.appearance.coverColors;
    if (!src || !colours) return clear();
    colours(src).then((c) => {
      if (lastArt !== src) return;
      if (!c || !c.length) return clear();
      vars.forEach((v, i) => { const [r, g, b] = c[i % c.length]; view.style.setProperty(v, `rgb(${r} ${g} ${b})`); });
    }, clear);
  }

  function syncTrack() {
    if (!hero) return;
    const t = riff() && riff().current();
    hero.hidden = !t;
    if (!t) { setGlow(''); return; }
    const playing = body.classList.contains('is-playing');
    hero.classList.toggle('is-playing', playing);
    el.label.textContent = playing ? 'Now Playing' : 'Jump Back In';
    el.play.title = playing ? 'Pause' : 'Play';
    el.play.setAttribute('aria-label', el.play.title);
    el.title.textContent = t.title;
    el.artist.textContent = t.artist;
    el.album.textContent = t.album ? ' · ' + t.album : '';
    if (t.thumb) {
      if (el.art.getAttribute('src') !== t.thumb) el.art.src = t.thumb;
      el.art.hidden = false;
      el.backdrop.style.backgroundImage = `url("${t.thumb.replace(/"/g, '%22')}")`;
    } else {
      el.art.hidden = true;
      el.art.removeAttribute('src');
      el.backdrop.style.backgroundImage = '';
    }
    setGlow(t.thumb);
    syncUpNext();
    syncTime();
  }
  if (el.art) el.art.addEventListener('error', () => { el.art.hidden = true; });

  let nextSig = '';
  function syncUpNext() {
    if (!el.next || !riff()) return;
    const list = riff().upNext(3);
    const sig = list.map((t) => t.index + ':' + t.title).join('|');
    if (sig === nextSig) return;
    nextSig = sig;
    el.nextList.textContent = '';
    for (const t of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-hero-next-item';
      b.title = 'Play ' + t.title;
      const art = document.createElement('span');
      art.className = 'tb-next-art';
      if (t.thumb) {
        const img = document.createElement('img');
        img.alt = '';
        img.src = t.thumb;
        img.addEventListener('error', () => img.remove());
        art.appendChild(img);
      }
      const text = document.createElement('span');
      text.className = 'tb-hero-next-text';
      const title = document.createElement('span');
      title.className = 'tb-hero-next-title';
      title.textContent = t.title;
      const artist = document.createElement('span');
      artist.className = 'tb-hero-next-artist';
      artist.textContent = t.artist;
      text.append(title, artist);
      b.append(art, text);
      b.addEventListener('click', () => riff() && riff().playQueued(t.index));
      el.nextList.appendChild(b);
    }
    el.next.hidden = list.length === 0;
  }

  // Riff's own time labels and the audio position, so the banner always agrees with the player bar.
  function duration() {
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
    const txt = (($('time-duration') || {}).textContent || '').trim();
    const parts = txt.split(':').map(Number);
    return parts.every(Number.isFinite) ? parts.reduce((s, p) => s * 60 + p, 0) : 0;
  }
  let lastLyric = null;
  function syncTime() {
    if (!hero || hero.hidden) return;
    const cur = audio && Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const dur = duration();
    el.fill.style.width = (dur ? Math.min(100, (cur / dur) * 100) : 0) + '%';
    el.time.textContent = (($('time-current') || {}).textContent || '0:00');
    el.duration.textContent = (($('time-duration') || {}).textContent || '0:00');
    const line = riff() ? riff().lyricAt(cur) : '';
    if (line !== lastLyric) {
      lastLyric = line;
      el.lyric.hidden = !line;
      el.lyric.textContent = line;
      el.lyric.classList.remove('tb-in');
      if (line) { void el.lyric.offsetWidth; el.lyric.classList.add('tb-in'); }
    }
  }

  // Click on the banner's progress bar: the same seek as clicking Riff's own progress bar.
  if (el.progress) {
    el.progress.addEventListener('click', (e) => {
      const bar = el.progress.querySelector('.tb-hero-bar').getBoundingClientRect();
      const k = (e.clientX - bar.left) / bar.width;
      const track = $('scrubber-track');
      if (!track || k < 0 || k > 1) return;
      const r = track.getBoundingClientRect();
      const pad = 5.5; // Riff's progress bar inset
      const x = r.left + pad + k * (r.width - 2 * pad);
      const y = r.top + r.height / 2;
      track.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y, button: 0 }));
    });
  }
  const bind = (id, fn) => { const b = $(id); if (b) b.addEventListener('click', fn); };
  bind('tb-hero-prev', () => click('btn-prev'));
  bind('tb-hero-play', () => click('btn-play-pause'));
  bind('tb-hero-next-btn', () => click('btn-next'));
  // Lyrics and the cover open Riff's now-playing panel (lyrics live there).
  function openNowPlaying() {
    const panel = $('right-panel');
    if (panel && panel.classList.contains('hidden')) click('btn-toggle-lyrics-panel');
  }
  bind('tb-hero-lyrics', openNowPlaying);
  bind('tb-hero-art-btn', openNowPlaying);

  // Keep in step: Riff updates the player bar on every song change and the body's is-playing class.
  const watch = (node, opts) => { if (node) new MutationObserver(syncTrack).observe(node, opts); };
  watch($('playbar-title'), { childList: true, characterData: true, subtree: true });
  watch($('playbar-artist'), { childList: true, characterData: true, subtree: true });
  watch($('playbar-artwork'), { attributes: true, attributeFilter: ['src'] });
  new MutationObserver(() => {
    if (!hero || hero.hidden) return;
    const playing = body.classList.contains('is-playing');
    if (playing !== hero.classList.contains('is-playing')) syncTrack();
  }).observe(body, { attributes: true, attributeFilter: ['class'] });

  // While Home shows: progress and lyric 4× a second, up next once a second (the queue can change).
  let ticks = 0;
  setInterval(() => {
    if (!isHome() || document.hidden) return;
    syncTime();
    if (++ticks % 4 === 0) syncUpNext();
  }, 250);

  // ---------- Shelves: cover flow / grid / list ----------
  const VIEWS = [
    ['flow', 'Cover flow', '<rect x="8" y="5" width="8" height="14" rx="1.5"/><path d="M5 7v10M19 7v10"/>'],
    ['grid', 'Grid', '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'],
    ['list', 'List', '<path d="M5 7h14M5 12h14M5 17h14"/>']
  ];
  const SHELVES = [
    { id: 'made', section: 'sp-made-sec', row: 'sp-made' },
    { id: 'trend', section: 'sp-trend-sec', row: 'sp-trend' },
    { id: 'artists', section: 'sp-artists-sec', row: 'sp-artists' }
  ];
  const CARD = '.sp-card, .fav-artist-card';
  const VISIBLE = 6; // covers drawn on each side of the centre one
  let views = {};
  try { views = JSON.parse(store.get('tunebox.homeViews') || '{}') || {}; } catch (e) { views = {}; }

  function setupShelf(def) {
    const section = $(def.section);
    const row = $(def.row);
    if (!section || !row || section.classList.contains('tb-shelf')) return;
    section.classList.add('tb-shelf');
    const heading = section.querySelector(':scope > h2');

    // The row moves into a wrapper that also holds the flow's caption and arrows.
    const wrap = document.createElement('div');
    wrap.className = 'tb-flow-wrap';
    row.parentNode.insertBefore(wrap, row);
    wrap.appendChild(row);
    const caption = document.createElement('div');
    caption.className = 'tb-flow-caption';
    caption.innerHTML = '<div class="tb-flow-title"></div><div class="tb-flow-subtitle"></div>';
    const arrow = (side, label, d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tb-flow-arrow ' + side;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
      return b;
    };
    const left = arrow('left', 'Previous', 'M15 5l-7 7 7 7');
    const right = arrow('right', 'Next', 'M9 5l7 7-7 7');
    wrap.append(caption, left, right);

    const state = { index: 0, drag: null, wheel: 0 };
    const cards = () => Array.from(row.children).filter((c) => c.matches(CARD));
    const current = () => section.dataset.view || 'flow';

    function layout() {
      const list = cards();
      const flow = current() === 'flow';
      wrap.classList.toggle('tb-flow-empty', list.length === 0);
      wrap.tabIndex = flow && list.length ? 0 : -1;
      if (!flow) {
        list.forEach((c) => {
          c.classList.remove('tb-flow-center', 'tb-flow-far');
          ['--side', '--dist'].forEach((p) => c.style.removeProperty(p));
          c.style.zIndex = '';
        });
        return;
      }
      if (!list.length) return;
      state.index = Math.max(0, Math.min(list.length - 1, state.index));
      list.forEach((c, i) => {
        const offset = i - state.index;
        const dist = Math.abs(offset);
        c.style.setProperty('--side', String(Math.sign(offset)));
        c.style.setProperty('--dist', String(dist));
        c.style.zIndex = String(100 - dist);
        c.classList.toggle('tb-flow-center', offset === 0);
        c.classList.toggle('tb-flow-far', dist > VISIBLE);
      });
      const center = list[state.index];
      const title = center.querySelector('.sp-card-title, .fav-artist-name');
      const sub = center.querySelector('.sp-card-sub');
      caption.firstChild.textContent = title ? title.textContent : '';
      caption.lastChild.textContent = sub ? sub.textContent : (center.matches('.fav-artist-card') ? 'Artist' : '');
      left.disabled = state.index === 0;
      right.disabled = state.index === list.length - 1;
    }
    const go = (i) => { state.index = i; layout(); };

    function setView(v, save) {
      section.dataset.view = v;
      switcher.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', b.dataset.view === v);
        b.setAttribute('aria-pressed', String(b.dataset.view === v));
      });
      if (save) { views[def.id] = v; store.set('tunebox.homeViews', JSON.stringify(views)); }
      layout();
    }

    const switcher = document.createElement('div');
    switcher.className = 'tb-view-switch';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', 'Section look');
    for (const [v, label, icon] of VIEWS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.view = v;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
      b.addEventListener('click', () => setView(v, true));
      switcher.appendChild(b);
    }
    if (heading) heading.appendChild(switcher);

    // In the flow, a side cover comes to the middle; only the middle one does what Riff's card does.
    row.addEventListener('click', (e) => {
      if (current() !== 'flow') return;
      const card = e.target.closest(CARD);
      if (!card || card.parentNode !== row) return;
      if (state.drag && state.drag.moved) { e.stopPropagation(); e.preventDefault(); return; }
      const i = cards().indexOf(card);
      if (i !== state.index) { e.stopPropagation(); e.preventDefault(); go(i); }
    }, true);
    row.addEventListener('pointerdown', (e) => {
      if (current() !== 'flow' || e.button !== 0) return;
      state.drag = { x: e.clientX, start: state.index, moved: false };
    });
    row.addEventListener('pointermove', (e) => {
      const d = state.drag;
      if (!d || !(e.buttons & 1)) return;
      const steps = Math.round((d.x - e.clientX) / 70);
      if (steps) d.moved = true;
      const n = cards().length;
      const target = Math.max(0, Math.min(n - 1, d.start + steps));
      if (target !== state.index) go(target);
    });
    const endDrag = () => setTimeout(() => { state.drag = null; }, 0);
    row.addEventListener('pointerup', endDrag);
    row.addEventListener('pointerleave', endDrag);
    row.addEventListener('dragstart', (e) => { if (current() === 'flow') e.preventDefault(); });
    // Only sideways scrolling (trackpad, or Shift + wheel) moves the flow; up and down scroll the page.
    wrap.addEventListener('wheel', (e) => {
      if (current() !== 'flow') return;
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault();
      state.wheel += dx;
      if (Math.abs(state.wheel) >= 60) {
        go(Math.max(0, Math.min(cards().length - 1, state.index + Math.sign(state.wheel))));
        state.wheel = 0;
      }
    }, { passive: false });
    wrap.addEventListener('keydown', (e) => {
      if (current() !== 'flow' || e.target !== wrap) return;
      const n = cards().length;
      if (e.key === 'ArrowLeft') go(Math.max(0, state.index - 1));
      else if (e.key === 'ArrowRight') go(Math.min(n - 1, state.index + 1));
      else if (e.key === 'Enter') { const c = cards()[state.index]; if (c) c.click(); }
      else return;
      e.preventDefault();
    });
    left.addEventListener('click', () => go(Math.max(0, state.index - 1)));
    right.addEventListener('click', () => go(Math.min(cards().length - 1, state.index + 1)));

    // Riff rebuilds its rows when Home refreshes.
    new MutationObserver(layout).observe(row, { childList: true });
    setView(['flow', 'grid', 'list'].includes(views[def.id]) ? views[def.id] : 'flow', false);
  }
  SHELVES.forEach(setupShelf);

  // ---------- Coming back to Home ----------
  function onShow() {
    if (!isHome()) return;
    syncGreeting();
    syncTrack();
  }
  new MutationObserver(onShow).observe(view, { attributes: true, attributeFilter: ['class'] });
  const nick = $('settings-nav-account-name');
  if (nick) new MutationObserver(syncGreeting).observe(nick, { childList: true, characterData: true, subtree: true });
  syncGreeting();
  syncTrack();
  setInterval(syncGreeting, 60 * 1000);
})();
