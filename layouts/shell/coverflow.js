/**
 * Cover Flow posing — adapted from ankushKun.github.io music-player.js.
 * Geometry: CF_WINDOW 6, angle 56°, depth/gap/spacing scale with cover size, 400ms ease.
 * Cover box is taller than the square so the flipped reflection sits inside the 3D plane.
 */
const CF_WINDOW = 6;
const CF_SIZE = 150;
const CF_SIZE_NARROW = 108;
const CF_SIZE_MIN = 72;
const CF_SIZE_MAX = 560;
const CF_SPACING = 58;
const CF_ANGLE = 56;
const CF_CENTER_Z = 70;
const CF_DEPTH = 48;
const CF_GAP = 52;
const CF_MS = 400;
const CF_WHEEL_STEP = 48;
const CF_DECEL = 0.998;
const CF_REFLECT = 0.52;

function faceOriginY(reducedMotion) {
  if (reducedMotion) return "50%";
  return `${(50 / (1 + CF_REFLECT)).toFixed(3)}%`;
}

function rubberband(overshoot, dimension, constant = 0.55) {
  const dim = Math.max(1, dimension);
  return (overshoot * dim * constant) / (dim + constant * Math.abs(overshoot));
}

function project(velocity, decelerationRate = CF_DECEL) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function captionBit(value) {
  return String(value || "").trim();
}

// A cover's own `id` is its grouping key (`album:Title:Artist`, a browse id), not a
// track id, so only the explicit track fields count here.
function coverTrackId(cover) {
  if (!cover) return "";
  return captionBit(cover.trackId || cover.videoId);
}

function trackFitsCover(cover, track) {
  if (!cover || !track) return false;
  const id = captionBit(track.id || track.videoId);
  const coverId = coverTrackId(cover);
  if (id) {
    if (coverId === id) return true;
    if (cover.tracks?.some((item) => captionBit(item.id || item.videoId) === id)) return true;
  }
  const songCover =
    cover.kind === "song" ||
    cover.kind === "video" ||
    Boolean(coverId && (cover.tracks?.length || 1) <= 1);
  if (songCover) {
    if (id && coverId && coverId !== id) return false;
    return (
      captionBit(cover.title) === captionBit(track.title) &&
      captionBit(cover.artist || cover.subtitle) === captionBit(track.artist)
    );
  }
  const album = captionBit(track.album);
  const artist = captionBit(track.artist);
  if (!album) return false;
  if (captionBit(cover.title) === album && captionBit(cover.artist) === artist) {
    return true;
  }
  if (captionBit(cover.album) === album && captionBit(cover.artist) === artist) {
    return true;
  }
  return false;
}

function resolveCaptionTrack(item, track) {
  if (track && (!item || trackFitsCover(item, track))) return track;
  if (!item) return track || null;
  if (item.tracks?.length === 1) return item.tracks[0];
  if (
    (item.kind === "song" || item.kind === "video") &&
    (item.tracks?.length || 0) <= 1
  ) {
    return (
      item.tracks?.[0] || {
        title: item.title,
        artist: item.artist || item.subtitle || "",
        album: item.album || "",
      }
    );
  }
  return null;
}

function coverCaptionParts(item, track) {
  const focused = resolveCaptionTrack(item, track);
  const song = captionBit(focused?.title);
  const album = captionBit(focused?.album || item?.album);
  const artist = captionBit(
    focused?.artist || item?.artist || item?.subtitle
  );
  const shelf = captionBit(item?.shelf);
  const coverTitle = captionBit(item?.title);

  if (song) {
    const bits = [];
    if (album && album !== song) bits.push(album);
    if (artist && artist !== album && artist !== song) bits.push(artist);
    return { title: song, sub: bits.join(" — ") };
  }

  const title = coverTitle || album;
  if (shelf && artist && shelf !== artist && shelf !== title) {
    return { title, sub: `${shelf} · ${artist}` };
  }
  const sub =
    (artist && artist !== title ? artist : "") ||
    (shelf && shelf !== title ? shelf : "") ||
    (album && album !== title ? album : "");
  return { title, sub };
}

