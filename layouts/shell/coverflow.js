/**
 * Cover Flow posing — adapted from ankushKun.github.io music-player.js.
 * Geometry: CF_WINDOW 6, angle 56°, depth 48, gap 52, spacing 58, 400ms ease.
 * Center cover uses -webkit-box-reflect; side covers stay square (no reflect).
 */
const CF_WINDOW = 6;
const CF_SIZE = 150;
const CF_SIZE_NARROW = 108;
const CF_SPACING = 58;
const CF_ANGLE = 56;
const CF_CENTER_Z = 70;
const CF_DEPTH = 48;
const CF_GAP = 52;
const CF_MS = 400;
const CF_WHEEL_STEP = 48;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function coverCaptionSub(item) {
  if (!item) return "";
  const shelf = item.shelf || "";
  const rest = item.artist || item.subtitle || "";
  if (shelf && rest && shelf !== rest) return `${shelf} · ${rest}`;
  return rest || shelf;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function CoverFlow(root, handlers) {
  const flow = root.querySelector(".ytunes-coverflow");
  const stage = root.querySelector("#ytunes-covers");
  const empty = root.querySelector("#ytunes-cover-empty");
  const titleEl = root.querySelector("#ytunes-cover-title");
  const artistEl = root.querySelector("#ytunes-cover-artist");
  const range = root.querySelector("#ytunes-cf-range");
  const reduced = prefersReducedMotion();
  let covers = [];
  let center = 0;
  let lastKey = "";
  let captionTimer = null;
  let wheelAcc = 0;
  let drag = null;
  let skipClick = false;

  if (reduced) flow.classList.add("is-reduced");
  flow.style.setProperty("--yt-cf-ms", `${CF_MS}ms`);

  function coverSize() {
    const centerEl = stage.querySelector(".ytunes-cf-cover.is-center");
    const probeEl = centerEl || stage.querySelector(".ytunes-cf-cover");
    if (probeEl) {
      const w = probeEl.offsetWidth;
      if (w > 8) return w;
    }
    const raw = getComputedStyle(flow).getPropertyValue("--yt-cf-size").trim();
    const fromVar = parseFloat(raw);
    if (fromVar > 8) return fromVar;
    return window.matchMedia("(max-width: 720px)").matches
      ? CF_SIZE_NARROW
      : CF_SIZE;
  }

  function poseCover(cover, offset) {
    const abs = Math.abs(offset);
    const size = coverSize();
    let transform;
    let origin;
    if (reduced || offset === 0) {
      origin = "50% 50%";
      transform =
        offset === 0 && !reduced
          ? `translate3d(-50%, -50%, ${CF_CENTER_Z}px) rotateY(0deg)`
          : "translate3d(-50%, -50%, 0px) rotateY(0deg)";
    } else if (offset < 0) {
      origin = "100% 50%";
      const x = -(size * 0.5 + CF_GAP) - (abs - 1) * CF_SPACING;
      transform = `translate3d(-50%, -50%, 0) translateX(${x}px) translateZ(${
        -abs * CF_DEPTH
      }px) rotateY(${CF_ANGLE}deg)`;
    } else {
      origin = "0% 50%";
      const x = size * 0.5 + CF_GAP + (abs - 1) * CF_SPACING;
      transform = `translate3d(-50%, -50%, 0) translateX(${x}px) translateZ(${
        -abs * CF_DEPTH
      }px) rotateY(${-CF_ANGLE}deg)`;
    }
    cover.dataset.offset = String(offset);
    cover.classList.toggle("is-center", offset === 0);
    cover.setAttribute("aria-selected", offset === 0 ? "true" : "false");
    cover.style.transformOrigin = origin;
    cover.style.transform = transform;
    cover.style.opacity = "1";
    cover.style.zIndex = String(200 - abs * 2);
  }

  function setCaption(title, artist) {
    const nextTitle = title || "";
    const nextArtist = artist || "";
    if (titleEl.textContent === nextTitle && artistEl.textContent === nextArtist) {
      return;
    }
    const cap = flow.querySelector(".ytunes-coverflow-caption");
    if (!cap || reduced) {
      titleEl.textContent = nextTitle;
      artistEl.textContent = nextArtist;
      return;
    }
    if (captionTimer) clearTimeout(captionTimer);
    cap.classList.add("is-swap");
    captionTimer = setTimeout(() => {
      captionTimer = null;
      titleEl.textContent = nextTitle;
      artistEl.textContent = nextArtist;
      cap.classList.remove("is-swap");
    }, 140);
  }

  function createCoverEl(item) {
    const cover = document.createElement("div");
    cover.className = "ytunes-cf-cover";
    cover.dataset.id = item.id;
    cover.setAttribute("role", "option");
    cover.tabIndex = -1;
    const face = document.createElement("div");
    face.className = "ytunes-cf-face";
    if (item.artwork) {
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      img.src = item.artwork;
      img.onerror = () => {
        img.remove();
        const ph = document.createElement("div");
        ph.className = "ytunes-cf-ph";
        ph.textContent = (item.title || "?").charAt(0).toUpperCase();
        face.appendChild(ph);
      };
      face.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "ytunes-cf-ph";
      ph.textContent = (item.title || "?").charAt(0).toUpperCase();
      face.appendChild(ph);
    }
    cover.appendChild(face);
    return cover;
  }

  function current() {
    return covers[center] || null;
  }

  function syncRange() {
    if (!range) return;
    const max = Math.max(0, covers.length - 1);
    range.max = String(max);
    range.value = String(center);
    range.disabled = covers.length < 2;
    range.style.setProperty(
      "--yt-fill",
      `${max ? (center / max) * 100 : 0}%`
    );
  }

  function render() {
    if (!covers.length) {
      flow.classList.add("is-empty");
      empty.hidden = false;
      stage.replaceChildren();
      lastKey = "";
      setCaption("", "");
      syncRange();
      return;
    }
    flow.classList.remove("is-empty");
    empty.hidden = true;
    center = clamp(center, 0, covers.length - 1);
    const item = covers[center];
    setCaption(item.title, coverCaptionSub(item));
    syncRange();

    const start = reduced ? center : Math.max(0, center - CF_WINDOW);
    const end = reduced
      ? center + 1
      : Math.min(covers.length, center + CF_WINDOW + 1);
    const listKey = `${covers.length}|${reduced ? "r" : "3"}`;
    const snapPose = listKey !== lastKey || !stage.children.length;
    lastKey = listKey;
    if (snapPose) flow.classList.add("is-snap");

    const wanted = new Set();
    for (let i = start; i < end; i += 1) wanted.add(covers[i].id);
    Array.from(stage.children).forEach((el) => {
      if (!wanted.has(el.dataset.id)) el.remove();
    });
    const byId = new Map();
    Array.from(stage.children).forEach((el) => byId.set(el.dataset.id, el));

    for (let i = start; i < end; i += 1) {
      const t = covers[i];
      let cover = byId.get(t.id);
      const fresh = !cover;
      if (!cover) {
        cover = createCoverEl(t);
        cover.style.transition = "none";
        stage.appendChild(cover);
      }
      poseCover(cover, i - center);
      if (fresh) {
        void cover.offsetWidth;
        cover.style.transition = "";
      }
    }

    if (snapPose) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => flow.classList.remove("is-snap"));
      });
    }

    handlers?.onIndex?.(center, covers.length);
  }

  function setList(list, selectedId) {
    covers = list || [];
    if (selectedId) {
      const idx = covers.findIndex((item) => item.id === selectedId);
      if (idx >= 0) center = idx;
    } else {
      center = 0;
    }
    lastKey = "";
    render();
  }

  function move(delta) {
    if (!covers.length || !delta) return;
    const next = clamp(center + delta, 0, covers.length - 1);
    if (next === center) return;
    center = next;
    render();
    handlers?.onBrowse?.(current());
  }

  function setIndex(index, silent) {
    if (!covers.length) return;
    const next = clamp(index, 0, covers.length - 1);
    if (next === center) return;
    center = next;
    render();
    if (!silent) handlers?.onBrowse?.(current());
  }

  function coverFromEvent(event) {
    if (typeof document.elementsFromPoint === "function") {
      const stack = document.elementsFromPoint(event.clientX, event.clientY) || [];
      for (const el of stack) {
        const cover = el?.closest?.(".ytunes-cf-cover");
        if (cover && stage.contains(cover)) return cover;
      }
    }
    const nodes = stage.querySelectorAll(".ytunes-cf-cover");
    let best = null;
    let bestDist = Infinity;
    nodes.forEach((node) => {
      const r = node.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      const dist =
        Math.abs(event.clientX - (r.left + r.width / 2)) +
        Math.abs(event.clientY - (r.top + r.height / 2));
      if (dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    });
    return best;
  }

  function onClick(event) {
    if (skipClick) {
      skipClick = false;
      return;
    }
    if (event.target.closest(".ytunes-cf-scroll")) return;
    const cover = coverFromEvent(event);
    if (!cover) {
      flow.focus({ preventScroll: true });
      return;
    }
    event.preventDefault();
    const id = cover.dataset.id;
    const idx = covers.findIndex((item) => item.id === id);
    if (idx < 0) return;
    if (event.type === "dblclick") {
      center = idx;
      render();
      handlers?.onPlay?.(covers[idx]);
      return;
    }
    if (cover.classList.contains("is-center")) {
      if (!covers[idx]?.tracks?.length) handlers?.onBrowse?.(covers[idx]);
      return;
    }
    setIndex(idx);
  }

  function onWheel(event) {
    event.preventDefault();
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    wheelAcc += delta;
    while (Math.abs(wheelAcc) >= CF_WHEEL_STEP) {
      move(wheelAcc > 0 ? 1 : -1);
      wheelAcc -= Math.sign(wheelAcc) * CF_WHEEL_STEP;
    }
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    if (event.target.closest("input, [data-cf], .ytunes-cf-scroll")) return;
    flow.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      x: event.clientX,
      acc: 0,
      moved: false,
      samples: [{ x: event.clientX, t: Date.now() }],
    };
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    drag.x = event.clientX;
    drag.acc += dx;
    drag.samples.push({ x: event.clientX, t: Date.now() });
    if (drag.samples.length > 6) drag.samples.shift();
    const threshold = Math.max(28, coverSize() * 0.28);
    if (Math.abs(drag.acc) >= threshold) {
      move(drag.acc > 0 ? -1 : 1);
      drag.acc = 0;
      drag.moved = true;
    }
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const samples = drag.samples;
    const moved = drag.moved;
    const pointerId = drag.id;
    skipClick = moved;
    drag = null;
    try {
      if (flow.hasPointerCapture?.(pointerId)) flow.releasePointerCapture(pointerId);
    } catch {
      /* capture already released */
    }
    if (!moved || samples.length < 2) return;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const dt = Math.max(1, last.t - first.t);
    const v = (last.x - first.x) / dt;
    if (Math.abs(v) > 0.35) move(v > 0 ? -1 : 1);
  }

  function onKey(event) {
    if (document.activeElement !== flow) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      handlers?.onPlay?.(current());
    }
  }

  flow.addEventListener("wheel", onWheel, { passive: false });
  flow.addEventListener("click", onClick);
  flow.addEventListener("dblclick", onClick);
  flow.addEventListener("pointerdown", onPointerDown);
  flow.addEventListener("pointermove", onPointerMove);
  flow.addEventListener("pointerup", onPointerUp);
  flow.addEventListener("pointercancel", onPointerUp);
  flow.addEventListener("keydown", onKey);

  if (range) {
    range.addEventListener("input", () => {
      setIndex(Number(range.value) || 0);
    });
  }

  flow.querySelectorAll("[data-cf]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      move(button.dataset.cf === "prev" ? -1 : 1);
    });
  });

  return {
    setList,
    current,
    index: () => center,
    count: () => covers.length,
    move,
    setIndex,
    focus: () => flow.focus({ preventScroll: true }),
  };
}
