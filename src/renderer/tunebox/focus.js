/* Tunebox's Focus mode (tunebox-design/4-now-playing: views/FocusMode.tsx, components/FocusDock.tsx,
   components/StageLyrics.tsx, lib/equalizer.ts), ported to plain JS for Riff.
   Riff's full-screen lyrics button (and its shortcut) opens this instead of Riff's karaoke screen: app.js's
   openTvKaraoke/closeTvKaraoke hand over to Tunebox.focus.open/close.

   Four layouts, cycled with the chip or L: Stage (poster lyrics over the cover, the "Playing Next" wall and
   the edge equalizer), Cover + lyrics, Lyrics, Cover. Riff's own lyric tools (Edit, Sync, Translate,
   Word/Line, Customize) sit as extra chips in the top row.

   Playback goes through Riff: its buttons (#btn-play-pause…), its <audio> for the time, and window.tbRiff
   for the song, lyrics, queue and seeking. */
(function () {
  'use strict';

  const IDLE_MS = 2500;
  const VOLUME_STEP = 5;
  const LAYOUTS = ['stage', 'split', 'lyrics', 'cover'];
  const LAYOUT_LABEL = { stage: 'Stage', split: 'Cover + lyrics', lyrics: 'Lyrics', cover: 'Cover' };
  const LAYOUT_KEY = 'tunebox.focusLayout';
  // Riff's shipped "Customize lyrics" values (defaults.json riff_tvk / riff_tvk_bg_blur). Only settings
  // changed from these override Tunebox's own look.
  const RIFF_TVK_SHIPPED = { font: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif', align: 'left', size: 95, weight: 600, gap: 17 };
  const RIFF_BG_BLUR_SHIPPED = 18;

  const $ = (id) => document.getElementById(id);
  const riff = () => window.tbRiff || null;
  const app = () => (window.Tunebox && window.Tunebox.appearance) || null;
  const look = () => (app() ? app().get() : {});
  const lyricsView = () => window.Tunebox && window.Tunebox.lyricsView;
  const icon = (name, size) => (window.Tunebox && window.Tunebox.icons ? window.Tunebox.icons.svg(name, size) : '');
  const audio = () => $('native-audio');
  const click = (id) => { const b = $(id); if (b) b.click(); };
  const notify = (msg) => { if (typeof window.showToast === 'function') window.showToast(msg); };
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const button = (cls, title, html, fn) => {
    const b = make('button', cls);
    b.type = 'button';
    if (title) b.title = title;
    if (html != null) b.innerHTML = html;
    if (fn) b.addEventListener('click', fn);
    return b;
  };
  const fmt = (ms) => {
    const s = Math.max(0, Math.floor((ms || 0) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };
  const cssUrl = (u) => `url("${String(u).replace(/"/g, '%22')}")`;

  // ---------- What's playing, read from Riff ----------
  function snapshot() {
    const r = riff();
    const track = r && r.current();
    const a = audio();
    const vol = $('volume-slider');
    const fav = $('fav-icon');
    const repeat = $('btn-repeat');
    return {
      track,
      key: track ? [track.title, track.artist, track.thumb].join('|') : '',
      playing: document.body.classList.contains('is-playing'),
      shuffle: !!($('btn-shuffle') && $('btn-shuffle').classList.contains('active')),
      repeat: !!(repeat && repeat.classList.contains('active')),
      repeatOne: !!(repeat && /repeat-one|one/.test(repeat.className)),
      liked: !!(fav && fav.getAttribute('fill') === 'currentColor'),
      volume: vol ? Math.round(Number(vol.value) * 100) : 100,
      pos: a ? (a.currentTime || 0) * 1000 : 0,
      dur: a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : 0
    };
  }
  function setVolume(pct) {
    const v = $('volume-slider');
    if (!v) return;
    v.value = String(Math.max(0, Math.min(100, pct)) / 100);
    v.dispatchEvent(new Event('input', { bubbles: true }));
    v.dispatchEvent(new Event('change', { bubbles: true }));
  }
  const hasLyrics = () => {
    const d = riff() && riff().lyrics ? riff().lyrics() : null;
    return !!d && (d.kind === 'synced' || d.kind === 'plain');
  };

  // ---------- Pieces shared by the layouts (FocusDock.tsx) ----------

  /** Draggable song position. The song only jumps when the drag ends. */
  function SeekBar(className) {
    const el = make('div', 'tb-seek' + (className ? ' ' + className : ''));
    const cur = make('span', 'tb-seek-time', '0:00');
    const input = make('input');
    input.type = 'range';
    input.min = '0';
    input.setAttribute('aria-label', 'Song position');
    const end = make('span', 'tb-seek-time', '0:00');
    el.append(cur, input, end);
    let drag = null;
    input.addEventListener('input', () => { drag = Number(input.value); });
    const commit = () => { if (drag != null && riff()) riff().seek(drag); drag = null; };
    input.addEventListener('pointerup', commit);
    input.addEventListener('keyup', commit);
    // Arrow keys belong to Focus mode (previous/next song), not to this slider.
    input.addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow')) e.preventDefault(); });
    return {
      el,
      update(s) {
        const dur = s.dur || 1;
        const pos = drag != null ? drag : s.pos;
        input.max = String(Math.round(dur));
        if (drag == null) input.value = String(Math.round(Math.min(pos, dur)));
        input.disabled = !s.track;
        input.style.setProperty('--fill', `${s.dur ? (Math.min(pos, s.dur) / s.dur) * 100 : 0}%`);
        cur.textContent = fmt(pos);
        end.textContent = fmt(s.dur);
      }
    };
  }

  /** Volume slider; the speaker button mutes, and clicking it again restores the previous level. */
  function VolumeControl() {
    const el = make('div', 'tb-focus-volume');
    let lastLoud = 60;
    let vol = 100;
    const mute = button('tb-focus-icon', 'Mute', '', () => setVolume(vol === 0 ? lastLoud : 0));
    const input = make('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.setAttribute('aria-label', 'Volume');
    input.addEventListener('input', () => setVolume(Number(input.value)));
    input.addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow')) e.preventDefault(); });
    el.append(mute, input);
    let shown = null;
    return {
      el,
      update(s) {
        vol = s.volume;
        if (vol > 0) lastLoud = vol;
        if (document.activeElement !== input) input.value = String(vol);
        input.style.setProperty('--fill', `${vol}%`);
        const muted = vol === 0;
        if (shown !== muted) {
          shown = muted;
          mute.title = muted ? 'Unmute' : 'Mute';
          mute.innerHTML = icon(muted ? 'mute' : 'volume', 18);
        }
      }
    };
  }

  /** Previous / play / next (FocusMode.tsx Controls). */
  function Controls(size) {
    const big = size !== 'small';
    const el = make('div', `tb-focus-controls tb-fades tb-${big ? 'large' : 'small'}`);
    const prev = button('tb-focus-btn', 'Previous', icon('prev', big ? 22 : 18), () => click('btn-prev'));
    const play = button('tb-focus-play', 'Play', '', () => click('btn-play-pause'));
    const next = button('tb-focus-btn', 'Next', icon('next', big ? 22 : 18), () => click('btn-next'));
    el.append(prev, play, next);
    let shown = null;
    return {
      el,
      update(s) {
        if (shown === s.playing) return;
        shown = s.playing;
        play.title = s.playing ? 'Pause' : 'Play';
        play.innerHTML = icon(s.playing ? 'pause' : 'play', big ? 24 : 20);
      }
    };
  }

  /** The glass playback bar along the bottom of Stage and Lyrics. */
  function FocusDock() {
    const el = make('div', 'tb-focus-dock tb-fades');
    let song = make('div', 'tb-focus-dock-song');
    const center = make('div', 'tb-focus-dock-center');
    const right = make('div', 'tb-focus-dock-right');
    const buttons = make('div', 'tb-focus-dock-buttons');
    const shuffle = button('tb-focus-icon', 'Shuffle', icon('shuffle', 17), () => click('btn-shuffle'));
    const prev = button('tb-focus-icon', 'Previous (←)', icon('prev', 20), () => click('btn-prev'));
    const play = button('tb-focus-play tb-small', '', '', () => click('btn-play-pause'));
    const next = button('tb-focus-icon', 'Next (→)', icon('next', 20), () => click('btn-next'));
    const repeat = button('tb-focus-icon', 'Repeat', icon('repeat', 17), () => click('btn-repeat'));
    buttons.append(shuffle, prev, play, next, repeat);
    const seek = SeekBar('');
    center.append(buttons, seek.el);
    const volume = VolumeControl();
    right.append(volume.el);
    el.append(song, center, right);
    let songKey = null, playing = null;
    const like = button('tb-focus-icon', '', '', () => click('btn-toggle-fav'));
    return {
      el,
      update(s) {
        if (songKey !== s.key) {
          songKey = s.key;
          // Re-created per song, so it fades in (Tunebox keys it by the song).
          const fresh = make('div', 'tb-focus-dock-song');
          song.replaceWith(fresh);
          song = fresh;
          if (s.track) {
            if (s.track.thumb) { const img = make('img'); img.src = s.track.thumb; img.alt = ''; fresh.appendChild(img); }
            else fresh.appendChild(make('span', 'tb-art-placeholder'));
            const text = make('div', 'tb-focus-dock-text');
            text.append(make('div', 'tb-focus-mini-title', s.track.title), make('div', 'tb-focus-mini-artist', s.track.artist));
            fresh.append(text, like);
          }
        }
        if (playing !== s.playing) {
          playing = s.playing;
          play.title = s.playing ? 'Pause (Space)' : 'Play (Space)';
          play.innerHTML = icon(s.playing ? 'pause' : 'play', 20);
        }
        shuffle.classList.toggle('tb-on', s.shuffle);
        repeat.classList.toggle('tb-on', s.repeat);
        repeat.title = s.repeat ? 'Repeat: on' : 'Repeat: off';
        like.classList.toggle('tb-liked', s.liked);
        like.title = s.liked ? 'Remove from Liked Songs' : 'Save to Liked Songs';
        const heart = icon('heart', 18).replace('<svg', `<svg fill="${s.liked ? 'currentColor' : 'none'}"`);
        if (like._heart !== heart) { like._heart = heart; like.innerHTML = heart; }
        seek.update(s);
        volume.update(s);
      },
      frame(s) { seek.update(s); }
    };
  }

  // ---------- Stage (StageLyrics.tsx) ----------
  const ROW_CHARS = 11;
  const LINGER_MS = 1800;
  const EXIT_MS = 550;
  const STYLES = ['serif-italic', 'sans', 'serif'];

  function emphasisIndex(texts) {
    let best = texts.length - 1, bestLen = 3;
    texts.forEach((t, i) => {
      const len = t.replace(/[^\p{L}\p{N}]/gu, '').length;
      if (len > bestLen) { best = i; bestLen = len; }
    });
    return best;
  }
  function layoutRows(texts, seed) {
    const gold = emphasisIndex(texts);
    const rows = [];
    let row = [], chars = 0;
    const push = () => {
      if (!row.length) return;
      rows.push({ tilt: (((seed + rows.length) % 3) - 1) * 2.5, words: row });
      row = []; chars = 0;
    };
    texts.forEach((text, i) => {
      const style = i === gold ? 'gold' : STYLES[(seed * 7 + i * 13) % STYLES.length];
      if (i === gold || (chars && chars + text.length > ROW_CHARS)) push();
      row.push({ i, text, style });
      chars += text.length + 1;
      if (i === gold) push();
    });
    push();
    return rows;
  }
  /** One phrase: centred stacked rows of big mixed type. */
  function Phrase(texts, seed) {
    const rows = layoutRows(texts, seed);
    const scale = rows.length > 3 ? Math.max(0.5, 3.4 / rows.length) : 1;
    const el = make('div', 'tb-stage-phrase');
    el.style.setProperty('--scale', String(scale));
    const words = [];
    rows.forEach((row) => {
      const r = make('div', 'tb-stage-row');
      r.style.setProperty('--tilt', `${row.tilt}deg`);
      row.words.forEach((w) => {
        const span = make('span', `tb-stage-word tb-${w.style}`, w.text);
        span.style.setProperty('--r', `${((seed + w.i * 5) % 7) - 3}deg`);
        words[w.i] = span;
        r.appendChild(span);
      });
      el.appendChild(r);
    });
    return {
      el,
      set(revealed, active) {
        words.forEach((w, i) => {
          if (!w) return;
          w.classList.toggle('tb-shown', i < revealed);
          w.classList.toggle('tb-active', i === active);
        });
      }
    };
  }

  /** Deterministic sparkle positions hugging the screen edges. */
  const SPARKLES = Array.from({ length: 44 }, (_, i) => {
    const r = (n) => (((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1) + 1) % 1;
    const side = i % 4;
    const along = r(1) * 100;
    const inset = 0.4 + r(2) * 2.2;
    const pos = side === 0 ? { left: `${along}%`, top: `${inset}%` }
      : side === 1 ? { left: `${along}%`, bottom: `${inset}%` }
        : side === 2 ? { top: `${along}%`, left: `${inset * 0.6}%` }
          : { top: `${along}%`, right: `${inset * 0.6}%` };
    return Object.assign(pos, { '--delay': `${(r(3) * 4).toFixed(2)}s`, '--size': `${(2 + r(4) * 3).toFixed(1)}px` });
  });

  // lib/palette.ts helpers for the equalizer colours
  function hexToRgb(h) {
    const m = String(h || '').replace('#', '');
    const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
  }
  function toHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function fromHsl(h, s, l) {
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round);
  }
  function withPartner(color) {
    const [h, s, l] = toHsl(color);
    return [color, fromHsl((h + 25) % 360, Math.min(1, s + 0.1), Math.min(0.78, l + 0.18))];
  }

  /** lib/equalizer.ts: an RGB equalizer drawn around the screen edge. Nothing here hears the music; each
      sung word kicks the bars, and while playing with no kicks a steady ~115 BPM beat takes over. */
  function startEqualizer(canvas, glow, isPlaying, getColors, getOptions) {
    const AUTO_BEAT_MS = 520, QUIET_MS = 2200, TAU = Math.PI * 2;
    const ctx = canvas.getContext('2d');
    const gctx = glow.getContext('2d');
    let w = 0, h = 0, barW = 0, bars = [], edges = [[], [], [], []];
    const barColor = (colors, s, t, lift) => {
      if (!colors || !colors.length) return `hsl(${((s * 360 + t * 45) % 360).toFixed(0)} 100% ${(56 + lift * 16).toFixed(0)}%)`;
      const n = colors.length;
      const u = ((((s + t * 0.06) % 1) + 1) % 1) * n;
      const i = Math.floor(u), f = u - i, k = f * f * (3 - 2 * f);
      const a = colors[i % n], b = colors[(i + 1) % n];
      const mix = (c) => a[c] + (b[c] - a[c]) * k;
      const up = lift * 0.3;
      const ch = (c) => Math.round(mix(c) + (255 - mix(c)) * up);
      return `rgb(${ch(0)} ${ch(1)} ${ch(2)})`;
    };
    const layout = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      barW = Math.round(getOptions().size);
      const gap = Math.max(2, Math.round(barW * 1.25));
      w = canvas.clientWidth; h = canvas.clientHeight;
      for (const c of [canvas, glow]) {
        c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
        c.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      const perimeter = 2 * (w + h) || 1, step = barW + gap;
      const miter = (along, length) => Math.min(along, length - along - barW) - 1;
      bars = [];
      for (let x = gap; x < w - barW; x += step) bars.push({ x, y: 0, dir: 0, s: x / perimeter, level: 0, limit: miter(x, w) });
      for (let y = gap; y < h - barW; y += step) bars.push({ x: w, y, dir: 1, s: (w + y) / perimeter, level: 0, limit: miter(y, h) });
      for (let x = w - gap - barW; x > 0; x -= step) bars.push({ x, y: h, dir: 2, s: (w + h + (w - x)) / perimeter, level: 0, limit: miter(x, w) });
      for (let y = h - gap - barW; y > 0; y -= step) bars.push({ x: 0, y, dir: 3, s: (2 * w + h + (h - y)) / perimeter, level: 0, limit: miter(y, h) });
      bars = bars.filter((b) => b.limit > 0);
      edges = [0, 1, 2, 3].map((d) => bars.filter((b) => b.dir === d));
    };
    layout();
    const resize = new ResizeObserver(layout);
    resize.observe(canvas);
    const rect = (bar, offset, len) => bar.dir === 0 ? [bar.x, offset, barW, len]
      : bar.dir === 1 ? [w - offset - len, bar.y, len, barW]
        : bar.dir === 2 ? [bar.x, h - offset - len, barW, len] : [offset, bar.y, len, barW];
    const drawWave = (edge, lens, colors, t) => {
      if (edge.length < 2) return;
      const horizontal = edge[0].dir === 0 || edge[0].dir === 2;
      const along = (b) => (horizontal ? b.x : b.y) + barW / 2;
      const tip = (b) => { const len = lens.get(b); return b.dir === 0 ? [along(b), len] : b.dir === 1 ? [w - len, along(b)] : b.dir === 2 ? [along(b), h - len] : [len, along(b)]; };
      const base = (a) => edge[0].dir === 0 ? [a, 0] : edge[0].dir === 1 ? [w, a] : edge[0].dir === 2 ? [a, h] : [0, a];
      const length = horizontal ? w : h;
      const grad = horizontal ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, 0, h);
      const every = Math.max(1, Math.floor(edge.length / 14));
      edge.forEach((b, i) => {
        if (i % every === 0 || i === edge.length - 1) grad.addColorStop(Math.min(1, Math.max(0, along(b) / length)), barColor(colors, b.s, t, Math.min(1, Math.max(0, b.level))));
      });
      ctx.beginPath();
      ctx.moveTo(...base(along(edge[0])));
      ctx.lineTo(...tip(edge[0]));
      for (let i = 1; i < edge.length; i++) {
        const [px, py] = tip(edge[i - 1]); const [qx, qy] = tip(edge[i]);
        ctx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
      }
      ctx.lineTo(...tip(edge[edge.length - 1]));
      ctx.lineTo(...base(along(edge[edge.length - 1])));
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    };
    let frame = 0, last = performance.now(), energy = 0, kicked = 0, lastKick = 0, autoBeat = 0, phase = 0, cleared = false;
    const draw = (now) => {
      frame = requestAnimationFrame(draw);
      const opts = getOptions();
      if (Math.round(opts.size) !== barW) layout();
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (opts.style === 'off') {
        if (!cleared) { ctx.clearRect(0, 0, w, h); gctx.clearRect(0, 0, w, h); cleared = true; }
        return;
      }
      cleared = false;
      const playing = isPlaying();
      if (kicked) { energy = Math.min(1.6, energy + 0.85 * kicked); kicked = 0; lastKick = now; }
      else if (playing && now - lastKick > QUIET_MS && now - autoBeat > AUTO_BEAT_MS) { autoBeat = now; energy = Math.min(1.2, energy + 0.55); }
      energy *= Math.exp(-dt * 4.5);
      phase += dt * opts.speed;
      const t = phase;
      const maxLen = Math.min(w, h) * (opts.reach || 0.075) * opts.height;
      const baseLevel = playing ? 0.12 : 0.04;
      const smooth = opts.style === 'wave';
      const colors = getColors();
      const lens = new Map();
      ctx.clearRect(0, 0, w, h);
      for (const bar of bars) {
        const wave = 0.5 + 0.5 * Math.sin(bar.s * TAU * 7 + t * 2.3) * Math.sin(bar.s * TAU * 3 - t * 1.7);
        const ripple = 0.5 + 0.5 * Math.sin(bar.s * TAU * 23 - t * 6);
        const target = playing
          ? baseLevel + (0.38 * wave + (smooth ? 0.1 : 0.22) * ripple) * (0.45 + energy) + (smooth ? 0 : energy * 0.3 * Math.random())
          : baseLevel + 0.04 * wave;
        bar.level += (target - bar.level) * Math.min(1, dt * 14);
        const lift = Math.min(1, Math.max(0, bar.level));
        const len = Math.min(bar.limit, 2 + Math.max(0, bar.level) * maxLen);
        if (opts.style === 'wave') { lens.set(bar, len); continue; }
        if (opts.style === 'blocks') {
          const seg = barW, gap = Math.max(1, Math.round(barW * 0.6));
          const count = Math.max(1, Math.floor((len + gap) / (seg + gap)));
          for (let k = 0; k < count; k++) { ctx.fillStyle = barColor(colors, bar.s, t, lift * ((k + 1) / count)); ctx.fillRect(...rect(bar, k * (seg + gap), seg)); }
          continue;
        }
        ctx.fillStyle = barColor(colors, bar.s, t, lift);
        ctx.fillRect(...rect(bar, 0, len));
      }
      if (opts.style === 'wave') for (const edge of edges) drawWave(edge, lens, colors, t);
      gctx.clearRect(0, 0, w, h);
      if (opts.glow > 0) gctx.drawImage(canvas, 0, 0, w, h);
    };
    frame = requestAnimationFrame(draw);
    return { kick: () => { kicked++; }, stop: () => { cancelAnimationFrame(frame); resize.disconnect(); } };
  }

  /** The current song and what's queued after it, on a panel tilted into the screen like a side wall.
      Clicking a song skips ahead to it: it lifts off the wall as a glass block and floats up into the
      "now playing" spot, while the songs it skips fade away. */
  function UpNext() {
    const wrap = make('div', 'tb-stage-list-wrap');
    const list = make('div', 'tb-stage-list');
    const head = make('div', 'tb-stage-list-head', 'Playing Next');
    const scroll = make('div', 'tb-stage-list-scroll');
    list.append(head, scroll);
    wrap.appendChild(list);
    let current = null;
    let items = [];
    let itemEls = [];
    let trackKey = null;
    let queueKey = null;
    let flight = null; // { index, fromKey, done, risen, block }
    let skipTimer = 0;
    let parked = null;
    const art = (src) => { if (src) { const i = make('img'); i.src = src; i.alt = ''; return i; } return make('span', 'tb-art-placeholder'); };
    const text = (title, artist) => { const t = make('div', 'tb-stage-list-text'); t.append(make('div', 'tb-stage-list-title', title), make('div', 'tb-stage-list-artist', artist)); return t; };

    function renderCurrent(track, cls) {
      const card = make('div', 'tb-stage-list-item tb-current' + (cls ? ' ' + cls : ''));
      card.append(art(track.thumb), text(track.title, track.artist));
      const eq = make('span', 'tb-stage-eq');
      eq.append(make('i'), make('i'), make('i'));
      card.appendChild(eq);
      if (current) current.replaceWith(card); else list.insertBefore(card, scroll);
      current = card;
    }
    function renderList(fresh) {
      items = fresh;
      scroll.textContent = '';
      itemEls = [];
      if (!items.length) scroll.appendChild(make('div', 'tb-stage-list-empty', 'Nothing queued after this song.'));
      items.forEach((item, i) => {
        const b = make('button', 'tb-stage-list-item');
        b.type = 'button';
        b.title = `Play ${item.title}`;
        b.style.setProperty('--n', String(Math.min(i, 6)));
        b.append(art(item.thumb), text(item.title, item.artist));
        b.addEventListener('click', () => pick(i, b));
        itemEls.push(b);
        scroll.appendChild(b);
      });
    }
    const fetchQueue = () => (riff() && riff().upNext ? riff().upNext(50) : []);
    const signature = (q) => q.map((x) => x.index + ':' + x.title).join('|');

    function pick(i, el) {
      if (flight) return;
      const item = items[i];
      const top = el.offsetTop - scroll.scrollTop;
      const rise = current.offsetTop - top;
      itemEls.forEach((b, j) => { b.disabled = true; if (j < i) b.classList.add('tb-passing'); });
      el.classList.add('tb-lifted');
      current.classList.add('tb-leaving');
      const block = make('div', 'tb-stage-list-item tb-stage-block');
      block.append(art(item.thumb), text(item.title, item.artist));
      Object.assign(block.style, { top: `${top}px`, left: `${el.offsetLeft}px`, width: `${el.offsetWidth}px` });
      block.style.setProperty('--rise', `${rise}px`);
      flight = { index: item.index, fromKey: trackKey, done: false, risen: false, block, item };
      block.addEventListener('animationend', (e) => {
        if (e.animationName === 'tb-stage-block-fly' && flight && flight.block === block) { flight.risen = true; maybeLand(); }
      });
      list.appendChild(block);
      // A skip normally ends with the song changing; if it fails, unlock the list.
      clearTimeout(skipTimer);
      skipTimer = setTimeout(() => { if (flight) { flight.block.remove(); flight = null; renderList(fetchQueue()); if (current) current.className = 'tb-stage-list-item tb-current'; } }, 15000);
      riff().playQueued(item.index);
    }
    function maybeLand() {
      if (!flight || !flight.done || !flight.risen) return;
      clearTimeout(skipTimer);
      flight.block.remove();
      flight = null;
      const s = snapshot();
      if (s.track) renderCurrent(s.track, 'tb-landed');
      const fresh = parked || fetchQueue();
      parked = null;
      queueKey = signature(fresh);
      renderList(fresh);
    }

    return {
      el: wrap,
      update(s) {
        if (!s.track) return;
        if (s.key !== trackKey) {
          const first = trackKey === null;
          trackKey = s.key;
          if (flight) {
            // The picked song started: hide the songs in between, land once the block has risen.
            if (current && !current.classList.contains('tb-leaving')) current.classList.add('tb-gone');
            flight.done = true;
            parked = fetchQueue();
            maybeLand();
            return;
          }
          renderCurrent(s.track, first ? '' : 'tb-arrived');
          const fresh = fetchQueue();
          queueKey = signature(fresh);
          renderList(fresh);
          return;
        }
        // Up Next also changes without the song changing (songs added to the queue).
        if (!flight) {
          const fresh = fetchQueue();
          const sig = signature(fresh);
          if (sig !== queueKey) { queueKey = sig; renderList(fresh); }
        }
      },
      destroy() { clearTimeout(skipTimer); }
    };
  }

  function useClock(el) {
    const read = () => {
      const now = new Date();
      const time = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' }).formatToParts(now)
        .filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
      const date = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
      return { time, date };
    };
    const date = make('div', 'tb-stage-date'), time = make('div', 'tb-stage-time');
    el.append(date, time);
    const tick = () => { const c = read(); date.textContent = c.date; time.textContent = c.time; };
    tick();
    return setInterval(tick, 5000);
  }

  /** "Stage": the phrase being sung fills the screen as a stacked typographic poster over the artwork,
      each word popping in as it's sung, inside a glowing animated frame with a large clock. */
  function Stage() {
    const lk = look();
    const el = make('div', 'tb-stage' + (lk.stageQueue === false ? ' tb-no-queue' : ''));
    const artHolder = make('div');
    artHolder.style.display = 'contents';
    const vignette = make('div', 'tb-stage-vignette');
    const words = make('div', 'tb-stage-words');
    el.append(artHolder, vignette);
    let clockTimer = 0;
    if (lk.stageClock !== false) { const c = make('div', 'tb-stage-clock'); clockTimer = useClock(c); el.appendChild(c); }
    el.appendChild(words);
    const upNext = lk.stageQueue === false ? null : UpNext();
    if (upNext) el.appendChild(upNext.el);
    const frameEl = make('div', 'tb-stage-frame');
    frameEl.setAttribute('aria-hidden', 'true');
    const glow = make('canvas', 'tb-stage-eq-glow');
    const bars = make('canvas', 'tb-stage-eq-bars');
    glow.style.setProperty('--eq-glow', String(lk.eqGlow == null ? 0.9 : lk.eqGlow));
    frameEl.append(glow, bars);
    if (lk.stageSparkles !== false) SPARKLES.forEach((st) => { const i = make('i'); Object.keys(st).forEach((k) => i.style.setProperty(k, st[k])); frameEl.appendChild(i); });
    el.appendChild(frameEl);

    let playing = false;
    let colors = null;
    let artKey = null;
    const setColors = (thumb) => {
      const l = look();
      if (l.eqMode === 'accent' && app()) colors = withPartner(hexToRgb(app().accentColor(true)));
      else if (l.eqMode === 'custom') { const list = (l.eqColors || []).map(hexToRgb); colors = list.length === 1 ? withPartner(list[0]) : list; }
      else if (l.eqMode === 'artwork' && thumb && app()) app().coverColors(thumb).then((c) => { if (artKey === thumb) colors = c; }, () => {});
      else colors = null;
    };
    const eq = startEqualizer(bars, glow, () => playing, () => colors, () => {
      const l = look();
      return { style: l.eqStyle || 'bars', size: l.eqSize || 4, height: l.eqHeight || 1, speed: l.eqSpeed || 1, glow: l.eqGlow == null ? 0.9 : l.eqGlow };
    });

    // Lyric style (font and colours from Appearance)
    const applyStyle = (thumb) => {
      const st = lyricsView() ? lyricsView().lyricStyle(thumb, () => applyStyle(thumb)) : { vars: {}, customFont: false };
      Object.keys(st.vars).forEach((k) => el.style.setProperty(k, st.vars[k]));
      if (st.customFont) el.dataset.lyricFont = '1'; else delete el.dataset.lyricFont;
    };

    let lines = null, lyricsKey = null, titleKey = null, lead = 0;
    let phrase = null, phraseLine = -2, last = '', lastWord = '';
    const showPhrase = (texts, seed, line) => {
      if (phrase) {
        const old = phrase.el;
        old.classList.add('tb-exiting');
        setTimeout(() => old.remove(), EXIT_MS);
      }
      phrase = texts && texts.length ? Phrase(texts, seed) : null;
      phraseLine = line;
      if (phrase) words.appendChild(phrase.el);
    };
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      if (!lines) return;
      const a = audio();
      if (!a) return;
      const lv = lyricsView();
      const t = (a.currentTime || 0) * 1000 + lv.offset + lead;
      let li = lv.findLine(lines, t);
      const line = lines[li];
      if (!line || !line.words.length || t > line.end + LINGER_MS) li = -1;
      const ws = li >= 0 ? line.words : [];
      const revealed = ws.filter((w) => w.start <= t).length;
      const active = ws.findIndex((w) => w.start <= t && t < w.end);
      const word = `${li}:${revealed}`;
      if (revealed > 0 && word !== lastWord) eq.kick();
      lastWord = word;
      const key = `${li}:${revealed}:${active}`;
      if (key === last) return;
      last = key;
      if (li !== phraseLine) showPhrase(li >= 0 ? ws.map((w) => w.text) : null, li, li);
      if (phrase) phrase.set(revealed, active);
    };
    frame = requestAnimationFrame(tick);

    return {
      el,
      update(s) {
        playing = s.playing;
        if (s.track && s.track.thumb !== artKey) {
          artKey = s.track.thumb;
          artHolder.textContent = '';
          if (artKey) { const art = make('div', 'tb-stage-art'); art.style.backgroundImage = cssUrl(artKey); artHolder.appendChild(art); }
          setColors(artKey);
          applyStyle(artKey);
        }
        if (upNext) upNext.update(s);
        const d = riff() && riff().lyrics ? riff().lyrics() : null;
        const k = d ? d.key : '';
        if (k !== lyricsKey) {
          lyricsKey = k;
          lines = d && d.kind === 'synced' && lyricsView() ? lyricsView().rawLines(d) : null;
          lead = (d && d.lead) || 0;
          last = ''; phraseLine = -2;
          if (phrase) { phrase.el.remove(); phrase = null; }
          titleKey = null;
        }
        if (!lines && s.track && titleKey !== s.key) {
          // No timed lyrics: the song title gets the poster treatment instead.
          titleKey = s.key;
          const tw = String(s.track.title || '').split(/\s+/).filter(Boolean);
          showPhrase(tw, tw.length, -1);
          if (phrase) phrase.set(Infinity, -1);
        }
      },
      restyle() { setColors(artKey); applyStyle(artKey); glow.style.setProperty('--eq-glow', String(look().eqGlow == null ? 0.9 : look().eqGlow)); },
      destroy() { cancelAnimationFrame(frame); clearInterval(clockTimer); eq.stop(); if (upNext) upNext.destroy(); }
    };
  }

  // ---------- Riff's "Customize lyrics" settings, applied to Tunebox's lyrics ----------
  function riffLyricTweaks() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem('riff_tvk') || '{}') || {}; } catch (e) { s = {}; }
    const out = {};
    const font = s.font || 'inherit';
    if (font !== RIFF_TVK_SHIPPED.font && font !== 'inherit' && font !== 'default') {
      const tv = $('tv-karaoke');
      const stack = tv ? tv.style.getPropertyValue('--tvk-font').trim() : '';
      out.font = stack && stack !== 'inherit' ? stack : font;
    }
    if (['left', 'center', 'right'].includes(s.align) && s.align !== RIFF_TVK_SHIPPED.align) out.align = s.align;
    const size = Number(s.size);
    if (size && size !== RIFF_TVK_SHIPPED.size) out.scale = size / RIFF_TVK_SHIPPED.size;
    const weight = Number(s.weight);
    if (weight && weight !== RIFF_TVK_SHIPPED.weight) out.weight = weight;
    const gap = Number(s.gap);
    if (Number.isFinite(gap) && s.gap !== undefined && gap !== RIFF_TVK_SHIPPED.gap) out.space = Math.max(0.25, gap / RIFF_TVK_SHIPPED.gap);
    const blur = parseInt(localStorage.getItem('riff_tvk_bg_blur') || String(RIFF_BG_BLUR_SHIPPED), 10);
    if (Number.isFinite(blur) && blur !== RIFF_BG_BLUR_SHIPPED) out.blur = blur / RIFF_BG_BLUR_SHIPPED;
    return out;
  }

  // ---------- Focus mode ----------
  let root = null;
  let parts = [];          // pieces with update(s) / frame(s) / destroy()
  let lyricViews = [];
  let layout = 'stage';
  let effective = null;
  let trackKey = null;
  let idleTimer = 0, tick = 0, frame = 0, clockTimer = 0;
  let content = null, top = null, clockEl = null, backdrop = null, backdropKey = null, line = null;
  let homePanel = null, panelNext = null, unsubscribe = null;
  let tweaks = {};

  const stageShows = () => { const l = look(); return [l.stageClock, l.stageQueue, l.stageSparkles].join('|'); };

  function readLayout() {
    try { const v = localStorage.getItem(LAYOUT_KEY); return LAYOUTS.includes(v) ? v : 'stage'; } catch (e) { return 'stage'; }
  }
  function cycleLayout() {
    layout = LAYOUTS[(LAYOUTS.indexOf(layout) + 1) % LAYOUTS.length];
    try { localStorage.setItem(LAYOUT_KEY, layout); } catch (e) { /* this session only */ }
    render(true);
  }

  // Riff's tweaks on a Tunebox lyrics view (see riffLyricTweaks).
  function tuneLyrics(el) {
    if (tweaks.font) el.style.setProperty('--lyric-font', tweaks.font);
    el.style.setProperty('--tb-lyric-scale', String(tweaks.scale || 1));
    if (tweaks.weight) el.style.setProperty('--tb-lyric-weight', String(tweaks.weight)); else el.style.removeProperty('--tb-lyric-weight');
    if (tweaks.space) el.style.setProperty('--wheel-space', String((look().wheelSpacing || 1) * tweaks.space));
    if (tweaks.align) {
      el.classList.toggle('tb-center', tweaks.align === 'center');
      el.classList.toggle('tb-right', tweaks.align === 'right');
    } else el.classList.remove('tb-right');
  }
  function addLyrics(host, align, className) {
    const v = lyricsView().create(host, { align, className, onLook: tuneLyrics });
    lyricViews.push(v);
    return v;
  }

  // The top row: Riff's lyric tools, then Tunebox's layout and Exit chips.
  function renderTop(s) {
    top.textContent = '';
    const lyricsShown = effective === 'split' || effective === 'lyrics';
    const chip = (label, title, fn, kbd) => {
      const b = button('tb-focus-chip', title, null, fn);
      b.append(document.createTextNode(label));
      if (kbd) { b.append(document.createTextNode(' ')); b.appendChild(make('kbd', '', kbd)); }
      return b;
    };
    if (s.track) {
      if (lyricsShown) {
        top.appendChild(chip('Edit', 'Edit lyrics', () => click('btn-add-custom-lyrics')));
        top.appendChild(chip('Sync', 'Sync lyrics', () => click('btn-sync-lyrics')));
        const tr = $('btn-translate-lyrics');
        if (tr && !tr.classList.contains('hidden')) {
          const c = chip('Translate', 'Translate lyrics', () => { click('btn-translate-lyrics'); setTimeout(() => renderTop(snapshot()), 50); });
          c.classList.toggle('tb-on', tr.classList.contains('active'));
          top.appendChild(c);
        }
        const mode = $('btn-lyrics-mode');
        if (mode) {
          const label = (mode.textContent || '').trim() || 'Word';
          top.appendChild(chip(label, 'Switch between word-by-word and whole-line lyrics', () => { click('btn-lyrics-mode'); setTimeout(() => renderTop(snapshot()), 50); }));
        }
        const custom = chip('Customize', 'Font, size, spacing and background', (e) => { e.stopPropagation(); click('btn-tvk-settings'); });
        custom.dataset.tbCustomize = '1';
        top.appendChild(custom);
      }
      top.appendChild(chip(LAYOUT_LABEL[layout], 'Change layout', cycleLayout, 'L'));
    }
    if (effective === 'stage') {
      const panel = window.Tunebox && window.Tunebox.appearancePanel;
      if (panel) top.appendChild(chip('Customize', 'Visualizer, colors and what shows on Stage', () => panel.open('stage')));
    }
    top.appendChild(chip('Exit', 'Exit full screen', () => close(), 'Esc'));
  }

  function clearContent() {
    parts.forEach((p) => p.destroy && p.destroy());
    lyricViews.forEach((v) => v.destroy());
    parts = []; lyricViews = [];
    content.textContent = '';
    line = null;
  }

  function addLine() {
    // A thin progress line stays when the controls fade out.
    const l = make('div', 'tb-focus-line');
    const fill = make('div');
    l.appendChild(fill);
    content.appendChild(l);
    parts.push({ frame: (s) => { fill.style.width = `${s.dur ? Math.min(100, (s.pos / s.dur) * 100) : 0}%`; } });
  }

  // The cover column of Cover and Cover + lyrics (re-made per song, so it animates in).
  function coverStage(s) {
    const col = make('div', 'tb-focus-stage');
    let cover;
    if (s.track.thumb) { cover = make('img', 'tb-focus-cover'); cover.src = s.track.thumb; cover.alt = ''; }
    else cover = make('div', 'tb-focus-cover tb-art-placeholder');
    const title = make('div', 'tb-focus-title', s.track.title);
    const artist = make('div', 'tb-focus-artist', s.track.artist);
    const seek = SeekBar('tb-focus-progress');
    const controls = Controls('large');
    const volRow = make('div', 'tb-focus-volume-row tb-fades');
    const volume = VolumeControl();
    volRow.appendChild(volume.el);
    col.append(cover, title, artist, seek.el, controls.el, volRow);
    return {
      el: col,
      update(st) { cover.classList.toggle('tb-paused', !st.playing); controls.update(st); volume.update(st); seek.update(st); },
      frame(st) { seek.update(st); }
    };
  }

  function render(force) {
    if (!root) return;
    const s = snapshot();
    const lyricsAvailable = !!s.track && hasLyrics();
    // Stage works without lyrics too (it shows the song title), so it stays when a song has none.
    const next = lyricsAvailable || layout === 'stage' ? layout : 'cover';
    const changed = force || next !== effective;
    effective = next;
    root.className = `tb-focus dark-surface tb-layout-${effective}` + (root.classList.contains('tb-idle') ? ' tb-idle' : '');
    renderTop(s);
    topKey = chipKey(s);
    clockEl.hidden = effective === 'stage';
    if (!changed) return;
    clearContent();
    trackKey = s.key;
    if (!s.track) {
      const st = make('div', 'tb-focus-stage');
      st.append(make('div', 'tb-focus-title', 'Nothing playing'), make('div', 'tb-focus-artist', 'Start a song, then come back here.'));
      content.appendChild(st);
      return;
    }
    if (effective === 'stage' || effective === 'lyrics') {
      if (effective === 'stage') { const stage = Stage(); content.appendChild(stage.el); parts.push(stage); }
      else addLyrics(content, 'center', 'tb-focus-lyrics-full');
      const dock = FocusDock();
      content.appendChild(dock.el);
      parts.push(dock);
      addLine();
    } else {
      const lay = make('div', 'tb-focus-layout');
      content.appendChild(lay);
      let col = coverStage(s);
      lay.appendChild(col.el);
      let colKey = s.key;
      parts.push({
        update(st) {
          if (st.track && st.key !== colKey) { colKey = st.key; const n = coverStage(st); col.el.replaceWith(n.el); col = n; }
          col.update(st);
        },
        frame(st) { col.frame(st); }
      });
      if (effective === 'split') addLyrics(lay, 'left', 'tb-focus-lyrics');
    }
    parts.forEach((p) => p.update && p.update(s));
  }

  // What the chip row depends on: Riff shows Translate only for some lyrics, and Word/Line changes its label.
  let topKey = '';
  function chipKey(s) {
    const tr = $('btn-translate-lyrics'), mode = $('btn-lyrics-mode');
    return [!!s.track, effective, layout, tr && !tr.classList.contains('hidden'), tr && tr.classList.contains('active'), mode && mode.textContent.trim()].join('|');
  }

  function update() {
    if (!root) return;
    const s = snapshot();
    const ck = chipKey(s);
    if (ck !== topKey) { topKey = ck; renderTop(s); }
    if (s.key !== trackKey && (!s.track || !trackKey)) { render(true); return; }
    const lyricsAvailable = !!s.track && hasLyrics();
    const next = lyricsAvailable || layout === 'stage' ? layout : 'cover';
    if (next !== effective) { render(true); return; }
    trackKey = s.key;
    // Backdrop: the blurred cover, re-made per cover so it fades in.
    const art = s.track && s.track.thumb;
    if (art !== backdropKey) {
      backdropKey = art;
      if (backdrop) backdrop.remove();
      backdrop = null;
      if (art) { backdrop = make('div', 'tb-focus-backdrop'); backdrop.style.backgroundImage = cssUrl(art); root.insertBefore(backdrop, root.firstChild); }
    }
    parts.forEach((p) => p.update && p.update(s));
  }

  function loop() {
    frame = requestAnimationFrame(loop);
    const a = audio();
    const s = { pos: a ? (a.currentTime || 0) * 1000 : 0, dur: a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : 0, track: true };
    const full = Object.assign(snapshot(), s);
    parts.forEach((p) => p.frame && p.frame(full));
  }

  function wake() {
    if (!root) return;
    root.classList.remove('tb-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (root && !(homePanel && homePanel.classList.contains('open'))) root.classList.add('tb-idle'); }, IDLE_MS);
  }

  // Something of Riff's is open over Focus mode (the lyrics editor, sync mode, a dialog): keys are theirs.
  const covered = () => [...document.querySelectorAll('.modal-backdrop, #sync-mode-overlay')].some((m) => {
    if (m.classList.contains('hidden') || !m.getClientRects().length) return false;
    const cs = getComputedStyle(m);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01 && cs.pointerEvents !== 'none';
  });

  function onKey(e) {
    if (!root) return;
    wake();
    const sheet = window.Tunebox && window.Tunebox.appearancePanel;
    if (sheet && sheet.isOpen) return;
    const t = e.target;
    if (covered() || t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type !== 'range') || (t && t.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const handled = () => { e.preventDefault(); e.stopImmediatePropagation(); };
    const s = snapshot();
    if (e.key === 'Escape') {
      handled();
      const panel = $('tvk-panel');
      if (panel && panel.classList.contains('open')) { panel.classList.remove('open'); return; }
      close();
    } else if (e.code === 'Space') { handled(); click('btn-play-pause'); }
    else if (e.key === 'ArrowRight') { handled(); click('btn-next'); }
    else if (e.key === 'ArrowLeft') { handled(); click('btn-prev'); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      handled();
      const v = Math.max(0, Math.min(100, s.volume + (e.key === 'ArrowUp' ? VOLUME_STEP : -VOLUME_STEP)));
      setVolume(v);
      notify(`Volume ${v}%`);
    } else if (e.key.toLowerCase() === 'm') {
      handled();
      setVolume(s.volume > 0 ? 0 : 60);
      notify(s.volume > 0 ? 'Muted' : 'Volume 60%');
    } else if (e.key.toLowerCase() === 'l') { handled(); cycleLayout(); }
  }
  function onFullscreenChange() {
    if (!document.fullscreenElement && root) {
      if (typeof window.closeTvKaraoke === 'function') window.closeTvKaraoke(); else close();
    }
  }
  // Buttons don't keep keyboard focus here, so Space always means play/pause.
  const onMouseDown = (e) => { if (e.target.closest && e.target.closest('button')) e.preventDefault(); };

  function open() {
    if (root) return;
    layout = readLayout();
    tweaks = riffLyricTweaks();
    root = make('div', 'tb-focus dark-surface');
    if (tweaks.blur) root.style.setProperty('--tb-backdrop-blur', `${Math.round(120 * tweaks.blur)}px`);
    top = make('div', 'tb-focus-top tb-fades');
    clockEl = make('div', 'tb-focus-clock');
    const clockTick = () => { clockEl.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
    clockTick();
    clockTimer = setInterval(clockTick, 10000);
    content = make('div');
    content.style.display = 'contents';
    root.append(top, clockEl, content);
    // Riff's "Customize lyrics" sheet comes along, under the Customize chip.
    homePanel = $('tvk-panel');
    if (homePanel) { panelNext = homePanel.nextSibling; root.appendChild(homePanel); }
    document.body.appendChild(root);
    // Nothing behind Focus mode keeps the keyboard (a search box would otherwise swallow Space, L, M…).
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    if (app()) app().setDarkSurface(true);
    backdropKey = undefined;
    effective = null;
    trackKey = null;
    render(true);
    update();
    tick = setInterval(update, 250);
    frame = requestAnimationFrame(loop);
    root.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', wake);
    window.addEventListener('mousedown', wake);
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    // Riff applies Customize changes to its karaoke screen; follow them here.
    const tv = $('tv-karaoke');
    if (tv && window.MutationObserver) {
      const mo = new MutationObserver(() => {
        if (!root) return;
        tweaks = riffLyricTweaks();
        lyricViews.forEach((v) => v.refresh());
        if (tweaks.blur) root.style.setProperty('--tb-backdrop-blur', `${Math.round(120 * tweaks.blur)}px`);
        else root.style.removeProperty('--tb-backdrop-blur');
      });
      mo.observe(tv, { attributes: true, attributeFilter: ['style', 'data-tvk-align'] });
      root._mo = mo;
    }
    let shown = stageShows();
    unsubscribe = app() ? app().subscribe(() => {
      const now = stageShows();
      if (now !== shown && effective === 'stage') { shown = now; render(true); return; }
      shown = now;
      parts.forEach((p) => p.restyle && p.restyle());
    }) : null;
    wake();
    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }

  function close() {
    if (!root) return;
    // Keep Riff's state in step (its button, Esc handling) when closed from here.
    if (typeof window.closeTvKaraoke === 'function' && window.tbFocusClosing !== true) {
      window.tbFocusClosing = true;
      try { window.closeTvKaraoke(); } finally { window.tbFocusClosing = false; }
      if (!root) return;
    }
    const el = root;
    root = null;
    clearInterval(tick); clearInterval(clockTimer); clearTimeout(idleTimer);
    cancelAnimationFrame(frame);
    if (el._mo) el._mo.disconnect();
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    window.removeEventListener('mousemove', wake);
    window.removeEventListener('mousedown', wake);
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    parts.forEach((p) => p.destroy && p.destroy());
    lyricViews.forEach((v) => v.destroy());
    parts = []; lyricViews = [];
    if (homePanel) {
      homePanel.classList.remove('open');
      const tv = $('tv-karaoke');
      if (panelNext && panelNext.parentNode === tv) tv.insertBefore(homePanel, panelNext); else if (tv) tv.appendChild(homePanel);
    }
    homePanel = null;
    if (app()) app().setDarkSurface(false);
    el.remove();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }

  window.Tunebox = Object.assign(window.Tunebox || {}, {
    focus: {
      open, close, isOpen: () => !!root, layout: () => effective,
      /** Whether Focus mode uses this key (Riff's own shortcuts leave these to it). */
      handles: (e) => !e.ctrlKey && !e.metaKey && !e.altKey &&
        (e.key === 'Escape' || e.code === 'Space' || /^Arrow(Left|Right|Up|Down)$/.test(e.key) || /^[lm]$/i.test(e.key)),
      // For the Appearance sheet's Stage tab (its live visualizer preview).
      startEqualizer, withPartner, hexToRgb
    }
  });
})();
