const MARQUEE_GAP = 48;
const MARQUEE_PX_PER_SEC = 36;
const MARQUEE_MOVE_RATIO = 0.82;

const MARQUEE_LIVE = [
  "#ytunes-lcd-title",
  "#ytunes-lcd-sub",
  "#ytunes-sidebar-well-title",
  "#ytunes-sidebar-well-sub",
  "#ytunes-cover-title",
  "#ytunes-cover-artist",
  "#ytunes-artwell-title",
  "#ytunes-artwell-sub",
  "#ytunes-status-center",
];

const MARQUEE_HOVER = [".ytunes-source-label"];

function marqueeLabel(el) {
  if (!el) return "";
  return (
    el.dataset.marqueeText ||
    el.querySelector(".ytunes-marquee-item")?.textContent ||
    el.textContent ||
    ""
  );
}

function upgradeMarquee(el, mode) {
  if (!el) return;
  if (el.querySelector(":scope > .ytunes-marquee-track")) {
    el.classList.add("ytunes-marquee");
    if (mode && !el.dataset.marquee) el.dataset.marquee = mode;
    return;
  }
  const text = el.textContent;
  el.textContent = "";
  el.classList.add("ytunes-marquee");
  el.dataset.marquee = mode || el.dataset.marquee || "hover";
  el.dataset.marqueeText = text;
  if (text) el.title = text;
  const track = document.createElement("span");
  track.className = "ytunes-marquee-track";
  const item = document.createElement("span");
  item.className = "ytunes-marquee-item";
  item.textContent = text;
  track.append(item);
  el.append(track);
}

function marqueeReduced() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function marqueeItemWidth(item) {
  if (!item) return 0;
  const boxW = Math.max(item.scrollWidth, item.offsetWidth, item.getBoundingClientRect().width);
  const host = item.closest(".ytunes-marquee");
  if (!host || boxW > host.clientWidth + 2) return Math.ceil(boxW);
  const cs = getComputedStyle(item);
  const probe = document.createElement("span");
  probe.textContent = item.textContent;
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    "display:inline-block",
    "width:auto",
    "max-width:none",
    "white-space:nowrap",
    "padding:0",
    "border:0",
    "margin:0",
    `font:${cs.font}`,
    `letter-spacing:${cs.letterSpacing}`,
    `text-transform:${cs.textTransform}`,
  ].join(";");
  (item.parentNode || host).append(probe);
  const probed = probe.offsetWidth;
  probe.remove();
  return Math.ceil(Math.max(boxW, probed));
}

function measureMarquee(el) {
  if (!el?.isConnected) return;
  const track = el.querySelector(":scope > .ytunes-marquee-track");
  const items = [...(track?.querySelectorAll(":scope > .ytunes-marquee-item") || [])];
  const item = items[0];
  if (!track || !item) return;
  if (el.clientWidth < 8 || marqueeReduced()) {
    items.slice(1).forEach((node) => node.remove());
    el.classList.remove("is-overflow");
    return;
  }
  const textWidth = marqueeItemWidth(item);
  if (textWidth - el.clientWidth <= 2) {
    items.slice(1).forEach((node) => node.remove());
    el.classList.remove("is-overflow");
    return;
  }
  const shift = textWidth + MARQUEE_GAP;
  if (
    el.classList.contains("is-overflow") &&
    el.style.getPropertyValue("--yt-marquee-shift") === `${shift}px` &&
    items.length > 1
  ) {
    return;
  }
  if (items.length < 2) {
    const clone = item.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    track.append(clone);
  }
  const duration = Math.max(4.5, shift / MARQUEE_PX_PER_SEC / MARQUEE_MOVE_RATIO);
  el.style.setProperty("--yt-marquee-shift", `${shift}px`);
  el.style.setProperty("--yt-marquee-duration", `${duration}s`);
  el.classList.add("is-overflow");
}

function setMarqueeText(el, text) {
  if (!el) return;
  const value = String(text ?? "");
  upgradeMarquee(el, el.dataset.marquee || "live");
  if (el.dataset.marqueeText !== value) {
    el.dataset.marqueeText = value;
    el.title = value;
    el.querySelectorAll(".ytunes-marquee-item").forEach((node) => {
      node.textContent = value;
    });
    el.classList.remove("is-overflow");
    el.style.removeProperty("--yt-marquee-shift");
  }
  measureMarquee(el);
}

function refreshMarquees(root) {
  if (!root) return;
  root.querySelectorAll(".ytunes-source-label").forEach((el) => upgradeMarquee(el, "hover"));
  root.querySelectorAll(".ytunes-marquee").forEach(measureMarquee);
}

function bindMarquees(root) {
  MARQUEE_LIVE.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => upgradeMarquee(el, "live"));
  });
  MARQUEE_HOVER.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => upgradeMarquee(el, "hover"));
  });
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      refreshMarquees(root);
    });
  };
  const observer = new ResizeObserver(schedule);
  [
    root,
    root.querySelector(".ytunes-lcd"),
    root.querySelector(".ytunes-lcd-meta"),
    root.querySelector(".ytunes-sidebar"),
    root.querySelector(".ytunes-sidebar-well"),
    root.querySelector(".ytunes-sidebar-well-meta"),
    root.querySelector(".ytunes-table-wrap"),
    root.querySelector(".ytunes-grid"),
    root.querySelector(".ytunes-coverflow-caption"),
    root.querySelector(".ytunes-artwell-meta"),
    root.querySelector(".ytunes-source-list"),
  ].forEach((node) => node && observer.observe(node));
  try {
    window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener("change", schedule);
  } catch {
    /* older engines */
  }
  refreshMarquees(root);
}
