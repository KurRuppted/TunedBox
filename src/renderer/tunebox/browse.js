/* Tunebox collection pages (stage 6). Loaded after app.js. Riff still builds and fills its playlist,
   Liked Songs, My files, album, artist and library pages; tunebox/browse.css restyles them. This adds
   the few pieces CSS can't:
   - the blurred cover glow behind each page's header (Tunebox's "ambient"), from the page's own cover
   - the album page's small kind label ("Album", "Single", "Daily Mix"…) and Tunebox's details line
     (artist · year · songs), read from Riff's own line so they change with it
   - the artist page's "Artist" label */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  if (!root || root.id !== 'tb') return;

  // ---------- Cover glow ----------
  // Each page and where its cover is. The glow is a layer at the top of the page, under everything.
  const PAGES = [
    { view: 'view-playlist-detail', cover: () => $('playlist-detail-cover') },
    { view: 'view-album', cover: () => $('album-detail-cover') },
    { view: 'view-artist', cover: () => $('artist-hero-img') }
  ];

  function coverUrl(el) {
    if (!el) return '';
    if (el.tagName === 'IMG') {
      // Riff hides the artist photo (display: none) when it has none for this artist.
      return el.style.display === 'none' ? '' : (el.currentSrc || el.src || '');
    }
    const img = el.querySelector('img');
    return img ? (img.currentSrc || img.src || '') : '';
  }

  function glowFor(view) {
    let glow = view.querySelector(':scope > .tb-ambient');
    if (!glow) {
      glow = document.createElement('div');
      glow.className = 'tb-ambient';
      glow.setAttribute('aria-hidden', 'true');
      view.prepend(glow);
    }
    return glow;
  }

  function syncGlow(page) {
    const view = $(page.view);
    if (!view) return;
    const url = coverUrl(page.cover());
    const glow = glowFor(view);
    const css = url ? `url("${url.replace(/["\\]/g, '\\$&')}")` : '';
    if (glow.style.backgroundImage !== css) glow.style.backgroundImage = css;
    glow.classList.toggle('tb-empty', !url);
  }

  PAGES.forEach((page) => {
    const view = $(page.view);
    const cover = page.cover();
    if (!view || !cover) return;
    const sync = () => syncGlow(page);
    // The cover is replaced (playlists, albums) or its src/style changes (artist photo).
    new MutationObserver(sync).observe(cover, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'style'] });
    cover.addEventListener('load', sync, true);
    sync();
  });

  // ---------- Album page: kind label and details line ----------
  // Riff writes "Album · 2018 · 12 tracks" (or "Daily Mix · 25 tracks") into #album-detail-count.
  // Tunebox shows the kind above the title and "Artist · 2018 · 12 songs" under it; the artist stays
  // Riff's own clickable button, so the line here is just the rest.
  const albumSide = document.querySelector('#view-album .album-side');
  const albumCount = $('album-detail-count');
  if (albumSide && albumCount) {
    const kind = document.createElement('div');
    kind.id = 'tb-album-kind';
    kind.className = 'tb-kind';
    const meta = document.createElement('div');
    meta.id = 'tb-album-meta';
    meta.className = 'tb-album-meta';
    albumSide.insertBefore(kind, albumSide.querySelector('#album-detail-title'));
    albumCount.after(meta);

    const syncAlbum = () => {
      const parts = (albumCount.textContent || '').split('·').map((s) => s.trim()).filter(Boolean);
      const first = parts[0] || '';
      // Riff leads with the type ("Album", "Single", "EP", "Daily Mix"); counts and years aren't types.
      const isType = first && !/^\d/.test(first);
      kind.textContent = isType ? first : 'Album';
      const rest = (isType ? parts.slice(1) : parts).map((p) => p.replace(/\btracks?\b/, (w) => (w === 'track' ? 'song' : 'songs')));
      meta.textContent = rest.join(' · ');
    };
    new MutationObserver(syncAlbum).observe(albumCount, { childList: true, characterData: true, subtree: true });
    syncAlbum();
  }

  // ---------- Artist page: kind label ----------
  const artistInfo = document.querySelector('#view-artist .artist-hero-info');
  if (artistInfo && !$('tb-artist-kind')) {
    const kind = document.createElement('div');
    kind.id = 'tb-artist-kind';
    kind.className = 'tb-kind';
    kind.textContent = 'Artist';
    artistInfo.prepend(kind);
  }
})();
