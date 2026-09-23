/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { CrmTable } from "@/components/crm/crm-table";
import { useProject } from "@/hooks/store/use-project";

export default observer(function ProjectCrmPage() {
  const { projectId } = useParams();
  const { getProjectById } = useProject();
  const project = projectId ? getProjectById(projectId.toString()) : undefined;

  return (
    <>
      <PageHead title={project?.identifier ? `${project.identifier} CRM` : "CRM"} />
      <div className="flex h-full w-full flex-col gap-4 overflow-auto p-4">
        <div>
          <h3 className="text-16 font-semibold text-primary">CRM</h3>
          <p className="mt-1 text-13 text-secondary">
            Contacts tagged to this project. Shared with the LGS admin CRM.
          </p>
        </div>
        <CrmTable projectId={projectId?.toString()} />
      </div>
    </>
  );
});
