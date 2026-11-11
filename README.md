<p align="center">
  <img src="banner.png?v=2" alt="TunedBox - desktop music player and audio suite for YouTube Music, SoundCloud, and local files" width="100%">
</p>

<p align="center">
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/windows8/windows8-original.svg" width="22" height="22" alt="Windows">&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/apple/apple-original.svg" width="22" height="22" alt="macOS">&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/linux/linux-original.svg" width="22" height="22" alt="Linux">&nbsp;&nbsp;
  <img src="https://cdn.simpleicons.org/ios/9ca3af" width="22" height="22" alt="iOS">&nbsp;&nbsp;
  <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/android/android-original.svg" width="22" height="22" alt="Android">
</p>

<h1 align="center">
  <img src="github/readme/emoj2i.gif" width="48" height="48" align="absmiddle" alt="emoji">&nbsp;TunedBox
</h1>

<p align="center">
  <b>A free, open-source desktop music player for YouTube Music, SoundCloud, and local files.</b><br>
  Built with Material Design 3, no tracking, and no account needed.
</p>

<p align="center">
  <a href="https://github.com/KurRuppted/TunedBox/releases">
    <img src="https://img.shields.io/badge/Download-6750A4?style=for-the-badge&logo=download&logoColor=white" height="40" alt="Download">
  </a>
</p>

<p align="center">
  <a href="#core-features">Features</a> &nbsp;·&nbsp;
  <a href="#built-in-audio-suite">Audio Suite</a> &nbsp;·&nbsp;
  <a href="#material-design-3-expressive-ui">Interface</a> &nbsp;·&nbsp;
  <a href="#download-and-install">Install</a> &nbsp;·&nbsp;
  <a href="#faq">FAQ</a> &nbsp;·&nbsp;
  <a href="#build-from-source">Build</a> &nbsp;·&nbsp;
  <a href="#credits">Credits</a>
</p>

<p align="center">
  <a href="https://github.com/KurRuppted/TunedBox/stargazers"><img src="https://img.shields.io/github/stars/KurRuppted/TunedBox?style=flat-square&labelColor=16191C&color=CAD3F5" alt="Stars"></a>
  <a href="https://github.com/KurRuppted/TunedBox/commits/main"><img src="https://img.shields.io/github/last-commit/KurRuppted/TunedBox?style=flat-square&labelColor=16191C&color=94C9FF" alt="Last Commit"></a>
  <a href="https://github.com/KurRuppted/TunedBox/blob/main/LICENSE"><img src="https://img.shields.io/github/license/KurRuppted/TunedBox?style=flat-square&labelColor=16191C&color=8EEDD8" alt="License"></a>
</p>

## What is TunedBox?

TunedBox is an open-source, telemetry-free desktop music app and player for **Windows, Linux, and macOS**. It unifies playback across **YouTube Music**, **YouTube**, **SoundCloud**, and offline local media into a single high-performance interface without ads, subscriptions, or login constraints. Provides very fancy UI and layout.

