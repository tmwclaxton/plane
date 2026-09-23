/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";

type PlaneProject = { id: string; label: string; identifier: string };
type CrmContact = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  region: string | null;
  status: string;
  source: string;
  tags: string[];
  closest_lgs: { id: number; name: string; town: string } | null;
  plane_projects: PlaneProject[];
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  notes: string | null;
};
type Viewer = { id: number; email: string; plane_user_id: string | null };
type Member = { id: string; email: string; display_name: string; is_admin: boolean };

async function crmFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/crm-api${path}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...init,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || "CRM request failed.");
  }
  return data as T;
}

export function CrmTable({ projectId }: { projectId?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [projects, setProjects] = useState<PlaneProject[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canView, setCanView] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const query = projectId ? `?plane_project_id=${encodeURIComponent(projectId)}` : "";
    Promise.all([
      crmFetch<{ can_view: boolean; is_admin: boolean; members?: Member[] }>("/me"),
      crmFetch<{ contacts: CrmContact[]; projects: PlaneProject[] }>(`/contacts${query}`).catch(() => ({
        contacts: [],
        projects: [],
      })),
    ])
      .then(async ([me, list]) => {
        if (cancelled) return;
        setCanView(me.can_view);
        setIsAdmin(me.is_admin);
        setContacts(list.contacts || []);
        setProjects(list.projects || []);
        if (me.is_admin) {
          const [viewerPayload, memberPayload] = await Promise.all([
            crmFetch<{ viewers: Viewer[] }>("/viewers"),
            crmFetch<{ members: Member[] }>("/members").catch(() => ({ members: me.members || [] })),
          ]);
          if (cancelled) return;
          setMembers(memberPayload.members || []);
          const next: Record<string, boolean> = {};
          (viewerPayload.viewers || []).forEach((viewer) => {
            next[viewer.email] = true;
          });
          setSelected(next);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const saveProjects = (contactId: number, planeProjectIds: string[]) => {
    crmFetch(`/contacts/${contactId}/plane-projects`, {
      method: "PATCH",
      body: JSON.stringify({ plane_project_ids: planeProjectIds }),
    }).catch((err: Error) => setError(err.message));
  };

  const saveViewers = () => {
    const payload = members
      .filter((member) => selected[member.email.toLowerCase()])
      .map((member) => ({
        email: member.email.toLowerCase(),
        plane_user_id: member.id,
      }));
    crmFetch("/viewers", {
      method: "PUT",
      body: JSON.stringify({ viewers: payload }),
    })
      .then(() => setError(null))
      .catch((err: Error) => setError(err.message));
  };

  if (error) {
    return <p className="text-13 text-red-400">{error}</p>;
  }
  if (!canView) {
    return <p className="text-13 text-secondary">You do not have permission to view CRM.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {isAdmin && !projectId && (
        <div className="rounded-lg border border-subtle bg-surface-2 p-3">
          <p className="mb-2 text-13 text-secondary">Who can view CRM. Workspace admins always can.</p>
          <div className="grid gap-1">
            {members
              .filter((member) => !member.is_admin)
              .map((member) => {
                const email = member.email.toLowerCase();
                return (
                  <label key={member.id} className="flex items-center gap-2 text-13">
                    <input
                      type="checkbox"
                      checked={!!selected[email]}
                      onChange={(event) =>
                        setSelected((current) => ({ ...current, [email]: event.target.checked }))
                      }
                    />
                    {member.display_name} ({email})
                  </label>
                );
              })}
          </div>
          <button
            type="button"
            className="mt-3 rounded border border-subtle px-3 py-1 text-13"
            onClick={saveViewers}
          >
            Save access
          </button>
        </div>
      )}
      <div className="overflow-auto">
        <table className="w-full min-w-[720px] text-left text-13">
          <thead>
            <tr className="text-secondary">
              <th className="border-b border-subtle px-2 py-2 font-medium">Contact</th>
              <th className="border-b border-subtle px-2 py-2 font-medium">Email</th>
              <th className="border-b border-subtle px-2 py-2 font-medium">Phone</th>
              <th className="border-b border-subtle px-2 py-2 font-medium">Region</th>
              <th className="border-b border-subtle px-2 py-2 font-medium">Closest LGS</th>
              <th className="border-b border-subtle px-2 py-2 font-medium">Status</th>
              <th className="border-b border-subtle px-2 py-2 font-medium">Projects</th>
              <th className="border-b border-subtle px-2 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr>
                <td className="px-2 py-3 text-secondary" colSpan={8}>
                  No contacts yet.
                </td>
              </tr>
            )}
            {contacts.map((contact) => (
              <tr key={contact.id}>
                <td className="border-b border-subtle px-2 py-2">{contact.name}</td>
                <td className="border-b border-subtle px-2 py-2">{contact.email}</td>
                <td className="border-b border-subtle px-2 py-2">{contact.phone}</td>
                <td className="border-b border-subtle px-2 py-2">{contact.region}</td>
                <td className="border-b border-subtle px-2 py-2">{contact.closest_lgs?.name}</td>
                <td className="border-b border-subtle px-2 py-2">{contact.status}</td>
                <td className="border-b border-subtle px-2 py-2">
                  {isAdmin
                    ? projects.map((project) => {
                        const assigned = contact.plane_projects.some((item) => item.id === project.id);
                        return (
                          <label key={project.id} className="mr-2 inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              defaultChecked={assigned}
                              onChange={(event) => {
                                const current = contact.plane_projects.map((item) => item.id);
                                const next = event.target.checked
                                  ? [...current, project.id]
                                  : current.filter((id) => id !== project.id);
                                saveProjects(contact.id, next);
                              }}
                            />
                            {project.identifier || project.label}
                          </label>
                        );
                      })
                    : contact.plane_projects.map((project) => project.identifier || project.label).join(", ")}
                </td>
                <td className="border-b border-subtle px-2 py-2">{contact.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
