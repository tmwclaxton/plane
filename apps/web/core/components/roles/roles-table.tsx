/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import type { TIssue, TIssuesResponse } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { LGS_ROLE_DEFINITIONS, isLgsRoleIssueName } from "@/constants/lgs-roles";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { useUserPermissions } from "@/hooks/store/user";
import { IssueService } from "@/services/issue";

const issueService = new IssueService();

function collectIssues(response: TIssuesResponse | undefined): TIssue[] {
  const results = response?.results;
  if (!results) return [];
  if (Array.isArray(results)) return results as TIssue[];

  const issues: TIssue[] = [];
  Object.values(results).forEach((group) => {
    if (!group || typeof group !== "object" || !("results" in group)) return;
    const groupResults = group.results;
    if (Array.isArray(groupResults)) {
      issues.push(...(groupResults as TIssue[]));
      return;
    }
    Object.values(groupResults ?? {}).forEach((subGroup) => {
      if (subGroup && typeof subGroup === "object" && Array.isArray(subGroup.results)) {
        issues.push(...(subGroup.results as TIssue[]));
      }
    });
  });
  return issues;
}

type RoleRow = {
  name: string;
  owns: string;
  difficulty: string;
  issue?: TIssue;
};

export const RolesTable = observer(function RolesTable() {
  const { workspaceSlug, projectId } = useParams();
  const { allowPermissions } = useUserPermissions();
  const { updateIssue } = useIssuesActions(EIssuesStoreType.PROJECT);
  const [issues, setIssues] = useState<TIssue[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const canEdit = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  const loadRoles = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setIsLoading(true);
    try {
      const response = await issueService.getIssuesFromServer(workspaceSlug.toString(), projectId.toString(), {
        per_page: 200,
      });
      setIssues(collectIssues(response).filter((issue) => isLgsRoleIssueName(issue.name)));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const rows: RoleRow[] = useMemo(
    () =>
      LGS_ROLE_DEFINITIONS.map((role) => ({
        ...role,
        issue: issues.find((issue) => issue.name === role.name),
      })),
    [issues]
  );

  const handleAssignee = async (issue: TIssue | undefined, memberId: string | null) => {
    if (!issue || !projectId || !updateIssue) return;
    const assigneeIds = memberId ? [memberId] : [];
    await updateIssue(projectId.toString(), issue.id, { assignee_ids: assigneeIds });
    setIssues((current) =>
      current.map((row) => (row.id === issue.id ? { ...row, assignee_ids: assigneeIds } : row))
    );
  };

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-md bg-surface-2" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-subtle">
      <table className="w-full min-w-[640px] border-collapse text-left text-13">
        <thead className="bg-surface-2 text-11 font-medium text-tertiary">
          <tr>
            <th className="px-4 py-2.5">Role</th>
            <th className="px-4 py-2.5">Owns</th>
            <th className="px-4 py-2.5">Difficulty</th>
            <th className="px-4 py-2.5">Name</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-subtle bg-surface-1">
              <td className="px-4 py-3 font-medium text-primary">{row.name}</td>
              <td className="px-4 py-3 text-secondary">{row.owns}</td>
              <td className="px-4 py-3 text-secondary">{row.difficulty}</td>
              <td className="px-4 py-3">
                <MemberDropdown
                  projectId={projectId?.toString()}
                  multiple={false}
                  value={row.issue?.assignee_ids?.[0] ?? null}
                  onChange={(memberId) => handleAssignee(row.issue, memberId)}
                  disabled={!canEdit || !row.issue}
                  buttonVariant="border-with-text"
                  placeholder="Unassigned"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
