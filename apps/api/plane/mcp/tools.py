# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import base64
import json
import re
from typing import Any
from uuid import uuid4

from urllib.parse import quote

from django.conf import settings
from django.core.files.base import ContentFile
from django.db.models import Q
from django.utils import timezone

from plane.app.serializers import ProjectSerializer
from plane.utils.html_processor import strip_tags
from plane.db.models import (
    FileAsset,
    Issue,
    Page,
    Project,
    ProjectMember,
    ProjectPage,
    State,
    Workspace,
    WorkspaceMember,
    DEFAULT_STATES,
)
from plane.settings.storage import S3Storage
from plane.utils.path_validator import sanitize_filename

from .connection import MCP_TOOLS
from .settings import is_instance_admin, is_mcp_enabled, is_mcp_enabled_for_members, mcp_url, request_origin


class ToolError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


def tool_schemas() -> list[dict[str, Any]]:
    string = {"type": "string"}
    boolean = {"type": "boolean"}
    return [
        {"name": "whoami", "description": "Current Plane user and MCP flags.", "inputSchema": {"type": "object", "properties": {}}},
        {
            "name": "list_workspaces",
            "description": "List workspaces the user can access. Optional query matches name or slug.",
            "inputSchema": {"type": "object", "properties": {"query": string}},
        },
        {
            "name": "get_workspace",
            "description": "Get one workspace by slug or name.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string},
                "required": ["workspace"],
            },
        },
        {
            "name": "list_projects",
            "description": "List projects the user can access in a workspace.",
            "inputSchema": {"type": "object", "properties": {"workspace": string}, "required": ["workspace"]},
        },
        {
            "name": "get_project",
            "description": "Get one project.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string, "project_id": string},
                "required": ["workspace", "project_id"],
            },
        },
        {
            "name": "create_project",
            "description": "Create a project. network 2 is public, 0 is private.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": string,
                    "name": string,
                    "identifier": string,
                    "description": string,
                    "network": {"type": "integer", "enum": [0, 2]},
                },
                "required": ["workspace", "name"],
            },
        },
        {
            "name": "update_project",
            "description": "Update a project, including public or private (network 2 or 0).",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": string,
                    "project_id": string,
                    "name": string,
                    "description": string,
                    "network": {"type": "integer", "enum": [0, 2]},
                },
                "required": ["workspace", "project_id"],
            },
        },
        {
            "name": "list_work_items",
            "description": "List work items in a project.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string, "project_id": string},
                "required": ["workspace", "project_id"],
            },
        },
        {
            "name": "get_work_item",
            "description": "Get one work item.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string, "project_id": string, "work_item_id": string},
                "required": ["workspace", "project_id", "work_item_id"],
            },
        },
        {
            "name": "create_work_item",
            "description": "Create a work item.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": string,
                    "project_id": string,
                    "name": string,
                    "description_html": string,
                    "priority": string,
                },
                "required": ["workspace", "project_id", "name"],
            },
        },
        {
            "name": "update_work_item",
            "description": "Update a work item.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": string,
                    "project_id": string,
                    "work_item_id": string,
                    "name": string,
                    "description_html": string,
                    "priority": string,
                },
                "required": ["workspace", "project_id", "work_item_id"],
            },
        },
        {
            "name": "list_pages",
            "description": "List project pages, including pages inside folders.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string, "project_id": string},
                "required": ["workspace", "project_id"],
            },
        },
        {
            "name": "get_page",
            "description": "Get one page, including the written document body as HTML and plain text.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string, "project_id": string, "page_id": string},
                "required": ["workspace", "project_id", "page_id"],
            },
        },
        {
            "name": "create_page",
            "description": "Create a page. access 0 is public, 1 is private. parent is a folder page id.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": string,
                    "project_id": string,
                    "name": string,
                    "access": {"type": "integer", "enum": [0, 1]},
                    "parent": string,
                    "is_folder": boolean,
                },
                "required": ["workspace", "project_id", "name"],
            },
        },
        {
            "name": "update_page",
            "description": "Update a page, including the written document body, public or private access, and parent folder.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": string,
                    "project_id": string,
                    "page_id": string,
                    "name": string,
                    "access": {"type": "integer", "enum": [0, 1]},
                    "parent": string,
                    "description_html": string,
                },
                "required": ["workspace", "project_id", "page_id"],
            },
        },
        {
            "name": "create_file",
            "description": "Store a file. Pass content_base64 to upload now, or PUT to the returned upload URL then call complete_file.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": string,
                    "project_id": string,
                    "filename": string,
                    "content_type": string,
                    "is_public": boolean,
                    "content_base64": string,
                },
                "required": ["workspace", "filename"],
            },
        },
        {
            "name": "complete_file",
            "description": "Finish an upload after the file is in storage so the public or private link will serve.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string, "file_id": string},
                "required": ["workspace", "file_id"],
            },
        },
        {
            "name": "list_files",
            "description": "List MCP files in a workspace.",
            "inputSchema": {"type": "object", "properties": {"workspace": string}, "required": ["workspace"]},
        },
        {
            "name": "get_file",
            "description": "Get file metadata and the download URL.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string, "file_id": string},
                "required": ["workspace", "file_id"],
            },
        },
        {
            "name": "update_file",
            "description": "Rename a file or set it public or private.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workspace": string,
                    "file_id": string,
                    "filename": string,
                    "is_public": boolean,
                },
                "required": ["workspace", "file_id"],
            },
        },
        {
            "name": "delete_file",
            "description": "Delete an MCP file.",
            "inputSchema": {
                "type": "object",
                "properties": {"workspace": string, "file_id": string},
                "required": ["workspace", "file_id"],
            },
        },
    ]


