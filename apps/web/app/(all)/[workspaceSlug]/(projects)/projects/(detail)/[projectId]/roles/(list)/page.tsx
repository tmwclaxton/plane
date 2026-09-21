/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { RolesTable } from "@/components/roles/roles-table";
import { useProject } from "@/hooks/store/use-project";

export default observer(function ProjectRolesPage() {
  const { projectId } = useParams();
  const { getProjectById } = useProject();
  const project = projectId ? getProjectById(projectId.toString()) : undefined;

  return (
    <>
      <PageHead title={project?.identifier ? `${project.identifier} Roles` : "Roles"} />
      <div className="flex h-full w-full flex-col gap-4 overflow-auto p-4">
        <div>
          <h3 className="text-16 font-semibold text-primary">Roles</h3>
          <p className="mt-1 text-13 text-secondary">
            One person per role. Meetup planning stays in Cycles and Work items.
          </p>
        </div>
        <RolesTable />
      </div>
    </>
  );
});
