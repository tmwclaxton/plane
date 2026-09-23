/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { LucideIcon } from "lucide-react";
import { MembersPropertyIcon } from "@plane/propel/icons";
// plane ui
import { Avatar, AvatarGroup } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
// plane utils
// helpers
// hooks
import { useMember } from "@/hooks/store/use-member";

type AvatarProps = {
  showTooltip: boolean;
  userIds: string | string[] | null;
  icon?: LucideIcon;
  size?: "sm" | "md" | "base" | "lg" | number;
  showPills?: boolean;
};

function memberLabel(user: { first_name?: string; display_name?: string }): string {
  return user.first_name?.trim() || user.display_name?.trim() || "";
}

export const ButtonAvatars = observer(function ButtonAvatars(props: AvatarProps) {
  const { showTooltip, userIds, icon: Icon, size = "md", showPills = false } = props;
  // store hooks
  const { getUserDetails } = useMember();

  const ids = Array.isArray(userIds) ? userIds : userIds ? [userIds] : [];

  if (showPills && ids.length > 0) {
    return (
      <span className="flex flex-wrap items-center gap-1">
        {ids.map((userId) => {
          const userDetails = getUserDetails(userId);
          if (!userDetails) return null;
          const name = memberLabel(userDetails);

          return (
            <span
              key={userId}
              className="inline-flex max-w-40 items-center gap-1 rounded-full border border-subtle bg-surface-2 py-0.5 pr-2 pl-0.5"
            >
              <Avatar
                src={getFileURL(userDetails.avatar_url)}
                name={userDetails.display_name}
                size="sm"
                showTooltip={false}
              />
              {name && <span className="truncate text-11 leading-4 text-primary">{name}</span>}
            </span>
          );
        })}
      </span>
    );
  }

  if (Array.isArray(userIds)) {
    if (userIds.length > 0)
      return (
        <AvatarGroup size={size} showTooltip={!showTooltip}>
          {userIds.map((userId) => {
            const userDetails = getUserDetails(userId);

            if (!userDetails) return;
            return <Avatar key={userId} src={getFileURL(userDetails.avatar_url)} name={userDetails.display_name} />;
          })}
        </AvatarGroup>
      );
  } else {
    if (userIds) {
      const userDetails = getUserDetails(userIds);
      return (
        <Avatar
          src={getFileURL(userDetails?.avatar_url ?? "")}
          name={userDetails?.display_name}
          size={size}
          showTooltip={!showTooltip}
        />
      );
    }
  }

  return Icon ? (
    <Icon className="h-3 w-3 flex-shrink-0" />
  ) : (
    <MembersPropertyIcon className={cn("mx-[4px] h-3 w-3 flex-shrink-0")} />
  );
});
