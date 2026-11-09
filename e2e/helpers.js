'use strict';

// Launches the real Riff Electron app in a throwaway profile so tests never touch the user's own data.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { _electron } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..');
const APP_VERSION = require('../package.json').version;

// A mono 16-bit PCM WAV with a sine tone. Small (8 kHz) but long enough to seek in.
function writeToneWav(file, { seconds = 30, freq = 440, rate = 8000 } = {}) {
  const samples = seconds * rate;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + samples * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 3000), 44 + i * 2);
  fs.writeFileSync(file, buf);
  return file;
}

function makeProfile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'riff-e2e-'));
  const dirs = {};
  for (const d of ['data', 'local', 'roaming', 'userData', 'music']) {
    dirs[d] = path.join(dir, d);
    fs.mkdirSync(dirs[d], { recursive: true });
  }
  // Skip the first-run welcome screen (platform.js accepts this marker inside the data dir).
  fs.writeFileSync(path.join(dirs.data, '.rifftutorial'), APP_VERSION);
  return { dir, ...dirs };
}

// seed: Riff storage keys to start with (values are strings, as Riff keeps them).
async function launchRiff({ width = 1600, height = 1000, maximize = false, seed = null } = {}) {
  const profile = makeProfile();
  if (seed) fs.writeFileSync(path.join(profile.userData, 'storage.json'), JSON.stringify(seed));
  // VS Code's terminal sets ELECTRON_RUN_AS_NODE, which would start Electron as plain Node.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'));
  Object.assign(env, {
    RIFF_DATA_DIR: profile.data,
    RIFF_STORAGE_FILE: path.join(profile.userData, 'storage.json'),
    LOCALAPPDATA: profile.local,
    APPDATA: profile.roaming,
    // Open in the background: tests never take focus from what the person is doing.
    RIFF_SHOW_INACTIVE: '1',
  });
  const pageCapture = process.env.RIFF_CAPTURE === 'page';
  const app = await _electron.launch({
    cwd: ROOT,
    // Keep rendering while other windows cover this one (a background window would otherwise pause).
    args: ['.', `--user-data-dir=${profile.userData}`, '--disable-features=CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
    env,
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await app.evaluate(({ BrowserWindow, screen }, size) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.webContents.setBackgroundThrottling(false);
    // Maximizing brings a window to the front; with page capture, size it to 1920×1032 instead.
    if (size.maximize && !size.pageCapture) { win.maximize(); return; }
    if (size.maximize) { if (win.isMaximized()) win.unmaximize(); win.setPosition(0, 0); win.setContentSize(1920, 1032); return; }
    if (win.isMaximized()) win.unmaximize();
    // Never larger than the screen, or the OS clips the window and screenshots get cut off.
    const area = screen.getDisplayMatching(win.getBounds()).workAreaSize;
    win.setContentSize(Math.min(size.width, area.width), Math.min(size.height, area.height - 40));
    win.center();
  }, { width, height, maximize, pageCapture });
  await page.waitForTimeout(300);
  await page.waitForSelector('#playbar', { state: 'attached' });
  // The boot skeleton covers the UI until the app has started.
  await page.waitForSelector('#boot-skeleton', { state: 'hidden', timeout: 30_000 }).catch(() => {});
  return { app, page, profile };
}

// Answer the next "Add files" dialog with these paths instead of showing it.
async function stubOpenDialog(app, filePaths) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: paths });
  }, filePaths);
}

async function closeRiff(ctx) {
  if (!ctx) return;
  try {
    // Riff hides to the tray on close, so quit the app outright.
    await ctx.app.evaluate(({ app }) => app.exit(0));
  } catch (e) {}
  try { await ctx.app.close(); } catch (e) {}
  try { fs.rmSync(ctx.profile.dir, { recursive: true, force: true }); } catch (e) {}
}

// Screenshot of the window as it appears on screen. On Windows this includes what the page itself can't
// capture: Mica behind the see-through sidebar and the native caption buttons. Elsewhere it falls back
// to Electron's page capture.
// RIFF_CAPTURE=page always uses the page capture: it never touches the screen or brings the window to
// the front (use it while the computer is in use), but shows no Mica and no native caption buttons.
async function capturePage(app, file) {
  const png = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].webContents.capturePage()).toPNG().toString('base64'));
  fs.writeFileSync(file, Buffer.from(png, 'base64'));
}

async function captureWindow(app, file) {
  if (process.platform !== 'win32' || process.env.RIFF_CAPTURE === 'page') return capturePage(app, file);
  const info = await app.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows()[0];
    win.setAlwaysOnTop(true, 'screen-saver');
    win.focus();
    const b = win.getContentBounds();
    const scale = screen.getDisplayMatching(b).scaleFactor;
    return { x: b.x, y: b.y, width: b.width, height: b.height, scale };
  });
  try {
    {
      await new Promise((r) => setTimeout(r, 400)); // let the window come to the front
      const s = info.scale;
      const [x, y, w, h] = [info.x * s, info.y * s, info.width * s, info.height * s].map(Math.round);
      const ps = [
        'Add-Type -AssemblyName System.Drawing',
        // Physical pixels, whatever Windows' display scaling is.
        'Add-Type -Name Dpi -Namespace W -MemberDefinition \'[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();\'',
        '[W.Dpi]::SetProcessDPIAware() | Out-Null',
        `$bmp = New-Object System.Drawing.Bitmap ${w}, ${h}`,
        '$g = [System.Drawing.Graphics]::FromImage($bmp)',
        `$g.CopyFromScreen(${x}, ${y}, 0, 0, $bmp.Size)`,
        `$bmp.Save('${file.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
        '$g.Dispose(); $bmp.Dispose()'
      ].join('; ');
      require('node:child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'pipe' });
    }
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setAlwaysOnTop(false));
  }
}

function audioState(page) {
  return page.evaluate(() => {
    const a = document.getElementById('native-audio');
    return a ? { paused: a.paused, time: a.currentTime, duration: a.duration, src: a.currentSrc } : null;
  });
}

module.exports = { ROOT, launchRiff, closeRiff, stubOpenDialog, writeToneWav, audioState, captureWindow };
