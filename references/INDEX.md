# OldTwitter → yTunes index

This document is the working map of [dimdenGD/OldTwitter](https://github.com/dimdenGD/OldTwitter) (vendored as `references/OldTwitter`) and what yTunes should steal, skip, or invert to turn **YouTube Music** into **classic iTunes** (Cover Flow era, ~iTunes 8/9).

Reference screenshot: [`itunes-cover-flow.png`](./itunes-cover-flow.png)

OldTwitter source of truth: `references/OldTwitter` (git submodule). Do not edit that tree; treat it as read-only analysis.

---

## 1. What OldTwitter actually is

OldTwitter is **not a CSS theme**. The README states it explicitly:

> This extension doesn't add any CSS on top of original Twitter. It's a fully original client that replaces Twitter.

The extension:

1. Stops Twitter’s own JS from booting.
2. Throws away Twitter’s DOM.
3. Injects its own HTML/CSS/JS from `layouts/`.
4. Talks to Twitter’s **internal REST + GraphQL APIs** using the user’s existing cookies.
5. Reimplements almost every product surface (home, profile, tweet, search, DMs, lists, …).

That is a **full client replacement**, not a restyle. yTunes can copy the *pattern*, but cannot copy the *player strategy* blindly — see §8.

---

## 2. Boot sequence (how a page becomes OldTwitter)

Content scripts run at `document_start` on `twitter.com` / `x.com` (except login, TweetDeck, Grok, `?newtwitter=true`, etc.).

```
document_start
    │
    ├─ blockBeforeInject.js
    │     MutationObserver: rewrite <script> type to javascript/blocked,
    │     preventDefault on beforescriptexecute, strip SVG/placeholder.
    │
    ├─ declarativeNetRequest (ruleset.json)
    │     • Remove Content-Security-Policy and X-Frame-Options
    │     • Block twitter.com/sw.js and x.com/sw.js
    │     • Redirect favicons to OldTwitter icons
    │     • Set CORS on twimg.com for twitter.com / x.com
    │
    ├─ config.js     load chrome.storage.sync settings + Bearer tokens + csrf from ct0 cookie
    ├─ helpers.js    DOM/modals/i18n/formatters
    ├─ apis.js       API.* wrappers around /1.1 and /i/api/graphql
    ├─ twchallenge.js  sandbox iframe that solves Twitter’s JS challenge
    └─ injection.js
          1. Map location.pathname → a page in `pages[]`
          2. Redirect / rewrite some URLs (hashtags → search, /messages → /home#dm, …)
          3. If the path is login/settings/analytics/etc → add ?newtwitter=true and leave
          4. Unregister Twitter’s service worker + clear Cache Storage
          5. fetch() layout HTML/CSS from chrome.runtime.getURL
          6. Substitute __MSG_*__ i18n placeholders
          7. document.documentElement.innerHTML = html   ← nuclear DOM replace
          8. Inject header HTML + page CSS + favicon
          9. chrome.runtime.sendMessage({ action: "inject", files: [...] })
                background.js uses chrome.scripting.executeScript to load
                layout scripts + libraries AFTER the new DOM exists
```

**Escape hatch:** `?newtwitter=true` skips the replacement and only injects `newtwitter.js` (a floating “Open in OldTwitter” link) plus `xIconRemove.js`.

**Why scripts inject in two phases:** layout JS must run against the *new* DOM. Content-script files listed in the manifest run too early, so page scripts are injected later via the background worker.

---

## 3. Architecture (copy this shape)

```
┌─────────────────────────────────────────────────────────────┐
│  Host site tab (twitter.com / x.com)                        │
│                                                             │
│  [blocked native app]                                       │
│                                                             │
│  layouts/{page}/index.html  +  layouts/header/              │
│           │                                                 │
│           ├─ layouts/{page}/script.js  (page logic)         │
│           ├─ tweetConstructor.js       (tweet DOM)          │
│           └─ API.*  ──fetch──►  Twitter GraphQL / REST      │
│                        cookies + Bearer + x-csrf-token      │
└─────────────────────────────────────────────────────────────┘
        ▲ chrome.scripting / getURL / storage / DNR
┌───────┴────────┐
│ background.js  │  inject files, fetch blobs, open settings
└────────────────┘
```

Shared chrome (`layouts/header`) is fetched on every page. Each route is a self-contained triple:

```
layouts/<name>/
  index.html
  style.css
  script.js
```

That is the most important structural lesson for yTunes.

---

## 4. Manifest capabilities (what the extension *is allowed* to do)

From `manifest.json` (MV3):

| Key | Why it exists |
| --- | --- |
| `content_scripts` `run_at: document_start` | Beat Twitter’s JS to the punch |
| `exclude_matches` | Leave login, TweetDeck, Grok, data download, `?newtwitter=true` alone |
| `declarativeNetRequest` | Strip CSP, kill SW, rewrite icons |
| `scripting` | Late-inject layout JS into the tab |
| `storage` + `unlimitedStorage` | Settings, caches, custom CSS overflow |
| `host_permissions` | twitter/x + twimg + giphy/tenor |
| `web_accessible_resources` | Layouts, fonts, images, locales, sandbox |
| `sandbox.pages: sandbox.html` | Isolated iframe for Twitter’s challenge solver |
| `action` + `contextMenus` | Toolbar click → `https://twitter.com/old/settings` |
| `_locales/*` | `chrome.i18n` + manual `__MSG_*__` substitution |

Firefox is a *generated* MV2 fork (`pack.js`): swaps `service_worker` for `background.scripts`, folds `host_permissions` into `permissions`, uses `webRequestBlocking` instead of DNR, and rewrites `chrome.storage.sync` → `local`.

---

## 5. File-by-file index

### 5.1 Core scripts (`scripts/`)

| File | Role | Steal for yTunes? |
| --- | --- | --- |
| `blockBeforeInject.js` | MutationObserver that neuters every `<script>` Twitter tries to insert, and removes SVG/placeholder chrome | **Partial.** Do not kill YTM’s player scripts (see §8). Maybe block ads / YouTube TV-style extras later. |
| `injection.js` | Router, URL rewrites, layout fetch, nuclear `innerHTML` replace, dark-mode CSS variables, custom CSS IndexedDB, late inject | **Yes, as the orchestrator.** Router + layout load is the pattern. |
| `config.js` | Hardcoded Twitter Bearer tokens, `ct0` csrf getter, huge `chrome.storage.sync` settings object with defaults | **Pattern yes, tokens no.** YTM uses SAPISID / InnerTube visitor data, not Twitter bearers. |
| `apis.js` (~9.3k lines) | The entire product: `API.account`, `.timeline`, `.discover`, `.notifications`, `.user`, `.tweet`, `.search`, `.inbox`, `.bookmarks`, `.list`, `.circle`, `.topic`, `.uploadMedia` | **Shape yes.** One namespaced client. Implementation will be InnerTube (`browse` / `next` / `player` / `search`). |
| `helpers.js` (~7k lines) | Modals, toast, number format, linkify, RTL, date, `html` tagged template, follow/block UI, etc. | **Selectively.** Modal + i18n helpers. Skip tweet-specific regexes. |
| `tweetConstructor.js` | Renders a tweet object into DOM (media, polls, cards, quoted tweets) | **No.** Replace with a **track-row constructor** and an **album-cover constructor**. |
| `tweetviewer.js` | Full-screen media viewer wiring (Viewer.js) | Later, for artwork lightbox. Not v1. |
| `background.js` | `scripting.executeScript` on `{action:"inject"}`, blob fetch for GIFs, settings tab, uninstall URL | **Yes.** Same inject + optional media proxy. |
| `newtwitter.js` | Escape-hatch overlay on native Twitter; keeps `?newtwitter=true` in the URL; Ctrl+Alt+O to leave | **Yes.** `?newytm=true` / “Open original YouTube Music”. |
| `xIconRemove.js` | Cosmetic: swap X logo + title suffix while on native Twitter | Optional. Swap YTM logo only if we keep a native-escape mode. |
| `iframeNavigation.js` | Optional SPA-ish navigation by stacking iframes (disabled on Firefox because XFO) | **No for v1.** YTM is already an SPA; we should hijack `history` or `ytmusic-app.navigate_`. |
| `twchallenge.js` | Posts path/method to sandboxed iframe; Twitter’s antibot solver returns a header | **Investigate.** YTM/YouTube has similar botguard. May need a sandbox later; do not cargo-cult Twitter’s solver. |
| `tdeb.js` | Debug helper | Skip. |

### 5.2 Layouts (`layouts/`) — every product surface

Injection maps `location.pathname` → `page.name` then loads `layouts/<name>/`.

| Layout | URL(s) | What it implements |
| --- | --- | --- |
| `header` | (injected into every page) | 2015 navbar: Home / Notifications / Messages, logo, search typeahead, user menu, Tweet button, DMs drawer, notification dropdown, hotkeys, theme buses |
| `home` | `/`, `/home` | Timeline (chrono / algo / popular-from-follows), composer, trends, profile card, timeline switch |
| `notifications` | `/notifications`, `/notifications/mentions` | Notification stream |
| `tweet` | `/:user/status/:id` (+ likes/retweets) | Tweet permalink + replies |
| `profile` | `/:user` (+ replies/media/likes/following/followers/lists) | Profile header, tabs, tweet list |
| `search` | `/search` | Search results |
| `bookmarks` | `/i/bookmarks` | Bookmarks |
| `lists` | `/i/lists/:id` | List timeline + members/followers |
| `topics` | `/i/topics/:id` | Topic timeline |
| `itl` | `/i/timeline` | “In case you missed it” / algorithmic extras |
| `settings` | `/old/settings` | Extension settings (not Twitter’s own settings — those stay on `?newtwitter=true`) |
| `unfollows` | `/old/unfollows/followers\|following` | Unfollower tracker (extension-only feature) |

`pages[]` also lists `history` → `/old/history`, but there is **no** `layouts/history/` folder and the header link is commented out. Dead route.

### 5.3 Network rewrite (`ruleset.json`)

22 DNR rules. Functionally:

- **CSP + XFO removal** on twitter.com and x.com (needed to inject our HTML/scripts and iframe navigation).
- **Service worker script blocked** so Twitter cannot take over the page after we unregister it.
- **Icon redirects** (twitter.3.ico → OldTwitter PNGs).
- **CORS allow-origin** on `*.twimg.com` for twitter.com / x.com / tweetdeck / chat.

### 5.4 Sandbox

`sandbox.html` is an extension-sandboxed page. `twchallenge.js` blobs it, iframes it offscreen, and `postMessage`s challenge jobs. This exists because Twitter’s antibot code must run in a context that can still see a `twitter-site-verification` meta tag.

### 5.5 Libraries (do not copy blindly)

See `LIBRARIES.md`. Relevant later for yTunes: DOMPurify (any HTML from APIs), maybe tinytoast. Skip twemoji, twitter-text, gif.js, Coloris until we need them.

### 5.6 Locales

`_locales/<lang>/messages.json` — Chrome i18n format. Layout HTML uses `__MSG_key__` because `document.documentElement.innerHTML = …` bypasses Chrome’s automatic i18n substitution. `injection.js` does the replace manually, falling back to English.

### 5.7 Settings surface (`config.js` keys)

OldTwitter settings are a product in themselves. Groups:

- **Look:** `darkMode`, `pitchBlack`, `systemDarkMode`, `timeMode`, `modernUI` (2018 vs 2015), `font`, `tweetFont`, `roundAvatars`, `linkColor`, `customCSS`, `customCSSVariables`
- **Timeline:** `timelineType`, `chronologicalTL`, `showTopicTweets`, `updateTimelineAutomatically`, `keepTimelinePosition`, `hideTimelineTypes`
- **Content filters:** hide trends / WTF / likes / followers, sensitive-media uncensor flags, `hideCommunityNotes`, `blockGrokEdit`
- **Media:** autoplay, GIF autoplay, mute, volume, original images, download button + template
- **Behavior:** hotkeys (and per-hotkey disables), Twemoji, hearts vs stars, iframe navigation, notifications-as-modal
- **Nav pins:** profile / bookmarks / lists / likes on the navbar

Cross-tab sync uses `BroadcastChannel` (`theme_bus`, `custom_css_bus`, `round_avatar_bus`, `modern_ui_bus`, `notification_bus`) so settings changes apply without reload.

---

## 6. Feature catalog (user-visible)

From README + code. This is what “replace the site” bought them:

**Parity with Twitter**

- Home timelines (chrono, chrono±retweets, algo v2, popular-from-follows)
- Tweet permalink, replies, quotes, likes, retweets, bookmarks, pin, translate, download media
- Profiles, follow/block/mute, lists, topics
- Search + typeahead + saved searches
- Notifications + unread badge + favicon pip
- DMs (inbox, conversations, send, crypto-key read from Twitter’s IndexedDB)
- Composer (tweet, reply, quote, poll, scheduled, media, GIF search, emoji picker)
- Multi-account switch
- 2015 and 2018 visual modes, dark / pitch-black / system / time-based

**Extension-only extras**

- Unfollower tracker
- Custom profile link colors (shared via dimden’s color DB)
- Algorithm “why am I seeing this”
- Custom CSS
- Hotkeys (vim-like `G+H` navigation, `S`/`W` tweet focus, `L` like, …)
- Ad / analytics stripping (by never loading Twitter’s client)
- `?newtwitter=true` escape hatch

**Explicit non-goals**

- Pixel-perfect 2015 recreation (“general look and feel”)
- Running on Twitter login / OAuth / some `/i/*` flows (delegated to native)

---

## 7. API pattern to copy

`API` is a plain object of namespaced functions. Each function:

1. Optionally checks `chrome.storage.local` cache with a TTL.
2. `fetch`es a same-origin Twitter URL (`/i/api/graphql/...` or `/1.1/...`).
3. Sends `authorization: Bearer …`, `x-csrf-token: ct0 cookie`, `credentials: "include"`.
4. Normalizes GraphQL timeline instructions into old-style tweet objects.
5. Rejects with login errors and clears caches.

**yTunes equivalent:** a `YTM` client that `fetch`es `https://music.youtube.com/youtubei/v1/{browse,next,search,player,...}` with:

- `credentials: "include"` (SAPISID cookies already on the tab)
- InnerTube client name `WEB_REMIX`
- `X-Goog-Visitor-Id`, `X-Goog-AuthUser`, and SAPISIDHASH when required
- Parsed browse JSON → `{ albums, playlists, tracks, artists }`

Do **not** ship hardcoded Twitter Bearer tokens. Discover YTM’s `INNERTUBE_API_KEY` / client version from `ytcfg` on the page (YouTube puts this on `window.ytcfg` / inline JSON).

Community maps of the same API (for endpoint names, not for copying code): [ytmusicapi](https://ytmusicapi.readthedocs.io/en/stable/), [muse](https://github.com/vixalien/muse), [YouTube.js Music client](https://github.com/LuanRT/YouTube.js).

Useful browse IDs:

| Browse ID | Meaning |
| --- | --- |
| `FEmusic_home` | Home |
| `FEmusic_library_landing` | Library landing |
| `FEmusic_liked_playlists` | Saved/created playlists |
| `FEmusic_liked_albums` | Saved albums |
| `FEmusic_library_corpus_track_artists` | Library artists |
| `FEmusic_liked_songs` / liked songs playlist | Liked songs |
| `MPREb_…` | Album |
| `VL` + playlist id | Playlist |

---

## 8. The one thing we must not copy: killing the host app

OldTwitter can delete Twitter’s DOM because a tweet timeline does not need a living media runtime. **YouTube Music does.** Audio lives in the page’s player (`#movie_player` / `ytmusic-player-bar`). Signed stream URLs from `/player` are often `UNPLAYABLE` without that player (n-sig / SABR / botguard). Reimplementing playback is a multi-month YouTube-player project, not a UI project.

### Recommended architecture for yTunes: **hosted-player hybrid**

```
music.youtube.com tab
├─ Keep YTM JS + <ytmusic-player-bar> + #movie_player alive (hidden)
├─ Hide native chrome (nav, browse pages) with CSS / inert
├─ Inject iTunes shell (our layouts) as the visible UI
├─ Bind transport (play/pause/next/prev/seek/volume/shuffle/repeat)
│     to moviePlayer / ytmusic-player-bar APIs
└─ Fill Cover Flow + song table from InnerTube browse/search
      (same-origin fetch, user’s cookies)
```

| OldTwitter | yTunes |
| --- | --- |
| Block all host scripts | Do **not** block player/app scripts |
| `document.documentElement.innerHTML = …` | Overlay + hide; or replace only the *browse* region, never the player host |
| Unregister host service worker | Leave it unless it fights us |
| GraphQL tweets | InnerTube library / search / next |
| Tweet constructor | Track row + album tile + Cover Flow item |
| `?newtwitter=true` | `?newytm=true` (show stock YTM) |
| Login left on native Twitter | Login left on accounts.google.com / stock YTM |

A later “full client” (OldTwitter-pure) is possible only after we prove we can play audio without the host player. That is **not** v1.

---

## 9. iTunes UI we are targeting

From [`itunes-cover-flow.png`](./itunes-cover-flow.png) (iTunes 8/9 Cover Flow):

### Window chrome

- Brushed-metal top bar
- Transport: back / play-pause / forward (glossy round buttons)
- Volume slider
- Center **LCD**: artwork-or-eq, title/artist, scrubber, shuffle/repeat glyphs
- View switcher: list / grid / Cover Flow (segmented control)
- Search field (“Search Music”)

### Left sidebar

- Sections with small caps headers: **Library**, **Store**, **Genius**, **Playlists**
- Row icons + optional count bubbles
- Selected playlist highlighted
- Mini artwork well at the bottom of the sidebar (now-playing / selected album)

### Main — Cover Flow (upper)

- Perspective carousel of album covers
- Center cover face-on; neighbors rotated in 3D
- Floor reflection
- Thin scrollbar under the stage

### Main — track table (lower)

Columns: Name, Time, Artist, Year, Album, Rating (stars), Plays, Last Played, Genre  
Alternating row colors; selected row solid gray; speaker glyph on the playing track.

### Status bar

- `+` (new playlist), shuffle, repeat
- “N items, D days, X GB”
- Equalizer / output icons

### YouTube Music → iTunes mapping

| iTunes | YouTube Music source |
| --- | --- |
| Library → Music | `FEmusic_library_landing` / library songs |
| Library → (no Movies/TV) | Hide or map Podcasts later |
| Playlists | `FEmusic_liked_playlists` + user playlists |
| Liked songs | Liked songs playlist |
| Store | Explore / Charts (optional, later) |
| Genius | YTM Radio / “song radio” (`next` watch playlist) — later |
| Cover Flow covers | Album `thumbnail` + `MPREb_` browse |
| Song table | Playlist/album/library track lists |
| LCD now-playing | `moviePlayer.getVideoData()` + player bar title/artist |
| Transport | `playVideo` / `pauseVideo` / `nextVideo` / `previousVideo` / seek / volume |
| Search | `/youtubei/v1/search` + `music/get_search_suggestions` |
| Ratings / play counts | YTM has likes, not star ratings or play counts — show likes; omit or fake-empty Plays/Last Played until we persist our own stats |
| iTunes Match / Store | Out of scope |

Classic iTunes is **skeuomorphic** (metal, glass, LCD). That is the opposite of current YTM. Budget real time for materials (gradients, inner shadows, pixel-hinted glyphs), not a flat “inspired by” bar.

---

## 10. What we need to build (phased)

### Phase 0 — Prove the host (before UI polish)

1. Content script on `https://music.youtube.com/*` at `document_idle` first (not `document_start` until we know what we can hide).
2. Locate and log:
   - `ytmusic-app`, `ytmusic-player-bar`, `#movie_player`
   - `ytcfg` / InnerTube API key + client version
   - Current queue / `getVideoData()`
3. Hide native nav + browse with CSS; confirm **audio keeps playing**.
4. Drive play/pause/next from our popup or a floating test HUD.
5. Same-origin `fetch('/youtubei/v1/browse', …)` for `FEmusic_liked_albums` while logged in.

**Exit:** we can hide YTM chrome, still hear music, and print a list of saved albums in the console.

### Phase 1 — iTunes shell (static)

Layouts, OldTwitter-style:

```
src/layouts/
  shell/     window chrome, sidebar, status bar
  coverflow/
  tracktable/
  search/
```

- Brushed-metal window filling the tab
- Sidebar with Library + Playlists (hardcoded placeholders OK)
- Empty Cover Flow + empty table
- LCD + transport widgets wired to the **real** player
- Escape hatch `?newytm=true`

**Exit:** it *looks* like iTunes; play/pause/seek control the hidden YTM player.

### Phase 2 — Data

- `YTM` client module (browse, next, search, like, playlist CRUD)
- Map playlists → sidebar
- Selected playlist/album → table rows + Cover Flow covers
- Click row / cover → `loadVideoById` / queue via `next`
- Search field → YTM search

**Exit:** a real library, not placeholders.

### Phase 3 — Cover Flow motion

- 3D carousel (CSS `preserve-3d` + `rotateY` / `translateZ`, or canvas)
- Scrollbar + keyboard (arrow keys, like iTunes)
- Click-to-center, mouse-wheel, drag
- Reflections (duplicate cover with `scaleY(-1)` + gradient mask)
- Interruptible: follow pointer while dragging; spring/ease-out on release (see project `apple-design` skill)

### Phase 4 — Parity extras

- Shuffle / repeat bound to player
- New playlist (`+`)
- Like as star or heart
- Settings page (`/old/settings` equivalent)
- Custom CSS, dark “graphite” vs “metal”
- Hotkeys (space play, arrows Cover Flow, enter play, Cmd-F search)

### Out of scope until proven

- Replacing the YouTube player with our own `<audio>`
- Offline / iTunes Match
- Pixel-perfect every iTunes inspector pane
- Firefox pack script (Chrome first)

---

## 11. Concrete techniques to steal (checklist)

Use these OldTwitter ideas as-is:

1. **Layout triples** (`index.html` + `style.css` + `script.js`) per screen.
2. **Shared header/shell** injected into every page.
3. **Path router** with string paths + regexes + `exclude`.
4. **Two-phase inject:** manifest content scripts first, layout JS via `chrome.scripting` after DOM is ours.
5. **`web_accessible_resources`** for every HTML/CSS/font/image the page must `fetch()`.
6. **`chrome.runtime.getURL`** for those assets.
7. **Manual `__MSG_*__` substitution** if we set `innerHTML`.
8. **Settings in `chrome.storage.sync`** with explicit defaults.
9. **BroadcastChannel** for live theme/settings.
10. **Escape query param** so users can see stock YTM / we can debug.
11. **Leave auth flows on the native app.**
12. **Background `action: "inject"`** message protocol.
13. **Cache with TTL** in `chrome.storage.local` for library responses.
14. **One `API` / `YTM` namespace** instead of scattershot `fetch` calls.

Do **not** start with:

- Script blocking of the whole host
- Service worker unregister
- CSP stripping unless a real CSP blocks us (prefer injecting as a content-script overlay first; add DNR only if needed)
- Twitter challenge sandbox
- Iframe navigation stack
- 9k-line God files — split `YTM` by resource (library, player, search)

---

## 12. Manifest yTunes will need (likely)

Start smaller than OldTwitter. Add permissions only when a phase requires them.

```
host_permissions: *://music.youtube.com/*, *://*.youtube.com/*, *://*.ytimg.com/*, *://*.googleusercontent.com/*
permissions: storage, scripting
content_scripts: music.youtube.com, exclude *?*newytm=true*
web_accessible_resources: layouts/*, icons/*, fonts/*
```

Add `declarativeNetRequest` only if YTM CSP blocks our overlay or we must rewrite a header. Add `unlimitedStorage` if album-art caches blow the 10 MB sync/local quota.

---

## 13. Risks

| Risk | Why | Mitigation |
| --- | --- | --- |
| Player dies when we hide/replace DOM | Custom elements unmount | Never remove `ytmusic-player-page` / `#movie_player`; hide with CSS; keep a dedicated host node |
| InnerTube browse IDs / protobuf params change | Private API | Isolate parsers; log raw responses; version the client |
| SAPISIDHASH / botguard | Same class of problem as Twitter’s challenge | Prefer calling APIs **from the page** (cookies + ytcfg already there) before building a sandbox |
| ToS / Web Store | Client replacement + private API | Personal/unpacked first; no scraping other users’ data |
| Cover Flow performance | Dozens of 3D layers + reflections | Virtualize: render ~9–15 covers; recycle nodes |
| Missing iTunes metadata | No play counts / star ratings / “17 days” | Show what YTM has; persist local stats later |
| Login / premium / TV-only tracks | Some items won’t play in WEB_REMIX | Surface the error in the LCD; don’t crash the shell |

---

## 14. Suggested first code drop (after this doc)

Not in this commit. When we start:

1. Restrict the existing boilerplate to `music.youtube.com`.
2. Content script: hide YTM chrome, inject a full-viewport iTunes shell.
3. Wire three buttons to `moviePlayer.playVideo()` / `pauseVideo()` / `nextVideo()`.
4. One InnerTube `browse` call rendered as a plain list.

That is the OldTwitter lesson applied to a music app: **prove the host is still alive, then replace the face.**

---

## 15. Submodule maintenance

```bash
git submodule update --init --recursive
cd references/OldTwitter && git fetch && git checkout <sha>
```

Pin a SHA; do not track `master` loosely. OldTwitter updates weekly and is huge — we only need it as a reference.

When reading it, start here:

1. `manifest.json`
2. `scripts/blockBeforeInject.js`
3. `scripts/injection.js` (`pages` array + `document.documentElement.innerHTML`)
4. `scripts/background.js`
5. `layouts/header/` + `layouts/home/`
6. `scripts/apis.js` (`const API = {`)
7. `ruleset.json`
