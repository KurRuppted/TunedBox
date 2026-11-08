/* Tunebox icons as SVG strings (a plain-JS port of Tunebox's components/Icons.tsx).
   One drawing style everywhere: 24×24 grid, 1.8 stroke, round caps and joins.
   - Tunebox.icons.svg(name, size) returns a complete <svg> for new markup.
   - Tunebox.icons.pack is the "Tunebox" icon pack: inner SVG for Riff's existing icons, keyed by the same
     selectors as Riff's other packs (applyIconPack in app.js swaps them in). */
(function () {
  'use strict';

  const F = ' fill="currentColor" stroke="none"'; // solid shapes inside an outline-style <svg>

  // Inner markup, drawn for an outline <svg> (fill="none" stroke="currentColor").
  const paths = {
    play: `<path d="M8 5v14l11-7z"${F}/>`,
    pause: `<path d="M6 5h4v14H6zM14 5h4v14h-4z"${F}/>`,
    next: `<path d="M6 5v14l9-7zM16 5h2v14h-2z"${F}/>`,
    prev: `<path d="M18 5v14L9 12zM6 5h2v14H6z"${F}/>`,
    shuffle: '<path d="M3 7h3c4 0 6 10 10 10h5M18 14l3 3-3 3M3 17h3c1.5 0 2.7-1.3 3.6-3M13.4 10C14.3 8.3 15.5 7 17 7h4M18 4l3 3-3 3"/>',
    repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h13M17 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H4M7 21l-3-3 3-3"/>',
    // No fill attribute: Riff fills the heart by setting fill on the <svg> when a song is liked.
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    more: `<circle cx="5" cy="12" r="1.8"${F}/><circle cx="12" cy="12" r="1.8"${F}/><circle cx="19" cy="12" r="1.8"${F}/>`,
    queue: '<path d="M4 6h16M4 12h10M4 18h8M16 14v6l5-3z"/>',
    devices: '<rect x="3" y="4" width="12" height="10" rx="1.5"/><path d="M6 18h6M18 8h3v12h-3z"/>',
    volume: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
    mute: '<path d="M4 9v6h4l5 4V5L8 9zM17 9.5l5 5M22 9.5l-5 5"/>',
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    library: '<path d="M5 4v16M10 4v16M15 4.5l5 15"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    forward: '<path d="M9 5l7 7-7 7"/>',
    sidebar: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M9.5 4.5v15M5.5 8.5h1.5M5.5 11.5h1.5"/>',
    friends: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9" r="2.5"/><path d="M15.6 14.2c2.4-.3 4.3 1.2 4.9 4"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
    focus: '<path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4"/>',
    nowPlaying: '<path d="M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
    logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
    // Riff features with no Tunebox icon, drawn in the same style.
    history: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    lyricsPanel: '<rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M14.5 4.5v15M17 8.5h1.5M17 11.5h1.5"/>'
  };

  function svg(name, size = 20) {
    const inner = paths[name];
    if (!inner) return '';
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }

  // The "Tunebox" icon pack: Riff's icons → Tunebox drawings.
  const pack = {
    '#nav-discover svg': paths.home,
    '#nav-favorites svg': paths.heart,
    '#nav-albums svg': paths.library,
    '#nav-local svg': paths.note,
    '#nav-history svg': paths.history,
    '#nav-queue svg': paths.queue,
    '#nav-settings svg': paths.sliders,
    '#btn-shuffle svg': paths.shuffle,
    '#btn-prev svg': paths.prev,
    '#btn-next svg': paths.next,
    '#btn-repeat svg': paths.repeat,
    '#btn-toggle-lyrics-panel svg': paths.lyricsPanel,
    '#btn-toggle-queue-panel svg': paths.queue,
    '#btn-open-settings svg': paths.sliders,
    '#btn-sb-settings svg': paths.settings,
    '#volume-icon': paths.volume,
    '#volume-muted-icon': paths.mute,
    '#fav-icon': paths.heart
  };

  window.Tunebox = Object.assign(window.Tunebox || {}, { icons: { paths, svg, pack } });
})();
