/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Loader, ToggleSwitch } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { InstanceService } from "@plane/services";
import type { TInstanceMcpSettings } from "@plane/types";
import { PageWrapper } from "@/components/common/page-wrapper";
import type { Route } from "./+types/page";

const instanceService = new InstanceService();

const InstanceMcpPage = observer(function InstanceMcpPage(_props: Route.ComponentProps) {
  const [settings, setSettings] = useState<TInstanceMcpSettings | undefined>();
  const [activeId, setActiveId] = useState("cursor");
  const [saving, setSaving] = useState(false);

  const { isLoading } = useSWR("INSTANCE_MCP", () => instanceService.mcp(), {
    onSuccess: (data) => {
      setSettings(data);
      setActiveId(data.clients[0]?.id ?? "cursor");
    },
  });

  const options = useMemo(() => {
    if (!settings) return [];
    return [
      ...settings.clients,
      {
        id: "general",
        name: settings.general.title,
        blurb: settings.general.blurb,
        snippet: settings.token
          ? settings.general.snippet.replaceAll("YOUR_PLANE_API_TOKEN", settings.token)
          : settings.general.snippet,
        steps: settings.general.steps,
      },
    ].map((client) => ({
      ...client,
      snippet: settings.token ? client.snippet.replaceAll("YOUR_PLANE_API_TOKEN", settings.token) : client.snippet,
    }));
  }, [settings]);

  const active = options.find((item) => item.id === activeId) ?? options[0];

  const update = async (payload: {
    enable_mcp?: boolean;
    enable_mcp_for_members?: boolean;
    rotate_token?: boolean;
  }) => {
    setSaving(true);
    try {
      const next = await instanceService.updateMcp(payload);
      setSettings(next);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Saved",
        message: payload.rotate_token ? "Token created. Copy it now." : "MCP settings updated.",
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Could not update MCP." });
    } finally {
      setSaving(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "Copied to clipboard." });
  };

  return (
    <PageWrapper
      header={{
        title: "MCP for agents",
        description:
          "Turn on HTTP MCP for Cursor, Claude, Codex, and Windsurf. Admins always connect when MCP is on. Members need the second switch.",
      }}
    >
      {isLoading || !settings ? (
        <Loader className="space-y-8">
          <Loader.Item height="50px" width="40%" />
          <Loader.Item height="50px" width="60%" />
        </Loader>
      ) : (
        <div className="space-y-8">
          <div className="flex items-center justify-between gap-4 rounded-md border border-subtle p-4">
            <div>
              <div className="text-18 font-medium text-primary">Enable MCP</div>
              <div className="text-13 text-tertiary">Instance admins can connect agents when this is on.</div>
            </div>
            <ToggleSwitch
              value={settings.enable_mcp}
              onChange={(value) => update({ enable_mcp: value })}
              size="sm"
              disabled={saving}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border border-subtle p-4">
            <div>
              <div className="text-18 font-medium text-primary">Allow members</div>
              <div className="text-13 text-tertiary">
                Members mint their own token in Settings → API tokens and use the same MCP URL.
              </div>
            </div>
            <ToggleSwitch
              value={settings.enable_mcp_for_members}
              onChange={(value) => update({ enable_mcp_for_members: value })}
              size="sm"
              disabled={saving || !settings.enable_mcp}
            />
          </div>
          <div className="space-y-3">
            <div className="text-18 font-medium text-primary">Admin token</div>
            <p className="text-13 text-tertiary">
              Shown once after you create or rotate it. Use it as Authorization: Bearer.
            </p>
            {settings.token ? (
              <pre className="overflow-x-auto rounded-md bg-layer-2 p-3 text-12">{settings.token}</pre>
            ) : (
              <p className="text-13 text-tertiary">
                {settings.has_token ? "A token already exists. Rotate it to see a new value." : "No token yet."}
              </p>
            )}
            <Button variant="primary" size="lg" onClick={() => update({ rotate_token: true })} loading={saving}>
              {settings.has_token ? "Rotate token" : "Create token"}
            </Button>
          </div>
          <div className="space-y-3">
            <div className="text-18 font-medium text-primary">Client setup</div>
            <p className="text-13 text-tertiary">{settings.mcp_url}</p>
            <div className="flex flex-wrap gap-2">
              {options.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`rounded-md px-3 py-1 text-13 ${
                    active?.id === item.id ? "bg-layer-transparent-active text-primary" : "text-secondary"
                  }`}
                  onClick={() => setActiveId(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
            {active ? (
              <div className="space-y-3">
                <p className="text-13 text-tertiary">{active.blurb}</p>
                <ol className="list-decimal space-y-1 pl-5 text-13 text-secondary">
                  {active.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                <pre className="overflow-x-auto rounded-md bg-layer-2 p-3 text-12">{active.snippet}</pre>
                <Button variant="secondary" size="sm" onClick={() => copy(active.snippet)}>
                  Copy config
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "MCP Settings - God Mode" }];

export default InstanceMcpPage;
