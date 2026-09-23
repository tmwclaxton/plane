/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { PageHead } from "@/components/core/page-title";
import { CrmTable } from "@/components/crm/crm-table";

export default function WorkspaceCrmPage() {
  return (
    <>
      <PageHead title="CRM" />
      <div className="flex h-full w-full flex-col gap-4 overflow-auto p-4">
        <div>
          <h3 className="text-16 font-semibold text-primary">CRM</h3>
          <p className="mt-1 text-13 text-secondary">
            Shared with the LGS admin CRM. No WhatsApp or Bumble logs here.
          </p>
        </div>
        <CrmTable />
      </div>
    </>
  );
}
