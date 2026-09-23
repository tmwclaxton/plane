/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import type { TIssue, TIssuesResponse } from "@plane/types";
import { Input, TextArea } from "@plane/ui";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import type { TRoleDifficulty } from "@/constants/lgs-roles";
import {
  LGS_ROLE_LABEL_NAME,
  difficultyFromPriority,
  escapeRoleHtml,
  isLgsRoleIssue,
  ownsFromIssue,
  priorityFromDifficulty,
} from "@/constants/lgs-roles";
import { useMember } from "@/hooks/store/use-member";
import { IssueLabelService, IssueService } from "@/services/issue";

const issueService = new IssueService();
const labelService = new IssueLabelService();

function collectIssues(response: TIssuesResponse | TIssue[] | undefined): TIssue[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;

  const results = "results" in response ? response.results : undefined;
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

const fieldClassName = "w-full rounded-md border border-subtle bg-surface-1 px-3 py-1.5 text-13 text-primary";

export const RolesTable = observer(function RolesTable() {
  const { workspaceSlug, projectId } = useParams();
  const {
    project: { fetchProjectMembers },
  } = useMember();
  const [issues, setIssues] = useState<TIssue[]>([]);
  const [roleLabelId, setRoleLabelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingIssueId, setSavingIssueId] = useState<string | null>(null);
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftOwns, setDraftOwns] = useState("");
  const [draftDifficulty, setDraftDifficulty] = useState<TRoleDifficulty>("Med");
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOwns, setNewOwns] = useState("");
  const [newDifficulty, setNewDifficulty] = useState<TRoleDifficulty>("Med");

  const slug = workspaceSlug?.toString();
  const currentProjectId = projectId?.toString();

  const ensureRoleLabel = useCallback(async () => {
    if (!slug || !currentProjectId) return null;
    const labels = await labelService.getProjectLabels(slug, currentProjectId);
    const existing = labels.find((label) => label.name === LGS_ROLE_LABEL_NAME);
    if (existing) {
      setRoleLabelId(existing.id);
      return existing.id;
    }
    const created = await labelService.createIssueLabel(slug, currentProjectId, {
      name: LGS_ROLE_LABEL_NAME,
      color: "#65A30D",
    });
    setRoleLabelId(created.id);
    return created.id;
  }, [slug, currentProjectId]);

  const loadRoles = useCallback(async () => {
    if (!slug || !currentProjectId) return;
    setIsLoading(true);
    try {
      const labelId = await ensureRoleLabel();
      const [allIssues, leadIssues] = await Promise.all([
        issueService.getIssuesFromServer(slug, currentProjectId, {
          cursor: "100:0:0",
          per_page: "100",
        }),
        issueService.getIssuesFromServer(slug, currentProjectId, {
          search: "Lead",
          cursor: "50:0:0",
          per_page: "50",
        }),
      ]);
      const merged = [...collectIssues(allIssues), ...collectIssues(leadIssues)];
      const unique = new Map<string, TIssue>();
      merged
        .filter((issue) => isLgsRoleIssue(issue, (id) => (id === labelId ? { name: LGS_ROLE_LABEL_NAME } : null)))
        .forEach((issue) => unique.set(issue.id, issue));
      const listed = Array.from(unique.values());
      const hydrated = await Promise.all(
        listed.map(async (issue) => {
          if (issue.description_stripped || issue.description_html) return issue;
          try {
            return await issueService.retrieve(slug, currentProjectId, issue.id);
          } catch {
            return issue;
          }
        })
      );
      setIssues(hydrated.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setIssues([]);
    } finally {
      setIsLoading(false);
    }
  }, [slug, currentProjectId, ensureRoleLabel]);

  useEffect(() => {
    if (!slug || !currentProjectId) return;
    fetchProjectMembers(slug, currentProjectId);
    loadRoles();
  }, [slug, currentProjectId, fetchProjectMembers, loadRoles]);

  const startEditing = (issue: TIssue) => {
    setEditingIssueId(issue.id);
    setDraftName(issue.name);
    setDraftOwns(ownsFromIssue(issue));
    setDraftDifficulty(difficultyFromPriority(issue.priority));
  };

  const saveEditing = async (issue: TIssue) => {
    const name = draftName.trim();
    if (!slug || !currentProjectId || !name) return;
    setSavingIssueId(issue.id);
    const owns = draftOwns.trim();
    const data: Partial<TIssue> = {
      name,
      description_html: `<p>${escapeRoleHtml(owns)}</p>`,
      description_stripped: owns,
      priority: priorityFromDifficulty(draftDifficulty),
    };
    setIssues((current) => current.map((row) => (row.id === issue.id ? { ...row, ...data } : row)));
    try {
      await issueService.patchIssue(slug, currentProjectId, issue.id, data);
      setEditingIssueId(null);
    } catch {
      await loadRoles();
    } finally {
      setSavingIssueId(null);
    }
  };

  const handleAssignees = async (issue: TIssue, memberIds: string[]) => {
    if (!slug || !currentProjectId) return;
    setSavingIssueId(issue.id);
    setIssues((current) => current.map((row) => (row.id === issue.id ? { ...row, assignee_ids: memberIds } : row)));
    try {
      await issueService.patchIssue(slug, currentProjectId, issue.id, { assignee_ids: memberIds });
    } catch {
      await loadRoles();
    } finally {
      setSavingIssueId(null);
    }
  };

  const handleCreate = async () => {
    if (!slug || !currentProjectId || !newName.trim()) return;
    setIsCreating(true);
    try {
      const labelId = roleLabelId ?? (await ensureRoleLabel());
      await issueService.createIssue(slug, currentProjectId, {
        name: newName.trim(),
        description_html: `<p>${escapeRoleHtml(newOwns.trim())}</p>`,
        priority: priorityFromDifficulty(newDifficulty),
        label_ids: labelId ? [labelId] : [],
        assignee_ids: [],
      });
      setNewName("");
      setNewOwns("");
      setNewDifficulty("Med");
      await loadRoles();
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (issue: TIssue) => {
    if (!slug || !currentProjectId) return;
    if (!window.confirm(`Delete the ${issue.name} role?`)) return;
    setSavingIssueId(issue.id);
    try {
      await issueService.deleteIssue(slug, currentProjectId, issue.id);
      setIssues((current) => current.filter((row) => row.id !== issue.id));
      if (editingIssueId === issue.id) setEditingIssueId(null);
    } finally {
      setSavingIssueId(null);
    }
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
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {issues.map((issue) => {
            const isEditing = editingIssueId === issue.id;
            const isSaving = savingIssueId === issue.id;

            return (
              <tr key={issue.id} className="border-t border-subtle bg-surface-1">
                <td className="px-4 py-3 align-top font-medium text-primary">
                  {isEditing ? (
                    <Input
                      value={draftName}
                      disabled={isSaving}
                      className="w-full min-w-36 text-13 font-medium"
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                  ) : (
                    issue.name
                  )}
                </td>
                <td className="px-4 py-3 align-top text-secondary">
                  {isEditing ? (
                    <TextArea
                      value={draftOwns}
                      disabled={isSaving}
                      className="min-h-16 w-full min-w-52 resize-y text-13"
                      onChange={(event) => setDraftOwns(event.target.value)}
                    />
                  ) : (
                    ownsFromIssue(issue)
                  )}
                </td>
                <td className="px-4 py-3 align-top text-secondary">
                  {isEditing ? (
                    <select
                      className={fieldClassName}
                      value={draftDifficulty}
                      disabled={isSaving}
                      onChange={(event) => setDraftDifficulty(event.target.value as TRoleDifficulty)}
                    >
                      <option value="Low">Low</option>
                      <option value="Med">Med</option>
                      <option value="High">High</option>
                    </select>
                  ) : (
                    difficultyFromPriority(issue.priority)
                  )}
                </td>
                <td className="px-4 py-3 align-top">
                  <MemberDropdown
                    projectId={currentProjectId}
                    multiple
                    value={issue.assignee_ids ?? []}
                    onChange={(memberIds) => handleAssignees(issue, memberIds)}
                    disabled={isSaving}
                    buttonVariant="border-with-text"
                    placeholder="Unassigned"
                    showUserDetails
                  />
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex items-center gap-1.5">
                    {isEditing ? (
                      <button
                        type="button"
                        className="rounded p-1 text-tertiary hover:bg-surface-2 hover:text-primary"
                        onClick={() => saveEditing(issue)}
                        disabled={isSaving || !draftName.trim()}
                        aria-label={`Save ${issue.name}`}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded p-1 text-tertiary hover:bg-surface-2 hover:text-primary"
                        onClick={() => startEditing(issue)}
                        disabled={isSaving}
                        aria-label={`Edit ${issue.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded p-1 text-tertiary hover:bg-surface-2 hover:text-primary"
                      onClick={() => handleDelete(issue)}
                      disabled={isSaving}
                      aria-label={`Delete ${issue.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
          <tr className="border-t border-subtle bg-surface-1">
            <td className="px-4 py-3 align-top">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Role name"
                className="w-full min-w-36 text-13"
              />
            </td>
            <td className="px-4 py-3 align-top">
              <TextArea
                value={newOwns}
                onChange={(event) => setNewOwns(event.target.value)}
                placeholder="What this role owns"
                className="min-h-16 w-full min-w-52 resize-y text-13"
              />
            </td>
            <td className="px-4 py-3 align-top">
              <select
                className={fieldClassName}
                value={newDifficulty}
                onChange={(event) => setNewDifficulty(event.target.value as TRoleDifficulty)}
              >
                <option value="Low">Low</option>
                <option value="Med">Med</option>
                <option value="High">High</option>
              </select>
            </td>
            <td className="px-4 py-3 align-top text-tertiary">Unassigned</td>
            <td className="px-4 py-3 align-top">
              <button
                type="button"
                className="rounded p-1 text-tertiary hover:bg-surface-2 hover:text-primary"
                onClick={() => handleCreate()}
                disabled={!newName.trim() || isCreating}
                aria-label="Add role"
              >
                <Plus className="h-4 w-4" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