function coverCaptionSub(item) {
  return coverCaptionParts(item, null).sub;
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
  let captionTrack = null;
  let captionTimer = null;
  let wheelAcc = 0;
  let drag = null;
  let skipClick = false;
  let fitted = 0;

  if (reduced) flow.classList.add("is-reduced");
  flow.style.setProperty("--yt-cf-ms", `${CF_MS}ms`);

  function fitCoverSize() {
    const stageH = stage.clientHeight;
    const stageW = stage.clientWidth;
    if (stageH < 40 || stageW < 40) {
      return fitted || CF_SIZE;
    }
    const size = clamp(
      Math.round(Math.min(stageH * 0.62, stageW * 0.56)),
      CF_SIZE_MIN,
      CF_SIZE_MAX
    );
    if (Math.abs(size - fitted) >= 1) {
      fitted = size;
      flow.style.setProperty("--yt-cf-size", `${size}px`);
    }
    return fitted;
  }

  function coverSize() {
    if (fitted > 8) return fitted;
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

  function layout() {
    const size = coverSize();
    const k = size / CF_SIZE;
    return {
      size,
      gap: CF_GAP * k,
      spacing: CF_SPACING * k,
      centerZ: CF_CENTER_Z * k,
      depth: CF_DEPTH * k,
    };
  }

  function poseCover(cover, offset) {
    const abs = Math.abs(offset);
    const geo = layout();
    const sign = offset < 0 ? -1 : 1;
    const originY = faceOriginY(reduced);
    let transform;
    let origin = `50% ${originY}`;
    if (reduced) {
      transform = `translate3d(-50%, -${originY}, 0px) rotateY(0deg)`;
    } else if (abs < 0.001) {
      origin = `50% ${originY}`;
      transform = `translate3d(-50%, -${originY}, ${geo.centerZ}px) rotateY(0deg)`;
    } else {
      origin = offset < 0 ? `100% ${originY}` : `0% ${originY}`;
      const first = geo.size * 0.5 + geo.gap;
      let x;
      let z;
      let angle;
      if (abs < 1) {
        x = sign * first * abs;
        z = geo.centerZ * (1 - abs) + -geo.depth * abs;
        angle = -sign * CF_ANGLE * abs;
      } else {
        x = sign * (first + (abs - 1) * geo.spacing);
        z = -abs * geo.depth;
        angle = -sign * CF_ANGLE;
      }
      transform = `translate3d(-50%, -${originY}, 0) translateX(${x}px) translateZ(${z}px) rotateY(${angle}deg)`;
    }
    cover.dataset.offset = String(offset);
    cover.classList.toggle("is-center", abs < 0.45);
    cover.setAttribute("aria-selected", abs < 0.45 ? "true" : "false");
    cover.style.transformOrigin = origin;
    cover.style.transform = transform;
    cover.style.opacity = "1";
    cover.style.zIndex = String(200 - Math.round(abs * 2));
  }

  function setCaption(title, artist) {
    const nextTitle = title || "";
    const nextArtist = artist || "";
    const paint = () => {
      setMarqueeText(titleEl, nextTitle);
      setMarqueeText(artistEl, nextArtist);
    };
    if (
      titleEl.dataset.marqueeText === nextTitle &&
      artistEl.dataset.marqueeText === nextArtist
    ) {
      return;
    }
    const cap = flow.querySelector(".ytunes-coverflow-caption");
    if (!cap || reduced) {
      paint();
      return;
    }
    if (captionTimer) clearTimeout(captionTimer);
    cap.classList.add("is-swap");
    captionTimer = setTimeout(() => {
      captionTimer = null;
      paint();
      cap.classList.remove("is-swap");
    }, 140);
  }

  function applyCaption(item) {
    const parts = coverCaptionParts(item, captionTrack);
    setCaption(parts.title, parts.sub);
  }

  function setCaptionTrack(track) {
    captionTrack = track || null;
    applyCaption(current());
  }

  function createCoverEl(item) {
    const cover = document.createElement("div");
    cover.className = "ytunes-cf-cover";
    cover.dataset.id = item.id;
    const videoId =
      coverTrackId(item) || YTunesPlayback.trackId(item.tracks?.[0]);
    const playlistId = YTunesPlayback.listId(
      item.playlistId || item.tracks?.[0]?.playlistId
    );
    if (videoId) cover.dataset.video = videoId;
    else delete cover.dataset.video;
    if (playlistId) cover.dataset.playlist = playlistId;
    else delete cover.dataset.playlist;
    cover.setAttribute("role", "option");
    cover.tabIndex = -1;
    const face = document.createElement("div");
    face.className = "ytunes-cf-face";
    const reflect = document.createElement("div");
    reflect.className = "ytunes-cf-reflect";
    reflect.setAttribute("aria-hidden", "true");
    const inner = document.createElement("div");
    inner.className = "ytunes-cf-reflect-inner";
    reflect.appendChild(inner);

    const addArt = (parent) => {
      if (item.artwork) {
        const img = document.createElement("img");
        img.alt = "";
        img.draggable = false;
        img.src = item.artwork;
        img.onerror = () => {
          const src = img.getAttribute("src") || "";
          const next = src
            .replace("/hq720.", "/hqdefault.")
            .replace("/maxresdefault.", "/hqdefault.");
          if (next !== src) {
            img.src = next;
            return;
          }
          img.remove();
          const ph = document.createElement("div");
          ph.className = "ytunes-cf-ph";
          ph.textContent = (item.title || "?").charAt(0).toUpperCase();
          parent.appendChild(ph);
        };
        parent.appendChild(img);
        return;
      }
      const ph = document.createElement("div");
      ph.className = "ytunes-cf-ph";
      ph.textContent = (item.title || "?").charAt(0).toUpperCase();
      parent.appendChild(ph);
    };
    addArt(face);
    addArt(inner);
    cover.appendChild(face);
    cover.appendChild(reflect);
    return cover;
  }

  function current() {
    return covers[center] || null;
  }

  function render() {
    fitCoverSize();
    if (!covers.length) {
      flow.classList.add("is-empty");
      empty.hidden = false;
      stage.replaceChildren();
      lastKey = "";
      captionTrack = null;
      setCaption("", "");
      return;
    }
    flow.classList.remove("is-empty");
    empty.hidden = true;
    center = clamp(center, 0, covers.length - 1);
    applyCaption(covers[center]);

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

  function stepWidth() {
    const geo = layout();
    return geo.size * 0.5 + geo.gap;
  }

  function poseAt(centerFloat) {
    if (!covers.length) return;
    fitCoverSize();
    const max = covers.length - 1;
    const start = reduced
      ? Math.round(centerFloat)
      : Math.max(0, Math.floor(centerFloat) - CF_WINDOW);
    const end = reduced
      ? Math.round(centerFloat) + 1
      : Math.min(covers.length, Math.ceil(centerFloat) + CF_WINDOW + 1);
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
      if (!cover) {
        cover = createCoverEl(t);
        stage.appendChild(cover);
      }
      poseCover(cover, i - centerFloat);
    }
    const nearest = clamp(Math.round(centerFloat), 0, max);
    applyCaption(covers[nearest]);
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    flow.setPointerCapture(event.pointerId);
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startCenter: center,
      visual: center,
      moved: false,
      samples: [{ x: event.clientX, t: Date.now() }],
    };
    flow.classList.add("is-dragging");
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const step = Math.max(24, stepWidth());
    let visual = drag.startCenter - (event.clientX - drag.startX) / step;
    const max = Math.max(0, covers.length - 1);
    if (visual < 0) visual = -rubberband(-visual, step);
    else if (visual > max) visual = max + rubberband(visual - max, step);
    if (Math.abs(event.clientX - drag.startX) > 4) drag.moved = true;
    drag.visual = visual;
    drag.samples.push({ x: event.clientX, t: Date.now() });
    if (drag.samples.length > 6) drag.samples.shift();
    poseAt(visual);
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const samples = drag.samples;
    const moved = drag.moved;
    const visual = drag.visual;
    const pointerId = drag.id;
    skipClick = moved;
    drag = null;
    flow.classList.remove("is-dragging");
    try {
      if (flow.hasPointerCapture?.(pointerId)) flow.releasePointerCapture(pointerId);
    } catch {
      /* capture already released */
    }
    if (!covers.length) return;
    const max = covers.length - 1;
    let target = clamp(Math.round(visual || 0), 0, max);
    if (moved && samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const vPx = (last.x - first.x) / dt;
      const step = Math.max(24, stepWidth());
      const v = -vPx / step;
      const projected = (visual || 0) + project(v * 1000);
      target = clamp(Math.round(projected), 0, max);
    }
    if (target !== center) {
      center = target;
      render();
      if (moved) handlers?.onBrowse?.(current());
    } else {
      render();
    }
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

  const resize = new ResizeObserver(() => {
    const before = fitted;
    fitCoverSize();
    if (!covers.length) return;
    if (Math.abs(fitted - before) < 1 && before) return;
    flow.classList.add("is-snap");
    if (drag) poseAt(drag.visual);
    else render();
    requestAnimationFrame(() => {
      if (!drag) flow.classList.remove("is-snap");
    });
  });
  resize.observe(flow);
  requestAnimationFrame(() => fitCoverSize());

  return {
    setList,
    current,
    index: () => center,
    count: () => covers.length,
    move,
    setIndex,
    setCaptionTrack,
    isDragging: () => Boolean(drag),
    focus: () => flow.focus({ preventScroll: true }),
  };
}
