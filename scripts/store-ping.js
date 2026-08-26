/**
 * Tell the Mixtunes website which build is installed.
 * Runs on ankush.one (and local preview in Chromium) so store, GitHub zip,
 * and unpacked loads all report the same way — the extension id does not matter.
 */
(function () {
  "use strict";

  function ping() {
    try {
      window.postMessage(
        {
          source: "mixtunes",
          type: "version",
          version: chrome.runtime.getManifest().version,
        },
        window.location.origin
      );
    } catch (_err) {
      /* page is gone or origin is opaque */
    }
  }

  ping();
  window.addEventListener("message", function (event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.source !== "mixtunes-site" || data.type !== "version-please") {
      return;
    }
    ping();
  });
})();
