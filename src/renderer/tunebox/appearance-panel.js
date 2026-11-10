/* Tunebox Appearance sheet (stage 7): a plain-JS port of Tunebox's AppearancePanel with its Themes,
   General, Home, Lyrics and Stage tabs. Everything it changes goes through window.Tunebox.appearance / .themes
   (tunebox/appearance.js). Opened from Home's
   appearance button, Settings → Theme, and Focus mode's Customize chip on Stage.
   Exposed as window.Tunebox.appearancePanel.open(tab). Loaded after app.js. */
(function () {
  'use strict';

  const root = document.documentElement;
  const T = window.Tunebox || {};
  const A = T.appearance;
  const Th = T.themes;
  if (!root || root.id !== 'tb' || !A || !Th) return;

  const h = (tag, props, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
    return el;
  };
  const isHex = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ''));
  const percent = (v) => `${Math.round(v * 100)}%`;
  const artwork = () => {
    const img = document.getElementById('playbar-artwork');
    const src = img && img.getAttribute('src');
    return src && !/^(null|undefined)?$/.test(src) ? (img.currentSrc || src) : '';
  };

  // ---------- Controls (Tunebox's components/appearance/controls.tsx) ----------
  function segmented(value, options, onChange) {
    return h('div', { class: 'tb-segmented', role: 'radiogroup' },
      options.map(([v, label]) => h('button', {
        type: 'button', role: 'radio', 'aria-checked': String(value === v), class: value === v ? 'on' : '', onclick: () => onChange(v)
      }, label)));
  }
  function toggleRow(label, hint, checked, onChange) {
    return h('label', { class: 'tb-toggle-row', title: hint },
      h('span', {}, label),
      h('button', { type: 'button', role: 'switch', 'aria-checked': String(checked), class: `tb-switch ${checked ? 'on' : ''}`, onclick: (e) => { e.preventDefault(); onChange(!checked); } }));
  }
  function block(label, note, action, ...children) {
    return h('div', { class: 'tb-sheet-block' },
      h('div', { class: 'tb-sheet-head-row' }, h('div', { class: 'tb-sheet-label' }, label), action),
      note ? h('p', { class: 'tb-sheet-note' }, note) : null,
      ...children);
  }
  function sliderRow(label, hint, value, min, max, step, def, format, onChange) {
    const out = h('span', { class: 'tb-size-value' }, format(value));
    // sl-done: Riff's slider code (enhanceSliders in app.js) leaves it as a plain Tunebox slider.
    const input = h('input', { type: 'range', class: 'sl-done', min, max, step, value, '--fill': `${((value - min) / (max - min)) * 100}%` });
    const set = (v) => {
      input.value = v;
      input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
      out.textContent = format(v);
      onChange(v);
    };
    input.addEventListener('input', () => set(Number(input.value)));
    input.addEventListener('dblclick', () => set(def));
    return h('label', { class: 'tb-size-row', title: hint }, h('span', { class: 'tb-size-label' }, label), input, out);
  }

  // ---------- Themes tab ----------
  function themePreview(themeLook) {
    const dark = themeLook.theme === 'dark' || (themeLook.theme === 'system' && A.isDark());
    const g = A.GRADIENTS.find((x) => x.id === themeLook.background);
    const art = artwork();
    const picture = A.backgroundImage && A.backgroundImage.get();
    const bg = g ? g.css : themeLook.background === 'artwork' && art ? `url("${art}")`
      : themeLook.background === 'custom' && picture ? `url("${picture}")` : 'none';
    return h('span', {
      class: `tb-theme-preview ${dark ? 'dark' : 'light'} ${themeLook.background === 'artwork' ? 'blurred' : ''}`,
      '--tp-bg': bg, '--tp-accent': A.accentFor(themeLook, dark), style: { fontFamily: A.stackFor(themeLook.font, themeLook.customFont) }
    },
    h('span', { class: 'tb-tp-sidebar' }, h('i'), h('i'), h('i')),
    h('span', { class: 'tb-tp-main' }, h('span', { class: 'tb-tp-title' }, 'Aa'), h('span', { class: 'tb-tp-pill' })));
  }
  function themeCard(theme) {
    const on = Th.matches(theme);
    const tools = [];
    tools.push(h('button', { type: 'button', title: 'Copy a code to share this theme', onclick: (e) => { e.stopPropagation(); copy(Th.encode(theme.name, theme.look), `Copied the code for ${theme.name}`); } }, 'Share'));
    if (!theme.builtIn) tools.push(h('button', { type: 'button', title: 'Delete this theme', onclick: (e) => { e.stopPropagation(); Th.remove(theme.id); render(); } }, 'Delete'));
    return h('div', { class: `tb-theme-card ${on ? 'on' : ''}` },
      h('button', { type: 'button', class: 'tb-theme-apply', title: `Use ${theme.name}`, onclick: () => { Th.apply(theme); render(); } },
        themePreview(theme.look), h('span', { class: 'tb-theme-name' }, theme.name)),
      h('div', { class: 'tb-theme-tools' }, tools));
  }
  function copy(text, message) {
    const done = () => toast(message);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast('Couldn’t copy the code.'));
    else done();
  }
  function toast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
  }
  function themesTab() {
    const saved = Th.saved();
    const nameInput = h('input', { class: 'tb-theme-input', placeholder: 'Name for your current look', maxlength: '40', spellcheck: 'false' });
    const codeInput = h('input', { class: 'tb-theme-input', placeholder: 'Paste a theme code (TUNEBOX-THEME-1:…)', spellcheck: 'false' });
    const codeError = h('p', { class: 'tb-sheet-note tb-error', hidden: true });
    return [
      block('Built-in themes', null, null, h('div', { class: 'tb-theme-grid' }, Th.PRESETS.map(themeCard))),
      block('My themes', saved.length ? null : 'Save how things look now as a theme to come back to it, or share it with a code.', null,
        saved.length ? h('div', { class: 'tb-theme-grid' }, saved.map(themeCard)) : null,
        h('div', { class: 'tb-theme-form' }, nameInput,
          h('button', { type: 'button', class: 'tb-btn tb-btn-ghost tb-btn-small', onclick: () => { Th.saveCurrent(nameInput.value); render(); } }, 'Save Current Look'))),
      block('Add a shared theme', null, null,
        h('div', { class: 'tb-theme-form' }, codeInput,
          h('button', {
            type: 'button', class: 'tb-btn tb-btn-ghost tb-btn-small', onclick: () => {
              try {
                const theme = Th.decode(codeInput.value);
                Th.apply(Th.add(theme));
                render();
              } catch (err) {
                codeError.textContent = err.message;
                codeError.hidden = false;
              }
            }
          }, 'Add and Use')),
        codeError)
    ];
  }

  // ---------- General tab ----------
  const TEXT_SIZE_ROWS = [
    ['ui', 'Interface', 'Sidebar, lists, buttons, menus and the player bar'],
    ['head', 'Titles', 'Page headings, the Home banner, album and playlist names'],
    ['lyrics', 'Lyrics', 'Lyrics in the panel and full-screen lyrics']
  ];
  function generalTab() {
    const look = A.get();
    const art = artwork();
    const customAccent = isHex(look.accent);
    const albumNote = look.accent === 'album' || look.albumTint
      ? (art ? 'Following the colours of the cover that’s playing.' : 'Play a song to pick up its cover’s colours.')
      : null;

    const colorInput = h('input', { type: 'color', class: 'tb-color-input', value: customAccent ? look.accent : A.accentColor(), tabindex: '-1', 'aria-hidden': 'true' });
    colorInput.addEventListener('input', () => A.set({ accent: colorInput.value }));
    colorInput.addEventListener('change', render);

    const swatches = h('div', { class: 'tb-swatches' },
      A.ACCENTS.map((a) => h('button', { type: 'button', title: a.label, class: `tb-swatch ${look.accent === a.id ? 'on' : ''}`, '--c': a.light, onclick: () => { A.set({ accent: a.id }); render(); } })),
      h('span', { class: 'tb-swatch-sep' }),
      h('button', {
        type: 'button', title: 'Album: changes with the cover that’s playing', class: `tb-swatch album ${look.accent === 'album' ? 'on' : ''}`,
        '--c': 'var(--accent)', style: art ? { backgroundImage: `url("${art}")` } : null, onclick: () => { A.set({ accent: 'album' }); render(); }
      }),
      h('span', { class: 'tb-swatch-wrap' },
        h('button', { type: 'button', title: 'Custom colour', class: `tb-swatch custom ${customAccent ? 'on' : ''}`, '--c': customAccent ? look.accent : 'var(--accent)', onclick: () => colorInput.click() }),
        colorInput));

    const customFont = h('input', { placeholder: 'e.g. Comic Sans MS', value: look.customFont || '', spellcheck: 'false' });
    customFont.addEventListener('input', () => {
      const v = customFont.value;
      A.set({ customFont: v, font: v.trim() ? 'custom' : 'inter' });
      fonts.querySelectorAll('.tb-font-tile').forEach((t) => t.classList.toggle('on', A.get().font === t.dataset.font));
      customLabel.classList.toggle('on', A.get().font === 'custom');
    });
    const customLabel = h('label', { class: `tb-custom-font ${look.font === 'custom' ? 'on' : ''}` }, h('span', {}, 'Any installed font'), customFont);
    const fonts = h('div', { class: 'tb-font-grid' }, A.FONTS.map((f) => h('button', {
      type: 'button', class: `tb-font-tile ${look.font === f.id ? 'on' : ''}`, 'data-font': f.id, onclick: () => { A.set({ font: f.id }); render(); }
    }, h('span', { class: 'tb-font-sample', style: { fontFamily: f.stack } }, 'Aa'), h('span', {}, f.label))));

    const sizesDefault = Object.values(look.textSizes).every((v) => v === 1);
    const reset = h('button', {
      type: 'button', class: 'tb-btn tb-btn-ghost tb-btn-small', disabled: sizesDefault,
      onclick: () => { A.set({ textSizes: { ui: 1, head: 1, lyrics: 1, stage: 1, clock: 1 } }); render(); }
    }, 'Reset');

    return [
      h('div', { class: 'tb-sheet-row' }, h('div', { class: 'tb-sheet-label' }, 'Mode'),
        segmented(look.theme, [['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], (theme) => { A.set({ theme }); render(); })),
      block('Accent colour', albumNote, null, swatches, h('div', { class: 'tb-sheet-gap' }),
        toggleRow('Tint the window with album colours', 'A soft wash of the playing cover’s colours behind everything', look.albumTint, (albumTint) => { A.set({ albumTint }); render(); })),
      block('Font', null, null, fonts, customLabel),
      block('Text size', 'Double-click a slider to put it back to 100%.', reset,
        TEXT_SIZE_ROWS.map(([key, label, hint]) => sliderRow(label, hint, look.textSizes[key], A.TEXT_SIZE_MIN, A.TEXT_SIZE_MAX, 0.05, 1, percent,
          (v) => { A.set({ textSizes: Object.assign({}, A.get().textSizes, { [key]: v }) }); reset.disabled = Object.values(A.get().textSizes).every((x) => x === 1); })))
    ];
  }

  // ---------- Home tab (Tunebox's components/appearance/HomeTab.tsx) ----------
  function homeTab() {
    const look = A.get();
    const art = cover();
    const custom = A.backgroundImage && A.backgroundImage.get();
    const set = (patch) => { A.set(patch); render(); };
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      try { await A.backgroundImage.setFromFile(f); } catch (e) { toast('Couldn’t use that picture. Try a smaller JPG or PNG.'); }
      render();
    });
    const tile = (id, label, preview, onclick, title) => h('button', {
      type: 'button', class: `tb-bg-tile ${look.background === id ? 'on' : ''}`, 'data-bg': id, title, onclick
    }, preview, h('span', {}, label));
    const [dmin, dmax] = A.RANGES.dim;
    const dim = h('input', { type: 'range', class: 'sl-done', min: dmin, max: dmax, step: 0.05, value: look.dim, '--fill': `${(look.dim / dmax) * 100}%` });
    dim.addEventListener('input', () => {
      const v = Number(dim.value);
      dim.style.setProperty('--fill', `${(v / dmax) * 100}%`);
      A.set({ dim: v });
    });
    return [
      block('Home background', null, null,
        h('div', { class: 'tb-bg-grid' },
          tile('none', 'None', h('span', { class: 'tb-bg-preview plain' }), () => set({ background: 'none' })),
          A.GRADIENTS.map((g) => tile(g.id, g.label, h('span', { class: 'tb-bg-preview', style: { backgroundImage: g.css } }), () => set({ background: g.id }))),
          tile('artwork', 'Now Playing', h('span', { class: 'tb-bg-preview blurred', style: art ? { backgroundImage: `url("${art}")` } : null }),
            () => set({ background: 'artwork' }), 'The cover of whatever is playing'),
          tile('custom', 'My Picture', h('span', { class: 'tb-bg-preview', style: custom ? { backgroundImage: `url("${custom}")` } : null }, custom ? null : '+'),
            () => (custom ? set({ background: 'custom' }) : file.click()))),
        h('div', { class: 'tb-sheet-inline' },
          h('button', { type: 'button', class: 'tb-btn tb-btn-ghost tb-btn-small', onclick: () => file.click() }, custom ? 'Choose Another Picture…' : 'Choose Picture…'),
          file,
          h('label', { class: 'tb-dim-control', title: 'Fades pictures so text stays easy to read' }, h('span', {}, 'Fade'), dim))),
      h('p', { class: 'tb-sheet-note gap' }, 'To reorder or hide Home sections, or switch a section between cover flow, grid and list, use ',
        h('b', {}, 'Edit Home'), ' at the top of the Home screen.')
    ];
  }

  // ---------- Lyrics tab (Tunebox's components/appearance/LyricsTab.tsx) ----------
  const LYRIC_COLOR_MODES = [['default', 'Default'], ['album', 'Match Album'], ['custom', 'Custom']];
  const LYRIC_SWATCHES = [
    ['sung', 'Sung', 'Words as they are sung, and their glow'],
    ['unsung', 'Upcoming', 'Words still to come (always shown faded)'],
    ['highlight', 'Highlight', 'The big emphasised word in Stage']
  ];
  const ALIGNS = [['auto', 'Auto'], ['left', 'Left'], ['center', 'Center']];
  const WHEEL_KEYS = ['wheelLines', 'wheelTilt', 'wheelBlur', 'wheelSpacing', 'wheelAlign'];

  /** A sample lyric line on a dark strip, styled with the current lyric font and colours. */
  function lyricPreview() {
    const el = h('div', { class: 'tb-lyric-preview' },
      h('span', { class: 'tb-lyric-preview-line' },
        h('span', { class: 'tb-lp-sung' }, 'Sung words glow'), ' ', h('span', { class: 'tb-lp-unsung' }, 'while the rest wait')),
      h('span', { class: 'tb-stage-word tb-gold tb-shown' }, 'highlight'));
    const LV = window.Tunebox && window.Tunebox.lyricsView;
    const apply = () => {
      if (!LV || !LV.lyricStyle) return;
      const { vars, customFont } = LV.lyricStyle(cover(), () => el.isConnected && apply());
      for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
      if (customFont) el.dataset.lyricFont = '1';
    };
    apply();
    return el;
  }

  /** A side view of the lyrics wheel: how many lines show, and how they tilt, blur and space out. */
  function wheelPreview(look) {
    const rows = [];
    for (let d = -look.wheelLines; d <= look.wheelLines; d++) rows.push(d);
    return h('div', { class: `tb-wheel-preview ${look.wheelAlign === 'center' ? 'center' : ''}` }, rows.map((d) => {
      const a = Math.abs(d);
      return h('div', {
        class: `tb-wheel-line ${d === 0 ? 'active' : ''}`,
        style: {
          transform: `translateZ(${-a * 45 * look.wheelTilt}px) rotateX(${-d * 13 * look.wheelTilt}deg) scale(${d ? 0.93 : 1})`,
          opacity: String(d ? Math.max(0.05, 0.9 - a * (0.55 / (look.wheelLines + 0.4))) : 1),
          filter: `blur(${a * 0.8 * look.wheelBlur * 0.6}px)`,
          marginBottom: `${8 * look.wheelSpacing}px`
        }
      }, d === 0 ? 'The line being sung' : d < 0 ? 'An earlier line' : 'A line still to come');
    }));
  }

  function lyricsTab() {
    const look = A.get();
    const art = cover();
    const D = A.DEFAULTS;
    const set = (patch) => { A.set(patch); render(); };
    // Sliders change things live; the previews redraw once the slider is let go.
    const settle = (row) => { row.querySelector('input').addEventListener('change', render); return row; };
    const wheelSlider = (label, hint, key, step, format) => {
      const [min, max, def] = A.RANGES[key];
      return settle(sliderRow(label, hint, look[key], min, max, step, def, format, (v) => A.set({ [key]: key === 'wheelLines' ? Math.round(v) : v })));
    };
    const sizeSlider = (label, hint, key) => settle(sliderRow(label, hint, look.textSizes[key], A.TEXT_SIZE_MIN, A.TEXT_SIZE_MAX, 0.05, 1, percent,
      (v) => A.set({ textSizes: Object.assign({}, A.get().textSizes, { [key]: v }) })));

    const fontInput = h('input', { placeholder: 'e.g. Impact', value: look.lyricCustomFont || '', spellcheck: 'false' });
    const fontLabel = h('label', { class: `tb-custom-font ${look.lyricFont === 'custom' ? 'on' : ''}` }, h('span', {}, 'Any installed font'), fontInput);
    const fonts = h('div', { class: 'tb-font-grid' },
      h('button', {
        type: 'button', class: `tb-font-tile ${look.lyricFont === 'default' ? 'on' : ''}`, 'data-font': 'default',
        title: 'Each lyrics view keeps its own styling (Stage mixes several typefaces)', onclick: () => set({ lyricFont: 'default' })
      }, h('span', { class: 'tb-font-sample' }, 'Aa'), h('span', {}, 'Default')),
      A.FONTS.map((f) => h('button', {
        type: 'button', class: `tb-font-tile ${look.lyricFont === f.id ? 'on' : ''}`, 'data-font': f.id, onclick: () => set({ lyricFont: f.id })
      }, h('span', { class: 'tb-font-sample', style: { fontFamily: f.stack } }, 'Aa'), h('span', {}, f.label))));
    fontInput.addEventListener('input', () => {
      const v = fontInput.value;
      A.set({ lyricCustomFont: v, lyricFont: v.trim() ? 'custom' : 'default' });
      const now = A.get().lyricFont;
      fonts.querySelectorAll('.tb-font-tile').forEach((t) => t.classList.toggle('on', now === t.dataset.font));
      fontLabel.classList.toggle('on', now === 'custom');
    });
    fontInput.addEventListener('change', render);

    const swatches = look.lyricColorMode !== 'custom' ? null : h('div', { class: 'tb-lyric-swatches' },
      LYRIC_SWATCHES.map(([key, label, hint]) => {
        const input = h('input', { type: 'color', class: 'tb-color-input', value: look.lyricColors[key], tabindex: '-1', 'aria-hidden': 'true' });
        const swatch = h('button', { type: 'button', class: 'tb-eq-swatch', 'data-swatch': key, style: { background: look.lyricColors[key] }, onclick: () => input.click() });
        input.addEventListener('input', () => {
          A.set({ lyricColors: Object.assign({}, A.get().lyricColors, { [key]: input.value }) });
          swatch.style.background = input.value;
        });
        input.addEventListener('change', render);
        return h('div', { class: 'tb-lyric-swatch', title: hint }, swatch, input, h('span', {}, label));
      }));

    const wheelChanged = WHEEL_KEYS.some((k) => look[k] !== D[k]);
    return [
      block('Lyrics', 'Font and colors for lyrics in Now Playing, Focus mode and Stage.', null,
        lyricPreview(),
        h('div', { class: 'tb-sheet-sublabel' }, 'Size'),
        sizeSlider('Lyrics', 'Scrolling lyrics in Now Playing and Focus mode (the preview above grows with it)', 'lyrics'),
        sizeSlider('Stage lyrics', 'The big poster words in Focus mode’s Stage layout', 'stage'),
        h('div', { class: 'tb-sheet-sublabel' }, 'Font'),
        fonts, fontLabel,
        h('div', { class: 'tb-sheet-sublabel' }, 'Colors'),
        segmented(look.lyricColorMode, LYRIC_COLOR_MODES, (lyricColorMode) => set({ lyricColorMode })),
        look.lyricColorMode === 'album'
          ? h('p', { class: 'tb-sheet-note gap' }, art ? 'Matches the cover of whatever is playing, changing with each song.' : 'Play a song to match its cover.')
          : null,
        swatches),
      block('Lyrics wheel', 'How the scrolling lyrics in Now Playing and Focus mode roll past.',
        h('button', { type: 'button', class: 'tb-btn tb-btn-ghost tb-btn-small', disabled: !wheelChanged, onclick: () => set(Object.fromEntries(WHEEL_KEYS.map((k) => [k, D[k]]))) }, 'Reset'),
        wheelPreview(look),
        wheelSlider('Lines shown', 'Lines visible above and below the one being sung. Scrolling shows them all.', 'wheelLines', 1, (v) => `${Math.round(v)} each side`),
        wheelSlider('3D curve', 'How far lines tip back, like text on a turning drum. 0% is flat.', 'wheelTilt', 0.05, percent),
        wheelSlider('Blur', 'Blur on lines away from the one being sung', 'wheelBlur', 0.05, percent),
        wheelSlider('Line spacing', null, 'wheelSpacing', 0.05, percent),
        h('div', { class: 'tb-sheet-row compact' },
          h('span', { title: 'Auto: left beside the cover, centered when lyrics fill the screen' }, 'Alignment'),
          segmented(look.wheelAlign, ALIGNS, (wheelAlign) => set({ wheelAlign }))))
    ];
  }

  // ---------- Stage tab (Tunebox's components/appearance/StageTab.tsx) ----------
  const VISUALIZER_MODES = [['rainbow', 'Rainbow'], ['accent', 'Accent'], ['artwork', 'Album Colors'], ['custom', 'Custom']];
  const EQ_STYLES = [['bars', 'Bars'], ['wave', 'Wave'], ['blocks', 'Blocks'], ['off', 'Off']];
  const SHAPE_KEYS = ['eqStyle', 'eqSize', 'eqHeight', 'eqSpeed', 'eqGlow', 'stageClock', 'stageQueue', 'stageSparkles'];
  const EQ_RANGES = { eqSize: [2, 8, 4], eqHeight: [0.5, 2.5, 1], eqSpeed: [0.25, 2.5, 1], eqGlow: [0, 1.5, 0.9] };
  const MAX_EQ_COLORS = 4;
  const RAINBOW = 'linear-gradient(90deg, #ff3b30, #ff9500, #ffcc00, #34c759, #5ac8fa, #007aff, #af52de, #ff2d55)';
  const cover = () => { const r = window.tbRiff && window.tbRiff.current(); return (r && r.thumb) || artwork(); };
  function eqGradient(mode, look, art) {
    if (mode === 'rainbow') return RAINBOW;
    if (mode === 'accent') { const a = A.accentColor(true); return `linear-gradient(90deg, ${a}, color-mix(in srgb, ${a} 55%, white), ${a})`; }
    if (mode === 'artwork') return art ? `url("${art}")` : 'linear-gradient(90deg, #888, #bbb)';
    const list = look.eqColors.length === 1 ? [look.eqColors[0], look.eqColors[0]] : look.eqColors;
    return `linear-gradient(90deg, ${list.join(', ')})`;
  }

  // The edge visualizer running in a small frame, with the current settings, so changes show straight away.
  let stopPreview = null;
  function visualizerPreview() {
    const F = window.Tunebox && window.Tunebox.focus;
    const art = cover();
    const glow = h('canvas', { class: 'tb-stage-eq-glow', '--eq-glow': String(A.get().eqGlow) });
    const bars = h('canvas', { class: 'tb-stage-eq-bars' });
    const box = h('div', { class: 'tb-eq-live', style: art ? { backgroundImage: `url("${art}")` } : null }, glow, bars,
      A.get().eqStyle === 'off' ? h('span', { class: 'tb-eq-live-off' }, 'Visualizer off') : null);
    if (!F || !F.startEqualizer) return box;
    let colors = null;
    const look = A.get();
    if (look.eqMode === 'accent') colors = F.withPartner(F.hexToRgb(A.accentColor(true)));
    else if (look.eqMode === 'custom') colors = look.eqColors.length === 1 ? F.withPartner(F.hexToRgb(look.eqColors[0])) : look.eqColors.map(F.hexToRgb);
    else if (look.eqMode === 'artwork' && art && A.coverColors) A.coverColors(art).then((c) => { colors = c; }, () => {});
    const eq = F.startEqualizer(bars, glow, () => true, () => colors, () => {
      const l = A.get();
      return { style: l.eqStyle, size: l.eqSize, height: l.eqHeight, speed: l.eqSpeed, glow: l.eqGlow, reach: 0.16 };
    });
    // Pretend words are being sung, so the bars bounce like they do on Stage.
    const beat = setInterval(() => eq.kick(), 430);
    stopPreview = () => { clearInterval(beat); eq.stop(); stopPreview = null; };
    return box;
  }

  function stageTab() {
    const look = A.get();
    const art = cover();
    const D = A.DEFAULTS;
    const changed = SHAPE_KEYS.some((k) => look[k] !== D[k]);
    const set = (patch) => { A.set(patch); render(); };
    const slider = (label, hint, key, step, format) => {
      const [min, max, def] = EQ_RANGES[key];
      return sliderRow(label, hint, look[key], min, max, step, def, format, (v) => {
        A.set({ [key]: v });
        if (key === 'eqGlow') panel.querySelectorAll('.tb-eq-live .tb-stage-eq-glow').forEach((g) => g.style.setProperty('--eq-glow', String(v)));
      });
    };
    const colours = look.eqMode !== 'custom' ? null : h('div', { class: 'tb-eq-colors' },
      look.eqColors.map((c, i) => {
        const input = h('input', { type: 'color', class: 'tb-color-input', value: c, tabindex: '-1', 'aria-hidden': 'true' });
        const swatch = h('button', { type: 'button', class: 'tb-eq-swatch', title: 'Change this color', style: { background: c }, onclick: () => input.click() });
        input.addEventListener('input', () => { const list = A.get().eqColors.slice(); list[i] = input.value; A.set({ eqColors: list }); swatch.style.background = input.value; });
        input.addEventListener('change', render);
        return h('div', { class: 'tb-eq-color' }, swatch, input,
          look.eqColors.length > 1 ? h('button', { type: 'button', class: 'tb-eq-remove', title: 'Remove this color', onclick: () => set({ eqColors: look.eqColors.filter((_, j) => j !== i) }) }, '×') : null);
      }),
      look.eqColors.length < MAX_EQ_COLORS ? h('button', { type: 'button', class: 'tb-eq-add', title: 'Add a color', onclick: () => set({ eqColors: look.eqColors.concat('#ffffff') }) }, '+') : null);
    return [
      block('Visualizer', 'The equalizer around the edge of Focus mode’s Stage layout.',
        h('button', { type: 'button', class: 'tb-btn tb-btn-ghost tb-btn-small', disabled: !changed, onclick: () => set(Object.fromEntries(SHAPE_KEYS.map((k) => [k, D[k]]))) }, 'Reset'),
        visualizerPreview(),
        h('div', { class: 'tb-sheet-row compact' }, h('span', {}, 'Style'), segmented(look.eqStyle, EQ_STYLES, (eqStyle) => set({ eqStyle }))),
        slider('Thickness', null, 'eqSize', 1, (v) => `${v} px`),
        slider('Height', 'How far the bars reach in from the edge', 'eqHeight', 0.05, percent),
        slider('Speed', 'How fast the waves and colors move around the frame', 'eqSpeed', 0.05, percent),
        slider('Glow', null, 'eqGlow', 0.05, percent)),
      block('Visualizer colors', null, null,
        h('div', { class: 'tb-bg-grid' }, VISUALIZER_MODES.map(([mode, label]) => h('button', {
          type: 'button', class: `tb-bg-tile ${look.eqMode === mode ? 'on' : ''}`, onclick: () => set({ eqMode: mode })
        }, h('span', { class: 'tb-bg-preview tb-eq-preview', style: { backgroundImage: eqGradient(mode, look, art) } }), h('span', {}, label)))),
        colours,
        look.eqMode === 'artwork' && !art ? h('p', { class: 'tb-sheet-note gap' }, 'Play a song to use its cover’s colors.') : null),
      block('Show on Stage', null, null,
        toggleRow('Clock and date', null, look.stageClock, (stageClock) => set({ stageClock })),
        toggleRow('Playing Next list', 'The tilted queue on the left. With it off, the lyrics move to the center.', look.stageQueue, (stageQueue) => set({ stageQueue })),
        toggleRow('Sparkles', null, look.stageSparkles, (stageSparkles) => set({ stageSparkles })))
    ];
  }

  // ---------- Sheet ----------
  const TABS = [['themes', 'Themes'], ['general', 'General'], ['home', 'Home'], ['lyrics', 'Lyrics'], ['stage', 'Stage']];
  let tab = 'general';
  let backdrop = null;
  let panel = null;
  let tabs = null;

  function render() {
    if (!panel) return;
    const scroll = sheet.scrollTop;
    tabs.querySelectorAll('button').forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    if (stopPreview) stopPreview();
    panel.replaceChildren(...(tab === 'themes' ? themesTab() : tab === 'stage' ? stageTab() : tab === 'lyrics' ? lyricsTab() : tab === 'home' ? homeTab() : generalTab()));
    sheet.scrollTop = scroll;
  }

  let sheet = null;
  function build() {
    tabs = h('div', { class: 'tb-sheet-tabs', role: 'tablist' }, TABS.map(([id, label]) => h('button', {
      type: 'button', role: 'tab', 'data-tab': id, onclick: () => { tab = id; sheet.scrollTop = 0; render(); }
    }, label)));
    panel = h('div', { class: 'tb-sheet-panel', role: 'tabpanel' });
    sheet = h('div', { class: 'tb-sheet', role: 'dialog', 'aria-label': 'Appearance', 'aria-modal': 'true', onmousedown: (e) => e.stopPropagation() },
      h('div', { class: 'tb-sheet-top' },
        h('header', { class: 'tb-sheet-head' }, h('h2', {}, 'Appearance'),
          h('button', { type: 'button', class: 'tb-btn tb-btn-primary tb-btn-small', onclick: close }, 'Done')),
        tabs),
      panel);
    backdrop = h('div', { class: 'tb-sheet-backdrop', id: 'tb-appearance', hidden: true, onmousedown: close }, sheet);
    document.body.append(backdrop);
  }

  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  function open(which) {
    if (!backdrop) build();
    if (TABS.some(([id]) => id === which)) tab = which;
    render();
    backdrop.hidden = false;
    document.addEventListener('keydown', onKey, true);
    const first = tabs.querySelector('button.on');
    if (first) first.focus({ preventScroll: true });
  }
  function close() {
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
    if (stopPreview) stopPreview();
    document.removeEventListener('keydown', onKey, true);
  }

  // Keep the sheet current when the look changes elsewhere (Settings → Theme mode, a new cover).
  // Not while a field or slider in the sheet is in use: redrawing would take it out from under the pointer.
  A.subscribe(() => {
    if (!backdrop || backdrop.hidden) return;
    const active = document.activeElement;
    if (active && sheet.contains(active) && active.tagName === 'INPUT') return;
    render();
  });

  window.Tunebox = Object.assign(window.Tunebox || {}, { appearancePanel: { open, close, get isOpen() { return !!backdrop && !backdrop.hidden; } } });

  // ---------- Ways in ----------
  // Settings → Theme: an "Appearance" row (replaces the stage 2 note about it).
  const openBtn = document.getElementById('tb-btn-open-appearance');
  if (openBtn) openBtn.addEventListener('click', () => open('general'));
})();
