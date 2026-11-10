/* Tunebox window frame behaviour (stage 3). Loaded after app.js; works only through Riff's existing
   elements and IDs, so Riff's own handlers keep doing the real work.
   - Native window buttons and Mica (main.js) → classes on <html>, caption symbol colour per theme
   - Sidebar: always the full Tunebox sidebar; the toolbar button hides and shows it
   - Toolbar: back button, glass once the page scrolls, Riff's mini-player buttons
   - Now Playing row (opens Riff's now-playing panel) and the account row */
(function () {
  'use strict';

  const root = document.documentElement;
  const body = document.body;
  const api = window.electronAPI || {};
  const $ = (id) => document.getElementById(id);
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (e) { /* not saved */ } }
  };

  // ---------- Window chrome ----------

  if (typeof api.tuneboxWindowInfo === 'function') {
    api.tuneboxWindowInfo().then((info) => {
      root.classList.toggle('tb-native-controls', !!(info && info.nativeControls));
      root.classList.toggle('has-material', !!(info && info.material));
    }, () => {});
  }

  const appearance = window.Tunebox && window.Tunebox.appearance;
  function syncCaptionSymbols() {
    if (typeof api.tuneboxSetWindowChrome !== 'function' || !appearance) return;
    api.tuneboxSetWindowChrome(appearance.isDark() || appearance.darkSurface, appearance.get().theme);
  }
  if (appearance) appearance.subscribe(syncCaptionSymbols);
  syncCaptionSymbols();

  // ---------- The window never scrolls ----------
  // Riff gives <body> `contain: strict`, so the frame (sidebar, toolbar, player bar) is positioned inside
  // the body; if anything scrolls the body itself (focusing a field, scrollIntoView), the whole window
  // slides up. Riff already pins the page's own scroll; this pins the body's.
  function pinBody() {
    if (body.scrollTop !== 0) body.scrollTop = 0;
    if (body.scrollLeft !== 0) body.scrollLeft = 0;
    if (root.scrollTop !== 0) root.scrollTop = 0;
  }
  body.addEventListener('scroll', pinBody, { passive: true });
  root.addEventListener('scroll', pinBody, { passive: true });
  pinBody();

  // ---------- Sidebar ----------

  // Riff only fills the playlist list while its sidebar is "expanded"; the Tunebox sidebar always is.
  function keepSidebarExpanded() {
    if (body.classList.contains('mini')) return;
    if (body.classList.contains('classic-sidebar')) body.classList.remove('classic-sidebar');
    if (!body.classList.contains('sidebar-expanded') && typeof window.applySidebarWidth === 'function') {
      window.applySidebarWidth(288, false);
    }
  }
  keepSidebarExpanded();
  new MutationObserver(keepSidebarExpanded).observe(body, { attributes: true, attributeFilter: ['class'] });

  const sidebarBtn = $('tb-btn-sidebar');
  function setSidebarHidden(hidden, save) {
    root.classList.toggle('tb-sidebar-hidden', hidden);
    if (sidebarBtn) {
      const label = hidden ? 'Show sidebar' : 'Hide sidebar';
      sidebarBtn.title = label;
      sidebarBtn.setAttribute('aria-label', label);
      sidebarBtn.setAttribute('aria-pressed', String(!hidden));
    }
    if (save) store.set('tunebox.sidebarHidden', hidden ? '1' : '0');
    // Riff's canvases (visualizers) measure their box.
    if (typeof window.resizeCanvases === 'function') setTimeout(window.resizeCanvases, 300);
    window.dispatchEvent(new Event('resize'));
  }
  setSidebarHidden(store.get('tunebox.sidebarHidden') === '1', false);
  if (sidebarBtn) sidebarBtn.addEventListener('click', () => setSidebarHidden(!root.classList.contains('tb-sidebar-hidden'), true));

  // Now Playing: Riff's now-playing panel on the right. It toggles the panel rather than opening a page,
  // so it never takes the sidebar's selected look (Tunebox highlights only the current page);
  // aria-pressed says whether the panel is open.
  const nowBtn = $('tb-nav-now-playing');
  const panel = $('right-panel');
  const panelToggle = $('btn-toggle-lyrics-panel');
  function syncNowPlaying() {
    if (nowBtn && panel) nowBtn.setAttribute('aria-pressed', String(!panel.classList.contains('hidden')));
  }
  if (nowBtn && panelToggle) nowBtn.addEventListener('click', () => panelToggle.click());
  if (panel) new MutationObserver(syncNowPlaying).observe(panel, { attributes: true, attributeFilter: ['class'] });
  syncNowPlaying();

  // The toolbar stops where the right panel starts (Riff lets people resize the panel).
  function syncPanelWidth() {
    const open = panel && !panel.classList.contains('hidden') && panel.offsetWidth > 0;
    root.style.setProperty('--tb-right', open ? panel.offsetWidth + 'px' : '0px');
    root.classList.toggle('tb-panel-open', !!open);
  }
  if (panel) {
    new ResizeObserver(syncPanelWidth).observe(panel);
    new MutationObserver(syncPanelWidth).observe(panel, { attributes: true, attributeFilter: ['class', 'style'] });
  }
  syncPanelWidth();

  // Places (Home, Now Playing, Queue) and Library (Liked songs, Albums, My files, History).
  // Riff's "sidebar order" setting re-inserts its nav buttons in the chosen order; they go back into
  // their Tunebox group, keeping that order within the group.
  const PLACES = ['discover', 'queue'];
  const nav = document.querySelector('#sidebar .sidebar-nav');
  const placesGroup = $('tb-side-places');
  const libraryGroup = $('tb-side-library');
  function placeAt(group, el, index) {
    if (group.children[index] !== el) group.insertBefore(el, group.children[index] || null);
  }
  function regroup() {
    if (!nav || !placesGroup || !libraryGroup) return;
    const items = Array.from(nav.querySelectorAll('.nav-item[data-view]')).filter((b) => b.dataset.view !== 'settings');
    const byView = (v) => items.find((b) => b.dataset.view === v);
    [byView('discover'), nowBtn, byView('queue')].filter(Boolean).forEach((el, i) => placeAt(placesGroup, el, i));
    const heading = libraryGroup.querySelector('.tb-side-heading');
    const offset = heading ? 1 : 0;
    items.filter((b) => !PLACES.includes(b.dataset.view)).forEach((el, i) => placeAt(libraryGroup, el, i + offset));
  }
  regroup();
  if (nav) new MutationObserver(regroup).observe(nav, { childList: true });

  // Account row: Riff's profile (Settings → Account).
  const accountBtn = $('tb-account');
  const accountName = $('tb-account-name');
  const accountAvatar = $('tb-account-avatar');
  const riffName = $('settings-nav-account-name');
  const riffAvatar = $('settings-nav-avatar');
  function syncAccount() {
    const name = ((riffName && riffName.textContent) || '').trim() || 'User';
    if (accountName) accountName.textContent = name;
    if (accountBtn) accountBtn.title = name + ' · Account';
    if (!accountAvatar) return;
    const img = accountAvatar.querySelector('img');
    const src = riffAvatar ? riffAvatar.getAttribute('src') || '' : '';
    // Riff's placeholder picture is its app icon; Tunebox shows the initial instead.
    const isPlaceholder = !src || /assets\/icon\.png$/.test(src);
    if (img) {
      img.hidden = isPlaceholder;
      if (!isPlaceholder && img.getAttribute('src') !== src) img.src = src;
    }
    let initial = accountAvatar.querySelector('.tb-avatar-initial');
    if (!initial) {
      initial = document.createElement('span');
      initial.className = 'tb-avatar-initial';
      accountAvatar.appendChild(initial);
    }
    initial.hidden = !isPlaceholder;
    initial.textContent = name.charAt(0).toUpperCase();
  }
  if (riffName) new MutationObserver(syncAccount).observe(riffName, { childList: true, characterData: true, subtree: true });
  if (riffAvatar) new MutationObserver(syncAccount).observe(riffAvatar, { attributes: true, attributeFilter: ['src'] });
  syncAccount();
  if (accountBtn) {
    accountBtn.addEventListener('click', () => {
      const settings = $('btn-sb-settings');
      if (settings) settings.click();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const accountTab = $('settings-nav-account');
        if (accountTab) accountTab.click();
      }));
    });
  }

  // ---------- Toolbar ----------

  const toolbar = document.querySelector('.top-nav');
  const toolbarEnd = $('tb-toolbar-end');

  // Riff's mini-player and mini-lyrics buttons lived in its own title bar; on Windows that bar gives way
  // to the native caption buttons, so they move into the toolbar.
  if (toolbarEnd) {
    for (const id of ['btn-mini-lyrics', 'btn-mini-player']) {
      const btn = $(id);
      if (btn) toolbarEnd.appendChild(btn);
    }
  }

  // Back: Riff has a back button on album, artist and playlist pages; the toolbar's follows the open page.
  const backBtn = $('tb-btn-back');
  const BACK_TARGETS = [
    ['view-album', 'btn-back-album'],
    ['view-artist', 'btn-back-artist'],
    ['view-playlist-detail', 'btn-back-playlists']
  ];
  function currentBack() {
    for (const [viewId, btnId] of BACK_TARGETS) {
      const view = $(viewId);
      const btn = $(btnId);
      if (view && btn && view.classList.contains('active')) return btn;
    }
    return null;
  }
  function syncBack() { if (backBtn) backBtn.disabled = !currentBack(); }
  if (backBtn) backBtn.addEventListener('click', () => { const target = currentBack(); if (target) target.click(); });

  // Glass toolbar once the page has scrolled under it.
  const main = $('main-content');
  function syncScrolled() {
    if (toolbar && main) toolbar.classList.toggle('scrolled', main.scrollTop > 2);
  }
  if (main) main.addEventListener('scroll', syncScrolled, { passive: true });

  // Page changes (Riff marks the open page with .active).
  const views = document.querySelectorAll('#main-content > .content-view, .content-view');
  const onViewChange = () => { syncBack(); syncScrolled(); };
  const viewObserver = new MutationObserver(onViewChange);
  views.forEach((v) => viewObserver.observe(v, { attributes: true, attributeFilter: ['class'] }));
  onViewChange();
})();
