/* Tunebox's Friends panel (2-app-shell/components/FriendsPanel.tsx), the look only.
   Tunebox's friends service (lib/friends/*: friend codes, presence, Listen Along, group sessions) isn't
   part of the design, and Riff has no server for it, so the panel shows Tunebox's own "isn't set up"
   state. The toolbar button and Ctrl+Shift+F show and hide it; it's remembered (tunebox.friendsOpen).
   It sits at the right edge, after Riff's now-playing panel; shell.js counts its width in --tb-right.
   Loaded after shell.js. */
(function () {
  'use strict';

  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  if (!root || root.id !== 'tb') return;
  const KEY = 'tunebox.friendsOpen';
  const store = {
    get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    set(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* not saved */ } }
  };

  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const SVG = 'http://www.w3.org/2000/svg';
  // Tunebox's FriendsIcon.
  function friendsIcon() {
    const svg = document.createElementNS(SVG, 'svg');
    for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
    for (const [tag, attrs] of [
      ['circle', { cx: '9', cy: '8', r: '3.2' }], ['path', { d: 'M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5' }],
      ['circle', { cx: '16.8', cy: '9', r: '2.5' }], ['path', { d: 'M15.6 14.2c2.4-.3 4.3 1.2 4.9 4' }]
    ]) {
      const el = document.createElementNS(SVG, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      svg.appendChild(el);
    }
    return svg;
  }

  // ---------- Panel ----------
  const panel = h('aside', 'tb-friends-panel');
  panel.id = 'tb-friends';
  panel.setAttribute('aria-label', 'Friends');
  const head = h('header', 'tb-friends-head');
  const close = h('button', 'tb-icon-btn tb-friends-close', '×');
  close.type = 'button';
  close.title = 'Hide friends (Ctrl+Shift+F)';
  close.setAttribute('aria-label', 'Hide friends');
  head.append(h('h2', null, 'Friends'), close);
  const empty = h('div', 'tb-friends-empty');
  empty.append(h('b', null, 'Friends isn’t set up in Riff yet.'),
    h('p', null, 'Adding friends, Listen Along and listening sessions need a Friends service, which this copy of Riff doesn’t have.'));
  const scroll = h('div', 'tb-friends-scroll');
  scroll.appendChild(empty);
  panel.append(h('div', 'tb-friends-top'), head, scroll);

  const rightPanel = $('right-panel');
  const layout = document.querySelector('.app-layout');
  if (rightPanel && rightPanel.parentElement) rightPanel.after(panel);
  else if (layout) layout.appendChild(panel);
  else return;

  // ---------- Toolbar button (shown while the panel is hidden, as in Tunebox) ----------
  const btn = h('button', 'tb-toolbar-friends');
  btn.type = 'button';
  btn.id = 'tb-btn-friends';
  btn.title = 'Show friends (Ctrl+Shift+F)';
  btn.setAttribute('aria-label', 'Show friends');
  btn.appendChild(friendsIcon());
  const end = $('tb-toolbar-end');
  if (end) end.appendChild(btn);

  function setOpen(open, save) {
    panel.hidden = !open;
    btn.hidden = open;
    root.classList.toggle('tb-friends-open', open);
    if (save) store.set(open ? '1' : '0');
    // shell.js measures the panels on the right (the toolbar and dock stop where they start).
    window.dispatchEvent(new Event('tb-panels-changed'));
  }
  const toggle = () => setOpen(panel.hidden, true);
  close.addEventListener('click', toggle);
  btn.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyF') {
      e.preventDefault();
      toggle();
    }
  });
  // Closed until opened: there's nothing in it to use yet.
  setOpen(store.get() === '1', false);

  window.Tunebox = Object.assign(window.Tunebox || {}, {
    friends: { open: () => setOpen(true, true), close: () => setOpen(false, true), toggle, get isOpen() { return !panel.hidden; } }
  });
})();
