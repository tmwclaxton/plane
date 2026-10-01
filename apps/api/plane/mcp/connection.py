# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json


MCP_TOOLS = [
    "whoami",
    "list_workspaces",
    "get_workspace",
    "list_projects",
    "get_project",
    "create_project",
    "update_project",
    "list_work_items",
    "get_work_item",
    "create_work_item",
    "update_work_item",
    "list_pages",
    "get_page",
    "create_page",
    "update_page",
    "create_file",
    "list_files",
    "get_file",
    "update_file",
    "delete_file",
]


def connection_guide(mcp_url: str, token_placeholder: str = "YOUR_PLANE_API_TOKEN") -> dict:
    def snippet(payload: dict) -> str:
        return json.dumps(payload, indent=2)

    return {
        "mcp_url": mcp_url,
        "clients": [
            {
                "id": "cursor",
                "name": "Cursor",
                "blurb": "Add Plane in Cursor Settings → MCP, or merge into your project mcp.json.",
                "steps": [
                    "Mint an API token in God Mode or Settings → API tokens.",
                    "Open Cursor Settings → MCP and add plane with the config below.",
                    "Reload MCP servers, then call whoami.",
                ],
                "snippet": snippet(
                    {
                        "mcpServers": {
                            "plane": {
                                "url": mcp_url,
                                "headers": {"Authorization": f"Bearer {token_placeholder}"},
                            }
                        }
                    }
                ),
            },
            {
                "id": "claude",
                "name": "Claude.ai",
                "blurb": "Custom connector with OAuth - paste the URL, sign in when prompted.",
                "steps": [
                    "In Claude.ai: Settings → Connectors → Add custom connector.",
                    "Paste the Plane MCP URL below and complete sign-in when prompted.",
                    "Call whoami to confirm.",
                ],
                "snippet": f"Claude.ai custom connector URL:\n{mcp_url}",
            },
            {
                "id": "claude-desktop",
                "name": "Claude Desktop / Claude Code",
                "blurb": "HTTP MCP with a bearer token, same pattern as Cursor.",
                "steps": [
                    "Mint an API token in God Mode or Settings → API tokens.",
                    "Add an HTTP MCP server with the config below.",
                    "Restart Claude and call whoami.",
                ],
                "snippet": snippet(
                    {
                        "mcpServers": {
                            "plane": {
                                "type": "http",
                                "url": mcp_url,
                                "headers": {"Authorization": f"Bearer {token_placeholder}"},
                            }
                        }
                    }
                ),
            },
            {
                "id": "codex",
                "name": "Codex",
                "blurb": "Any Codex or OpenAI agent harness that supports remote HTTP MCP.",
                "steps": [
                    "Mint an API token in God Mode or Settings → API tokens.",
                    "Register the Plane MCP URL with the bearer header below.",
                    "Call whoami.",
                ],
                "snippet": f"MCP server URL: {mcp_url}\nAuth header: Authorization: Bearer {token_placeholder}",
            },
            {
                "id": "windsurf",
                "name": "Windsurf",
                "blurb": "Same HTTP + bearer pattern as Cursor.",
                "steps": [
                    "Mint an API token in God Mode or Settings → API tokens.",
                    "Open Windsurf MCP settings and add plane with the config below.",
                    "Call whoami to confirm.",
                ],
                "snippet": snippet(
                    {
                        "mcpServers": {
                            "plane": {
                                "serverUrl": mcp_url,
                                "headers": {"Authorization": f"Bearer {token_placeholder}"},
                            }
                        }
                    }
                ),
            },
        ],
        "general": {
            "title": "General MCP",
            "blurb": "Any MCP client over HTTPS can connect to Plane.",
            "steps": [
                "Mint an API token in God Mode or Settings → API tokens.",
                "Paste the config into your MCP client.",
                "Call whoami to confirm the connection.",
            ],
            "snippet": (
                f"Authenticated: {mcp_url}\n"
                f"  Header: Authorization: Bearer {token_placeholder}\n\n"
                "Starter calls: whoami, list_projects, list_pages, list_files"
            ),
        },
        "tools": MCP_TOOLS,
    }
