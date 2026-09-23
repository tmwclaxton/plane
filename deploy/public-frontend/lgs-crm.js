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
          (state.me.is_admin ? checks : escapeHtml(projects)) +
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
        '<div class="panel"><p class="sub">Who can view CRM (workspace admins always can)</p>' +
        memberBoxes +
        '<div><button type="button" id="lgs-crm-save-viewers">Save access</button></div></div>';
    }

    root.innerHTML =
      "<h1>" +
      title +
      "</h1>" +
      '<p class="sub">Shared with the LGS admin CRM. No WhatsApp or Bumble logs here.</p>' +
      access +
      "<table><thead><tr>" +
      "<th>Contact</th><th>Email</th><th>Phone</th><th>Region</th><th>Closest LGS</th><th>Status</th><th>Projects</th><th>Notes</th>" +
      "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="8" class="muted">No contacts yet.</td></tr>') +
      "</tbody></table>";

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
    return (
      document.querySelector("[data-lgs-crm-root]") ||
      document.querySelector("main") ||
      document.querySelector("#content") ||
      document.querySelector(".h-full.w-full.overflow-auto")
    );
  }

  function ensureSidebar() {
    if (!window.__lgsCrmCanView) {
      return;
    }
    var home = document.querySelector('a[href$="/lgs/"], a[href$="/lgs"]');
    var nav = home && home.parentElement && home.parentElement.parentElement;
    if (!nav || nav.querySelector("[data-lgs-crm-link]")) {
      return;
    }
    var link = document.createElement("a");
    link.href = "/lgs/crm";
    link.setAttribute("data-lgs-crm-link", "1");
    link.textContent = "CRM";
    link.style.cssText =
      "display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:6px;color:inherit;text-decoration:none;font-size:13px;";
    if (home && home.parentElement) {
      home.parentElement.insertAdjacentElement("afterend", link);
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
      var projectLink = document.createElement("a");
      projectLink.href = match[1] + "/crm";
      projectLink.setAttribute("data-lgs-project-crm", "1");
      projectLink.textContent = "CRM";
      projectLink.style.cssText = roles.getAttribute("style") || link.style.cssText;
      roles.insertAdjacentElement("afterend", projectLink);
    });
  }

  function bootOverlay() {
    request("GET", "/me")
      .then(function (me) {
        window.__lgsCrmCanView = !!me.can_view;
        ensureSidebar();
        if (isCrmPath() && me.can_view) {
          var main = findMain();
          if (!main) {
            return;
          }
          main.setAttribute("data-lgs-crm-root", "1");
          mount(main);
        }
      })
      .catch(function () {});
  }

  window.LgsCrm = { mount: mount, bootOverlay: bootOverlay };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootOverlay);
  } else {
    bootOverlay();
  }
  window.setInterval(ensureSidebar, 2000);
})();