def _json(data: Any) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": json.dumps(data, default=str)}], "structuredContent": data}


def _workspace_payload(workspace: Workspace) -> dict[str, Any]:
    return {
        "id": str(workspace.id),
        "name": workspace.name,
        "slug": workspace.slug,
    }


def _accessible_workspaces(user):
    return Workspace.objects.filter(workspace_member__member=user, workspace_member__is_active=True).distinct()


def _workspace(user, slug: str) -> Workspace:
    key = (slug or "").strip()
    if not key:
        raise ToolError("workspace is required.")
    workspace = Workspace.objects.filter(slug=key).first()
    if workspace is None:
        workspace = Workspace.objects.filter(name__iexact=key).first()
    if workspace is None:
        raise ToolError("Workspace not found.", 404)
    if not WorkspaceMember.objects.filter(workspace=workspace, member=user, is_active=True).exists():
        raise ToolError("You do not have access to this workspace.", 403)
    return workspace


def _project(user, workspace: Workspace, project_id: str) -> Project:
    project = Project.objects.filter(id=project_id, workspace=workspace).first()
    if project is None:
        raise ToolError("Project not found.", 404)
    if not ProjectMember.objects.filter(project=project, member=user, is_active=True).exists():
        raise ToolError("You do not have access to this project.", 403)
    return project


def _can_admin_project(user, workspace: Workspace, project: Project) -> bool:
    return (
        WorkspaceMember.objects.filter(workspace=workspace, member=user, is_active=True, role=20).exists()
        or ProjectMember.objects.filter(project=project, member=user, is_active=True, role=20).exists()
    )


def _identifier(name: str) -> str:
    letters = re.sub(r"[^A-Za-z0-9]", "", name).upper()
    return (letters[:5] or "PROJ")[:12]


def _project_payload(project: Project) -> dict[str, Any]:
    return {
        "id": str(project.id),
        "name": project.name,
        "identifier": project.identifier,
        "description": project.description,
        "network": project.network,
        "is_public": project.network == 2,
        "workspace": project.workspace.slug,
    }


def _issue_payload(issue: Issue) -> dict[str, Any]:
    return {
        "id": str(issue.id),
        "name": issue.name,
        "sequence_id": issue.sequence_id,
        "priority": issue.priority,
        "project_id": str(issue.project_id),
        "description_html": issue.description_html,
    }


