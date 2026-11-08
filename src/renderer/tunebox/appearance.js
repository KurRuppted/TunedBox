/* Tunebox appearance: the look settings (light/dark, accent, fonts, text sizes, album colours) and themes.
   A plain-JS port of Tunebox's lib/appearance.ts, lib/themes.ts, lib/theme.ts and lib/palette.ts, so the
   Tunebox look runs inside Riff without React. It writes CSS variables and data-theme onto <html>;
   tunebox/tokens.css turns those into the colours every screen uses.
   Exposed as window.Tunebox.appearance / .themes. Loaded before app.js. */
(function () {
  'use strict';

  // ---------- Options ----------

  const ACCENTS = [
    { id: 'blue', label: 'Blue', light: '#007aff', dark: '#0a84ff', on: '#ffffff' },
    { id: 'purple', label: 'Purple', light: '#af52de', dark: '#bf5af2', on: '#ffffff' },
    { id: 'pink', label: 'Pink', light: '#ff2d55', dark: '#ff375f', on: '#ffffff' },
    { id: 'red', label: 'Red', light: '#ff3b30', dark: '#ff453a', on: '#ffffff' },
    { id: 'orange', label: 'Orange', light: '#ff9500', dark: '#ff9f0a', on: '#ffffff' },
    { id: 'yellow', label: 'Yellow', light: '#e6b800', dark: '#ffd60a', on: '#1d1d1f' },
    { id: 'green', label: 'Green', light: '#28cd41', dark: '#32d74b', on: '#ffffff' },
    { id: 'graphite', label: 'Graphite', light: '#8e8e93', dark: '#98989d', on: '#ffffff' }
  ];

  // Fraunces (Paper theme) and Oswald (Neon theme) are bundled in vendor/fonts (tunebox/fonts.css).
  const FONTS = [
    { id: 'inter', label: 'Inter', stack: "'Inter Variable', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif" },
    { id: 'system', label: 'System', stack: "'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif" },
    { id: 'fraunces', label: 'Fraunces', stack: "'Fraunces Variable', Georgia, serif" },
    { id: 'oswald', label: 'Oswald', stack: "'Oswald Variable', 'Segoe UI', sans-serif" },
    { id: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
    { id: 'mono', label: 'Mono', stack: "'Cascadia Code', Consolas, 'Courier New', monospace" }
  ];

  const GRADIENTS = [
    { id: 'dawn', label: 'Dawn', css: 'radial-gradient(60% 70% at 15% 10%, rgb(255 149 120 / 0.45), transparent 70%), radial-gradient(55% 65% at 85% 25%, rgb(255 204 112 / 0.38), transparent 70%), radial-gradient(70% 70% at 50% 100%, rgb(214 120 255 / 0.3), transparent 70%)' },
    { id: 'ocean', label: 'Ocean', css: 'radial-gradient(60% 70% at 10% 15%, rgb(64 156 255 / 0.42), transparent 70%), radial-gradient(55% 60% at 90% 20%, rgb(90 220 220 / 0.35), transparent 70%), radial-gradient(70% 70% at 60% 100%, rgb(88 86 214 / 0.32), transparent 70%)' },
    { id: 'aurora', label: 'Aurora', css: 'radial-gradient(60% 70% at 20% 0%, rgb(48 209 88 / 0.36), transparent 70%), radial-gradient(55% 60% at 85% 30%, rgb(100 210 255 / 0.36), transparent 70%), radial-gradient(70% 70% at 40% 100%, rgb(191 90 242 / 0.3), transparent 70%)' },
    { id: 'dusk', label: 'Dusk', css: 'radial-gradient(60% 70% at 85% 10%, rgb(255 55 95 / 0.36), transparent 70%), radial-gradient(55% 60% at 10% 30%, rgb(94 92 230 / 0.4), transparent 70%), radial-gradient(70% 70% at 50% 100%, rgb(255 159 10 / 0.26), transparent 70%)' }
  ];

  const TEXT_SIZE_MIN = 0.7;
  const TEXT_SIZE_MAX = 1.6;
  const RANGES = {
    dim: [0, 0.8, 0.35],
    eqSize: [2, 8, 4],
    eqHeight: [0.5, 2.5, 1],
    eqSpeed: [0.25, 2.5, 1],
    eqGlow: [0, 1.5, 0.9],
    wheelLines: [1, 6, 3],
    wheelBlur: [0, 2.5, 1],
    wheelTilt: [0, 2, 1],
    wheelSpacing: [0.5, 2, 1]
  };

  // Look settings only. Layout settings (sidebar, Home sections) arrive with their screens in later stages.
  const DEFAULTS = Object.freeze({
    theme: 'dark', // Tunebox in Riff opens dark; light and system are options
    accent: 'blue',
    albumTint: false,
    font: 'inter',
    customFont: '',
    background: 'none',
    dim: RANGES.dim[2],
    eqMode: 'rainbow',
    eqColors: ['#ff3cac', '#784ba0', '#2b86c5'],
    eqStyle: 'bars',
    eqSize: RANGES.eqSize[2],
    eqHeight: RANGES.eqHeight[2],
    eqSpeed: RANGES.eqSpeed[2],
    eqGlow: RANGES.eqGlow[2],
    lyricFont: 'default',
    lyricCustomFont: '',
    lyricColorMode: 'default',
    lyricColors: { sung: '#ffffff', unsung: '#ffffff', highlight: '#f5c542' },
    wheelLines: RANGES.wheelLines[2],
    wheelBlur: RANGES.wheelBlur[2],
    wheelTilt: RANGES.wheelTilt[2],
    wheelSpacing: RANGES.wheelSpacing[2],
    wheelAlign: 'auto',
    stageClock: true,
    stageQueue: true,
    stageSparkles: true,
    textSizes: { ui: 1, head: 1, lyrics: 1, stage: 1, clock: 1 }
  });

  // ---------- Validation (saved settings and pasted theme codes are untrusted) ----------

  const HEX = /^#[0-9a-f]{6}$/i;
  const isHex = (v) => typeof v === 'string' && HEX.test(v);
  const oneOf = (v, options, fallback) => (options.includes(v) ? v : fallback);
  const num = (v, [min, max, fallback]) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback);
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
  const text = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
  const hex = (v, fallback) => (isHex(v) ? v.toLowerCase() : fallback);

  function sanitize(raw, base = DEFAULTS) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const d = base;
    const has = (k) => k in s;
    const sizes = s.textSizes && typeof s.textSizes === 'object' ? s.textSizes : {};
    const lyric = s.lyricColors && typeof s.lyricColors === 'object' ? s.lyricColors : {};
    const accentOk = (v) => v === 'album' || isHex(v) || ACCENTS.some((a) => a.id === v);
    const fontOk = (v, extra) => extra.includes(v) || FONTS.some((f) => f.id === v);
    const bgOk = (v) => ['none', 'artwork', 'custom'].includes(v) || GRADIENTS.some((g) => g.id === v);
    const size = (v, fallback) => num(v, [TEXT_SIZE_MIN, TEXT_SIZE_MAX, fallback]);
    const range = (key) => num(s[key], [RANGES[key][0], RANGES[key][1], d[key]]);
    return {
      theme: oneOf(s.theme, ['system', 'light', 'dark'], d.theme),
      accent: accentOk(s.accent) ? s.accent : d.accent,
      albumTint: bool(s.albumTint, d.albumTint),
      font: fontOk(s.font, ['custom']) ? s.font : d.font,
      customFont: has('customFont') ? text(s.customFont) : d.customFont,
      background: bgOk(s.background) ? s.background : d.background,
      dim: range('dim'),
      eqMode: oneOf(s.eqMode, ['rainbow', 'accent', 'artwork', 'custom'], d.eqMode),
      eqColors: Array.isArray(s.eqColors) && s.eqColors.some(isHex)
        ? s.eqColors.filter(isHex).slice(0, 4).map((c) => c.toLowerCase())
        : d.eqColors.slice(),
      eqStyle: oneOf(s.eqStyle, ['bars', 'wave', 'blocks', 'off'], d.eqStyle),
      eqSize: range('eqSize'),
      eqHeight: range('eqHeight'),
      eqSpeed: range('eqSpeed'),
      eqGlow: range('eqGlow'),
      lyricFont: fontOk(s.lyricFont, ['default', 'custom']) ? s.lyricFont : d.lyricFont,
      lyricCustomFont: has('lyricCustomFont') ? text(s.lyricCustomFont) : d.lyricCustomFont,
      lyricColorMode: oneOf(s.lyricColorMode, ['default', 'album', 'custom'], d.lyricColorMode),
      lyricColors: {
        sung: hex(lyric.sung, d.lyricColors.sung),
        unsung: hex(lyric.unsung, d.lyricColors.unsung),
        highlight: hex(lyric.highlight, d.lyricColors.highlight)
      },
      wheelLines: Math.round(range('wheelLines')),
      wheelBlur: range('wheelBlur'),
      wheelTilt: range('wheelTilt'),
      wheelSpacing: range('wheelSpacing'),
      wheelAlign: oneOf(s.wheelAlign, ['auto', 'left', 'center'], d.wheelAlign),
      stageClock: bool(s.stageClock, d.stageClock),
      stageQueue: bool(s.stageQueue, d.stageQueue),
      stageSparkles: bool(s.stageSparkles, d.stageSparkles),
      textSizes: {
        ui: size(sizes.ui, d.textSizes.ui),
        head: size(sizes.head, d.textSizes.head),
        lyrics: size(sizes.lyrics, d.textSizes.lyrics),
        stage: size(sizes.stage, d.textSizes.stage),
        clock: size(sizes.clock, d.textSizes.clock)
      }
    };
  }

  // ---------- Colour helpers (lib/palette.ts) ----------

  const rgbToHex = ([r, g, b]) =>
    '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

  function toHsl([r, g, b]) {
    const R = r / 255, G = g / 255, B = b / 255;
    const max = Math.max(R, G, B), min = Math.min(R, G, B);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
  }

  function fromHsl(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }

  function withPartner(color) {
    const [h, s, l] = toHsl(color);
    return [color, fromHsl((h + 25) % 360, Math.min(1, s + 0.1), Math.min(0.78, l + 0.18))];
  }

  function readPixels(url, size) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, size, size);
          resolve(ctx.getImageData(0, 0, size, size).data);
        } catch (e) {
          resolve(null); // The image wouldn't allow reading its pixels.
        }
      };
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // Brightens a very dark colour to 30% lightness so it shows on a dark screen, keeping its chroma.
  function liftDark(c) {
    const [h, , l] = toHsl(c);
    if (l >= 0.3) return c;
    const chroma = (Math.max(...c) - Math.min(...c)) / 255;
    return fromHsl(h, Math.min(1, chroma / (1 - Math.abs(2 * 0.3 - 1))), 0.3);
  }

  // The colours covering most of an image, most common first (k-means, near shades merged).
  function dominantColors(pixels, count = 3) {
    const pts = [];
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 128) pts.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    if (!pts.length) return [];
    const K = Math.min(8, pts.length);
    const byLight = pts.slice().sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    let centres = Array.from({ length: K }, (_, k) => byLight[Math.floor(((k + 0.5) * byLight.length) / K)].slice());
    let sizes = new Array(K).fill(0);
    for (let iter = 0; iter < 12; iter++) {
      const sums = Array.from({ length: K }, () => [0, 0, 0]);
      sizes = new Array(K).fill(0);
      for (const p of pts) {
        let best = 0, bestD = Infinity;
        for (let k = 0; k < K; k++) {
          const d = dist2(p, centres[k]);
          if (d < bestD) { bestD = d; best = k; }
        }
        sizes[best]++;
        sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2];
      }
      centres = centres.map((c, k) => (sizes[k] ? [sums[k][0] / sizes[k], sums[k][1] / sizes[k], sums[k][2] / sizes[k]] : c));
    }
    const MIN_APART = 48 ** 2;
    const groups = [];
    for (const k of [...centres.keys()].sort((a, b) => sizes[b] - sizes[a])) {
      if (!sizes[k]) continue;
      const near = groups.find((g) => dist2(g.colour, centres[k]) < MIN_APART);
      if (!near) { groups.push({ colour: centres[k], size: sizes[k] }); continue; }
      const total = near.size + sizes[k];
      near.colour = near.colour.map((v, c) => (v * near.size + centres[k][c] * sizes[k]) / total);
      near.size = total;
    }
    return groups.sort((a, b) => b.size - a.size).slice(0, count).map(({ colour }) => liftDark(colour.map(Math.round)));
  }

  const coverCache = new Map();
  function coverColors(url) {
    if (coverCache.has(url)) return coverCache.get(url);
    const job = readPixels(url, 64).then((px) => {
      if (!px) return null;
      const colors = dominantColors(px, 3);
      return colors.length ? (colors.length === 1 ? withPartner(colors[0]) : colors) : null;
    });
    coverCache.set(url, job);
    if (coverCache.size > 60) coverCache.delete(coverCache.keys().next().value);
    return job;
  }

  // ---------- State ----------

  const KEY = 'tunebox.appearance';
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  // Defaults until init(): Riff swaps localStorage for its disk store at the top of app.js, so saved
  // settings can only be read after that (app.js calls Tunebox.appearance.init()).
  let state = sanitize({});
  let album = null; // the playing cover's main colours, [[r,g,b], ...]
  let darkSurface = false;
  const listeners = new Set();
  const emit = () => listeners.forEach((l) => { try { l(state); } catch (e) { console.warn('[tunebox] listener', e); } });

  function load() {
    try { return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return sanitize({}); }
  }

  function stackFor(id, custom) {
    if (id === 'custom' && custom && custom.trim()) {
      return '"' + custom.trim().replace(/["\\;{}<>]/g, '') + '", ' + FONTS[0].stack;
    }
    return (FONTS.find((f) => f.id === id) || FONTS[0]).stack;
  }

  const isDark = () => (state.theme === 'system' ? media.matches : state.theme === 'dark');

  // The most colourful of the cover's colours, made readable as an accent; null when the cover is basically grey.
  function albumAccent(colors, dark) {
    if (!colors || !colors.length) return null;
    const chroma = (c) => (Math.max(...c) - Math.min(...c)) / 255;
    const best = colors.slice().sort((a, b) => chroma(b) - chroma(a))[0];
    if (chroma(best) < 0.12) return null;
    const [h, s, l] = toHsl(best);
    const light = dark ? Math.min(0.68, Math.max(0.56, l)) : Math.min(0.5, Math.max(0.4, l));
    return rgbToHex(fromHsl(h, Math.max(0.55, s), light));
  }

  function textOn(hexColor) {
    const n = parseInt(hexColor.slice(1), 16);
    const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
    return lum > 0.45 ? '#1d1d1f' : '#ffffff';
  }

  function accentColor(look, dark) {
    if (look.accent === 'album') return albumAccent(album, dark) || (dark ? ACCENTS[0].dark : ACCENTS[0].light);
    if (isHex(look.accent)) return look.accent;
    const preset = ACCENTS.find((x) => x.id === look.accent) || ACCENTS[0];
    return dark ? preset.dark : preset.light;
  }

  // Writes light/dark, font, accent, tint and text sizes onto <html>.
  function apply() {
    const root = document.documentElement;
    const dark = isDark();
    root.dataset.theme = dark ? 'dark' : 'light';
    const preset = ACCENTS.find((x) => x.id === state.accent);
    const color = accentColor(state, dark);
    const darkColor = accentColor(state, true);
    const s = root.style;
    s.setProperty('--font', stackFor(state.font, state.customFont));
    s.setProperty('--accent', color);
    s.setProperty('--accent-hover', `color-mix(in srgb, ${color} 85%, ${dark ? 'white' : 'black'})`);
    s.setProperty('--on-accent', preset ? preset.on : textOn(color));
    s.setProperty('--accent-dark', darkColor);
    s.setProperty('--on-accent-dark', preset ? preset.on : textOn(darkColor));
    const tint = state.albumTint && album ? album : null;
    for (let i = 0; i < 3; i++) {
      if (tint) s.setProperty(`--tint-${i + 1}`, rgbToHex(tint[i % tint.length]));
      else s.removeProperty(`--tint-${i + 1}`);
    }
    const t = state.textSizes;
    s.setProperty('--fs', String(t.ui));
    s.setProperty('--fs-ui', String(t.ui));
    s.setProperty('--fs-head', String(t.head));
    s.setProperty('--fs-lyrics', String(t.lyrics));
    s.setProperty('--fs-stage', String(t.stage));
    s.setProperty('--fs-clock', String(t.clock));
    // Riff writes its saved corner radius at startup; Tunebox's radius scale (tokens.css) replaces it.
    for (const p of ['--md-shape-corner-l', '--md-shape-corner-m']) s.removeProperty(p);
  }

  const appearance = {
    DEFAULTS,
    ACCENTS,
    FONTS,
    GRADIENTS,
    /** Loads the saved look (and saved themes) once Riff's storage is ready. */
    init() {
      state = load();
      saved = loadSaved();
      apply();
      emit();
    },
    get: () => state,
    isDark,
    /** 'dark' or 'light': what the window shows right now. */
    effectiveMode: () => (isDark() ? 'dark' : 'light'),
    set(patch) {
      state = sanitize(Object.assign({}, state, patch));
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* not saved; applies until the app closes */ }
      apply();
      emit();
    },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    refresh: apply,
    /** The accent as #rrggbb for light or dark surroundings. */
    accentColor: (dark = isDark()) => accentColor(state, dark),
    /** Call with true while a screen that's always dark (Now Playing, full screen) fills the window. */
    setDarkSurface(on) { darkSurface = !!on; },
    get darkSurface() { return darkSurface; },
    coverColors,
    album: {
      get: () => album,
      set(colors) { album = colors; apply(); emit(); }
    }
  };

  // ---------- Themes (lib/themes.ts) ----------

  const look = (a) => sanitize(a); // every Appearance field is a look setting in this port
  const preset = (id, name, patch) => ({ id, name, builtIn: true, look: look(Object.assign({}, DEFAULTS, patch)) });
  const PRESETS = [
    preset('tunebox', 'Tunebox', {}),
    preset('midnight', 'Midnight', {
      theme: 'dark', accent: 'purple', background: 'dusk', eqMode: 'custom', eqColors: ['#5e5ce6', '#bf5af2', '#64d2ff'],
      eqStyle: 'wave', eqGlow: 1.2, lyricColorMode: 'custom', lyricColors: { sung: '#ece8ff', unsung: '#a59ed6', highlight: '#bf5af2' }
    }),
    preset('paper', 'Paper', {
      theme: 'light', accent: '#c2410c', font: 'fraunces', background: 'dawn', eqMode: 'accent', eqStyle: 'blocks', eqGlow: 0.4,
      lyricFont: 'fraunces', lyricColorMode: 'custom', lyricColors: { sung: '#fff7ed', unsung: '#fed7aa', highlight: '#fb923c' }, wheelTilt: 0.5
    }),
    preset('neon', 'Neon', {
      theme: 'dark', accent: '#ff2bd6', font: 'oswald', background: 'aurora', eqMode: 'rainbow', eqStyle: 'bars', eqSize: 3,
      eqHeight: 1.5, eqSpeed: 1.6, eqGlow: 1.5, lyricColorMode: 'custom', lyricColors: { sung: '#7df9ff', unsung: '#ff9ff3', highlight: '#ff2bd6' }
    }),
    preset('album', 'Album', { accent: 'album', albumTint: true, background: 'artwork', eqMode: 'artwork', eqStyle: 'wave', lyricColorMode: 'album' }),
    preset('minimal', 'Minimal', {
      accent: 'graphite', font: 'system', eqStyle: 'off', stageSparkles: false, stageQueue: false, lyricFont: 'system',
      wheelLines: 1, wheelTilt: 0, wheelBlur: 0
    })
  ];

  const THEMES_KEY = 'tunebox.themes';
  const MAX_SAVED = 40;
  const themeListeners = new Set();

  function loadSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(THEMES_KEY) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((t) => t && typeof t.id === 'string' && typeof t.name === 'string')
        .map((t) => ({ id: t.id, name: t.name.slice(0, 40), look: look(t.look) }));
    } catch (e) { return []; }
  }
  let saved = [];
  function commit(next) {
    saved = next;
    try { localStorage.setItem(THEMES_KEY, JSON.stringify(saved)); } catch (e) { /* listed until the app closes */ }
    themeListeners.forEach((l) => l(saved));
  }

  const PREFIX = 'TUNEBOX-THEME-1:';
  const toBase64Url = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromBase64Url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

  const themes = {
    PRESETS,
    saved: () => saved,
    subscribe(l) { themeListeners.add(l); return () => themeListeners.delete(l); },
    /** Switches to a theme's look. */
    apply(theme) { appearance.set(theme.look); },
    matches: (theme) => JSON.stringify(theme.look) === JSON.stringify(look(state)),
    /** Saves the current look under a name; a theme with the same name is replaced. */
    saveCurrent(name) {
      const clean = String(name || '').trim().slice(0, 40) || 'My Theme';
      const theme = { id: 't' + Date.now().toString(36), name: clean, look: look(state) };
      commit([theme, ...saved.filter((t) => t.name.toLowerCase() !== clean.toLowerCase())].slice(0, MAX_SAVED));
      return theme;
    },
    add(theme) {
      let name = theme.name;
      for (let n = 2; saved.some((t) => t.name.toLowerCase() === name.toLowerCase()); n++) name = `${theme.name} ${n}`;
      const added = { id: 't' + Date.now().toString(36), name, look: look(theme.look) };
      commit([added, ...saved].slice(0, MAX_SAVED));
      return added;
    },
    remove(id) { commit(saved.filter((t) => t.id !== id)); },
    /** A theme as a short code to paste elsewhere; only settings that differ from the defaults go in. */
    encode(name, themeLook) {
      const diff = {};
      for (const [k, v] of Object.entries(themeLook)) if (JSON.stringify(v) !== JSON.stringify(DEFAULTS[k])) diff[k] = v;
      if (diff.background === 'custom') delete diff.background;
      return PREFIX + toBase64Url(JSON.stringify({ n: name, l: diff }));
    },
    /** Reads a pasted code back into a theme, or throws an Error with a message to show. */
    decode(code) {
      const body = String(code || '').replace(/\s+/g, '');
      if (!body.toUpperCase().startsWith(PREFIX)) throw new Error('That isn’t a Tunebox theme code. Codes start with TUNEBOX-THEME-1:');
      let data;
      try { data = JSON.parse(fromBase64Url(body.slice(PREFIX.length))); } catch (e) {
        throw new Error('That theme code is incomplete or damaged. Try copying it again.');
      }
      const name = typeof data.n === 'string' && data.n.trim() ? data.n.trim().slice(0, 40) : 'Shared Theme';
      return { name, look: look(Object.assign({}, DEFAULTS, data.l)) };
    }
  };

  // ---------- Album colours: follow the cover in the player bar ----------

  let lastCover = '';
  function followCover() {
    const img = document.getElementById('playbar-artwork');
    const src = img && img.getAttribute('src');
    if (!src || src === lastCover || /^(null|undefined)?$/.test(src)) return;
    lastCover = src;
    coverColors(img.currentSrc || src).then((colors) => {
      // Keep the previous song's colours until the new ones are ready, so the accent never flashes back.
      if (colors && lastCover === src) appearance.album.set(colors);
    });
  }

  function watchCover() {
    const img = document.getElementById('playbar-artwork');
    if (!img) return;
    new MutationObserver(followCover).observe(img, { attributes: true, attributeFilter: ['src'] });
    followCover();
  }

  // ---------- Start ----------

  apply();
  media.addEventListener('change', () => { if (state.theme === 'system') { apply(); emit(); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchCover, { once: true });
  else watchCover();

  window.Tunebox = Object.assign(window.Tunebox || {}, { appearance, themes });
})();
