"""Plane CRM proxy: session cookie -> LGS /api/plane-crm."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

def _plane():
    import og as plane

    return plane

LGS_API_URL = os.environ.get("LGS_API_URL", "https://letsgosocial.co.uk").rstrip("/")
LGS_PLANE_CRM_TOKEN = os.environ.get("LGS_PLANE_CRM_TOKEN", "")
WORKSPACE_SLUG = os.environ.get("LGS_PLANE_WORKSPACE", "lgs")

CRM_API_RE = re.compile(
    r"^/crm-api(?:/(me|contacts|viewers|members|app|app\.js)"
    r"(?:/(\d+)/plane-projects)?)?/?$"
)
APP_JS = Path(__file__).with_name("lgs-crm.js")


def user_email(cur, user_id: str) -> tuple[str | None, str | None]:
    row = _plane().one(
        cur,
        """
        SELECT email, display_name
        FROM users
        WHERE id = %s::uuid AND is_active = true
        """,
        (user_id,),
    )
    if row is None:
        return None, None
    return row[0], row[1]


def is_workspace_admin(cur, user_id: str, slug: str) -> bool:
    row = _plane().one(
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
    return row is not None


def workspace_members(cur, slug: str) -> list[dict[str, Any]]:
    cur.execute(
        """
        SELECT u.id::text, u.email, u.display_name, wm.role
        FROM workspace_members wm
        JOIN workspaces w ON w.id = wm.workspace_id
        JOIN users u ON u.id = wm.member_id
        WHERE w.slug = %s
          AND wm.deleted_at IS NULL
          AND wm.is_active = true
          AND u.email IS NOT NULL
          AND u.email <> ''
        ORDER BY u.display_name
        """,
        (slug,),
    )
    return [
        {
            "id": row[0],
            "email": row[1],
            "display_name": row[2],
            "role": int(row[3]),
            "is_admin": int(row[3]) >= 20,
        }
        for row in cur.fetchall()
    ]


def lgs_request(
    method: str,
    path: str,
    email: str,
    user_id: str,
    is_admin: bool,
    query: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[int, dict[str, Any]]:
    if LGS_PLANE_CRM_TOKEN == "":
        return 503, {"error": "Plane CRM token is not configured."}

    url = f"{LGS_API_URL}/api/plane-crm/{path.lstrip('/')}"
    if query:
        url = f"{url}?{urlencode(query)}"
    data = None if body is None else json.dumps(body).encode()
    request = Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {LGS_PLANE_CRM_TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "X-Plane-User-Email": email,
            "X-Plane-User-Id": user_id,
            "X-Plane-Is-Admin": "true" if is_admin else "false",
        },
    )
    try:
        with urlopen(request, timeout=15) as response:
            raw = response.read().decode()
            payload = json.loads(raw) if raw else {}
            return response.status, payload
    except HTTPError as exc:
        raw = exc.read().decode() if exc.fp else ""
        try:
            payload = json.loads(raw) if raw else {"error": exc.reason}
        except json.JSONDecodeError:
            payload = {"error": raw or str(exc.reason)}
        return exc.code, payload
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        return 502, {"error": f"Could not reach LGS CRM: {exc}"}


def identity_from_session(cookie: str | None, project_id: str | None) -> tuple[int, dict[str, Any]]:
    try:
        plane = _plane()
        with plane.connect() as conn:
            with conn.cursor() as cur:
                user_id = plane.session_user(cur, cookie)
                if user_id is None:
                    return 401, {"error": "Sign in to view CRM."}
                email, display_name = user_email(cur, user_id)
                if not email:
                    return 403, {"error": "Your Plane account needs an email address."}
                admin = is_workspace_admin(cur, user_id, WORKSPACE_SLUG)
                if project_id and plane.UUID_RE.fullmatch(project_id) and not admin:
                    if plane.member_role(cur, WORKSPACE_SLUG, project_id, user_id) < 5:
                        return 403, {"error": "Join this project to view its CRM."}
                members = workspace_members(cur, WORKSPACE_SLUG) if admin else []
                return 200, {
                    "user_id": user_id,
                    "email": email,
                    "display_name": display_name,
                    "is_admin": admin,
                    "members": members,
                }
    except Exception:
        return 500, {"error": "Could not check your Plane session."}


def handle_crm(method: str, path: str, query: str, cookie: str | None, raw_body: bytes) -> tuple[int, dict[str, Any] | str]:
    parsed = urlparse(path)
    match = CRM_API_RE.fullmatch(parsed.path)
    if match is None:
        return 404, {"error": "Not found."}

    kind, contact_id = match.group(1), match.group(2)
    params = parse_qs(query)
    project_id = (params.get("plane_project_id") or [None])[0]

    if kind == "app.js":
        return 200, ("js", APP_JS.read_text())
    if kind == "app":
        return 200, ("html", APP_HTML)

    identity_code, identity = identity_from_session(cookie, project_id)
    if identity_code != 200:
        return identity_code, identity

    email = identity["email"]
    user_id = identity["user_id"]
    is_admin = identity["is_admin"]

    if kind == "members":
        if not is_admin:
            return 403, {"error": "CRM admin required."}
        return 200, {"ok": True, "members": identity["members"]}

    if kind == "me":
        code, payload = lgs_request("GET", "me", email, user_id, is_admin)
        if code == 200:
            payload["members"] = identity["members"]
        return code, payload

    if kind == "contacts" and contact_id is None and method == "GET":
        query_args = {}
        if project_id:
            query_args["plane_project_id"] = project_id
        return lgs_request("GET", "contacts", email, user_id, is_admin, query=query_args)

    if kind == "contacts" and contact_id is not None and method == "PATCH":
        try:
            body = json.loads(raw_body.decode() or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return 400, {"error": "Expected JSON body."}
        return lgs_request(
            "PATCH",
            f"contacts/{contact_id}/plane-projects",
            email,
            user_id,
            is_admin,
            body=body,
        )

    if kind == "viewers" and method == "GET":
        return lgs_request("GET", "viewers", email, user_id, is_admin)

    if kind == "viewers" and method == "PUT":
        try:
            body = json.loads(raw_body.decode() or "{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return 400, {"error": "Expected JSON body."}
        return lgs_request("PUT", "viewers", email, user_id, is_admin, body=body)

    return 405, {"error": "Method not allowed."}


APP_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CRM</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font: 14px/1.45 ui-sans-serif, system-ui, sans-serif; background: #0d0d0d; color: #e5e5e5; }
    main { padding: 20px; }
    h1 { font-size: 16px; margin: 0 0 4px; }
    p.sub { margin: 0 0 16px; color: #a3a3a3; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #262626; vertical-align: top; }
    th { color: #a3a3a3; font-weight: 500; }
    .muted { color: #737373; }
    .err { color: #f87171; }
    label { display: block; margin: 4px 0; }
    .panel { margin: 16px 0 24px; padding: 12px; border: 1px solid #262626; border-radius: 8px; background: #171717; }
    button { background: #262626; color: #e5e5e5; border: 1px solid #404040; border-radius: 6px; padding: 6px 10px; cursor: pointer; }
    a { color: #e5e5e5; }
  </style>
</head>
<body>
  <main id="root">Loading CRM…</main>
  <script src="/crm-api/app.js"></script>
  <script>window.LgsCrm && window.LgsCrm.mount(document.getElementById("root"));</script>
</body>
</html>
"""
