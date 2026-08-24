function focusablesIn(node) {
  return [
    ...node.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => !el.closest("[hidden]"));
}

function bindDialogs(root, handlers) {
  const prompt = root.querySelector("#ytunes-dialog");
  const form = root.querySelector("#ytunes-dialog-form");
  const input = root.querySelector("#ytunes-dialog-input");
  const heading = root.querySelector("#ytunes-dialog-title");
  const ok = root.querySelector("#ytunes-dialog-ok");
  const cancel = root.querySelector("#ytunes-dialog-cancel");
  const prefs = root.querySelector("#ytunes-prefs");
  const jump = root.querySelector("#ytunes-jump");
  const jumpInput = root.querySelector("#ytunes-jump-input");
  const jumpList = root.querySelector("#ytunes-jump-list");
  const pick = root.querySelector("#ytunes-pick");
  const pickTitle = root.querySelector("#ytunes-pick-title");
  const pickList = root.querySelector("#ytunes-pick-list");
  let promptFinish = null;
  let pickFinish = null;
  let lastFocus = null;

  function overlayOpen() {
    return Boolean(
      (prompt && !prompt.hidden) ||
        (prefs && !prefs.hidden) ||
        (jump && !jump.hidden) ||
        (pick && !pick.hidden)
    );
  }

  function trap(event, host) {
    if (event.key !== "Tab") return;
    const items = focusablesIn(host);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closePrompt(value) {
    if (!promptFinish) return;
    const finish = promptFinish;
    promptFinish = null;
    prompt.hidden = true;
    finish(value);
    lastFocus?.focus?.({ preventScroll: true });
  }

  function openPrompt(title, okLabel) {
    lastFocus = document.activeElement;
    heading.textContent = title;
    ok.textContent = okLabel;
    input.value = "";
    prompt.hidden = false;
    input.focus();
    return new Promise((resolve) => {
      promptFinish = resolve;
    });
  }

  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    closePrompt(input.value.trim());
  });
  cancel?.addEventListener("click", () => closePrompt(""));
  prompt?.addEventListener("click", (event) => {
    if (event.target === prompt) closePrompt("");
  });
  prompt?.addEventListener("keydown", (event) => trap(event, prompt));

  function closePrefs() {
    if (!prefs || prefs.hidden) return;
    prefs.hidden = true;
    lastFocus?.focus?.({ preventScroll: true });
  }

  function openPrefs() {
    if (!prefs) return;
    lastFocus = document.activeElement;
    handlers?.onPrefsOpen?.();
    prefs.hidden = false;
    focusablesIn(prefs)[0]?.focus();
  }

  prefs?.addEventListener("click", (event) => {
    if (event.target === prefs) closePrefs();
  });
  prefs?.addEventListener("keydown", (event) => trap(event, prefs));
  root.querySelector("#ytunes-prefs-close")?.addEventListener("click", closePrefs);

  function closeJump() {
    if (!jump || jump.hidden) return;
    jump.hidden = true;
    clearHtml(jumpList);
    lastFocus?.focus?.({ preventScroll: true });
  }

  function openJump() {
    if (!jump || !jumpInput) return;
    lastFocus = document.activeElement;
    jump.hidden = false;
    jumpInput.value = "";
    handlers?.onJumpQuery?.("");
    jumpInput.focus();
  }

  jumpInput?.addEventListener("input", () => {
    handlers?.onJumpQuery?.(jumpInput.value);
  });
  jumpInput?.addEventListener("keydown", (event) => {
    const buttons = [...(jumpList?.querySelectorAll("button") || [])];
    const active = jumpList?.querySelector("button.is-active");
    const index = buttons.indexOf(active);
    if (event.key === "ArrowDown" && buttons.length) {
      event.preventDefault();
      const next = buttons[Math.min(buttons.length - 1, index + 1)] || buttons[0];
      buttons.forEach((node) => node.classList.toggle("is-active", node === next));
      next.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "ArrowUp" && buttons.length) {
      event.preventDefault();
      const next = buttons[Math.max(0, index - 1)] || buttons[0];
      buttons.forEach((node) => node.classList.toggle("is-active", node === next));
      next.scrollIntoView({ block: "nearest" });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      (active || buttons[0])?.click();
    }
  });
  jumpList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-jump]");
    if (!button) return;
    handlers?.onJumpPick?.(button.dataset.jump, button.dataset.jumpId || "");
    closeJump();
  });
  jump?.addEventListener("click", (event) => {
    if (event.target === jump) closeJump();
  });
  jump?.addEventListener("keydown", (event) => trap(event, jump));

  function renderJump(items) {
    if (!jumpList) return;
    setHtml(
      jumpList,
      items
        .slice(0, 12)
        .map(
          (item, index) =>
            `<li><button type="button" class="${index === 0 ? "is-active" : ""}" data-jump="${escapeHtml(
              item.kind
            )}" data-jump-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</button></li>`
        )
        .join("")
    );
  }

  function closePick(value) {
    if (!pickFinish) return;
    const finish = pickFinish;
    pickFinish = null;
    if (pick) pick.hidden = true;
    clearHtml(pickList);
    finish(value);
    lastFocus?.focus?.({ preventScroll: true });
  }

  function movePickActive(delta) {
    const buttons = [...(pickList?.querySelectorAll("button[data-playlist]") || [])];
    if (!buttons.length) return;
    const focusedIndex = buttons.indexOf(document.activeElement);
    const index = focusedIndex >= 0 ? focusedIndex : delta > 0 ? -1 : buttons.length;
    const next = buttons[Math.max(0, Math.min(buttons.length - 1, index + delta))];
    buttons.forEach((node) => node.classList.toggle("is-active", node === next));
    next.focus();
    next.scrollIntoView({ block: "nearest" });
  }

  function openPick(title, items) {
    if (!pick) return Promise.resolve(null);
    lastFocus = document.activeElement;
    if (pickTitle) pickTitle.textContent = title;
    const list = (items || []).filter((item) => item?.playlistId);
    if (pickList) {
      setHtml(
        pickList,
        list.length
          ? list
              .map(
                (item, index) =>
                  `<li><button type="button" class="${index === 0 ? "is-active" : ""}" data-playlist="${escapeHtml(
                    item.playlistId
                  )}">${escapeHtml(item.title)}</button></li>`
              )
              .join("")
          : `<li class="ytunes-pick-empty">No playlists yet.</li>`
      );
    }
    pick.hidden = false;
    (pickList?.querySelector("button") || root.querySelector("#ytunes-pick-new"))?.focus();
    return new Promise((resolve) => {
      pickFinish = resolve;
    });
  }

  pickList?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-playlist]");
    if (!button) return;
    closePick({ playlistId: button.dataset.playlist, title: button.textContent || "" });
  });
  pick?.addEventListener("click", (event) => {
    if (event.target === pick) closePick(null);
  });
  pick?.addEventListener("keydown", (event) => {
    trap(event, pick);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      movePickActive(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      movePickActive(-1);
    } else if (event.key === "Enter" && event.target?.closest?.("#ytunes-pick-list")) {
      event.preventDefault();
      (pickList?.querySelector("button.is-active") || pickList?.querySelector("button"))?.click();
    }
  });
  root.querySelector("#ytunes-pick-new")?.addEventListener("click", () => closePick({ create: true }));
  root.querySelector("#ytunes-pick-cancel")?.addEventListener("click", () => closePick(null));

  function onGlobalKey(event) {
    if (!overlayOpen()) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (prompt && !prompt.hidden) closePrompt("");
      else if (pick && !pick.hidden) closePick(null);
      else if (jump && !jump.hidden) closeJump();
      else closePrefs();
      return true;
    }
    return overlayOpen();
  }

  return {
    overlayOpen,
    openPrompt,
    openPick,
    openPrefs,
    closePrefs,
    openJump,
    closeJump,
    renderJump,
    onGlobalKey,
  };
}
