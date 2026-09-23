(function () {
  var LOGO_SRC = "/lgs-brand/lgs-logo.png";
  var HOME_IMG_SRC = "/lgs-brand/lgs-logo.png?v=7";
  var STYLE_ID = "lgs-brand-style";

  function ensureHeadBrand() {
    var head = document.head;
    if (!head) return;

    function upsert(selector, attrs) {
      var existing = head.querySelector(selector);
      if (existing) {
        Object.keys(attrs).forEach(function (key) {
          existing.setAttribute(key, attrs[key]);
        });
        return;
      }
      var link = document.createElement("link");
      Object.keys(attrs).forEach(function (key) {
        link.setAttribute(key, attrs[key]);
      });
      head.appendChild(link);
    }

    upsert('link[rel="icon"][type="image/svg+xml"]', {
      rel: "icon",
      type: "image/svg+xml",
      href: "/lgs-brand/favicon.svg",
    });
    upsert('link[rel="shortcut icon"]', { rel: "shortcut icon", href: "/lgs-brand/favicon.ico" });
    upsert('link[rel="icon"][sizes="any"]', {
      rel: "icon",
      href: "/lgs-brand/favicon.ico",
      sizes: "any",
    });

    document.querySelectorAll('link[rel="icon"][type="image/png"]').forEach(function (node) {
      node.setAttribute("href", "/lgs-brand/favicon.ico");
    });
    document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(function (node) {
      node.setAttribute("href", "/lgs-brand/apple-touch-icon.png");
    });

    var title = document.querySelector("title");
    if (title) title.textContent = "Let's Go Social";
    var appName = document.querySelector('meta[name="application-name"]');
    if (appName) appName.setAttribute("content", "Let's Go Social");
    var appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) appleTitle.setAttribute("content", "Let's Go Social");
  }

  function ensureStyle() {
    var existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      /* Hide Plane Community edition upsell */
      'button[aria-label*="paid plans"],',
      'button[aria-label*="Open paid plans"] { display: none !important; }',
      'div.flex.h-12.items-center.justify-between.border-t.border-subtle:has(button[aria-label*="paid plans"]),',
      'div.flex.h-12.items-center.justify-between.border-t.border-subtle:has(button[aria-haspopup="dialog"]) { display: none !important; }',
      /* Hide Star us on GitHub */
      'a[aria-label="Star us on GitHub"],',
      'a[aria-label*="Star us on GitHub"],',
      'a[href*="github.com/makeplane/plane"],',
      'a[href*="github.com/makeplane"][aria-label] { display: none !important; }',
      /* Hide stickies on LGS home and sidebar; they error on save. */
      'a[href$="/stickies"],',
      'a[href$="/stickies/"],',
      'a[href*="/stickies?"] { display: none !important; }',
    ].join("\n");
    document.head.appendChild(style);
  }

  function hideUpsells() {
    document.querySelectorAll("button").forEach(function (btn) {
      var label = (btn.getAttribute("aria-label") || "").toLowerCase();
      var text = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (label.indexOf("paid plans") !== -1 || text === "Community") {
        btn.style.setProperty("display", "none", "important");
        var row = btn.closest("div.flex.h-12");
        if (row) row.style.setProperty("display", "none", "important");
      }
    });
    document.querySelectorAll("a").forEach(function (link) {
      var label = (link.getAttribute("aria-label") || "").toLowerCase();
      var href = link.getAttribute("href") || "";
      if (
        label.indexOf("star us on github") !== -1 ||
        href.indexOf("github.com/makeplane") !== -1 ||
        /\/stickies\/?$/.test(href)
      ) {
        link.style.setProperty("display", "none", "important");
      }
    });
    hideStickies();
  }

  function hideStickies() {
    document.querySelectorAll('a[href*="stickies"]').forEach(function (link) {
      var href = link.getAttribute("href") || "";
      if (!/\/stickies\/?(\?|$)/.test(href)) return;
      link.style.setProperty("display", "none", "important");
    });
  }

  function isPlaneLogoSvg(node) {
    if (!node || node.tagName !== "svg") return false;
    if (node.getAttribute("data-lgs-branded") === "1") return false;
    var viewBox = (node.getAttribute("viewBox") || "").trim();
    if (viewBox === "0 0 85 52" || viewBox === "0 0 253 53") return true;
    var paths = node.querySelectorAll("path");
    for (var i = 0; i < paths.length; i += 1) {
      if ((paths[i].getAttribute("d") || "").indexOf("44.3223") === 0) return true;
    }
    return false;
  }

  function logoHeight(svg) {
    if (svg.classList && svg.classList.contains("h-4")) return "16px";
    var attr = parseInt(svg.getAttribute("height"), 10);
    if (attr && attr <= 24) return attr + "px";
    return "36px";
  }

  function brandLogoSafely(svg) {
    if (!isPlaneLogoSvg(svg)) return;
    svg.setAttribute("data-lgs-branded", "1");
    svg.style.display = "none";
    if (svg.parentElement && svg.parentElement.querySelector('img[data-lgs-logo="1"]')) return;
    var img = document.createElement("img");
    img.src = LOGO_SRC;
    img.alt = "Let's Go Social";
    img.setAttribute("data-lgs-logo", "1");
    img.style.height = logoHeight(svg);
    img.style.width = "auto";
    img.style.display = "block";
    img.style.objectFit = "contain";
    if (svg.parentNode) svg.parentNode.insertBefore(img, svg);
  }

  function brandLogos() {
    document.querySelectorAll("svg").forEach(brandLogoSafely);
  }

  function brandHomeDoodle() {
    // Force the dashboard card to the logo campfire (stones + flame), not the people doodle.
    document.querySelectorAll("img").forEach(function (img) {
      var src = img.getAttribute("src") || "";
      var card = img.closest("div");
      var cardText = card && card.textContent ? card.textContent : "";
      var looksLikeHomeCard =
        cardText.indexOf("Meetup for people aged 20 to 35") !== -1 ||
        src.indexOf("coffee.webp") !== -1 ||
        src.indexOf("auth-campfire.webp") !== -1 ||
        src.indexOf("letsgosocial.co.uk/images/doodles/") !== -1;
      if (!looksLikeHomeCard) return;
      if (src.indexOf("lgs-logo.png?v=7") !== -1) {
        img.setAttribute("data-lgs-home-doodle", "1");
        return;
      }
      img.setAttribute("data-lgs-home-doodle", "1");
      img.src = HOME_IMG_SRC;
    });
  }

  function replaceAuthCopy() {
    document.querySelectorAll("span, p").forEach(function (el) {
      var text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text.indexOf("teams building with Plane") === -1) return;
      var wrap = el.closest("div.flex.flex-col");
      if (wrap) wrap.style.setProperty("display", "none", "important");
    });
    var replacements = [
      ["Welcome back to Plane.", "Welcome back to Let's Go Social."],
      ["Create your Plane account.", "Create your Let's Go Social account."],
      ["Work in all dimensions.", "Meetup for people aged 20 to 35."],
      ["New to Plane?", "New to Let's Go Social?"],
      ["Sign in - Plane", "Sign in - Let's Go Social"],
      ["Sign up - Plane", "Sign up - Let's Go Social"],
    ];
    if (!document.body) return;
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue;
      if (!value) continue;
      var next = value;
      replacements.forEach(function (pair) {
        if (next.indexOf(pair[0]) !== -1) next = next.split(pair[0]).join(pair[1]);
      });
      if (next !== value) node.nodeValue = next;
    }
    var path = window.location.pathname || "";
    if (path === "/" || path.indexOf("/sign-in") === 0) {
      document.title = "Sign in - Let's Go Social";
    } else if (path.indexOf("/sign-up") === 0) {
      document.title = "Sign up - Let's Go Social";
    } else if (document.title && document.title.indexOf("Plane") !== -1) {
      document.title = document.title.replace(/Plane/g, "Let's Go Social");
    }
  }

  function scheduleBranding() {
    var pending = false;
    function tick() {
      pending = false;
      hideUpsells();
      brandLogos();
      brandHomeDoodle();
      replaceAuthCopy();
    }
    function requestTick() {
      if (pending) return;
      pending = true;
      window.setTimeout(tick, 300);
    }
    window.setTimeout(tick, 200);
    window.setTimeout(tick, 1500);
    window.setTimeout(tick, 4000);
    if (window.MutationObserver && !window.__lgsBrandObserver) {
      window.__lgsBrandObserver = new MutationObserver(requestTick);
      window.__lgsBrandObserver.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }
  }

  function boot() {
    ensureHeadBrand();
    ensureStyle();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then(function (regs) {
        regs.forEach(function (reg) {
          reg.unregister();
        });
      });
    }
    if (window.caches && caches.keys) {
      caches.keys().then(function (keys) {
        keys.forEach(function (key) {
          caches.delete(key);
        });
      });
    }
    scheduleBranding();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
