async function injectShell() {
  if (document.getElementById("ytunes-root")) return;
  const html = await fetch(chrome.runtime.getURL("layouts/shell/index.html")).then(
    (response) => response.text()
  );
  const root = document.createElement("div");
  root.id = "ytunes-root";
  root.innerHTML = html;
  (document.body || document.documentElement).appendChild(root);
  bindShell(root);
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

waitForPlayerBar().then(() => injectShell());