TunedBox is a personal fork of the [**Riff**](https://github.com/rootscripts/riff) music player, restyled with a **Tunebox**-inspired look (sidebar, Now Playing panel, Focus mode, Stage, lyrics, Friends) while keeping Riff's playback engine, queue, and providers intact. See [Credits](#credits) for full attribution.

Built with **Electron**, **Vanilla JavaScript**, and **WebGL**, TunedBox provides responsive UI interactions and hardware-accelerated audio visualization without runtime framework overhead. The project is distributed under the **MIT license** and enforces strict privacy: all configuration, cached streams, and playback history remain strictly on the local machine.

## Core features

- High quality streaming with **YouTube Music, YouTube, and SoundCloud** without third-party advertisements or account requirements
- **Offline lossless playback with full local library support** for high resolution formats including FLAC, WAV, MP3, OGG, and M4A.
- **Easy built-in audio editor**, downloading with effects or trimming 10-band & 3-band equalizer, and real-time DSP effects (speed, pitch, reverb, distortion).
- **1-Click multi-platform playlist migration**: Direct import and resolution of public playlists from Spotify, Apple Music, Deezer, YouTube Music, and SoundCloud
- **Tunebox-styled UI**: sidebar, Now Playing panel, Friends panel, dynamic color extraction from album artwork, deep UI theming, responsive layout presets, and an integrated CSS editor
- **Hardware-Accelerated Visuals**: Canvas and WebGL visualizers including real-time frequency analyzers, an interactive squiggly progress scrubber, Focus mode's Stage layout, and synchronized karaoke lyrics with word- and syllable-level sync.
- **Discord Rich Presence**: Real-time playback status reporting track metadata, artist info, and elapsed time to Discord.
- **Zero Telemetry**: No tracking identifiers, analytics pings, or background data collection.
- **Fullscreen mode** with fancy lyrics animation.
- **Albums** - see all of your favorite artist albums.
- **Customization** - built in theme editor, configure everything, and a CSS editor, with animated backgrounds and interface opacity sliders.
- **Plugins** - built-in plugin feature where you can add a plugin to edit how TunedBox works with something or add a new function.

## Built-in Audio Suite

TunedBox includes an integrated audio engineering toolkit accessible directly within the player interface:

### Visual Audio Editor
- **Lossless Audio Trimming**: Define start and end boundaries to trim tracks without transcoding loss.
- **Region Extraction**: Select and isolate specific audio segments to save as standalone files.
- **Non-Destructive Processing**: Edit operations produce independent files while preserving original source media untouched.

### 10-Band Parametric Equalizer
- Dedicated frequency sliders covering 32 Hz through 16 kHz with pre-configured acoustic profiles (Bass Boost, Vocal Clarity, Electronic, Flat, Rock).
- Per-channel gain adjustments with real-time Web Audio API signal processing.

### Real-Time DSP Effects Chain
- **Tempo Control**: Dynamically speed up or slow down playback rate without altering pitch.
- **Pitch Shifting**: Independent semitone pitch adjustment for rehearsal and tuning.
- **Reverb & Spatial Effects**: Algorithmic convolution and room size simulation for spatial enhancement.
- **Distortion / Overdrive**: Adjustable wave-shaping saturation and drive harmonics.

### Offline Library & Download Pipeline
- Download streams from YouTube Music, YouTube, and SoundCloud directly into local disk storage (MP3, FLAC, Opus, WAV).
- Automatic ID3 and metadata tagging, including high-resolution cover art embedding.
- Complete offline availability with full playlist compilation and search indexing.

## Material Design 3 Expressive UI

TunedBox's Tunebox-styled shell is layered over a Material Design 3 (M3 Expressive) foundation:

- **Dynamic Color Extraction**: Generates responsive UI tonal palettes on the fly based on the dominant and secondary hues of active album art.
- **Deep UI Customization**: Configurable banner backdrops, mesh gradients, blur filters, and typography controls.
- **Integrated CSS Editor**: Built-in developer console allowing direct CSS overrides and custom style injection to personalize every aspect of the interface.
- **Optimized Layout Modes**: Compact mini-player layout, expanded desktop view, and fullscreen Focus / Stage mode with synchronized lyrics rendering.

## Multi-Platform Playlist Migration

Migrate existing music libraries between platforms in a single operation:

- Import public playlist URLs from **Spotify** (including playlists with 100+ tracks via automated pagination).
- Import public playlists from **Deezer**, and public playlists and albums from **Apple Music**, **SoundCloud**, and **YouTube / YouTube Music**.
- Platform-aware search resolution: matches imported track metadata against the selected audio provider to construct immediate local playlists.

## Synchronized Lyrics Engine

- Automatic multi-provider lyrics lookup matching artist, title, album, and duration metadata (word- and syllable-timed lyrics preferred, with a duration-matched fallback).
- Native support for synchronized LRC files, plain text lyrics, and dynamic online timestamp alignment.
- Inline time-offset and word-speed adjustments to manually synchronize lyrics with live streams.
- Multi-language translation support directly inside the lyrics panel.

## Download and install

Pre-built binaries are available on the [Releases page](https://github.com/KurRuppted/TunedBox/releases).

Standard releases include all necessary dependencies (bundled yt-dlp and ffmpeg binaries). No secondary runtime configuration is required on Windows or Linux.

On Windows, the installer lets you choose the installation directory. Uninstalling TunedBox does not delete your app data.

### macOS

macOS support is currently experimental and compiled via continuous integration.

1. Download the appropriate image:
   - `TunedBox-<version>-mac-arm64.dmg` for Apple Silicon (M1 / M2 / M3 / M4)
   - `TunedBox-<version>-mac-x64.dmg` for Intel-based hardware
2. Open the disk image and drag TunedBox to your `Applications` directory.
3. TunedBox is ad-hoc signed but not notarized, so the first launch is blocked. Right-click `TunedBox.app` in `Applications`, select **Open**, and confirm the prompt. On macOS 15 and later, open it once, then go to **System Settings → Privacy & Security** and click **Open Anyway**.
4. If macOS still flags the bundle as damaged (older releases), execute the following command in Terminal:
   ```bash
   xattr -cr /Applications/TunedBox.app
   ```
   If a quarantine warning occurs when mounting the `.dmg` itself, run:
   ```bash
   xattr -d -r com.apple.quarantine /path/to/TunedBox.dmg
   ```
5. TunedBox downloads yt-dlp on first launch. Installing the tools with Homebrew is recommended, especially on Apple Silicon, where the ffmpeg build TunedBox downloads needs Rosetta (TunedBox finds Homebrew paths even when opened from Finder or the Dock):
   ```bash
   brew install yt-dlp ffmpeg
   ```
   Streaming works without ffmpeg; it is only needed for downloads and the audio editor.

macOS application data and local indexes are stored in `~/Library/Application Support/TunedBox`.

## Build from source

Requires Node.js 18 or newer and npm.

```bash
git clone https://github.com/KurRuppted/TunedBox.git
cd TunedBox
npm install
npm start        # run the dev version
npm run dist     # make a production build
```

The exact build output depends on the current project configuration.

## Memory usage

TunedBox (single Electron renderer and server process) typically utilizes approximately **180 MB of RAM** during steady-state playback. Actual footprint varies based on active visualizer modes, library size, and OS window compositing.

### Memory usage is only classified as a leak when sustained footprint exceeds 600 MB.

## FAQ

**Is TunedBox free?**
Yes. TunedBox is free software published under the permissive MIT license. There are no subscriptions, paywalls, or premium tiers.

**Does TunedBox display advertisements?**
No. Streams from YouTube Music, YouTube, and SoundCloud are resolved directly and play without advertisements.

**Is an account or sign-in required?**
No account is required for playback or public playlist imports. Optional Google sign-in lets you import your own YouTube likes and playlists; TunedBox uses Google's OAuth flow and YouTube Data API for that feature. Telemetry and analytic tracking are strictly omitted.

**Which operating systems are supported?**
Windows 10/11, modern Linux distributions, and macOS (experimental).

**Can TunedBox function as an offline local music player?**
Yes. TunedBox natively indexes local audio files (including lossless FLAC, WAV, MP3, and OGG), reads standard metadata tags and embedded artwork, and manages playlists without altering underlying disk files.

**Can I use TunedBox entirely offline?**
Yes. Downloaded tracks, saved audio segments, and indexed local libraries function without an internet connection.

**How does playlist migration work?**
Paste any public Spotify, Apple Music, Deezer, YouTube Music, or SoundCloud playlist link. TunedBox extracts track titles and artists, batches requests to resolve streams on your active platform, and saves the result as an editable local playlist.

**Does TunedBox support synchronized lyrics?**
Yes. TunedBox prefers word- and syllable-timed lyrics, with duration-matched LRC fallback, local LRC files, manual timing adjustments, and real-time synchronized karaoke display (Focus mode / Stage).

**Does TunedBox integrate with Discord?**
Yes. Native Discord Rich Presence displays the currently playing track title, artist, elapsed time, and platform indicator.

**Are there official mobile builds?**
No official mobile releases exist for TunedBox.

## Contributing

This is a personal fork maintained in my spare time. Bug reports via Issues are welcome; small, focused pull requests may be considered, but there's no guarantee of a quick review. Please verify all changes locally, ensure code passes syntax validation (`node --check`), and confirm stability before submitting.

## Credits

TunedBox is a fork of [**Riff**](https://github.com/rootscripts/riff), an open-source desktop music player created and maintained by **rootscripts** ("rootless"). Riff's playback engine, queue, and providers power TunedBox under the hood; TunedBox adds a Tunebox-inspired UI on top. Riff is distributed under the MIT license, included unmodified in [`LICENSE`](LICENSE).

If you find the underlying player useful, consider supporting the original Riff project directly:
- Riff on GitHub: https://github.com/rootscripts/riff
- Support Riff's development: [Ko-fi](https://ko-fi.com/rootlesszen)

## Disclaimer

TunedBox is developed for educational purposes and personal media management. Users are responsible for adhering to the terms of service of third-party platforms and applicable local copyright regulations.

## License

[MIT](LICENSE) — originally © rootscripts (Riff), see [Credits](#credits).

---

<sub>Keywords: free music player, YouTube Music desktop app, SoundCloud desktop player, ad-free music player, Material Design 3, M3 Expressive, visual audio editor, lossless audio trimmer, 10-band equalizer, DSP effects, tempo changer, pitch shift, FLAC player, WAV playback, Spotify playlist import, Apple Music playlist migration, Electron music player, Vanilla JS, WebGL audio visualizer, Discord Rich Presence, open source music player, MIT license, telemetry-free desktop player.</sub>
