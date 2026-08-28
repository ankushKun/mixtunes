/**
 * document_start MAIN world: capture the web player's bearer and client-token
 * plus Pathfinder persisted-query hashes from live traffic. Never log tokens.
 */
(() => {
  const store = {
    accessToken: "",
    clientToken: "",
    appPlatform: "",
    appVersion: "",
    hashes: {},
    variables: {},
    payloads: {},
    library: null,
  };

  function isSpotifyUrl(url) {
    return /spotify\.com/i.test(String(url || ""));
  }

  function headerMap(headers) {
    const out = {};
    if (!headers) return out;
    if (typeof headers.forEach === "function") {
      headers.forEach((value, key) => {
        out[String(key).toLowerCase()] = String(value || "");
      });
      return out;
    }
    if (Array.isArray(headers)) {
      for (const pair of headers) {
        if (pair && pair[0]) out[String(pair[0]).toLowerCase()] = String(pair[1] || "");
      }
      return out;
    }
    for (const key of Object.keys(headers)) {
      out[String(key).toLowerCase()] = String(headers[key] || "");
    }
    return out;
  }

  function captureAuth(name, value) {
    if (!/^authorization$/i.test(String(name || ""))) return;
    const auth = String(value || "");
    if (/^bearer\s+/i.test(auth)) {
      store.accessToken = auth.replace(/^bearer\s+/i, "");
    }
  }

  function captureHeader(name, value) {
    captureAuth(name, value);
    const key = String(name || "").toLowerCase();
    const text = String(value || "");
    if (key === "client-token" && text) store.clientToken = text;
    if (key === "app-platform" && text) store.appPlatform = text;
    if (key === "spotify-app-version" && text) store.appVersion = text;
  }

  function harvest(url, headers, body) {
    if (!isSpotifyUrl(url)) return;
    const map = headerMap(headers);
    for (const [key, value] of Object.entries(map)) captureHeader(key, value);
    if (!/pathfinder/i.test(String(url || "")) || !body) return;
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      const name = parsed?.operationName;
      const hash = parsed?.extensions?.persistedQuery?.sha256Hash;
      if (name && hash) store.hashes[name] = hash;
      if (name && parsed?.variables && typeof parsed.variables === "object") {
        store.variables[name] = parsed.variables;
      }
    } catch {
      /* ignore non-JSON bodies */
    }
  }

  function rememberTokenJson(json) {
    const token = json?.accessToken || json?.access_token;
    if (token) store.accessToken = token;
  }

  function rememberQueryJson(json) {
    if (!json || typeof json !== "object") return;
    const data = json.data;
    if (data && typeof data === "object") {
      for (const key of Object.keys(data)) store.payloads[key] = json;
    }
    if (hasTrackUri(json)) store.library = json;
  }

  function hasTrackUri(node, depth = 0) {
    if (!node || depth > 10) return false;
    if (typeof node === "string") return /^spotify:track:/i.test(node);
    if (typeof node !== "object") return false;
    if (typeof node.uri === "string" && /^spotify:track:/i.test(node.uri)) return true;
    const vals = Array.isArray(node) ? node.slice(0, 40) : Object.values(node).slice(0, 40);
    for (const child of vals) {
      if (hasTrackUri(child, (depth || 0) + 1)) return true;
    }
    return false;
  }

  function rememberResponse(url, response) {
    if (!response || typeof response.clone !== "function") return;
    const href = String(url || response.url || "");
    if (/get_access_token|accessToken/i.test(href)) {
      response
        .clone()
        .json()
        .then(rememberTokenJson)
        .catch(() => {});
      return;
    }
    if (!/pathfinder/i.test(href)) return;
    response
      .clone()
      .json()
      .then(rememberQueryJson)
      .catch(() => {});
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let url = "";
    try {
      url =
        typeof input === "string"
          ? input
          : input && typeof input.url === "string"
            ? input.url
            : "";
      const headers = init?.headers || (input && input.headers);
      const body = init?.body;
      harvest(url, headers, body);
    } catch {
      /* never break the page fetch */
    }
    const result = originalFetch(input, init);
    try {
      // Observe on a branch, and swallow that branch's rejection: the page owns
      // `result`, and an unwatched copy of a failed fetch would surface as an
      // "Uncaught (in promise)" pointing here on every aborted request.
      Promise.resolve(result).then(
        (response) => rememberResponse(url, response),
        () => {}
      );
    } catch {
      /* never break the page fetch */
    }
    return result;
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSet = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__ytunesSpotifyUrl = url;
    return xhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    try {
      harvest(this.__ytunesSpotifyUrl, { [name]: value });
    } catch {
      /* ignore */
    }
    return xhrSet.apply(this, arguments);
  };

  if (typeof Headers !== "undefined") {
    const headerSet = Headers.prototype.set;
    const headerAppend = Headers.prototype.append;
    Headers.prototype.set = function (name, value) {
      try {
        captureHeader(name, value);
      } catch {
        /* ignore */
      }
      return headerSet.apply(this, arguments);
    };
    Headers.prototype.append = function (name, value) {
      try {
        captureHeader(name, value);
      } catch {
        /* ignore */
      }
      return headerAppend.apply(this, arguments);
    };
  }

  window.__ytunesSpotify = store;
})();
