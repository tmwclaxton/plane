/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export const LGS_ROLE_DEFINITIONS = [
  {
    name: "Area Lead",
    owns: "Overall area health. Recruits the other roles, attends events, talks to attendees and explains the mission.",
    difficulty: "Med",
  },
  {
    name: "Organisation Lead",
    owns: "Event logistics: coffee shop, sports activity, chill activity, food and on-the-day admin.",
    difficulty: "Med",
  },
  {
    name: "Social Media Lead",
    owns: "Visibility and hype. Posts and stories before, during and after each event.",
    difficulty: "Med",
  },
  {
    name: "Partnerships Lead",
    owns: "Charity relationships. Secures free venues by trading volunteer hours.",
    difficulty: "Med",
  },
  {
    name: "Relationships Lead",
    owns: "Growing the group. Bumble Friends / LGS Pipeline, WhatsApp and Instagram, group chat invites, CRM.",
    difficulty: "High",
  },
  {
    name: "Grant Writer",
    owns: "Use GrantGunner to apply for grants for Let's Go Social.",
    difficulty: "Med",
  },
] as const;

export const LGS_ROLE_NAMES = LGS_ROLE_DEFINITIONS.map((role) => role.name);

export function isLgsRoleIssueName(name?: string | null): boolean {
  return !!name && (LGS_ROLE_NAMES as readonly string[]).includes(name);
}
