/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Button } from "@plane/propel/button";
import { DueDatePropertyIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { DateDropdown } from "@/components/dropdowns/date";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";

type Props = {
  className?: string;
  selectionHelpers: TSelectionHelper;
};

export const BulkDateOperationsBar = observer(function BulkDateOperationsBar(props: Props) {
  const { className, selectionHelpers } = props;
  const { workspaceSlug, projectId } = useParams();
  const { selectedEntityIds } = useMultipleSelectStore();
  const { issues, issueMap } = useIssuesStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyDates = async (field: "start_date" | "target_date", date: Date | null) => {
    if (!workspaceSlug || !date) return;

    const formattedDate = renderFormattedPayloadDate(date);
    if (!formattedDate) return;

    const grouped: Record<string, { id: string; start_date?: string; target_date?: string }[]> = {};

    selectedEntityIds.forEach((issueId) => {
      const issue = issueMap[issueId];
      const issueProjectId = issue?.project_id ?? projectId?.toString();
      if (!issueProjectId) return;
      if (!grouped[issueProjectId]) grouped[issueProjectId] = [];
      grouped[issueProjectId].push({ id: issueId, [field]: formattedDate });
    });

    if (Object.keys(grouped).length === 0) return;

    setIsSubmitting(true);
    try {
      await Promise.all(
        Object.entries(grouped).map(([issueProjectId, updates]) =>
          issues.updateIssueDates(workspaceSlug.toString(), updates, issueProjectId)
        )
      );
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: `${field === "target_date" ? "Due date" : "Start date"} set on ${selectedEntityIds.length} work items.`,
      });
      selectionHelpers.handleClearSelection();
    } catch (error) {
      const message =
        typeof error === "object" && error && "message" in error && typeof error.message === "string"
          ? error.message
          : "Could not update dates. Please try again.";
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn("sticky bottom-0 left-0 z-[2] grid h-20 place-items-center px-3.5", className)}>
      <div className="flex h-14 w-full items-center justify-between gap-3 rounded-md border-[0.5px] border-accent-strong/50 bg-layer-1 px-3.5 py-3 shadow-sm">
        <p className="shrink-0 font-medium text-primary">
          {selectedEntityIds.length} work item{selectedEntityIds.length === 1 ? "" : "s"} selected
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <DateDropdown
            value={null}
            onChange={(date) => applyDates("start_date", date)}
            placeholder="Start date"
            buttonVariant="border-with-text"
            disabled={isSubmitting}
            isClearable={false}
            closeOnSelect
            optionsClassName="z-30"
          />
          <DateDropdown
            value={null}
            onChange={(date) => applyDates("target_date", date)}
            placeholder="Due date"
            icon={<DueDatePropertyIcon className="h-3 w-3 flex-shrink-0" />}
            buttonVariant="border-with-text"
            disabled={isSubmitting}
            isClearable={false}
            closeOnSelect
            optionsClassName="z-30"
          />
          <Button
            variant="secondary"
            size="base"
            onClick={selectionHelpers.handleClearSelection}
            disabled={isSubmitting}
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
});
