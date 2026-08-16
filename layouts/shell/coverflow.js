/**
 * Cover Flow posing — adapted from ankushKun.github.io music-player.js.
 * Geometry: CF_WINDOW 6, angle 56°, depth 48, gap 52, spacing 58, 480ms ease.
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
const CF_MS = 480;

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
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
  const reduced = prefersReducedMotion();
  let covers = [];
  let center = 0;
  let lastKey = "";
  let captionTimer = null;

  if (reduced) flow.classList.add("is-reduced");
  flow.style.setProperty("--yt-cf-ms", `${CF_MS}ms`);

  function coverSize() {
    const centerEl = stage.querySelector(".ytunes-cf-cover.is-center");
    const probe = centerEl || stage.querySelector(".ytunes-cf-cover");
    if (probe) {
      const w = probe.offsetWidth;
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

  function render() {
    if (!covers.length) {
      flow.classList.add("is-empty");
      empty.hidden = false;
      stage.replaceChildren();
      lastKey = "";
      setCaption("", "");
      return;
    }
    flow.classList.remove("is-empty");
    empty.hidden = true;
    center = clamp(center, 0, covers.length - 1);
    const item = covers[center];
    setCaption(item.title, item.artist || item.subtitle || "");

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

    setImg(
      root.querySelector("#ytunes-selected-img"),
      item.artwork || "",
      item.title || ""
    );
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
    if (!covers.length) return;
    center = clamp(center + delta, 0, covers.length - 1);
    render();
    handlers?.onBrowse?.(current());
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

  function onPointer(event) {
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
    if (cover.classList.contains("is-center")) return;
    center = idx;
    render();
    handlers?.onBrowse?.(covers[idx]);
  }

  function onWheel(event) {
    event.preventDefault();
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (Math.abs(delta) < 2) return;
    move(delta > 0 ? 1 : -1);
  }

  function onKey(event) {
    if (document.activeElement !== flow) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlers?.onPlay?.(current());
    }
  }

  flow.addEventListener("wheel", onWheel, { passive: false });
  flow.addEventListener("click", onPointer);
  flow.addEventListener("dblclick", onPointer);
  flow.addEventListener("keydown", onKey);

  return {
    setList,
    current,
    index: () => center,
  };
}
