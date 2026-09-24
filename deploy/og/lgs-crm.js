(function () {
  var API = "/crm-api";

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (key) {
      if (params[key] != null && params[key] !== "") {
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(params[key]));
      }
    });
    return parts.length ? "?" + parts.join("&") : "";
  }

  function request(method, path, body) {
    return fetch(API + path, {
      method: method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error(data.error || data.message || "CRM request failed.");
        }
        return data;
      });
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function projectIdsFromPath() {
    var match = window.location.pathname.match(
      /\/projects\/([0-9a-fA-F-]{36})\/crm\/?$/,
    );
    return match ? match[1] : null;
  }

  function isCrmPath() {
    return /\/crm\/?$/.test(window.location.pathname);
  }

  function ensureStyles() {
    if (document.getElementById("lgs-crm-style")) {
      return;
    }
    var style = document.createElement("style");
    style.id = "lgs-crm-style";
    style.textContent = [
      "html[data-lgs-crm-page='1'] [data-lgs-crm-hide] { display: none !important; }",
      "#lgs-crm-host {",
      "  position: fixed; top: 0; right: 0; bottom: 0; z-index: 25;",
      "  display: flex; flex-direction: column; gap: 16px;",
      "  overflow: auto; padding: 24px 28px 32px;",
      "  background: var(--color-background-1, #0d0d0d);",
      "  color: var(--color-text-primary, #e5e5e5);",
      "  font: 13px/1.45 ui-sans-serif, system-ui, sans-serif;",
      "}",
      "#lgs-crm-host h1 { margin: 0; font-size: 16px; font-weight: 600; }",
      "#lgs-crm-host .sub { margin: 4px 0 0; color: var(--color-text-secondary, #a3a3a3); }",
      "#lgs-crm-host .err { color: #f87171; }",
      "#lgs-crm-host .panel {",
      "  border: 1px solid var(--color-border-subtle, #262626);",
      "  border-radius: 8px; padding: 12px 14px;",
      "  background: var(--color-background-2, #171717);",
      "}",
      "#lgs-crm-host .panel-grid { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 8px 0 12px; }",
      "#lgs-crm-host label { display: inline-flex; align-items: center; gap: 6px; margin: 0; }",
      "#lgs-crm-host button {",
      "  background: transparent; color: inherit; cursor: pointer;",
      "  border: 1px solid var(--color-border-subtle, #404040);",
      "  border-radius: 6px; padding: 5px 10px;",
      "}",
      "#lgs-crm-host .table-wrap { overflow: auto; border: 1px solid var(--color-border-subtle, #262626); border-radius: 8px; }",
      "#lgs-crm-host table { width: 100%; min-width: 860px; border-collapse: collapse; }",
      "#lgs-crm-host th, #lgs-crm-host td {",
      "  text-align: left; vertical-align: top; padding: 10px 12px;",
      "  border-bottom: 1px solid var(--color-border-subtle, #262626);",
      "}",
      "#lgs-crm-host th { color: var(--color-text-secondary, #a3a3a3); font-weight: 500; }",
      "#lgs-crm-host .muted { color: var(--color-text-tertiary, #737373); }",
      "#lgs-crm-host .chips { display: flex; flex-wrap: wrap; gap: 6px 10px; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  function placeHost(host) {
    var left = 251;
    var home = findHomeLink();
    var sidebar = home && home.closest("aside");
    if (!sidebar && home) {
      sidebar = home.closest("div.flex.h-full.flex-col, div.flex.h-full.w-full.flex-col");
    }
    if (sidebar) {
      var box = sidebar.getBoundingClientRect();
      if (box.width > 48 && box.left < 320) {
        left = Math.round(box.right);
      }
    }
    host.style.left = left + "px";
  }

  function hidePlaneNotFound() {
    document.documentElement.setAttribute("data-lgs-crm-page", "1");
    document.querySelectorAll("h1, h2, p").forEach(function (el) {
      var text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (
        text === "404" ||
        text.indexOf("This page could not be found") !== -1 ||
        text.indexOf("Page not found") !== -1
      ) {
        var wrap = el.closest("div.h-screen, main, [class*='empty']") || el.parentElement;
        if (wrap && wrap.id !== "lgs-crm-host") {
          wrap.setAttribute("data-lgs-crm-hide", "1");
        }
      }
    });
  }

  function render(root, state) {
    if (state.error) {
      root.innerHTML = '<p class="err">' + escapeHtml(state.error) + "</p>";
      return;
    }
    if (!state.me || !state.me.can_view) {
      root.innerHTML = "<p>You do not have permission to view CRM.</p>";
      return;
    }

    var projectId = state.projectId;
    var title = projectId ? "Project CRM" : "CRM";
    var rows = (state.contacts || [])
      .map(function (contact) {
        var projects = (contact.plane_projects || [])
          .map(function (project) {
            return escapeHtml(project.identifier || project.label);
          })
          .join(", ");
        var checks = "";
        if (state.me.is_admin) {
          checks = (state.projects || [])
            .map(function (project) {
              var assigned = (contact.plane_projects || []).some(function (item) {
                return item.id === project.id;
              });
              return (
                '<label><input type="checkbox" data-contact="' +
                contact.id +
                '" data-project="' +
                escapeHtml(project.id) +
                '"' +
                (assigned ? " checked" : "") +
                "> " +
                escapeHtml(project.identifier || project.label) +
                "</label>"
              );
            })
            .join("");
        }
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(contact.name) +
          "</td>" +
          "<td>" +
          escapeHtml(contact.email) +
          "</td>" +
          "<td>" +
          escapeHtml(contact.phone) +
          "</td>" +
          "<td>" +
          escapeHtml(contact.region) +
          "</td>" +
          "<td>" +
          escapeHtml((contact.closest_lgs && contact.closest_lgs.name) || "") +
          "</td>" +
          "<td>" +
          escapeHtml(contact.status) +
          "</td>" +
          "<td>" +
          (state.me.is_admin ? '<div class="chips">' + checks + "</div>" : escapeHtml(projects)) +
          "</td>" +
          "<td>" +
          escapeHtml(contact.notes) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var access = "";
    if (state.me.is_admin) {
      var selected = {};
      (state.viewers || []).forEach(function (viewer) {
        selected[viewer.email] = true;
      });
      var memberBoxes = (state.members || [])
        .filter(function (member) {
          return !member.is_admin;
        })
        .map(function (member) {
          var email = String(member.email || "").toLowerCase();
          return (
            '<label><input type="checkbox" data-viewer-email="' +
            escapeHtml(email) +
            '" data-viewer-id="' +
            escapeHtml(member.id) +
            '"' +
            (selected[email] ? " checked" : "") +
            "> " +
            escapeHtml(member.display_name || email) +
            " (" +
            escapeHtml(email) +
            ")</label>"
          );
        })
        .join("");
      access =
        '<div class="panel"><p class="sub">Who can view CRM. Workspace admins always can.</p>' +
        '<div class="panel-grid">' +
        memberBoxes +
        '</div><button type="button" id="lgs-crm-save-viewers">Save access</button></div>';
    }

    root.innerHTML =
      "<div><h1>" +
      title +
      "</h1>" +
      '<p class="sub">Shared with the LGS admin CRM. No WhatsApp or Bumble logs here.</p></div>' +
      access +
      '<div class="table-wrap"><table><thead><tr>' +
      "<th>Contact</th><th>Email</th><th>Phone</th><th>Region</th><th>Closest LGS</th><th>Status</th><th>Projects</th><th>Notes</th>" +
      "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="8" class="muted">No contacts yet.</td></tr>') +
      "</tbody></table></div>";

    root.querySelectorAll("input[data-contact]").forEach(function (input) {
      input.addEventListener("change", function () {
        var id = input.getAttribute("data-contact");
        var chosen = [];
        root.querySelectorAll('input[data-contact="' + id + '"]').forEach(function (box) {
          if (box.checked) {
            chosen.push(box.getAttribute("data-project"));
          }
        });
        request("PATCH", "/contacts/" + id + "/plane-projects", {
          plane_project_ids: chosen,
        }).catch(function (error) {
          window.alert(error.message);
        });
      });
    });

    var save = root.querySelector("#lgs-crm-save-viewers");
    if (save) {
      save.addEventListener("click", function () {
        var viewers = [];
        root.querySelectorAll("input[data-viewer-email]").forEach(function (box) {
          if (box.checked) {
            viewers.push({
              email: box.getAttribute("data-viewer-email"),
              plane_user_id: box.getAttribute("data-viewer-id"),
            });
          }
        });
        request("PUT", "/viewers", { viewers: viewers })
          .then(function () {
            return load(root);
          })
          .catch(function (error) {
            window.alert(error.message);
          });
      });
    }
  }

  function load(root) {
    var projectId = projectIdsFromPath();
    root.innerHTML = "Loading CRM…";
    return request("GET", "/me")
      .then(function (me) {
        if (!me.can_view) {
          render(root, { me: me, contacts: [], projectId: projectId });
          return null;
        }
        var viewers = Promise.resolve({ viewers: [] });
        var members = Promise.resolve({ members: me.members || [] });
        if (me.is_admin) {
          viewers = request("GET", "/viewers");
          members = request("GET", "/members").catch(function () {
            return { members: me.members || [] };
          });
        }
        return Promise.all([
          request("GET", "/contacts" + qs({ plane_project_id: projectId })),
          viewers,
          members,
          Promise.resolve(me),
        ]);
      })
      .then(function (bundle) {
        if (!bundle) {
          return;
        }
        render(root, {
          contacts: bundle[0].contacts,
          projects: bundle[0].projects,
          viewers: bundle[1].viewers,
          members: bundle[2].members,
          me: bundle[3],
          projectId: projectId,
        });
      })
      .catch(function (error) {
        render(root, { error: error.message });
      });
  }

  function mount(root) {
    if (!root) {
      return;
    }
    load(root);
  }

  function findMain() {
    ensureStyles();
    hidePlaneNotFound();
    var host = document.getElementById("lgs-crm-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "lgs-crm-host";
      host.setAttribute("data-lgs-crm-root", "1");
      document.body.appendChild(host);
    }
    placeHost(host);
    return host;
  }

  function findHomeLink() {
    var links = document.querySelectorAll("a[href]");
    for (var i = 0; i < links.length; i += 1) {
      var href = links[i].getAttribute("href") || "";
      var text = (links[i].textContent || "").replace(/\s+/g, " ").trim();
      if (text === "Home" && /\/lgs\/?$/.test(href.split("?")[0])) {
        return links[i];
      }
    }
    return document.querySelector('a[href$="/lgs/"], a[href$="/lgs"]');
  }

  function setNavActive(link, active) {
    if (!link) {
      return;
    }
    var item = link.querySelector("div.group.relative") || link.firstElementChild || link;
    var classes = (item.getAttribute("class") || "")
      .replace(/!?bg-layer-transparent-active/g, "")
      .replace(/\btext-primary\b/g, "")
      .replace(/\btext-secondary\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    item.setAttribute(
      "class",
      (classes + (active ? " !bg-layer-transparent-active text-primary" : " text-secondary")).trim(),
    );
  }

  function syncSidebarActive() {
    var onCrm = isCrmPath();
    document.querySelectorAll("[data-lgs-crm-link]").forEach(function (link) {
      setNavActive(link, onCrm && !projectIdsFromPath());
    });
    document.querySelectorAll("[data-lgs-project-crm]").forEach(function (link) {
      var href = (link.getAttribute("href") || "").replace(/\/$/, "");
      var path = window.location.pathname.replace(/\/$/, "");
      setNavActive(link, path === href);
    });
  }

  function ensureSidebar() {
    if (!window.__lgsCrmCanView) {
      return;
    }
    if (!document.querySelector("[data-lgs-crm-link]")) {
      var home = findHomeLink();
      if (home && home.parentNode) {
        var link = home.cloneNode(true);
        link.setAttribute("data-lgs-crm-link", "1");
        link.setAttribute("href", "/lgs/crm");
        var label = link.querySelector("p");
        if (label) {
          label.textContent = "CRM";
        }
        home.insertAdjacentElement("afterend", link);
      }
    }

    document.querySelectorAll('a[href*="/projects/"][href$="/roles"]').forEach(function (roles) {
      if (roles.parentElement && roles.parentElement.querySelector("[data-lgs-project-crm]")) {
        return;
      }
      var href = roles.getAttribute("href") || "";
      var match = href.match(/(\/[^/]+\/projects\/[0-9a-fA-F-]{36})\/roles/);
      if (!match) {
        return;
      }
      var projectLink = roles.cloneNode(true);
      projectLink.setAttribute("href", match[1] + "/crm");
      projectLink.setAttribute("data-lgs-project-crm", "1");
      var projectLabel = projectLink.querySelector("p");
      if (projectLabel) {
        projectLabel.textContent = "CRM";
      }
      roles.insertAdjacentElement("afterend", projectLink);
    });
    syncSidebarActive();
  }

  function refreshMe() {
    return request("GET", "/me")
      .then(function (me) {
        window.__lgsCrmMeResolved = true;
        window.__lgsCrmCanView = !!me.can_view;
        ensureSidebar();
        if (isCrmPath() && me.can_view) {
          var main = findMain();
          if (main && !main.getAttribute("data-lgs-crm-mounted")) {
            main.setAttribute("data-lgs-crm-mounted", "1");
            mount(main);
          } else if (main) {
            placeHost(main);
          }
        } else {
          var extra = document.getElementById("lgs-crm-host");
          if (extra && !isCrmPath()) {
            extra.remove();
            document.documentElement.removeAttribute("data-lgs-crm-page");
          }
        }
        return me;
      })
      .catch(function () {});
  }

  window.LgsCrm = { mount: mount, bootOverlay: refreshMe };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshMe);
  } else {
    refreshMe();
  }
  window.setInterval(function () {
    if (!window.__lgsCrmMeResolved) {
      refreshMe();
    }
    ensureSidebar();
    if (isCrmPath() && window.__lgsCrmCanView) {
      var pane = findMain();
      if (pane && !pane.getAttribute("data-lgs-crm-mounted")) {
        pane.setAttribute("data-lgs-crm-mounted", "1");
        mount(pane);
      } else if (pane) {
        placeHost(pane);
        hidePlaneNotFound();
      }
    } else if (!isCrmPath()) {
      var leftover = document.getElementById("lgs-crm-host");
      if (leftover) leftover.remove();
      document.documentElement.removeAttribute("data-lgs-crm-page");
    }
  }, 2000);
  window.addEventListener("resize", function () {
    var host = document.getElementById("lgs-crm-host");
    if (host) {
      placeHost(host);
    }
  });
})();
