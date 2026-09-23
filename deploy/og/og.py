"""Link-preview HTML for plane.canvassr.org.

Chat apps only read the first HTML response. Plane's web app is a static
shell, so every URL otherwise unfurls as the generic Plane card. This serves
an LGS card whose title and description name the project, doc, or work item.
"""

from __future__ import annotations

import json
import os
import re
import time
from html import escape
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, quote, unquote, urlparse

import psycopg

ORIGIN = os.environ.get("PUBLIC_ORIGIN", "https://plane.canvassr.org").rstrip("/")
IMAGE_PATH = "/lgs-og.png"
IMAGE_FILE = Path(__file__).with_name("lgs-og.png")
PORT = int(os.environ.get("PORT", "8080"))

SECTIONS = {
    "issues": "Work items",
    "pages": "Docs",
    "cycles": "Cycles",
    "roles": "Roles",
    "crm": "CRM",
    "views": "Views",
    "modules": "Modules",
    "intake": "Intake",
    "archives": "Archive",
    "settings": "Settings",
}


def connect():
    return psycopg.connect(
        host=os.environ.get("PGHOST", "plane-db"),
        port=os.environ.get("POSTGRES_PORT", "5432"),
        dbname=os.environ.get("PGDATABASE") or os.environ.get("POSTGRES_DB", "plane"),
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
        connect_timeout=3,
    )


def one(cur, sql: str, params: tuple):
    cur.execute(sql, params)
    return cur.fetchone()


def home() -> tuple[str, str]:
    return (
        "Let's Go Social",
        "Meetups for ages 20 to 35 in London, Wycombe and Gloucestershire.",
    )


def describe(path: str) -> tuple[str, str]:
    parts = [unquote(part) for part in path.split("/") if part]
    if len(parts) < 2:
        return home()

    section = parts[1]
    if section == "projects" and len(parts) == 2:
        return (
            "Projects",
            "London, Wycombe, Gloucestershire and General projects in Let's Go Social.",
        )
    if section == "stickies":
        return ("Stickies", "Notes on the Let's Go Social home.")
    if section == "crm":
        return ("CRM", "Let's Go Social contacts.")
    if section == "active-cycles":
        return ("Active cycles", "Current meetup cycles in Let's Go Social.")
    if section == "browse" and len(parts) >= 3 and "-" in parts[2]:
        identifier, _, sequence = parts[2].partition("-")
        if sequence.isdigit():
            return work_item_by_key(identifier, int(sequence))
    if section != "projects" or len(parts) < 3:
        return home()

    project_id = parts[2]
    with connect() as conn:
        with conn.cursor() as cur:
            project = one(
                cur,
                """
                SELECT name, identifier
                FROM projects
                WHERE id = %s AND deleted_at IS NULL
                """,
                (project_id,),
            )
            if project is None:
                return home()
            project_name, identifier = project
            if len(parts) == 3:
                return (project_name, f"Project {identifier} in Let's Go Social.")

            kind = parts[3]
            if kind == "pages" and len(parts) >= 5:
                page = one(
                    cur,
                    """
                    SELECT name
                    FROM pages
                    WHERE id = %s AND deleted_at IS NULL
                    """,
                    (parts[4],),
                )
                if page is not None:
                    return (page[0], f"Doc in {project_name}.")
            if kind == "pages":
                return (f"Docs · {project_name}", f"Docs in the {project_name} project.")
            if kind == "issues" and len(parts) >= 5:
                issue = one(
                    cur,
                    """
                    SELECT name, sequence_id
                    FROM issues
                    WHERE id = %s AND deleted_at IS NULL
                    """,
                    (parts[4],),
                )
                if issue is not None:
                    return (f"{identifier}-{issue[1]} {issue[0]}", f"Work item in {project_name}.")
            if kind == "issues":
                return (f"Work items · {project_name}", f"Work items in the {project_name} project.")
            if kind == "cycles" and len(parts) >= 5:
                cycle = one(
                    cur,
                    """
                    SELECT name
                    FROM cycles
                    WHERE id = %s AND deleted_at IS NULL
                    """,
                    (parts[4],),
                )
                if cycle is not None:
                    return (cycle[0], f"Cycle in {project_name}.")
            if kind == "cycles":
                return (f"Cycles · {project_name}", f"Cycles in the {project_name} project.")
            if kind == "roles":
                return (f"Roles · {project_name}", f"Roles in the {project_name} project.")

            label = SECTIONS.get(kind, kind.replace("-", " ").capitalize())
            return (f"{label} · {project_name}", f"{label} in the {project_name} project.")


