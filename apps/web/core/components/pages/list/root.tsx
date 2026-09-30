/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import type { TPageNavigationTabs } from "@plane/types";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
import { ListLayout } from "@/components/core/list";
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";
import { useMultipleSelect } from "@/hooks/use-multiple-select";
import { PageListBlock } from "./block";
import { PageBulkMoveBar } from "./bulk-move-bar";
import { pageParentId } from "./folder";

type TPagesListRoot = {
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
};

export const PagesListRoot = observer(function PagesListRoot(props: TPagesListRoot) {
  const { pageType, storeType } = props;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { filters, getCurrentProjectFilteredPageIdsByTab, getPageById, movePagesToParent } = usePageStore(storeType);
  const filteredPageIds = getCurrentProjectFilteredPageIdsByTab(pageType) ?? [];
  const searching = filters.searchQuery.trim().length > 0;
  const visiblePageIds = searching
    ? filteredPageIds
    : filteredPageIds.filter((pageId) => !pageParentId(getPageById(pageId)));
  const entities = useMemo(() => ({ docs: filteredPageIds }), [filteredPageIds]);
  const selectionHelpers = useMultipleSelect({
    containerRef,
    disabled: pageType === "archived",
    entities,
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => source.data.type === "PAGE",
      getData: () => ({ type: "PAGE_ROOT" }),
      onDrop: async ({ source, location }) => {
        const droppedOnSelf = location.current.dropTargets.some((target) => target.data.type === "PAGE");
        if (droppedOnSelf || source.data.type !== "PAGE" || typeof source.data.id !== "string") {
          return;
        }
        try {
          await movePagesToParent([source.data.id], null);
        } catch {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: "Could not move to Docs.",
          });
        }
      },
    });
  }, [movePagesToParent]);

  if (!filteredPageIds.length) return <></>;

  return (
    <div ref={containerRef} className={cn("flex h-full min-h-0 flex-col overflow-hidden")}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <ListLayout>
          {visiblePageIds.map((pageId) => (
            <PageListBlock
              key={pageId}
              pageId={pageId}
              pageType={pageType}
              storeType={storeType}
              depth={0}
              selectionHelpers={selectionHelpers}
            />
          ))}
        </ListLayout>
      </div>
      <PageBulkMoveBar selectionHelpers={selectionHelpers} storeType={storeType} />
    </div>
  );
});
