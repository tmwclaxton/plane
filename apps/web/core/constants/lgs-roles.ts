/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssue } from "@plane/types";

export const LGS_ROLE_LABEL_NAME = "Role";

export const LGS_ROLE_NAMES = [
  "Area Lead",
  "Organisation Lead",
  "Social Media Lead",
  "Partnerships Lead",
  "Relationships Lead",
  "Grant Writer",
  "Global Admin",
] as const;

export type TRoleDifficulty = "Low" | "Med" | "High";

export function difficultyFromPriority(priority?: string | null): TRoleDifficulty {
  if (priority === "high" || priority === "urgent") return "High";
  if (priority === "low") return "Low";
  return "Med";
}

export function priorityFromDifficulty(difficulty: TRoleDifficulty): "low" | "medium" | "high" {
  if (difficulty === "High") return "high";
  if (difficulty === "Low") return "low";
  return "medium";
}

export function escapeRoleHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ownsFromIssue(issue: TIssue): string {
  const stripped = issue.description_stripped?.trim();
  if (stripped) return stripped;
  const html = issue.description_html ?? "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function isLgsRoleIssueName(name?: string | null): boolean {
  return !!name && (LGS_ROLE_NAMES as readonly string[]).includes(name);
}

export function isLgsRoleIssue(
  issue: TIssue | undefined,
  getLabelById?: (labelId: string) => { name: string } | null
): boolean {
  if (!issue) return false;
  if (isLgsRoleIssueName(issue.name)) return true;
  return (issue.label_ids ?? []).some((labelId) => getLabelById?.(labelId)?.name === LGS_ROLE_LABEL_NAME);
}
