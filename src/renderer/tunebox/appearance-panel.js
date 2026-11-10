/* Tunebox Appearance sheet (stage 7): a plain-JS port of Tunebox's AppearancePanel with its Themes and
   General tabs. Everything it changes goes through window.Tunebox.appearance / .themes
   (tunebox/appearance.js). Tunebox's Home, Lyrics and Stage tabs belong to features Riff doesn't have
   yet, so they're left out. Opened from Home's appearance button and Settings → Theme.
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
    const bg = g ? g.css : themeLook.background === 'artwork' && art ? `url("${art}")` : 'none';
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

  // ---------- Sheet ----------
  const TABS = [['themes', 'Themes'], ['general', 'General']];
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
    panel.replaceChildren(...(tab === 'themes' ? themesTab() : generalTab()));
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
    if (which === 'themes' || which === 'general') tab = which;
    render();
    backdrop.hidden = false;
    document.addEventListener('keydown', onKey, true);
    const first = tabs.querySelector('button.on');
    if (first) first.focus({ preventScroll: true });
  }
  function close() {
    if (!backdrop || backdrop.hidden) return;
    backdrop.hidden = true;
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
