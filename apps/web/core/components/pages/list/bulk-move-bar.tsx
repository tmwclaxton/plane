import { useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { MovePagesModal } from "@/components/pages/modals/move-pages-modal";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import type { EPageStoreType } from "@/hooks/store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";

type Props = {
  selectionHelpers: TSelectionHelper;
  storeType: EPageStoreType;
};

export const PageBulkMoveBar = observer(function PageBulkMoveBar(props: Props) {
  const { selectionHelpers, storeType } = props;
  const { isSelectionActive, selectedEntityIds } = useMultipleSelectStore();
  const [isMoveOpen, setIsMoveOpen] = useState(false);

  if (!isSelectionActive || selectionHelpers.isSelectionDisabled || selectedEntityIds.length === 0) {
    return null;
  }

  return (
    <>
      <div className={cn("sticky bottom-0 left-0 z-[2] grid h-20 place-items-center px-3.5")}>
        <div className="flex h-14 w-full items-center justify-between gap-3 rounded-md border-[0.5px] border-accent-strong/50 bg-layer-1 px-3.5 py-3 shadow-sm">
          <p className="shrink-0 font-medium text-primary">
            {selectedEntityIds.length} selected
          </p>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="base" onClick={() => setIsMoveOpen(true)}>
              Move
            </Button>
            <Button variant="secondary" size="base" onClick={selectionHelpers.handleClearSelection}>
              Clear
            </Button>
          </div>
        </div>
      </div>
      <MovePagesModal
        isOpen={isMoveOpen}
        pageIds={selectedEntityIds}
        storeType={storeType}
        onClose={() => setIsMoveOpen(false)}
        onMoved={() => {
          setIsMoveOpen(false);
          selectionHelpers.handleClearSelection();
        }}
      />
    </>
  );
});
