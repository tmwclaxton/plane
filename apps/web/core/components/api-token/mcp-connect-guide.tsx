/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { useInstance } from "@/hooks/store/use-instance";

type TGuide = {
  id: string;
  name: string;
  blurb: string;
  snippet: string;
  steps: string[];
};

export const McpConnectGuide = observer(function McpConnectGuide() {
  const { config } = useInstance();
  const [activeId, setActiveId] = useState("cursor");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const mcpUrl = `${origin}/mcp`;
  const token = "YOUR_PLANE_API_TOKEN";

  const clients = useMemo<TGuide[]>(
    () => [
      {
        id: "cursor",
        name: "Cursor",
        blurb: "Add Plane in Cursor Settings → MCP.",
        steps: ["Create an API token above.", "Paste the config below.", "Call whoami."],
        snippet: JSON.stringify(
          { mcpServers: { plane: { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } } },
          null,
          2
        ),
      },
      {
        id: "claude",
        name: "Claude.ai",
        blurb: "Custom connector with OAuth.",
        steps: ["Settings → Connectors → Add custom connector.", "Paste the MCP URL.", "Sign in when prompted."],
        snippet: `Claude.ai custom connector URL:\n${mcpUrl}`,
      },
      {
        id: "claude-desktop",
        name: "Claude Desktop / Claude Code",
        blurb: "HTTP MCP with a bearer token.",
        steps: ["Create an API token above.", "Add an HTTP MCP server.", "Call whoami."],
        snippet: JSON.stringify(
          {
            mcpServers: {
              plane: { type: "http", url: mcpUrl, headers: { Authorization: `Bearer ${token}` } },
            },
          },
          null,
          2
        ),
      },
      {
        id: "codex",
        name: "Codex",
        blurb: "Remote HTTP MCP.",
        steps: ["Create an API token above.", "Register the URL and bearer header."],
        snippet: `MCP server URL: ${mcpUrl}\nAuth header: Authorization: Bearer ${token}`,
      },
      {
        id: "windsurf",
        name: "Windsurf",
        blurb: "Same HTTP + bearer pattern as Cursor.",
        steps: ["Create an API token above.", "Add plane in Windsurf MCP settings."],
        snippet: JSON.stringify(
          { mcpServers: { plane: { serverUrl: mcpUrl, headers: { Authorization: `Bearer ${token}` } } } },
          null,
          2
        ),
      },
    ],
    [mcpUrl]
  );

  if (!config?.enable_mcp || !config.enable_mcp_for_members) {
    return null;
  }

  const active = clients.find((item) => item.id === activeId) ?? clients[0];

  return (
    <div className="mb-8 space-y-3 rounded-md border border-subtle p-4">
      <div className="text-15 font-medium">MCP</div>
      <p className="text-13 text-tertiary">
        Your instance admin enabled MCP for members. Create a token, then connect Cursor, Claude, Codex, or Windsurf.
      </p>
      <div className="flex flex-wrap gap-2">
        {clients.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-md px-3 py-1 text-13 ${
              active.id === item.id ? "bg-layer-transparent-active text-primary" : "text-secondary"
            }`}
            onClick={() => setActiveId(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <p className="text-13 text-tertiary">{active.blurb}</p>
      <ol className="list-decimal space-y-1 pl-5 text-13 text-secondary">
        {active.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <pre className="overflow-x-auto rounded-md bg-layer-2 p-3 text-12">{active.snippet}</pre>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          await navigator.clipboard.writeText(active.snippet);
          setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "MCP config copied." });
        }}
      >
        Copy config
      </Button>
    </div>
  );
});
