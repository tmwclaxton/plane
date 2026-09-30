/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { observer } from "mobx-react";
import { ChevronDown, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageNavigationTabs } from "@plane/types";
import { cn, getPageName } from "@plane/utils";
import { ListItem } from "@/components/core/list";
import { MultipleSelectEntityAction } from "@/components/core/multiple-select";
import { BlockItemAction } from "@/components/pages/list/block-item-action";
import type { EPageStoreType } from "@/hooks/store";
import { usePage, usePageStore } from "@/hooks/store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { canMovePageToParent, isPageFolder, pageParentId } from "./folder";

type TPageListBlock = {
  pageId: string;
  pageType: TPageNavigationTabs;
  storeType: EPageStoreType;
  depth?: number;
  selectionHelpers: TSelectionHelper;
};

export const PageListBlock = observer(function PageListBlock(props: TPageListBlock) {
  const { pageId, pageType, storeType, depth = 0, selectionHelpers } = props;
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(true);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const page = usePage({
    pageId,
    storeType,
  });
  const { isMobile } = usePlatformOS();
  const { data, filters, getCurrentProjectFilteredPageIdsByTab, getPageById, movePagesToParent } =
    usePageStore(storeType);

  useEffect(() => {
    const element = parentRef.current;
    if (!element || !page) {
      return;
    }
    const folder = isPageFolder(page);
    return combine(
      draggable({
        element,
        getInitialData: () => ({ type: "PAGE", id: pageId, isFolder: folder }),
      }),
      dropTargetForElements({
        element,
        getData: () => ({ type: "PAGE", id: pageId }),
        canDrop: ({ source }) => {
          if (source.data.type !== "PAGE" || typeof source.data.id !== "string") {
            return false;
          }
          return folder && canMovePageToParent(data, source.data.id, pageId);
        },
        onDragEnter: () => setIsDropTarget(true),
        onDragLeave: () => setIsDropTarget(false),
        onDrop: async ({ source }) => {
          setIsDropTarget(false);
          if (source.data.type !== "PAGE" || typeof source.data.id !== "string") {
            return;
          }
          try {
            await movePagesToParent([source.data.id], pageId);
            setIsOpen(true);
          } catch {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: "Error!",
              message: "Could not move into that folder.",
            });
          }
        },
      })
    );
  }, [data, page, pageId, movePagesToParent]);

  if (!page) return null;

  const { name, logo_props, getRedirectionLink } = page;
  const folder = isPageFolder(page);
  const searching = filters.searchQuery.trim().length > 0;
  const childIds = (getCurrentProjectFilteredPageIdsByTab(pageType) ?? []).filter(
    (id) => pageParentId(getPageById(id)) === pageId
  );
  const showChildren = folder && !searching && isOpen;

  return (
    <>
      <ListItem
        className={cn(depth ? "border-subtle/80" : undefined, isDropTarget ? "bg-accent-primary/10" : undefined)}
        prependTitleElement={
          <span className="flex items-center gap-2" style={depth ? { marginLeft: `${depth * 1.25}rem` } : undefined}>
            <MultipleSelectEntityAction
              groupId="docs"
              id={pageId}
              selectionHelpers={selectionHelpers}
            />
            {folder && !searching ? (
              isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-tertiary" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-tertiary" />
              )
            ) : null}
            {logo_props?.in_use ? (
              <Logo logo={logo_props} size={16} type="lucide" />
            ) : folder ? (
              isOpen ? (
                <FolderOpen className="h-4 w-4 text-tertiary" />
              ) : (
                <Folder className="h-4 w-4 text-tertiary" />
              )
            ) : (
              <PageIcon className="h-4 w-4 text-tertiary" />
            )}
          </span>
        }
        title={getPageName(name)}
        itemLink={getRedirectionLink()}
        onItemClick={
          folder
            ? (event) => {
                event.preventDefault();
                if (!searching) {
                  setIsOpen((current) => !current);
                }
              }
            : undefined
        }
        actionableItems={<BlockItemAction page={page} parentRef={parentRef} storeType={storeType} />}
        isMobile={isMobile}
        parentRef={parentRef}
      />
      {showChildren
        ? childIds.map((childId) => (
            <PageListBlock
              key={childId}
              pageId={childId}
              pageType={pageType}
              storeType={storeType}
              depth={depth + 1}
              selectionHelpers={selectionHelpers}
            />
          ))
        : null}
    </>
  );
});
