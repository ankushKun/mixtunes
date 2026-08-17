function bindToast(root) {
  const el = root.querySelector("#ytunes-toast");
  let token = 0;
  let timer = 0;

  function show(message, kind = "info") {
    if (!el || !message) return;
    token += 1;
    const mine = token;
    el.hidden = false;
    el.textContent = message;
    el.dataset.kind = kind;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (mine !== token) return;
      el.hidden = true;
      el.textContent = "";
      delete el.dataset.kind;
    }, 2200);
  }

  return { show };
}
