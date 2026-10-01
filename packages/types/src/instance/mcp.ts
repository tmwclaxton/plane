/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TInstanceMcpConfigurationKeys = "ENABLE_MCP" | "ENABLE_MCP_FOR_MEMBERS";

export type TMcpClientGuide = {
  id: string;
  name: string;
  blurb: string;
  snippet: string;
  steps: string[];
};

export type TInstanceMcpSettings = {
  mcp_url: string;
  enable_mcp: boolean;
  enable_mcp_for_members: boolean;
  has_token: boolean;
  token: string | null;
  clients: TMcpClientGuide[];
  general: {
    title: string;
    blurb: string;
    snippet: string;
    steps: string[];
  };
  tools: string[];
};
