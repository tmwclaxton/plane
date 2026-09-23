(function () {
  var tab = Math.random().toString(36).slice(2, 10);
  var activePage = null;
  var shareButton = null;
  var shareState = null;
  var lastViewers = [];

  function pageFromPath(path) {
    var match = path.match(/^\/([^/]+)\/projects\/([0-9a-fA-F-]{36})\/pages\/([0-9a-fA-F-]{36})\/?$/);
    if (!match) return null;
    return { slug: match[1], projectId: match[2], pageId: match[3] };
  }

  function endpoint(page) {
    return "/public/pages/" + page.slug + "/" + page.projectId + "/" + page.pageId;
  }

  function headerRow() {
    var button = document.querySelector('[aria-label="Copy link"], [aria-label="Copied link"]');
    var node = button;
    while (node && node !== document.body) {
      if (node.classList && node.classList.contains("gap-1") && node.classList.contains("items-center")) return node;
      node = node.parentElement;
    }
    return null;
  }

  function renderViewers(viewers) {
    lastViewers = viewers || [];
    var host = document.getElementById("lgs-doc-viewers");
    if (!viewers || !viewers.length) {
      if (host) host.remove();
      return;
    }
    if (!host) {
      host = document.createElement("span");
      host.id = "lgs-doc-viewers";
      host.className = "mr-1 flex flex-wrap items-center gap-1";
    }
    host.replaceChildren();
    viewers.forEach(function (viewer) {
      var name = viewer.name || "Someone";
      var item = document.createElement("span");
      item.className =
        "inline-flex max-w-40 items-center gap-1 rounded-full border border-subtle bg-surface-2 py-0.5 pr-2 pl-0.5";
      item.title = name + " is viewing this doc";

      var avatar = document.createElement("span");
      avatar.className = "grid h-4 w-4 place-items-center overflow-hidden rounded-full text-11";
      if (viewer.avatar) {
        var image = document.createElement("img");
        image.src = viewer.avatar;
        image.alt = "";
        image.className = "h-4 w-4 rounded-full object-cover";
        image.addEventListener("error", function () {
          image.remove();
          avatar.textContent = name.slice(0, 1).toUpperCase();
          avatar.style.background = "var(--background-color-accent-primary)";
          avatar.style.color = "var(--text-color-on-color)";
        });
        avatar.appendChild(image);
      } else {
        avatar.textContent = name.slice(0, 1).toUpperCase();
        avatar.style.background = "var(--background-color-accent-primary)";
        avatar.style.color = "var(--text-color-on-color)";
      }

      var label = document.createElement("span");
      label.className = "truncate text-11 leading-4 text-primary";
      label.textContent = name;
      item.appendChild(avatar);
      item.appendChild(label);
      host.appendChild(item);
    });

    var row = headerRow();
    if (row && host.parentElement !== row) row.insertBefore(host, row.firstChild);
  }

  function presence(page, leave) {
    var body = JSON.stringify({ tab: tab, leave: !!leave });
    var url = endpoint(page) + "/presence";
    if (leave && navigator.sendBeacon) {
      navigator.sendBeacon(url + "?tab=" + encodeURIComponent(tab) + "&leave=1", new Blob([body], { type: "application/json" }));
      return;
    }
    fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: !!leave,
    })
      .then(function (response) {
        if (leave || !response.ok) return null;
        return response.json();
      })
      .then(function (payload) {
        if (!payload || pageKey(pageFromPath(location.pathname)) !== pageKey(page)) return;
        renderViewers(payload.viewers || []);
      })
      .catch(function () {});
  }

  function pageKey(page) {
    return page ? page.projectId + "/" + page.pageId : "";
  }

  function paintShare(label) {
    if (!shareButton || !shareState) return;
    var on = !!shareState.internet_public;
    shareButton.textContent = label || (on ? "Public" : "Public link");
    shareButton.title = on
      ? "Anyone with this link can view the doc. Click to turn it off."
      : "Let anyone with this link view the doc. They cannot edit it.";
    shareButton.style.background = on ? "#C6E27A" : "#F7F3E8";
    shareButton.style.color = "#1A4326";
  }

  function mountShare(page) {
    fetch(endpoint(page) + "/state", { credentials: "same-origin" })
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (state) {
        if (!state || !state.can_share || pageKey(pageFromPath(location.pathname)) !== pageKey(page)) return;
        shareState = state;
        if (!shareButton) {
          shareButton = document.createElement("button");
          shareButton.type = "button";
          shareButton.id = "lgs-public-share";
          shareButton.style.position = "fixed";
          shareButton.style.right = "16px";
          shareButton.style.bottom = "16px";
          shareButton.style.zIndex = "40";
          shareButton.style.border = "1px solid #1A4326";
          shareButton.style.borderRadius = "999px";
          shareButton.style.padding = "8px 14px";
          shareButton.style.font = "600 13px/1 Arial, sans-serif";
          shareButton.style.cursor = "pointer";
          shareButton.style.boxShadow = "0 8px 24px rgba(26, 67, 38, 0.16)";
          shareButton.addEventListener("click", function () {
            var current = pageFromPath(location.pathname);
            if (!current || !shareState) return;
            var next = !shareState.internet_public;
            shareButton.disabled = true;
            fetch(endpoint(current), {
              method: "POST",
              credentials: "same-origin",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ internet_public: next }),
            })
              .then(function (response) {
                if (!response.ok) throw new Error("update failed");
                return response.json();
              })
              .then(function (updated) {
                shareState.internet_public = !!updated.internet_public;
                if (shareState.internet_public && navigator.clipboard) {
                  navigator.clipboard.writeText(location.origin + location.pathname);
                  paintShare("Link copied");
                  window.setTimeout(function () {
                    paintShare();
                  }, 1600);
                  return;
                }
                paintShare();
              })
              .catch(function () {
                paintShare("Could not update");
                window.setTimeout(function () {
                  paintShare();
                }, 1600);
              })
              .finally(function () {
                shareButton.disabled = false;
              });
          });
          document.body.appendChild(shareButton);
        }
        paintShare();
      })
      .catch(function () {});
  }

  function sync(force) {
    var page = pageFromPath(location.pathname);
    if (!force && pageKey(page) === pageKey(activePage)) return;
    if (activePage && pageKey(activePage) !== pageKey(page)) {
      presence(activePage, true);
      renderViewers([]);
    }
    activePage = page;
    if (!page) {
      if (shareButton) shareButton.hidden = true;
      return;
    }
    if (shareButton) shareButton.hidden = false;
    presence(page, false);
    mountShare(page);
  }

  sync(true);
  window.setInterval(function () {
    var page = pageFromPath(location.pathname);
    if (pageKey(page) !== pageKey(activePage)) sync(false);
    else if (page) presence(page, false);
  }, 8000);
  window.setInterval(function () {
    var page = pageFromPath(location.pathname);
    if (pageKey(page) !== pageKey(activePage)) sync(false);
    else if (page && lastViewers.length && !document.getElementById("lgs-doc-viewers")) renderViewers(lastViewers);
  }, 1000);

  window.addEventListener("pagehide", function () {
    if (activePage) presence(activePage, true);
  });
})();
