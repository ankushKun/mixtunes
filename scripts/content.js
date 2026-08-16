const PLAYER_BAR = "ytmusic-player-bar";
const SELECTORS = {
  previous: [".previous-button", "#previous-button"],
  playPause: [".play-pause-button", "#play-pause-button"],
  next: [".next-button", "#next-button"],
  title: [".title.ytmusic-player-bar", ".content-info-wrapper .title"],
  subtitle: [
    ".subtitle.ytmusic-player-bar",
    ".content-info-wrapper .subtitle",
    ".byline",
  ],
  artwork: [
    "#song-image img",
    ".image.ytmusic-player-bar img",
    "yt-img-shadow.ytmusic-player-bar img",
    ".thumbnail-image-wrapper img",
  ],
};

function firstMatch(root, selectors) {
  if (!root) return null;
  for (const selector of selectors) {
    const node = root.querySelector(selector);
    if (node) return node;
  }
  return null;
}

function playerBar() {
  return document.querySelector(PLAYER_BAR);
}

function textOf(node) {
  return node?.textContent?.replace(/\s+/g, " ").trim() || "";
}

function isPlaying(playPause) {
  const label = (
    playPause?.getAttribute("title") ||
    playPause?.getAttribute("aria-label") ||
    ""
  ).toLowerCase();
  return label.includes("pause");
}

function isArtworkSrc(src) {
  if (!src || src.startsWith("data:")) return false;
  if (src.includes("gstatic.com")) return false;
  return /ytimg|googleusercontent|ggpht/.test(src);
}

function squareArtwork(url) {
  try {
    const parsed = new URL(url, location.href);
    if (parsed.hostname.includes("ytimg.com")) {
      parsed.pathname = parsed.pathname.replace(
        /\/(hqdefault|mqdefault|sddefault|maxresdefault|default|hq720|[0-3])(\.jpg|\.webp)$/i,
        "/hq720$2"
      );
      return parsed.toString();
    }
    if (/googleusercontent|ggpht/.test(parsed.hostname)) {
      return parsed
        .toString()
        .replace(/w\d+-h\d+/g, "w240-h240")
        .replace(/=s\d+/g, "=s240");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function srcFromImg(img) {
  const src = img.currentSrc || img.src || "";
  if (isArtworkSrc(src)) return squareArtwork(src);
  const srcset = img.getAttribute("srcset") || "";
  const last = srcset.split(",").pop()?.trim().split(/\s+/)[0] || "";
  return isArtworkSrc(last) ? squareArtwork(last) : "";
}

function artworkUrl(root) {
  if (!root) return "";
  for (const selector of SELECTORS.artwork) {
    const img = root.querySelector(selector);
    const src = img && srcFromImg(img);
    if (src) return src;
  }
  for (const img of root.querySelectorAll("img")) {
    const src = srcFromImg(img);
    if (src) return src;
  }
  return "";
}

function probe() {
  const bar = playerBar();
  const playPause = firstMatch(bar, SELECTORS.playPause);
  const player = document.querySelector("ytmusic-player");
  const rawArt = artworkUrl(bar) || artworkUrl(player);
  return {
    hostAlive: Boolean(bar),
    hasMoviePlayer: Boolean(document.querySelector("#movie_player")),
    hasApp: Boolean(document.querySelector("ytmusic-app")),
    playing: isPlaying(playPause),
    title: textOf(firstMatch(bar, SELECTORS.title)),
    subtitle: textOf(firstMatch(bar, SELECTORS.subtitle)),
    artwork: rawArt,
  };
}

function clickControl(action) {
  const bar = playerBar();
  const node = firstMatch(bar, SELECTORS[action]);
  if (!node) return false;
  node.click();
  return true;
}

function markHostReady() {
  document.documentElement.dataset.ytunesHost = "ready";
}

function waitForPlayerBar() {
  if (playerBar()) {
    markHostReady();
    return;
  }

  const started = Date.now();
  const observer = new MutationObserver(() => {
    if (playerBar()) {
      observer.disconnect();
      markHostReady();
      return;
    }
    if (Date.now() - started > 15000) {
      observer.disconnect();
      document.documentElement.dataset.ytunesHost = "missing";
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "ytunes.probe") {
    sendResponse(probe());
    return;
  }
  if (message?.type === "ytunes.control") {
    sendResponse({ ok: clickControl(message.action) });
  }
});

waitForPlayerBar();
