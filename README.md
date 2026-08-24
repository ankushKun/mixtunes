# Mixtunes

**A classic iTunes theme for streaming music.**

A free browser extension that themes the streaming sites you already use with a classic desktop music-library UI: sidebar sources, a sortable track list, Cover Flow, and transport controls. The host site stays the player. Your preferences stay on your device.

**Works on YouTube Music today.** Spotify, Apple Music, and SoundCloud are planned.

[Website](https://ankush.one/mixtunes/) · [Releases](https://github.com/ankushKun/mixtunes/releases) · [Privacy](https://ankush.one/mixtunes/privacy.html)

<p align="center">
  <img src="docs/assets/shot-coverflow.jpg" alt="Mixtunes theme on YouTube Music: Cover Flow" width="920" />
</p>

## Features

- **Cover Flow** - album art you can flip through, with reflections
- **Sidebar library** - Music, Liked Songs, Albums, Artists, playlists
- **Track list** - sortable columns including Plays and Last Played
- **Themes** - Metal, Graphite, or match the system appearance
- **Local only** - no Mixtunes account; the extension does not phone home

Works on **Chrome 121+**, **Firefox 121+**, and Chromium-based browsers (Edge, Brave, Arc, Vivaldi, Opera, Zen). Not on Safari or mobile yet.

## Install

### From a release (recommended)

1. Open [Releases](https://github.com/ankushKun/mixtunes/releases) and download the zip for your browser:
   - `Mixtunes-…-chrome.zip` - Chrome, Edge, Brave, Arc, Vivaldi, Opera, Chromium
   - `Mixtunes-…-firefox.zip` - Firefox / Zen
2. Unzip it.
3. **Chrome-family**  
   Open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select the unzipped folder.
4. **Firefox**  
   Open `about:debugging` → **This Firefox** → **Load Temporary Add-on** → pick any file inside the unzipped folder. Temporary add-ons are cleared when Firefox quits until a signed AMO build is available.

Publishing a GitHub Release (tag like `v0.1.0`) runs CI that packs both zips and attaches them automatically.

Then open a supported player site while signed in - today that is [music.youtube.com](https://music.youtube.com).

### From source

```bash
git clone git@github.com:ankushKun/mixtunes.git
cd mixtunes
npm test
npm run pack
```

Load `build/chromium` (Chrome-family) or `build/firefox` (Firefox) as an unpacked / temporary add-on using the steps above.

## Development

| Command        | What it does                                      |
| -------------- | ------------------------------------------------- |
| `npm test`     | Runs the core unit tests                          |
| `npm run pack` | Builds `build/chromium` and `build/firefox` (+ zips) |

Marketing site (static): `docs/` - preview with:

```bash
python3 -m http.server 4173 --directory docs
```

Store listing copy and publish checklist live in `store/`.

## Privacy

- **Extension:** preferences in `chrome.storage.local` only; no analytics SDK; player API calls go to the host (YouTube today), not to Mixtunes.
- **Website:** [ankush.one/mixtunes](https://ankush.one/mixtunes/) may use PostHog for page/install analytics, with an opt-out on the [privacy policy](https://ankush.one/mixtunes/privacy.html).

## Disclaimer

Mixtunes is an independent, fan-made project. It is **not** affiliated with, endorsed by, or sponsored by Apple, Google, Spotify, or SoundCloud. “iTunes” and “Cover Flow” are trademarks of Apple Inc.; “YouTube” and “YouTube Music” are trademarks of Google LLC.

## License

[GPL-3.0](LICENSE) © Ankush Singh