def _page_payload(page: Page, include_body: bool = False) -> dict[str, Any]:
    view_props = page.view_props or {}
    payload = {
        "id": str(page.id),
        "name": page.name,
        "access": page.access,
        "is_public": page.access == Page.PUBLIC_ACCESS,
        "parent": str(page.parent_id) if page.parent_id else None,
        "is_folder": view_props.get("is_folder") is True,
        "view_props": view_props,
    }
    if include_body:
        html = page.description_html or ""
        payload["description_html"] = html
        payload["description_text"] = page.description_stripped or strip_tags(html)
    return payload


def _file_payload(request, asset: FileAsset) -> dict[str, Any]:
    origin = request_origin(request)
    if asset.is_public:
        filename = sanitize_filename((asset.attributes or {}).get("name") or "file") or "file"
        download_url = f"{origin}/api/assets/v2/public/{asset.id}/{quote(filename)}"
    else:
        download_url = f"{origin}/api/assets/v2/mcp/{asset.id}/"
    return {
        "id": str(asset.id),
        "filename": (asset.attributes or {}).get("name"),
        "content_type": (asset.attributes or {}).get("type"),
        "size": asset.size,
        "is_public": asset.is_public,
        "is_uploaded": asset.is_uploaded,
        "workspace": asset.workspace.slug if asset.workspace_id else None,
        "project_id": str(asset.project_id) if asset.project_id else None,
        "download_url": download_url,
    }


def dispatch(request, user, name: str, arguments: dict[str, Any] | None) -> dict[str, Any]:
    arguments = arguments or {}
    handler = TOOLS.get(name)
    if handler is None:
        raise ToolError(f"Unknown tool: {name}")
    return handler(request, user, arguments)


def whoami(request, user, _arguments):
    return _json(
        {
            "id": str(user.id),
            "email": user.email,
            "display_name": getattr(user, "display_name", None) or user.email,
            "is_instance_admin": is_instance_admin(user),
            "mcp_enabled": is_mcp_enabled(),
            "mcp_enabled_for_members": is_mcp_enabled_for_members(),
            "mcp_url": mcp_url(request),
            "tools": MCP_TOOLS,
        }
    )


def list_workspaces(request, user, arguments):
    query = (arguments.get("query") or "").strip()
    workspaces = _accessible_workspaces(user)
    if query:
        workspaces = workspaces.filter(Q(name__icontains=query) | Q(slug__icontains=query))
    return _json([_workspace_payload(workspace) for workspace in workspaces.order_by("name")])