def work_item_by_key(identifier: str, sequence: int) -> tuple[str, str]:
    with connect() as conn:
        with conn.cursor() as cur:
            row = one(
                cur,
                """
                SELECT issues.name, projects.name
                FROM issues
                JOIN projects ON projects.id = issues.project_id
                WHERE projects.identifier = %s
                  AND issues.sequence_id = %s
                  AND issues.deleted_at IS NULL
                  AND projects.deleted_at IS NULL
                """,
                (identifier.upper(), sequence),
            )
    if row is None:
        return home()
    return (f"{identifier.upper()}-{sequence} {row[0]}", f"Work item in {row[1]}.")


def page(title: str, description: str, url: str) -> bytes:
    safe_title = escape(title)
    safe_description = escape(description)
    safe_url = escape(url, quote=True)
    image = escape(f"{ORIGIN}{IMAGE_PATH}", quote=True)
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{safe_title}</title>
  <meta name="description" content="{safe_description}">
  <meta property="og:site_name" content="Let's Go Social">
  <meta property="og:type" content="website">
  <meta property="og:title" content="{safe_title}">
  <meta property="og:description" content="{safe_description}">
  <meta property="og:url" content="{safe_url}">
  <meta property="og:image" content="{image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Let's Go Social">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{safe_title}">
  <meta name="twitter:description" content="{safe_description}">
  <meta name="twitter:image" content="{image}">
</head>
<body>
  <p>{safe_title}</p>
  <p>{safe_description}</p>
