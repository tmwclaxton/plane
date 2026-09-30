import { observer } from "mobx-react";
import { Folder } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { getPageName } from "@plane/utils";
import { canMovePageToParent, folderPathLabel, isPageFolder } from "@/components/pages/list/folder";
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";

type Props = {
  isOpen: boolean;
  pageIds: string[];
  storeType: EPageStoreType;
  onClose: () => void;
  onMoved?: () => void;
};

export const MovePagesModal = observer(function MovePagesModal(props: Props) {
  const { isOpen, pageIds, storeType, onClose, onMoved } = props;
  const { data, movePagesToParent } = usePageStore(storeType);

  const folders = Object.values(data)
    .filter(
      (page) =>
        page.id &&
        isPageFolder(page) &&
        pageIds.every((pageId) => canMovePageToParent(data, pageId, page.id ?? null))
    )
    .sort((left, right) =>
      folderPathLabel(data, left.id ?? "").localeCompare(folderPathLabel(data, right.id ?? ""), undefined, {
        sensitivity: "base",
      })
    );

  const moveTo = async (parentId: string | null) => {
    try {
      await movePagesToParent(pageIds, parentId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Moved",
        message: parentId ? "Items moved into the folder." : "Items moved to Docs.",
      });
      onMoved?.();
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Could not move items. Please try again.",
      });
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.LG}>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="text-18 font-medium text-secondary">Move to folder</h3>
          <p className="mt-1 text-13 text-tertiary">
            {pageIds.length} selected. Pick a folder, or send them back to the Docs root.
          </p>
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md border border-subtle px-3 py-2 text-left text-13 hover:bg-layer-2"
          onClick={() => moveTo(null)}
        >
          Docs root
        </button>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-13 hover:bg-layer-2"
              onClick={() => folder.id && moveTo(folder.id)}
            >
              <Folder className="h-4 w-4 shrink-0 text-tertiary" />
              <span className="truncate">{folderPathLabel(data, folder.id ?? "") || getPageName(folder.name)}</span>
            </button>
          ))}
          {folders.length === 0 ? <p className="px-1 text-13 text-tertiary">No folders yet.</p> : null}
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