def get_workspace(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    return _json(_workspace_payload(workspace))


def list_projects(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    projects = Project.objects.filter(
        workspace=workspace,
        project_projectmember__member=user,
        project_projectmember__is_active=True,
    ).distinct()
    return _json([_project_payload(project) for project in projects])


def get_project(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    return _json(_project_payload(project))


def create_project(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    if not WorkspaceMember.objects.filter(workspace=workspace, member=user, is_active=True, role__gte=15).exists():
        raise ToolError("You do not have permission to create a project.", 403)
    name = (arguments.get("name") or "").strip()
    if not name:
        raise ToolError("name is required.")
    identifier = (arguments.get("identifier") or _identifier(name)).upper()
    serializer = ProjectSerializer(
        data={
            "name": name,
            "identifier": identifier,
            "description": arguments.get("description") or "",
            "network": arguments.get("network", 2),
        },
        context={"workspace_id": workspace.id},
    )
    if not serializer.is_valid():
        raise ToolError(json.dumps(serializer.errors))
    serializer.save()
    project = serializer.instance
    ProjectMember.objects.create(project=project, member=user, role=20)
    State.objects.bulk_create(
        [
            State(
                name=state["name"],
                color=state["color"],
                project=project,
                sequence=state["sequence"],
                workspace=workspace,
                group=state["group"],
                default=state.get("default", False),
                created_by=user,
            )
            for state in DEFAULT_STATES
        ]
    )
    return _json(_project_payload(project))


def update_project(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    if not _can_admin_project(user, workspace, project):
        raise ToolError("You don't have the required permissions.", 403)
    data = {}
    for key in ("name", "description", "network"):
        if key in arguments:
            data[key] = arguments[key]
    serializer = ProjectSerializer(project, data=data, context={"workspace_id": workspace.id}, partial=True)
    if not serializer.is_valid():
        raise ToolError(json.dumps(serializer.errors))
    serializer.save()
    return _json(_project_payload(serializer.instance))


def list_work_items(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    issues = Issue.issue_objects.filter(project=project)[:100]
    return _json([_issue_payload(issue) for issue in issues])


def get_work_item(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    issue = Issue.issue_objects.filter(project=project, id=arguments.get("work_item_id")).first()
    if issue is None:
        raise ToolError("Work item not found.", 404)
    return _json(_issue_payload(issue))


def create_work_item(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    name = (arguments.get("name") or "").strip()
    if not name:
        raise ToolError("name is required.")
    issue = Issue.issue_objects.create(
        name=name,
        project=project,
        workspace=workspace,
        description_html=arguments.get("description_html") or "<p></p>",
        priority=arguments.get("priority") or "none",
        created_by=user,
    )
    return _json(_issue_payload(issue))


def update_work_item(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    issue = Issue.issue_objects.filter(project=project, id=arguments.get("work_item_id")).first()
    if issue is None:
        raise ToolError("Work item not found.", 404)
    if "name" in arguments:
        issue.name = arguments["name"]
    if "description_html" in arguments:
        issue.description_html = arguments["description_html"]
    if "priority" in arguments:
        issue.priority = arguments["priority"]
    issue.save()
    return _json(_issue_payload(issue))


def list_pages(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    pages = Page.objects.filter(workspace=workspace, projects=project).distinct()
    return _json([_page_payload(page) for page in pages])


def get_page(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    page = Page.objects.filter(id=arguments.get("page_id"), workspace=workspace, projects=project).first()
    if page is None:
        raise ToolError("Page not found.", 404)
    return _json(_page_payload(page, include_body=True))


def create_page(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    name = (arguments.get("name") or "").strip()
    if not name:
        raise ToolError("name is required.")
    parent = None
    if arguments.get("parent"):
        parent = Page.objects.filter(id=arguments["parent"], workspace=workspace, projects=project).first()
        if parent is None:
            raise ToolError("Parent page not found.", 404)
    view_props = {"full_width": False}
    if arguments.get("is_folder"):
        view_props["is_folder"] = True
    page = Page.objects.create(
        workspace=workspace,
        name=name,
        owned_by=user,
        access=arguments.get("access", Page.PUBLIC_ACCESS),
        parent=parent,
        view_props=view_props,
        created_by=user,
    )
    ProjectPage.objects.create(workspace=workspace, project=project, page=page)
    return _json(_page_payload(page))


def update_page(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = _project(user, workspace, arguments.get("project_id"))
    page = Page.objects.filter(id=arguments.get("page_id"), workspace=workspace, projects=project).first()
    if page is None:
        raise ToolError("Page not found.", 404)
    if "name" in arguments:
        page.name = arguments["name"]
    if "access" in arguments:
        page.access = arguments["access"]
    if "parent" in arguments:
        parent_id = arguments["parent"]
        if parent_id:
            parent = Page.objects.filter(id=parent_id, workspace=workspace, projects=project).first()
            if parent is None:
                raise ToolError("Parent page not found.", 404)
            page.parent = parent
        else:
            page.parent = None
    if "description_html" in arguments:
        page.description_html = arguments.get("description_html") or "<p></p>"
    page.save()
    return _json(_page_payload(page, include_body=True))


def create_file(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    project = None
    if arguments.get("project_id"):
        project = _project(user, workspace, arguments["project_id"])
    filename = sanitize_filename(arguments.get("filename") or "") or "unnamed"
    content_type = arguments.get("content_type") or "application/octet-stream"
    is_public = bool(arguments.get("is_public"))
    asset_key = f"{workspace.id}/{uuid4().hex}-{filename}"
    asset = FileAsset.objects.create(
        attributes={"name": filename, "type": content_type},
        asset=asset_key,
        user=user,
        workspace=workspace,
        project=project,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_public=is_public,
        size=0,
        is_uploaded=False,
        created_by=user,
    )
    payload = _file_payload(request, asset)
    content_b64 = arguments.get("content_base64")
    if content_b64:
        raw = base64.b64decode(content_b64)
        if len(raw) > settings.FILE_SIZE_LIMIT:
            asset.delete()
            raise ToolError("File too large.")
        asset.asset.save(filename, ContentFile(raw), save=False)
        asset.size = len(raw)
        asset.is_uploaded = True
        asset.save(update_fields=["asset", "size", "is_uploaded"])
        payload = _file_payload(request, asset)
        return _json(payload)

    storage = S3Storage(request=request)
    upload = storage.generate_presigned_post(asset_key, content_type, settings.FILE_SIZE_LIMIT)
    payload["upload"] = upload
    payload["upload_complete"] = f"{request_origin(request)}/api/assets/v2/mcp/{asset.id}/complete/"
    payload["next_step"] = "After the storage upload succeeds, call complete_file with this file_id."
    return _json(payload)


def mark_mcp_file_uploaded(request, asset: FileAsset) -> FileAsset:
    asset.is_uploaded = True
    asset.save(update_fields=["is_uploaded"])
    return asset


def complete_file(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    asset = FileAsset.objects.filter(
        id=arguments.get("file_id"),
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_deleted=False,
    ).first()
    if asset is None:
        raise ToolError("File not found.", 404)
    mark_mcp_file_uploaded(request, asset)
    return _json(_file_payload(request, asset))


def list_files(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    assets = FileAsset.objects.filter(
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_deleted=False,
    )
    return _json([_file_payload(request, asset) for asset in assets])


def get_file(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    asset = FileAsset.objects.filter(
        id=arguments.get("file_id"),
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_deleted=False,
    ).first()
    if asset is None:
        raise ToolError("File not found.", 404)
    return _json(_file_payload(request, asset))


def update_file(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    asset = FileAsset.objects.filter(
        id=arguments.get("file_id"),
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_deleted=False,
    ).first()
    if asset is None:
        raise ToolError("File not found.", 404)
    attributes = dict(asset.attributes or {})
    if arguments.get("filename"):
        attributes["name"] = sanitize_filename(arguments["filename"]) or attributes.get("name")
        asset.attributes = attributes
    if "is_public" in arguments:
        asset.is_public = bool(arguments["is_public"])
    asset.save()
    return _json(_file_payload(request, asset))


def delete_file(request, user, arguments):
    workspace = _workspace(user, arguments.get("workspace"))
    asset = FileAsset.objects.filter(
        id=arguments.get("file_id"),
        workspace=workspace,
        entity_type=FileAsset.EntityTypeContext.MCP_FILE,
        is_deleted=False,
    ).first()
    if asset is None:
        raise ToolError("File not found.", 404)
    asset.is_deleted = True
    asset.deleted_at = timezone.now()
    asset.save(update_fields=["is_deleted", "deleted_at"])
    return _json({"deleted": True, "id": str(asset.id)})


TOOLS = {
    "whoami": whoami,
    "list_workspaces": list_workspaces,
    "get_workspace": get_workspace,
    "list_projects": list_projects,
    "get_project": get_project,
    "create_project": create_project,
    "update_project": update_project,
    "list_work_items": list_work_items,
    "get_work_item": get_work_item,
    "create_work_item": create_work_item,
    "update_work_item": update_work_item,
    "list_pages": list_pages,
    "get_page": get_page,
    "create_page": create_page,
    "update_page": update_page,
    "create_file": create_file,
    "complete_file": complete_file,
    "list_files": list_files,
    "get_file": get_file,
    "update_file": update_file,
    "delete_file": delete_file,
}