</body>
</html>
"""
    return html.encode()


PAGE_RE = re.compile(
    r"^/([^/]+)/projects/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
    r"/pages/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/?$"
)
PUBLIC_API_RE = re.compile(
    r"^/public/pages/([^/]+)/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"
    r"/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:/(state|presence))?/?$"
)
TAB_RE = re.compile(r"^[a-z0-9]{6,32}$")
PRESENCE_TTL = 20
PRESENCE: dict[tuple[str, str, str, str, str], dict[str, str | float]] = {}
PRESENCE_LOCK = Lock()
SESSION_KEY_RE = re.compile(r"^[a-z0-9]{32,128}$")
BOT_RE = re.compile(
    r"facebookexternalhit|Facebot|Twitterbot|Slackbot|Slack-ImgProxy|LinkedInBot|Discordbot|"
    r"WhatsApp|TelegramBot|SkypeUriPreview|Applebot|iMessage|Googlebot|bingbot|redditbot|"
    r"Embedly|Iframely|Pinterest|vkShare|Quora|DuckDuckBot|Baiduspider|YandexBot|Snapchat|Viber|embedly",
    re.IGNORECASE,
)
UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)

ALLOWED_TAGS = {
    "p", "br", "span", "strong", "b", "em", "i", "u", "s", "a",
    "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "pre", "code", "img", "table", "thead", "tbody",
    "tr", "th", "td", "hr", "div", "mark", "sub", "sup",
}
VOID_TAGS = {"br", "img", "hr"}
SKIP_TAGS = {"script", "style", "iframe", "object", "embed", "form", "svg", "link", "meta"}


def session_user(cur, cookie_header: str | None) -> str | None:
    if not cookie_header:
        return None
    key = None
    for part in cookie_header.split(";"):
        name, _, value = part.strip().partition("=")
        if name == "session-id":
            key = unquote(value).strip('"')
            break
    if key is None or SESSION_KEY_RE.fullmatch(key) is None:
        return None
    row = one(
        cur,
        """
        SELECT user_id
        FROM sessions
        WHERE session_key = %s AND expire_date > now()
        """,
        (key,),
    )
    if row is None or not row[0] or UUID_RE.fullmatch(row[0]) is None:
        return None
    return row[0]


def member_role(cur, slug: str, project_id: str, user_id: str) -> int:
    row = one(
        cur,
        """
        SELECT pm.role
        FROM project_members pm
        JOIN projects p ON p.id = pm.project_id
        JOIN workspaces w ON w.id = p.workspace_id
        WHERE pm.member_id = %s::uuid
          AND pm.project_id = %s::uuid
          AND w.slug = %s
          AND pm.deleted_at IS NULL
          AND pm.is_active = true
          AND p.deleted_at IS NULL
        """,
        (user_id, project_id, slug),
    )
    role = int(row[0]) if row else 0
    admin = one(
        cur,
        """
        SELECT 1
        FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.member_id = %s::uuid
          AND w.slug = %s
          AND wm.deleted_at IS NULL
          AND wm.is_active = true
          AND wm.role >= 20
        """,
        (user_id, slug),
    )
    if admin is not None:
        return max(role, 20)
    return role


def load_page(cur, slug: str, project_id: str, page_id: str):
    return one(
        cur,
        """
        SELECT pages.name, pages.description_html, pages.view_props, projects.name, pages.is_locked
        FROM pages
        JOIN project_pages
          ON project_pages.page_id = pages.id
         AND project_pages.deleted_at IS NULL
         AND project_pages.project_id = %s::uuid
        JOIN projects
          ON projects.id = project_pages.project_id
         AND projects.deleted_at IS NULL
        JOIN workspaces ON workspaces.id = projects.workspace_id
        WHERE pages.id = %s::uuid
          AND projects.id = %s::uuid
          AND workspaces.slug = %s
          AND pages.deleted_at IS NULL
        """,
        (project_id, page_id, project_id, slug),
    )


def is_internet_public(view_props) -> bool:
    return isinstance(view_props, dict) and view_props.get("internet_public") is True


def user_label(cur, user_id: str) -> tuple[str, str]:
    row = one(
        cur,
        """
        SELECT first_name, display_name, avatar
        FROM users
        WHERE id = %s::uuid
        """,
        (user_id,),
    )
    if row is None:
        return ("", "")
    name = (row[0] or "").strip() or (row[1] or "").strip()
    avatar = row[2] or ""
    if not avatar.startswith("https://"):
        avatar = ""
    return (name, avatar)


def prune_presence(now: float) -> None:
    stale = [key for key, value in PRESENCE.items() if now - float(value["seen"]) > PRESENCE_TTL]
    for key in stale:
        del PRESENCE[key]


def current_viewers(slug: str, project_id: str, page_id: str, user_id: str) -> list[dict[str, str]]:
    found: dict[str, dict[str, str]] = {}
    for key, value in PRESENCE.items():
        if key[0] != slug or key[1] != project_id or key[2] != page_id or key[3] == user_id:
            continue
        found[key[3]] = {"id": key[3], "name": str(value["name"]), "avatar": str(value["avatar"])}
    return sorted(found.values(), key=lambda item: item["name"].lower())


def viewers_for(slug: str, project_id: str, page_id: str, user_id: str) -> list[dict[str, str]]:
    with PRESENCE_LOCK:
        prune_presence(time.time())
        return current_viewers(slug, project_id, page_id, user_id)


def mark_presence(
    slug: str,
    project_id: str,
    page_id: str,
    user_id: str,
    tab: str,
    name: str,
    avatar: str,
    leave: bool,
) -> list[dict[str, str]]:
    with PRESENCE_LOCK:
        prune_presence(time.time())
        key = (slug, project_id, page_id, user_id, tab)
        if leave:
            PRESENCE.pop(key, None)
        else:
            PRESENCE[key] = {"name": name, "avatar": avatar, "seen": time.time()}
        return current_viewers(slug, project_id, page_id, user_id)


def safe_url(value: str) -> str | None:
    cleaned = value.strip()
    lower = cleaned.lower()
    if lower.startswith(("https://", "http://", "mailto:")):
        return cleaned
    if cleaned.startswith("/") and not cleaned.startswith("//") and not cleaned.lower().startswith("/\\"):
        return cleaned
    return None


def clean_attrs(tag: str, attrs: list[tuple[str, str | None]]) -> list[tuple[str, str]]:
    kept: list[tuple[str, str]] = []
    for name, value in attrs:
        if value is None:
            continue
        key = name.lower()
        if key.startswith("on"):
            continue
        if tag == "a" and key == "href":
            href = safe_url(value)
            if href:
                kept.append(("href", href))
                kept.append(("rel", "noopener noreferrer"))
        elif tag == "img" and key == "src":
            src = safe_url(value)
            if src:
                kept.append(("src", src))
        elif tag == "img" and key == "alt":
            kept.append(("alt", value))
        elif tag in {"td", "th"} and key in {"colspan", "rowspan"} and value.isdigit():
            kept.append((key, value))
    return kept


class Sanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.stack: list[str] = []
        self.skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._open(tag, attrs, closing=False)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self._open(tag, attrs, closing=True)

    def _open(self, tag: str, attrs: list[tuple[str, str | None]], closing: bool) -> None:
        tag = tag.lower()
        if tag in SKIP_TAGS:
            if not closing:
                self.skip_depth += 1
            return
        if self.skip_depth or tag not in ALLOWED_TAGS:
            return
        rendered = "".join(
            f' {name}="{escape(value, quote=True)}"' for name, value in clean_attrs(tag, attrs)
        )
        if tag in VOID_TAGS or closing:
            self.parts.append(f"<{tag}{rendered}>")
            return
        self.parts.append(f"<{tag}{rendered}>")
        self.stack.append(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in SKIP_TAGS:
            if self.skip_depth:
                self.skip_depth -= 1
            return
        if self.skip_depth or tag not in ALLOWED_TAGS or tag in VOID_TAGS:
            return
        if tag not in self.stack:
            return
        while self.stack:
            open_tag = self.stack.pop()
            self.parts.append(f"</{open_tag}>")
            if open_tag == tag:
                break

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        self.parts.append(escape(data))

    def finish(self) -> str:
        while self.stack:
            self.parts.append(f"</{self.stack.pop()}>")
        return "".join(self.parts)


def sanitize_html(raw: str | None) -> str:
    if not raw:
        return ""
    parser = Sanitizer()
    parser.feed(raw)
    parser.close()
    return parser.finish()


def shell(title: str, project: str, body: str, sign_in: str) -> bytes:
    safe_title = escape(title)
    safe_project = escape(project)
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{safe_title}</title>
  <style>
    body {{
      margin: 0;
      background: #F7F3E8;
      color: #1A4326;
      font: 18px/1.55 Georgia, "Iowan Old Style", Palatino, serif;
    }}
    header, main, footer {{
      max-width: 42rem;
      margin: 0 auto;
      padding: 0 1.25rem;
    }}
    header {{
      padding-top: 2rem;
    }}
    .mark {{
      margin: 0;
      font: 700 13px/1.2 Arial, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }}
    .project {{
      margin: 0.35rem 0 0;
      color: #3d6b48;
      font: 600 14px/1.3 Arial, sans-serif;
    }}
    h1 {{
      margin: 1.25rem 0 0.25rem;
      font: 700 2rem/1.15 Arial, sans-serif;
    }}
    .badge {{
      display: inline-block;
      margin: 0;
      padding: 0.15rem 0.55rem;
      border-radius: 999px;
      background: #C6E27A;
      font: 700 12px/1.4 Arial, sans-serif;
    }}
    article {{
      padding-bottom: 2rem;
    }}
    article p {{ margin: 0.8rem 0; }}
    article h1, article h2, article h3, article h4 {{
      font-family: Arial, sans-serif;
      line-height: 1.2;
    }}
    article a {{ color: #1A4326; }}
    article img {{ max-width: 100%; height: auto; }}
    article ul, article ol {{ padding-left: 1.25rem; }}
    article blockquote {{
      margin: 1rem 0;
      padding-left: 0.9rem;
      border-left: 3px solid #C6E27A;
    }}
    article pre, article code {{
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 0.9em;
    }}
    footer {{
      padding-bottom: 3rem;
      font: 14px/1.4 Arial, sans-serif;
    }}
    footer a {{ color: #1A4326; }}
  </style>
</head>
<body>
  <header>
    <p class="mark">Let's Go Social</p>
    <p class="project">{safe_project}</p>
    <h1>{safe_title}</h1>
    <p class="badge">View only</p>
  </header>
  <main>
    <article>{body}</article>
  </main>
  <footer><a href="{escape(sign_in, quote=True)}">Sign in to edit</a></footer>
</body>
</html>
"""
    return html.encode()


