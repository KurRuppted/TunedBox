'use strict';

// app.js finds its UI by element ID. The Tunebox redesign rebuilds index.html, so this guards
// against an edit quietly dropping an element the app still looks up.
// The fixture lists the IDs in index.html that app.js looks up (taken from the pre-redesign baseline).
// If an ID is removed on purpose (and app.js no longer needs it), remove it from the fixture too.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const contract = require('./fixtures/ui-id-contract.json');

test('index.html keeps every element ID that app.js looks up', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]));
  const missing = contract.filter((id) => !ids.has(id));
  assert.deepStrictEqual(missing, [], `index.html lost IDs that app.js uses: ${missing.join(', ')}`);
});

test('index.html has no duplicate IDs among the ones app.js uses', () => {
  const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
  const counts = new Map();
  for (const m of html.matchAll(/\sid="([\w-]+)"/g)) counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  const dupes = contract.filter((id) => counts.get(id) > 1);
  assert.deepStrictEqual(dupes, [], `duplicate IDs: ${dupes.join(', ')}`);
});
