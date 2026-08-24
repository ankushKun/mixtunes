/* yTunes site behaviour: browser detection for the install buttons, the
   screenshot Cover Flow, sticky-header shadow, scroll-spy tabs, and
   reveal-on-scroll. All progressive: with this file absent the page still
   offers both stores and a manual download. */
(function () {
  "use strict";

  var reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- which browser is this, and what should they get ---------- */

  (function installer() {
    var rows = Array.prototype.slice.call(document.querySelectorAll("[data-cta]"));
    if (!rows.length) return;

    var STORES = {
      chrome: {
        name: "Chrome",
        phrase: "the Chrome Web Store",
        url: "https://chromewebstore.google.com"
      },
      firefox: {
        name: "Firefox",
        phrase: "Firefox Add-ons",
        url: "https://addons.mozilla.org"
      }
    };

    // min is the *engine* version yTunes needs (manifest: Chrome/Firefox 121+),
    // which for a fork is its underlying Chromium, not its own version number.
    var BROWSERS = {
      chrome: { name: "Chrome", icon: "chrome", store: "chrome", showVersion: true },
      chromium: { name: "Chromium", icon: "chromium", store: "chrome", showVersion: true },
      edge: { name: "Edge", icon: "edge", store: "chrome", fork: true },
      brave: { name: "Brave", icon: "brave", store: "chrome", fork: true },
      opera: { name: "Opera", icon: "opera", store: "chrome", fork: true },
      vivaldi: { name: "Vivaldi", icon: "vivaldi", store: "chrome", fork: true },
      firefox: { name: "Firefox", icon: "firefox", store: "firefox", showVersion: true },
      safari: { name: "Safari", icon: "safari", store: null, note: "There is no Safari version yet. Use Chrome or Firefox instead." }
    };

    var MIN = 121;

    function detect() {
      var ua = navigator.userAgent;
      var uad = navigator.userAgentData;
      var mobile = (uad && uad.mobile === true) ||
        /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua);

      function num(re) {
        var m = ua.match(re);
        return m ? parseInt(m[1], 10) : 0;
      }

      var chromium = num(/Chrome\/(\d+)/);
      var id = null;
      var engineVersion = 0;

      // Order matters: every Chromium fork also claims "Chrome/" in its UA.
      if (/Edg\//.test(ua)) { id = "edge"; engineVersion = chromium; }
      else if (/OPR\//.test(ua)) { id = "opera"; engineVersion = chromium; }
      else if (/Vivaldi/.test(ua)) { id = "vivaldi"; engineVersion = chromium; }
      else if (/Firefox\//.test(ua) && !/Seamonkey/i.test(ua)) {
        id = "firefox";
        engineVersion = num(/Firefox\/(\d+)/);
      } else if (/Chromium\//.test(ua)) { id = "chromium"; engineVersion = num(/Chromium\/(\d+)/); }
      else if (chromium) { id = "chrome"; engineVersion = chromium; }
      else if (/Safari\//.test(ua)) { id = "safari"; engineVersion = num(/Version\/(\d+)/); }

      return { id: id, version: engineVersion, mobile: mobile };
    }

    function iconFor(slug) {
      return '<svg class="bi" aria-hidden="true"><use href="#bi-' + slug + '" /></svg>';
    }

    function paint(found) {
      var info = found.id && BROWSERS[found.id];
      var note = document.querySelector("[data-detect]");

      function say(icon, html) {
        if (!note) return;
        // One text child only: the pill is a flex row, so loose text nodes
        // around <b> would each become a flex item and inherit the gap.
        note.innerHTML = icon + "<span>" + html + "</span>";
        note.hidden = false;
      }

      // Unknown: leave both store buttons alone and say nothing.
      if (!info) return;

      // Mark this browser in the compatibility table, supported or not.
      var row = document.querySelector('[data-browser="' + found.id + '"]');
      if (row) {
        row.classList.add("is-you");
        row.insertAdjacentHTML("beforeend", '<i class="you">You</i>');
      }

      if (found.mobile) {
        say(
          iconFor(info.icon),
          "You are on a phone or tablet. Add-ons like this only work on a " +
            "computer, so open this page there instead."
        );
        rows.forEach(function (row) {
          row.classList.add("is-muted");
        });
        return;
      }

      if (!info.store) {
        say(iconFor(info.icon), info.note);
        return;
      }

      var store = STORES[info.store];
      var other = info.store === "chrome" ? STORES.firefox : STORES.chrome;
      var otherIcon = info.store === "chrome" ? "firefox" : "chrome";
      var otherName = info.store === "chrome" ? "Firefox" : "Chrome";

      rows.forEach(function (row) {
        var primary = row.querySelector("[data-cta-primary]");
        var secondary = row.querySelector("[data-cta-secondary]");
        if (primary) {
          primary.href = store.url;
          primary.querySelector("[data-cta-label]").textContent = "Add to " + info.name;
          primary.querySelector("use").setAttribute("href", "#bi-" + info.icon);
        }
        if (secondary) {
          // The hero drops to a single button; the install section keeps the
          // other store on offer for people setting up a second browser.
          if (row.dataset.cta === "hero") {
            secondary.hidden = true;
            return;
          }
          secondary.href = other.url;
          secondary.querySelector("[data-cta-label]").textContent = "Add to " + otherName;
          secondary.querySelector("use").setAttribute("href", "#bi-" + otherIcon);
          secondary.classList.remove("btn-aqua");
          secondary.classList.add("btn-graphite");
        }
      });

      var seen = info.name + (info.showVersion && found.version ? " " + found.version : "");
      if (found.version && found.version < MIN) {
        say(
          iconFor(info.icon),
          "You have <b>" + seen + "</b>. yTunes needs " + store.name + " " + MIN +
            " or newer, so update your browser first."
        );
      } else if (info.fork) {
        // Explain why a fork is being sent to Chrome's store.
        say(
          iconFor(info.icon),
          "You are using <b>" + seen + "</b>. The button above goes to " +
            store.phrase + ". " + info.name + " can install from there."
        );
      } else {
        say(
          iconFor(info.icon),
          "You are using <b>" + seen + "</b>. The button above goes to " + store.phrase + "."
        );
      }

    }

    var found = detect();

    // Brave masquerades as Chrome in its UA; this is the only reliable tell.
    if (found.id === "chrome" && navigator.brave && navigator.brave.isBrave) {
      navigator.brave
        .isBrave()
        .then(function (yes) {
          if (yes) found.id = "brave";
          paint(found);
        })
        .catch(function () {
          paint(found);
        });
      return;
    }

    paint(found);
  })();

  /* ---------- screenshot Cover Flow ---------- */

  (function coverFlow() {
    var flow = document.querySelector("[data-flow]");
    if (!flow) return;

    var covers = Array.prototype.slice.call(flow.querySelectorAll(".cover"));
    if (!covers.length) return;

    var dotList = document.querySelector("[data-dots]");
    var dots = [];

    var n = covers.length;
    var index = 0;
    var timer = null;
    var onScreen = true;
    var DELAY = 5000;

    if (dotList) {
      covers.forEach(function (cover, i) {
        var li = document.createElement("li");
        var dot = document.createElement("button");
        dot.type = "button";
        dot.setAttribute("aria-label", cover.dataset.title || "Screenshot " + (i + 1));
        dot.addEventListener("click", function () {
          go(i, true);
          restart();
        });
        li.appendChild(dot);
        dotList.appendChild(li);
        dots.push(dot);
      });
    }

    // Shortest signed distance around the ring, so the deck wraps instead of
    // flinging the far cover across the stage: with 3 covers the offsets are
    // always -1, 0, +1 and every cover stays on screen.
    function offset(i) {
      var d = ((i - index) % n + n) % n;
      return d > n / 2 ? d - n : d;
    }

    // How many covers flank the centre. The stage is sized for one on each
    // side; anything further out is parked off-stage and faded, so a six-shot
    // deck does not turn into a crowded row.
    var FLANK = 1;

    // Transforms only, called on every pointermove, so it stays cheap.
    function applyOffsets(shift) {
      covers.forEach(function (cover, i) {
        var d = offset(i) + shift;
        var ad = Math.abs(d);
        cover.style.setProperty("--d", String(d));
        cover.style.setProperty("--ad", String(ad));
        cover.style.zIndex = String(20 - Math.round(ad));
        var shown = ad <= FLANK + 0.55;
        cover.style.opacity = shown ? "1" : "0";
        cover.style.pointerEvents = shown ? "" : "none";
      });
    }

    function paint() {
      applyOffsets(0);
      covers.forEach(function (cover, i) {
        var d = offset(i);
        cover.classList.toggle("is-center", d === 0);
        // Roving tabindex: the deck is one tab stop, arrows move within it.
        cover.tabIndex = d === 0 ? 0 : -1;
        if (d === 0) cover.setAttribute("aria-current", "true");
        else cover.removeAttribute("aria-current");
      });

      dots.forEach(function (dot, i) {
        if (i === index) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
    }

    function go(i, focus) {
      index = ((i % n) + n) % n;
      paint();
      if (focus) covers[index].focus();
    }

    function stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    }

    function restart() {
      stop();
      if (reduceMotion.matches || !onScreen || document.hidden) return;
      timer = setInterval(function () {
        // Hovering no longer halts the deck, only a keyboard user actively
        // stepping through it does.
        if (flow.contains(document.activeElement)) return;
        go(index + 1);
      }, DELAY);
    }

    covers.forEach(function (cover, i) {
      cover.addEventListener("click", function () {
        go(i, true);
        restart();
      });
    });

    flow.addEventListener("keydown", function (event) {
      var moved = true;
      if (event.key === "ArrowLeft") go(index - 1, true);
      else if (event.key === "ArrowRight") go(index + 1, true);
      else if (event.key === "Home") go(0, true);
      else if (event.key === "End") go(n - 1, true);
      else moved = false;
      if (moved) {
        event.preventDefault();
        restart();
      }
    });

    /* ---- drag: same gesture with a mouse or a finger ---- */

    var drag = null;
    var suppressClick = false;

    // One step across the deck, in pixels. --step-pct lives in the CSS next to
    // the transform that consumes it, so the two cannot drift apart.
    function stepPx() {
      var width = covers[0].getBoundingClientRect().width;
      var pct = parseFloat(getComputedStyle(flow).getPropertyValue("--step-pct"));
      return width * (pct || 0.44);
    }

    function endDrag(commit) {
      if (!drag) return;
      var moved = drag.dx;
      var step = drag.step;
      flow.classList.remove("is-dragging");
      if (drag.captured && flow.hasPointerCapture(drag.id)) {
        flow.releasePointerCapture(drag.id);
      }
      var wasHorizontal = drag.horizontal;
      suppressClick = wasHorizontal && Math.abs(moved) > 4;
      drag = null;

      if (commit && wasHorizontal && Math.abs(moved) > step * 0.2) {
        go(moved > 0 ? index - 1 : index + 1);
      } else {
        paint();
      }
      restart();
    }

    flow.addEventListener("pointerdown", function (event) {
      if (event.button !== undefined && event.button !== 0) return;
      suppressClick = false;
      drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        dx: 0,
        step: stepPx(),
        horizontal: false,
        decided: false,
        captured: false
      };
      stop();
    });

    flow.addEventListener("pointermove", function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      var dx = event.clientX - drag.x;
      var dy = event.clientY - drag.y;

      if (!drag.decided) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        // A mostly-vertical gesture belongs to the page, not the deck.
        drag.decided = true;
        drag.horizontal = Math.abs(dx) > Math.abs(dy);
        if (!drag.horizontal) {
          endDrag(false);
          return;
        }
        flow.classList.add("is-dragging");
        try {
          flow.setPointerCapture(drag.id);
          drag.captured = true;
        } catch (err) {
          /* capture is a nicety; the gesture still works without it */
        }
      }

      drag.dx = dx;
      event.preventDefault();
      // Clamp to a single step so the deck never flies past its neighbours.
      var shift = Math.max(-1, Math.min(1, dx / drag.step));
      applyOffsets(shift);
    });

    flow.addEventListener("pointerup", function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      endDrag(true);
    });

    flow.addEventListener("pointercancel", function (event) {
      if (!drag || event.pointerId !== drag.id) return;
      endDrag(false);
    });

    // Swallow the click that ends a drag, so releasing over a side cover does
    // not navigate twice.
    flow.addEventListener(
      "click",
      function (event) {
        if (suppressClick) {
          event.stopPropagation();
          event.preventDefault();
          suppressClick = false;
        }
      },
      true
    );


    // Arrow keys drive the deck from anywhere on the page, not just when it
    // happens to hold focus.
    document.addEventListener("keydown", function (event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      var active = document.activeElement;
      if (active) {
        // Never steal arrows from a field, or from the deck's own handler.
        if (active.isContentEditable) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return;
        if (flow.contains(active)) return;
      }

      event.preventDefault();
      go(event.key === "ArrowLeft" ? index - 1 : index + 1);
      restart();
    });

    document.addEventListener("visibilitychange", restart);
    if (typeof reduceMotion.addEventListener === "function") {
      reduceMotion.addEventListener("change", restart);
    }

    // Do not animate a deck nobody is looking at.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        function (entries) {
          onScreen = entries[0].isIntersecting;
          restart();
        },
        { threshold: 0.2 }
      ).observe(flow);
    }

    paint();
    restart();
  })();

  /* ---------- the mini Cover Flow deck ---------- */

  (function coverDeck() {
    var demo = document.querySelector(".demo-flow");
    if (!demo) return;

    var slots = Array.prototype.slice.call(demo.querySelectorAll("i"));
    var n = slots.length;
    if (n < 3) return;

    // Read the art back out of the stylesheet rather than repeating the paths
    // here, so the CSS stays the one place the covers are listed, and the card
    // still shows art if this script never runs.
    var art = slots.map(function (slot) {
      return getComputedStyle(slot).backgroundImage;
    });

    // A random starting order each visit, then the deck flips through it.
    (function seed() {
      var pool = art.slice();
      for (var i = pool.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var swap = pool[i];
        pool[i] = pool[j];
        pool[j] = swap;
      }
      slots.forEach(function (slot, i) {
        // The reflection is `background: inherit`, so it follows along.
        slot.style.backgroundImage = pool[i];
      });
    })();

    var index = 0;
    // Hovering peeks one cover ahead; leaving settles back to where the
    // clicks have actually got to.
    var peek = 0;
    var previous = slots.map(function () {
      return null;
    });

    // The fan lives in CSS so it can change at the mobile breakpoint.
    function fan() {
      var cs = getComputedStyle(demo);
      function num(name) {
        return parseFloat(cs.getPropertyValue(name)) || 0;
      }
      return [
        { x: 0, z: 0, r: 0 },
        { x: num("--fx1"), z: num("--fz1"), r: num("--fr1") },
        { x: num("--fx2"), z: num("--fz2"), r: num("--fr2") },
        { x: num("--fx3"), z: num("--fz3"), r: num("--fr3") }
      ];
    }

    function offset(i) {
      var d = ((i - index - peek) % n + n) % n;
      return d > n / 2 ? d - n : d;
    }

    function paint() {
      var rings = fan();
      slots.forEach(function (slot, i) {
        var d = offset(i);
        var ring = rings[Math.min(Math.abs(d), rings.length - 1)];
        var sign = d < 0 ? -1 : 1;

        // One cover per step jumps from one end of the fan to the other.
        // Move that one without a transition so it does not fly across.
        var jumped = previous[i] !== null && Math.abs(d - previous[i]) > 1;
        if (jumped) {
          slot.style.transition = "none";
          void slot.offsetWidth;
        }

        slot.style.transform =
          d === 0
            ? "none"
            : "translateX(" + sign * ring.x + "px) translateZ(" + ring.z +
              "px) rotateY(" + -sign * ring.r + "deg)";
        slot.style.zIndex = String(10 - Math.abs(d));
        slot.style.boxShadow =
          d === 0
            ? "inset 0 0 0 1px rgba(255,255,255,.32), 0 2px 6px rgba(0,0,0,.55)"
            : "inset 0 0 0 1px rgba(255,255,255,.14)";

        if (jumped) {
          void slot.offsetWidth;
          slot.style.transition = "";
        }
        previous[i] = d;
      });
    }

    paint();

    var card = demo.closest(".feature");
    if (card) {
      card.classList.add("is-shufflable");
      card.addEventListener("click", function () {
        index += 1;
        paint();
      });
      // mouseenter/leave do not bubble, so children cannot retrigger these
      card.addEventListener("mouseenter", function () {
        if (reduceMotion.matches) return;
        peek = 1;
        paint();
      });
      card.addEventListener("mouseleave", function () {
        if (!peek) return;
        peek = 0;
        paint();
      });
    }

    // the fan is narrower on phones, so re-place on a width change
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(paint, 150);
    });
  })();

  /* ---------- sticky header shadow ---------- */

  (function stickyHeader() {
    var head = document.querySelector("[data-head]");
    if (!head) return;
    var sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    head.parentNode.insertBefore(sentinel, head);

    if (!("IntersectionObserver" in window)) return;
    new IntersectionObserver(function (entries) {
      head.classList.toggle("is-stuck", !entries[0].isIntersecting);
    }).observe(sentinel);
  })();

  /* ---------- reveal on scroll ---------- */

  (function reveal() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
    if (!items.length) return;

    function showAll() {
      items.forEach(function (el) {
        el.classList.add("is-in");
      });
    }

    if (reduceMotion.matches || !("IntersectionObserver" in window)) {
      showAll();
      return;
    }

    // Only now does the CSS start hiding anything.
    document.documentElement.classList.add("reveal-ready");

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 }
    );
    items.forEach(function (el) {
      io.observe(el);
    });
  })();

  /* ---------- scroll-spy tabs ---------- */

  (function scrollSpy() {
    var tabs = Array.prototype.slice.call(
      document.querySelectorAll('.tabs a[href^="#"]')
    );
    if (!tabs.length || !("IntersectionObserver" in window)) return;

    var byId = {};
    var targets = [];
    tabs.forEach(function (tab) {
      var el = document.getElementById(tab.hash.slice(1));
      if (!el) return;
      byId[el.id] = tab;
      targets.push(el);
    });
    if (!targets.length) return;

    var visible = {};
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          visible[entry.target.id] = entry.isIntersecting;
        });
        var active = targets.filter(function (el) {
          return visible[el.id];
        })[0];
        tabs.forEach(function (tab) {
          tab.classList.remove("is-active");
        });
        if (active && byId[active.id]) byId[active.id].classList.add("is-active");
      },
      { rootMargin: "-30% 0px -55% 0px" }
    );
    targets.forEach(function (el) {
      io.observe(el);
    });
  })();
})();