def unavailable_page(sign_in: str) -> bytes:
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Doc not shared</title>
  <style>
    body {{
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #F7F3E8;
      color: #1A4326;
      font: 18px/1.5 Georgia, Palatino, serif;
    }}
    main {{ max-width: 28rem; padding: 2rem; }}
    p.mark {{
      margin: 0;
      font: 700 13px/1.2 Arial, sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }}
    a {{ color: #1A4326; }}
  </style>
</head>
<body>
  <main>
    <p class="mark">Let's Go Social</p>
    <h1>This doc is not shared publicly.</h1>
    <p><a href="{escape(sign_in, quote=True)}">Sign in</a> if you have an account.</p>
  </main>
</body>
</html>
"""
    return html.encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/crm-api"):
            self.crm()
            return
        self.respond()

    def do_HEAD(self) -> None:  # noqa: N802
        if self.path.startswith("/crm-api"):
            self.crm(head=True)
            return
        self.respond(head=True)

    def do_PATCH(self) -> None:  # noqa: N802
        self.crm()

    def do_PUT(self) -> None:  # noqa: N802
        self.crm()

    def crm(self, head: bool = False) -> None:
        import crm as crm_proxy

        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0") or "0")
        raw = self.rfile.read(length) if length > 0 else b""
        code, payload = crm_proxy.handle_crm(
            self.command,
            parsed.path,
            parsed.query,
            self.headers.get("Cookie"),
            raw,
        )
        if isinstance(payload, tuple):
            kind, body_text = payload
            body = body_text.encode()
            self.send_response(code)
            self.send_header(
                "Content-Type",
                "application/javascript; charset=utf-8" if kind == "js" else "text/html; charset=utf-8",
            )
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not head:
                self.wfile.write(body)
            return
        self.send_json(code, payload, head=head)

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        match = PUBLIC_API_RE.fullmatch(parsed.path)
        if match is None or match.group(4) == "state":
            self.send_error(404)
            return
        if match.group(4) == "presence":
            self.update_presence(match.group(1), match.group(2), match.group(3), parsed.query)
            return
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length < 0 or length > 1024:
            self.send_error(400)
            return
        raw = self.rfile.read(length) if length else b""
        try:
            payload = json.loads(raw.decode() or "{}")
            enabled = payload["internet_public"]
            if not isinstance(enabled, bool):
                raise ValueError
        except (json.JSONDecodeError, KeyError, ValueError, UnicodeDecodeError):
            self.send_json(400, {"error": "Expected internet_public true or false."})
            return
        slug, project_id, page_id = match.group(1), match.group(2), match.group(3)
        try:
            with connect() as conn:
                with conn.cursor() as cur:
                    user_id = session_user(cur, self.headers.get("Cookie"))
                    if user_id is None:
                        self.send_json(401, {"error": "Sign in to share this doc."})
                        return
                    if member_role(cur, slug, project_id, user_id) < 15:
                        self.send_json(403, {"error": "You cannot share this doc."})
                        return
                    page_row = load_page(cur, slug, project_id, page_id)
                    if page_row is None:
                        self.send_json(404, {"error": "Doc not found."})
                        return
                    if page_row[4]:
                        self.send_json(400, {"error": "Unlock the doc before sharing it."})
                        return
                    cur.execute(
                        """
                        UPDATE pages
                        SET view_props = COALESCE(view_props, '{}'::jsonb)
                          || jsonb_build_object('internet_public', %s::boolean),
                            updated_at = now()
                        WHERE id = %s::uuid
                          AND deleted_at IS NULL
                        """,
                        (enabled, page_id),
                    )
        except Exception:
            self.send_json(500, {"error": "Could not update the public link."})
            return
        self.send_json(200, {"internet_public": enabled})

    def send_json(self, code: int, payload: dict, head: bool = False) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def send_html(self, code: int, body: bytes, head: bool = False) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'",
        )
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def update_presence(self, slug: str, project_id: str, page_id: str, query: str) -> None:
        params = parse_qs(query)
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length < 0 or length > 1024:
            self.send_error(400)
            return
        raw = self.rfile.read(length) if length else b""
        payload: dict = {}
        if raw:
            try:
                parsed = json.loads(raw.decode())
                if not isinstance(parsed, dict):
                    raise ValueError
                payload = parsed
            except (json.JSONDecodeError, ValueError, UnicodeDecodeError):
                self.send_json(400, {"error": "Could not read presence."})
                return
        tab = str(payload.get("tab") or (params.get("tab") or [""])[0])
        leave = payload.get("leave") is True or (params.get("leave") or ["0"])[0] == "1"
        if TAB_RE.fullmatch(tab) is None:
            self.send_json(400, {"error": "Could not read presence."})
            return
        try:
            with connect() as conn:
                with conn.cursor() as cur:
                    user_id = session_user(cur, self.headers.get("Cookie"))
                    if user_id is None or member_role(cur, slug, project_id, user_id) < 5:
                        self.send_json(401, {"viewers": []})
                        return
                    if load_page(cur, slug, project_id, page_id) is None:
                        self.send_json(404, {"viewers": []})
                        return
                    name, avatar = user_label(cur, user_id)
        except Exception:
            self.send_json(500, {"viewers": []})
            return
        self.send_json(
            200,
            {"viewers": mark_presence(slug, project_id, page_id, user_id, tab, name, avatar, leave)},
        )

    def public_state(self, slug: str, project_id: str, page_id: str) -> None:
        try:
            with connect() as conn:
                with conn.cursor() as cur:
                    user_id = session_user(cur, self.headers.get("Cookie"))
                    if user_id is None:
                        self.send_json(401, {"error": "Sign in required."})
                        return
                    page_row = load_page(cur, slug, project_id, page_id)
                    if page_row is None or member_role(cur, slug, project_id, user_id) < 15:
                        self.send_json(404, {"error": "Doc not found."})
                        return
                    self.send_json(
                        200,
                        {
                            "internet_public": is_internet_public(page_row[2]),
                            "can_share": not bool(page_row[4]),
                        },
                    )
        except Exception:
            self.send_json(500, {"error": "Could not load the public link."})

    def public_document(self, slug: str, project_id: str, page_id: str, head: bool) -> None:
        sign_in = f"/?next_path={quote(f'/{slug}/projects/{project_id}/pages/{page_id}/')}"
        try:
            with connect() as conn:
                with conn.cursor() as cur:
                    page_row = load_page(cur, slug, project_id, page_id)
        except Exception:
            page_row = None
        if page_row is None or not is_internet_public(page_row[2]):
            self.send_html(404, unavailable_page(sign_in), head=head)
            return
        name, description_html, _view_props, project_name, _locked = page_row
        self.send_html(
            200,
            shell(
                name or "Doc",
                project_name or "Let's Go Social",
                sanitize_html(description_html),
                sign_in,
            ),
            head=head,
        )

    def respond(self, head: bool = False) -> None:
        parsed = urlparse(self.path)
        api = PUBLIC_API_RE.fullmatch(parsed.path)
        if api is not None:
            slug, project_id, page_id, kind = api.group(1), api.group(2), api.group(3), api.group(4)
            if kind == "state":
                self.public_state(slug, project_id, page_id)
            elif kind == "presence":
                self.send_json(405, {"error": "Use POST to update who is viewing."})
            else:
                self.public_document(slug, project_id, page_id, head)
            return

        doc = PAGE_RE.fullmatch(parsed.path)
        if doc is not None and BOT_RE.search(self.headers.get("User-Agent", "")) is None:
            self.public_document(doc.group(1), doc.group(2), doc.group(3), head)
            return

        if parsed.path == IMAGE_PATH:
            body = IMAGE_FILE.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Cache-Control", "public, max-age=86400")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if not head:
                self.wfile.write(body)
            return

        try:
            title, description = describe(parsed.path)
        except Exception:
            title, description = home()
        target = f"{ORIGIN}{parsed.path}"
        if parsed.query:
            target = f"{target}?{parsed.query}"
        body = page(title, description, target)
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "public, max-age=300")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}", flush=True)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
