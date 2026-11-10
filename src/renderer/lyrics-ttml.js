/* Better Lyrics TTML → Riff's synced lyrics lines, with the browser's own XML parser (no dependency).
   A port of what Tunebox does with @braccato/parsers (Tunebox's src/renderer/src/lib/ttml.ts):
   - each <p> is a line; its <span begin end> children are timed parts
   - parts of one word are adjacent spans (syllables); words are separated by whitespace, either a text
     node between spans or a trailing space inside a span
   - background vocals (ttm:role="x-bg") are skipped: they overlap the lead and these views show one voice
   - a line without timed spans (itunes:timing="Line") keeps its line timing; the views estimate its words
   Times are in seconds, the way Riff stores lyrics: { time, endTime, text, words?: [{ text, start, end,
   syllables?: [{ start, end, chars }] }] }. Loaded before app.js; exposed as window.RiffTtml.parse(). */
(function () {
  'use strict';

  /** "12.345", "1:02.345", "01:02:03.456", "12.3s", "1500ms" → seconds (NaN when unreadable). */
  function parseTime(value) {
    const v = String(value == null ? '' : value).trim();
    if (!v) return NaN;
    let m = /^(\d+(?:\.\d+)?)(h|m|s|ms)$/.exec(v);
    if (m) {
      const n = parseFloat(m[1]);
      return m[2] === 'h' ? n * 3600 : m[2] === 'm' ? n * 60 : m[2] === 'ms' ? n / 1000 : n;
    }
    m = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(v);
    if (!m) return NaN;
    const parts = [m[1], m[2], m[3]].filter((x) => x !== undefined).map(parseFloat);
    return parts.reduce((total, n) => total * 60 + n, 0);
  }

  const role = (el) => el.getAttribute('ttm:role') || el.getAttributeNS('http://www.w3.org/ns/ttml#metadata', 'role') || '';
  const isAside = (el) => /^x-(bg|translation|roman)/.test(role(el));

  /** A line's timed parts in order, skipping background vocals: [{ text, start, end }] (text keeps its spaces). */
  function partsOf(p) {
    const parts = [];
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) {
          // Text between spans only matters as a word break.
          if (/\s/.test(child.nodeValue) && parts.length) parts[parts.length - 1].breakAfter = true;
          continue;
        }
        if (child.nodeType !== 1 || child.localName !== 'span' || isAside(child)) continue;
        const begin = parseTime(child.getAttribute('begin'));
        const end = parseTime(child.getAttribute('end'));
        const timedKids = child.querySelector('span[begin]');
        if (Number.isFinite(begin) && !timedKids) parts.push({ text: child.textContent, start: begin, end: Number.isFinite(end) ? end : begin });
        else walk(child);
      }
    };
    walk(p);
    return parts;
  }

  /** Groups timed parts into words, keeping each part as a syllable (Tunebox's partsToWords). */
  function partsToWords(parts) {
    const words = [];
    let current = null;
    const close = () => { if (current && current.text) words.push(current); current = null; };
    for (const part of parts) {
      const text = part.text.trim();
      if (/^\s/.test(part.text)) close();
      if (text) {
        const end = Math.max(part.start, part.end);
        const syllable = { start: part.start, end, chars: [...text].length };
        if (current) {
          current.text += text;
          current.end = Math.max(current.end, end);
          current.syllables.push(syllable);
        } else {
          current = { text, start: part.start, end, syllables: [syllable] };
        }
      }
      if (/\s$/.test(part.text) || part.breakAfter) close();
    }
    close();
    // A one-syllable word sweeps evenly anyway; drop the extra detail.
    for (const w of words) if (w.syllables.length === 1) delete w.syllables;
    return words;
  }

  /** Visible text of a line without its background vocals. */
  function leadText(p) {
    let text = '';
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) text += child.nodeValue;
        else if (child.nodeType === 1 && !isAside(child)) walk(child);
      }
    };
    walk(p);
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Parses a TTML document. Returns { lines, wordSynced, syllableSynced }; throws on a document that
   * isn't TTML or has no timed lines, so the caller can fall back to other lyrics.
   */
  function parse(ttml) {
    if (typeof ttml !== 'string' || !ttml.includes('<tt')) throw new Error('Not a TTML document');
    const doc = new DOMParser().parseFromString(ttml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Malformed TTML');
    const tt = doc.documentElement;
    if (!tt || tt.localName !== 'tt') throw new Error('Not a TTML document');
    const timing = (tt.getAttribute('itunes:timing') || '').toLowerCase();
    if (timing === 'none') throw new Error('TTML lyrics are not timed');

    const lines = [];
    for (const p of doc.getElementsByTagNameNS('*', 'p')) {
      const text = leadText(p);
      if (!text) continue;
      const begin = parseTime(p.getAttribute('begin'));
      const end = parseTime(p.getAttribute('end'));
      let words = partsToWords(partsOf(p));
      const start = Number.isFinite(begin) ? begin : (words.length ? words[0].start : NaN);
      if (!Number.isFinite(start)) continue;
      // Only background vocals timed, or line-timed TTML: the views estimate this line's words.
      if (!words.length) words = null;
      const lastEnd = words ? words[words.length - 1].end : start;
      lines.push({ time: start, endTime: Math.max(Number.isFinite(end) ? end : start, lastEnd), text, words: words || undefined });
    }
    if (!lines.length) throw new Error('TTML has no timed lines');
    lines.sort((a, b) => a.time - b.time);
    const worded = lines.filter((l) => l.words);
    return {
      lines,
      wordSynced: timing === 'word' || worded.length > 0,
      syllableSynced: worded.some((l) => l.words.some((w) => w.syllables))
    };
  }

  window.RiffTtml = { parse, parseTime };
})();
