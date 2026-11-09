/* Tunebox player bar and search behaviour (stage 4). Loaded after app.js and shell.js.
   Riff's handlers still do the work (playing, seeking, volume, searching); this keeps the Tunebox
   look in step with them:
   - progress bar colours for Riff's progress canvas (app.js draws the Tunebox style when this exists)
   - the volume slider's fill
   - the dock's height, so the search button sits on top of it
   - the search button opening into the field, and closing when it's empty and loses focus */
(function () {
  'use strict';

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);

  // Call `onChange` when Riff sets an input's value from code (no input event in that case).
  function watchValue(input, onChange) {
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    if (!native || !native.set) return;
    Object.defineProperty(input, 'value', {
      configurable: true,
      enumerable: true,
      get() { return native.get.call(this); },
      set(v) { native.set.call(this, v); onChange(); }
    });
  }

  // ---------- Progress bar colours ----------
  // Read from the theme tokens, so light, dark and every preset are matched.
  const probe = document.createElement('span');
  probe.hidden = true;
  probe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(probe);
  function tokenColour(name, fallback) {
    probe.style.color = '';
    probe.style.color = `var(${name}, ${fallback})`;
    return getComputedStyle(probe).color || fallback;
  }
  let scrubColours = null;
  function scrubberStyle() {
    if (!scrubColours) {
      scrubColours = {
        track: tokenColour('--fill-2', 'rgba(255,255,255,0.13)'),
        fill: tokenColour('--fill-strong', 'rgba(255,255,255,0.62)'),
        knob: '#ffffff'
      };
    }
    return scrubColours;
  }
  // A theme change: recolour, and have Riff redraw the bar even while paused.
  new MutationObserver(() => {
    scrubColours = null;
    window.dispatchEvent(new Event('resize'));
  }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- Volume fill ----------
  const volume = $('volume-slider');
  function syncVolume() {
    if (!volume) return;
    const min = parseFloat(volume.min) || 0;
    const max = parseFloat(volume.max) || 1;
    const pct = Math.max(0, Math.min(100, ((parseFloat(volume.value) - min) / (max - min)) * 100));
    volume.style.setProperty('--tb-pct', pct + '%');
  }
  if (volume) {
    watchValue(volume, syncVolume);
    volume.addEventListener('input', syncVolume);
    syncVolume();
  }

  // ---------- Dock height ----------
  const dock = $('playbar');
  function syncDockHeight() {
    if (dock && dock.offsetHeight) root.style.setProperty('--tb-dock-h', dock.offsetHeight + 'px');
  }
  if (dock && window.ResizeObserver) new ResizeObserver(syncDockHeight).observe(dock);
  syncDockHeight();

  // ---------- Search ----------
  // Open while the field has focus or holds a search (as in Tunebox).
  const wrap = document.querySelector('#tb-search-float .search-box-wrapper');
  const input = $('search-input');
  const iconBtn = $('search-icon-btn');
  function syncSearch() {
    if (!wrap || !input) return;
    wrap.classList.toggle('tb-open', document.activeElement === input || !!input.value);
  }
  if (wrap && input) {
    watchValue(input, syncSearch);
    input.addEventListener('focus', syncSearch);
    input.addEventListener('blur', syncSearch);
    input.addEventListener('input', syncSearch);
    // Riff's Escape returns to Home and clears the field; the field then closes.
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') input.blur(); });
    // The round button opens the field; with a search typed, Riff's own click runs it.
    if (iconBtn) iconBtn.addEventListener('click', () => { if (!input.value.trim()) input.focus(); });
    syncSearch();
  }

  window.Tunebox = Object.assign(window.Tunebox || {}, { player: { scrubberStyle } });
})();
