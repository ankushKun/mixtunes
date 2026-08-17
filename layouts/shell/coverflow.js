/**
 * Cover Flow posing — adapted from ankushKun.github.io music-player.js.
 * Geometry: CF_WINDOW 6, angle 56°, depth/gap/spacing scale with cover size, 400ms ease.
 * Cover box is taller than the square so the flipped reflection sits inside the 3D plane.
 */
const CF_WINDOW = 3;
const CF_WINDOW_DRAG = 2;
const CF_SIZE = 150;
const CF_SIZE_NARROW = 108;
const CF_SIZE_MIN = 72;
const CF_SIZE_MAX = 240;
const CF_SPACING = 58;
const CF_ANGLE = 56;
const CF_CENTER_Z = 70;
const CF_DEPTH = 48;
const CF_GAP = 52;
const CF_MS = 400;
const CF_TAU = 0.09;
const CF_WHEEL_STEP = 56;
const CF_DECEL = 0.998;
const CF_REFLECT = 0.52;
const CF_BROWSE_MS = 360;

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

function trackFitsCover(cover, track) {
  if (!cover || !track) return false;
  const videoId = captionBit(track.videoId);
  if (videoId) {
    if (cover.videoId === videoId) return true;
    if (cover.tracks?.some((item) => item.videoId === videoId)) return true;
  }
  const songCover =
    cover.kind === "song" ||
    cover.kind === "video" ||
    Boolean(cover.videoId && (cover.tracks?.length || 1) <= 1);
  if (songCover) {
    if (videoId && cover.videoId && cover.videoId !== videoId) return false;
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

function coverArtSrc(url) {
  const src = String(url || "");
  if (!src) return "";
  try {
    const parsed = new URL(src, location.href);
    if (/googleusercontent|ggpht/.test(parsed.hostname)) {
      return src.replace(/w\d+-h\d+/g, "w300-h300").replace(/=s\d+/g, "=s300");
    }
  } catch {
    /* keep original */
  }
  return src;
}

function CoverFlow(root, handlers) {
  const flow = root.querySelector(".ytunes-coverflow");
  const stage = root.querySelector("#ytunes-covers");
  const empty = root.querySelector("#ytunes-cover-empty");
  const titleEl = root.querySelector("#ytunes-cover-title");
  const artistEl = root.querySelector("#ytunes-cover-artist");
  const reduced = prefersReducedMotion();
  const originY = faceOriginY(reduced);
  let covers = [];
  let center = 0;
  let captionTrack = null;
  let captionTimer = null;
  let captionIndex = -1;
  let wheelAcc = 0;
  let wheelSteps = 0;
  let drag = null;
  let skipClick = false;
  let fitted = 0;
  let geo = null;
  let raf = 0;
  let wheelRaf = 0;
  let resizeRaf = 0;
  let resizing = false;
  let resizeStart = 0;
  let browseTimer = 0;
  let movingUntil = 0;
  let visual = 0;
  let target = 0;
  let lastTick = 0;
  let ticking = false;
  const pool = [];
  const byId = new Map();
  const live = [];
  let lastWindow = "";
  const cap = flow.querySelector(".ytunes-coverflow-caption");

  if (reduced) flow.classList.add("is-reduced");
  flow.style.setProperty("--yt-cf-ms", `${CF_MS}ms`);

  function measureCoverSize() {
    const stageH = stage.clientHeight;
    const stageW = stage.clientWidth;
    if (stageH < 40 || stageW < 40) return fitted || CF_SIZE;
    return clamp(
      Math.round(Math.min(stageH * 0.62, stageW * 0.56)),
      CF_SIZE_MIN,
      CF_SIZE_MAX
    );
  }

  function fitCoverSize() {
    const size = measureCoverSize();
    if (Math.abs(size - fitted) >= 2 || !fitted) {
      fitted = size;
      geo = null;
      flow.style.setProperty("--yt-cf-size", `${size}px`);
    }
    return fitted;
  }

  function layout() {
    if (geo) return geo;
    const size = fitted > 8 ? fitted : fitCoverSize();
    const k = size / CF_SIZE;
    geo = {
      size,
      gap: CF_GAP * k,
      spacing: CF_SPACING * k,
      centerZ: CF_CENTER_Z * k,
      depth: CF_DEPTH * k,
    };
    return geo;
  }

  function poseCover(cover, offset, metrics) {
    const snapped = Math.round(offset * 64) / 64;
    const abs = Math.abs(snapped);
    if (cover._offset === snapped && cover._size === metrics.size) return;
    cover._offset = snapped;
    cover._size = metrics.size;
    const sign = snapped < 0 ? -1 : 1;
    let transform;
    if (reduced) {
      transform = `translate3d(-50%, -${originY}, 0) rotateY(0deg)`;
    } else {
      const first = metrics.size * 0.5 + metrics.gap;
      const x =
        abs < 1
          ? sign * first * abs
          : sign * (first + (abs - 1) * metrics.spacing);
      const z =
        abs < 1
          ? metrics.centerZ * (1 - abs) - metrics.depth * abs
          : -abs * metrics.depth;
      const angle = -sign * CF_ANGLE * Math.min(abs, 1);
      transform = `translate3d(-50%, -${originY}, 0) translate3d(${x}px, 0, ${z}px) rotateY(${angle}deg)`;
    }
    const centered = abs < 0.45;
    if (cover._centered !== centered) {
      cover._centered = centered;
      cover.classList.toggle("is-center", centered);
    }
    const near = abs <= 1.35;
    if (cover._near !== near) {
      cover._near = near;
      cover.classList.toggle("is-near", near);
    }
    cover.style.transform = transform;
  }

  function markMoving() {
    movingUntil = Date.now() + 480;
  }

  function isBusy() {
    return Boolean(drag || resizing || ticking || Date.now() < movingUntil);
  }

  function startTick() {
    if (ticking) return;
    ticking = true;
    flow.classList.add("is-moving");
    lastTick = performance.now();
    requestAnimationFrame(step);
  }

  function stopTick() {
    ticking = false;
    flow.classList.remove("is-moving");
    scheduleBrowse();
  }

  function step(now) {
    const dt = Math.min(0.032, Math.max(0.008, (now - lastTick) / 1000));
    lastTick = now;
    if (drag) {
      poseOnly(visual);
      ticking = false;
      return;
    }
    const max = Math.max(0, covers.length - 1);
    target = clamp(target, 0, max);
    const k = 1 - Math.exp(-dt / CF_TAU);
    visual += (target - visual) * k;
    const done = Math.abs(target - visual) < 0.003;
    if (done) visual = target;
    center = Math.round(visual);
    poseOnly(visual);
    if (done) {
      stopTick();
      return;
    }
    requestAnimationFrame(step);
  }

  function goTo(index) {
    if (!covers.length) return;
    target = clamp(index, 0, covers.length - 1);
    center = target;
    markMoving();
    startTick();
  }

  function setCaption(title, artist, instant) {
    const nextTitle = title || "";
    const nextArtist = artist || "";
    if (
      titleEl.dataset.marqueeText === nextTitle &&
      artistEl.dataset.marqueeText === nextArtist
    ) {
      return;
    }
    const paint = () => {
      if (instant || isBusy()) {
        titleEl.dataset.marqueeText = nextTitle;
        artistEl.dataset.marqueeText = nextArtist;
        const titleItem = titleEl.querySelector(".ytunes-marquee-item");
        const artistItem = artistEl.querySelector(".ytunes-marquee-item");
        if (titleItem) titleItem.textContent = nextTitle;
        else titleEl.textContent = nextTitle;
        if (artistItem) artistItem.textContent = nextArtist;
        else artistEl.textContent = nextArtist;
        titleEl.classList.remove("is-overflow");
        artistEl.classList.remove("is-overflow");
        return;
      }
      setMarqueeText(titleEl, nextTitle);
      setMarqueeText(artistEl, nextArtist);
    };
    if (!cap || reduced || instant || isBusy()) {
      if (captionTimer) {
        clearTimeout(captionTimer);
        captionTimer = null;
      }
      cap?.classList.remove("is-swap");
      paint();
      return;
    }
    if (captionTimer) clearTimeout(captionTimer);
    cap.classList.add("is-swap");
    captionTimer = setTimeout(() => {
      captionTimer = null;
      paint();
      cap.classList.remove("is-swap");
    }, 120);
  }

  function applyCaption(item, index) {
    if (index === captionIndex) return;
    captionIndex = index;
    if (!item) {
      setCaption("", "");
      return;
    }
    const parts = coverCaptionParts(item, captionTrack);
    setCaption(parts.title, parts.sub, optsInstant());
  }

  function optsInstant() {
    return isBusy();
  }

  function setCaptionTrack(track) {
    captionTrack = track || null;
    captionIndex = -1;
    applyCaption(current(), center);
  }

  function createCoverEl() {
    const cover = document.createElement("div");
    cover.className = "ytunes-cf-cover";
    cover.setAttribute("role", "option");
    cover.tabIndex = -1;
    cover.classList.add("is-idle");
    const face = document.createElement("div");
    face.className = "ytunes-cf-face";
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.decoding = "async";
    img.hidden = true;
    img.onerror = () => {
      const src = img.getAttribute("src") || "";
      const next = src
        .replace("/hq720.", "/hqdefault.")
        .replace("/maxresdefault.", "/hqdefault.");
      if (next !== src) {
        img.src = next;
        if (cover._mirror) cover._mirror.src = next;
        return;
      }
      img.hidden = true;
      ph.hidden = false;
      if (cover._mirror) cover._mirror.hidden = true;
      if (cover._mirrorPh) cover._mirrorPh.hidden = false;
    };
    const ph = document.createElement("div");
    ph.className = "ytunes-cf-ph";
    ph.hidden = true;
    face.appendChild(img);
    face.appendChild(ph);
    const reflect = document.createElement("div");
    reflect.className = "ytunes-cf-reflect";
    reflect.setAttribute("aria-hidden", "true");
    const inner = document.createElement("div");
    inner.className = "ytunes-cf-reflect-inner";
    const mirror = document.createElement("img");
    mirror.alt = "";
    mirror.draggable = false;
    mirror.decoding = "async";
    mirror.hidden = true;
    const mirrorPh = document.createElement("div");
    mirrorPh.className = "ytunes-cf-ph";
    mirrorPh.hidden = true;
    inner.appendChild(mirror);
    inner.appendChild(mirrorPh);
    reflect.appendChild(inner);
    cover.appendChild(face);
    cover.appendChild(reflect);
    cover._img = img;
    cover._ph = ph;
    cover._mirror = mirror;
    cover._mirrorPh = mirrorPh;
    cover._boundId = "";
    stage.appendChild(cover);
    return cover;
  }

  function ensurePool(count) {
    while (pool.length < count) pool.push(createCoverEl());
  }

  function bindCover(cover, item) {
    if (cover._boundId === item.id) return false;
    cover._boundId = item.id;
    cover.dataset.id = item.id;
    const videoId = item.videoId || item.tracks?.[0]?.videoId || "";
    const playlistId = String(
      item.playlistId || item.tracks?.[0]?.playlistId || ""
    ).replace(/^VL/, "");
    if (videoId) cover.dataset.video = videoId;
    else delete cover.dataset.video;
    if (playlistId) cover.dataset.playlist = playlistId;
    else delete cover.dataset.playlist;
    const src = coverArtSrc(item.artwork);
    if (src) {
      if (cover._img.getAttribute("src") !== src) cover._img.src = src;
      if (cover._mirror.getAttribute("src") !== src) cover._mirror.src = src;
      cover._img.hidden = false;
      cover._mirror.hidden = false;
      cover._ph.hidden = true;
      cover._mirrorPh.hidden = true;
    } else {
      const letter = (item.title || "?").charAt(0).toUpperCase();
      cover._img.removeAttribute("src");
      cover._mirror.removeAttribute("src");
      cover._img.hidden = true;
      cover._mirror.hidden = true;
      cover._ph.hidden = false;
      cover._mirrorPh.hidden = false;
      cover._ph.textContent = letter;
      cover._mirrorPh.textContent = letter;
    }
    return true;
  }

  function current() {
    return covers[center] || null;
  }

  function scheduleBrowse() {
    window.clearTimeout(browseTimer);
    browseTimer = window.setTimeout(() => {
      captionIndex = -1;
      applyCaption(current(), center);
      handlers?.onBrowse?.(current());
    }, CF_BROWSE_MS);
  }

  function windowFor(centerFloat) {
    const span = drag ? CF_WINDOW_DRAG : CF_WINDOW;
    if (reduced) {
      const at = Math.round(centerFloat);
      return { start: at, end: at + 1 };
    }
    return {
      start: Math.max(0, Math.floor(centerFloat) - span),
      end: Math.min(covers.length, Math.ceil(centerFloat) + span + 1),
    };
  }

  function syncWindow(centerFloat) {
    const { start, end } = windowFor(centerFloat);
    const key = `${start}:${end}`;
    if (key === lastWindow && live.length) return false;
    lastWindow = key;
    ensurePool(Math.max(CF_WINDOW * 2 + 1, end - start));
    const used = new Set();
    live.length = 0;
    let slot = 0;
    for (let i = start; i < end; i += 1) {
      const item = covers[i];
      let cover = byId.get(item.id);
      if (!cover || used.has(cover)) {
        while (slot < pool.length && used.has(pool[slot])) slot += 1;
        cover = pool[slot] || pool[0];
        if (cover._boundId && cover._boundId !== item.id) byId.delete(cover._boundId);
        bindCover(cover, item);
        byId.set(item.id, cover);
      }
      used.add(cover);
      cover.classList.remove("is-idle");
      cover.style.zIndex = String(200 - Math.abs(i - Math.round(centerFloat)));
      live.push({ cover, index: i });
    }
    pool.forEach((node) => {
      if (used.has(node)) return;
      node.classList.add("is-idle");
      node._offset = NaN;
    });
    return true;
  }

  function poseOnly(centerFloat) {
    if (!covers.length) return;
    const metrics = geo || layout();
    syncWindow(centerFloat);
    for (let i = 0; i < live.length; i += 1) {
      const slot = live[i];
      poseCover(slot.cover, slot.index - centerFloat, metrics);
    }
  }

  function paint(centerFloat, opts = {}) {
    if (!covers.length) {
      flow.classList.add("is-empty");
      empty.hidden = false;
      live.length = 0;
      lastWindow = "";
      pool.forEach((node) => {
        node.classList.add("is-idle");
      });
      captionTrack = null;
      captionIndex = -1;
      setCaption("", "", true);
      return;
    }
    flow.classList.remove("is-empty");
    empty.hidden = true;
    lastWindow = "";
    poseOnly(centerFloat);
    const nearest = clamp(Math.round(centerFloat), 0, covers.length - 1);
    if (!opts.skipCaption) applyCaption(covers[nearest], nearest);
  }

  function render(opts = {}) {
    center = clamp(Math.round(visual), 0, Math.max(0, covers.length - 1));
    paint(visual, opts);
  }

  function setList(list, selectedId) {
    covers = list || [];
    byId.clear();
    live.length = 0;
    lastWindow = "";
    pool.forEach((node) => {
      node._boundId = "";
      node._offset = NaN;
    });
    if (selectedId) {
      const idx = covers.findIndex((item) => item.id === selectedId);
      if (idx >= 0) center = idx;
    } else {
      center = 0;
    }
    captionIndex = -1;
    visual = center;
    target = center;
    ticking = false;
    render({ skipCaption: false });
  }

  function beginResize() {
    resizing = true;
    resizeStart = fitted || fitCoverSize();
    flow.classList.add("is-snap");
  }

  function endResize() {
    resizing = false;
    resizeStart = 0;
    stage.style.transform = "";
    geo = null;
    pool.forEach((node) => {
      node._size = 0;
      node._offset = NaN;
    });
    fitCoverSize();
    visual = center;
    target = center;
    render();
    requestAnimationFrame(() => flow.classList.remove("is-snap"));
  }

  function move(delta) {
    if (!covers.length || !delta) return;
    goTo(target + delta);
  }

  function setIndex(index, silent) {
    if (!covers.length) return;
    const next = clamp(index, 0, covers.length - 1);
    if (silent) {
      visual = next;
      target = next;
      center = next;
      ticking = false;
      render({ skipCaption: true });
      return;
    }
    goTo(next);
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
      visual = idx;
      target = idx;
      center = idx;
      ticking = false;
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
      wheelSteps += wheelAcc > 0 ? 1 : -1;
      wheelAcc -= Math.sign(wheelAcc) * CF_WHEEL_STEP;
    }
    if (wheelRaf) return;
    wheelRaf = requestAnimationFrame(() => {
      wheelRaf = 0;
      const steps = wheelSteps;
      wheelSteps = 0;
      if (steps) goTo(target + steps);
    });
  }

  function stepWidth() {
    const metrics = layout();
    return metrics.size * 0.5 + metrics.gap;
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
    markMoving();
  }

  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const step = Math.max(24, stepWidth());
    let next = drag.startCenter - (event.clientX - drag.startX) / step;
    const max = Math.max(0, covers.length - 1);
    if (next < 0) next = -rubberband(-next, step);
    else if (next > max) next = max + rubberband(next - max, step);
    if (Math.abs(event.clientX - drag.startX) > 4) drag.moved = true;
    drag.visual = next;
    visual = next;
    drag.samples.push({ x: event.clientX, t: Date.now() });
    if (drag.samples.length > 6) drag.samples.shift();
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (drag) paint(drag.visual, { skipCaption: true });
    });
  }

  function onPointerUp(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const samples = drag.samples;
    const moved = drag.moved;
    const at = drag.visual;
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
    let landing = clamp(Math.round(at || 0), 0, max);
    if (moved && samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = Math.max(1, last.t - first.t);
      const vPx = (last.x - first.x) / dt;
      const step = Math.max(24, stepWidth());
      const v = -vPx / step;
      landing = clamp(Math.round((at || 0) + project(v * 1000)), 0, max);
    }
    visual = at;
    goTo(landing);
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
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      if (resizing) {
        const live = measureCoverSize();
        if (resizeStart) {
          const scale = live / resizeStart;
          stage.style.transform = `scale(${scale})`;
          stage.style.transformOrigin = "50% 42%";
        }
        return;
      }
      const before = fitted;
      fitCoverSize();
      if (!covers.length) return;
      if (Math.abs(fitted - before) < 2 && before) return;
      flow.classList.add("is-snap");
      pool.forEach((node) => {
        node._size = 0;
        node._offset = NaN;
      });
      if (drag) paint(drag.visual, { skipCaption: true });
      else render({ skipCaption: true });
      requestAnimationFrame(() => {
        if (!drag && !resizing) flow.classList.remove("is-snap");
      });
    });
  });
  resize.observe(flow);
  ensurePool(CF_WINDOW * 2 + 1);
  requestAnimationFrame(() => fitCoverSize());

  return {
    setList,
    current,
    index: () => center,
    count: () => covers.length,
    move,
    setIndex,
    setCaptionTrack,
    beginResize,
    endResize,
    isDragging: () => Boolean(drag),
    isBusy,
    focus: () => flow.focus({ preventScroll: true }),
  };
}
