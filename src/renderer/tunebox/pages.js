/* Tunebox search results (stage 7). Loaded after app.js. Riff fills its search results; this adds
   Tunebox's page heading ("Results for “…”") and a "Songs" heading over the song list, which comes
   first, as in Tunebox (tunebox/pages.css styles the rest). */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  if (!root || root.id !== 'tb') return;

  const results = $('search-results-container');
  const songs = $('search-tracks-list');
  const input = $('search-input');
  if (!results || !songs) return;

  const title = document.createElement('h1');
  title.className = 'tb-search-title';
  title.id = 'tb-search-title';
  results.prepend(title);

  const songsTitle = document.createElement('h2');
  songsTitle.className = 'tb-search-songs-title';
  songsTitle.id = 'tb-search-songs-title';
  songsTitle.textContent = 'Songs';
  songs.before(songsTitle);

  // Songs first, then the artist, albums and playlists (Riff's order is the other way round; the
  // container is a column in tunebox/pages.css).
  const order = [
    [title, 0], [$('search-filter-chips'), 1], [songsTitle, 2], [songs, 3],
    [$('search-artist-card-container'), 4], [$('search-albums-container'), 5], [$('search-playlists-container'), 6]
  ];
  order.forEach(([el, n]) => { if (el) el.style.order = String(n); });

  // The heading follows the search that's showing; the Songs heading only shows with songs under it.
  let shownQuery = '';
  function sync() {
    if (!results.classList.contains('hidden') && input) shownQuery = (input.value || '').trim() || shownQuery;
    title.textContent = shownQuery ? `Results for “${shownQuery}”` : 'Search';
    songsTitle.hidden = !songs.querySelector('.track-row');
  }
  new MutationObserver(sync).observe(results, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(sync).observe(songs, { childList: true });
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') setTimeout(sync, 0); });
  sync();
})();
