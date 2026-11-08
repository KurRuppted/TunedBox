'use strict';

// UI tests run against the real Electron app (no browser download needed).
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.js$/,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: './e2e/.results',
});
