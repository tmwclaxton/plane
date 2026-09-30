import type { FormEvent } from "react";
import { useState } from "react";
import { EPageAccess } from "@plane/constants";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPage } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
import { PAGE_FOLDER_LOGO } from "@/components/pages/list/folder";
import type { EPageStoreType } from "@/hooks/store";
import { usePageStore } from "@/hooks/store";

type Props = {
  isOpen: boolean;
  pageAccess?: EPageAccess;
  storeType: EPageStoreType;
  onClose: () => void;
};

export function CreateFolderModal(props: Props) {
  const { isOpen, pageAccess = EPageAccess.PUBLIC, storeType, onClose } = props;
  const { createPage } = usePageStore(storeType);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setName("");
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const folderName = name.trim();
    if (!folderName) return;
    setIsSubmitting(true);
    const payload: Partial<TPage> = {
      name: folderName,
      access: pageAccess,
      parent: null,
      view_props: { full_width: false, is_folder: true },
      logo_props: PAGE_FOLDER_LOGO,
    };
    try {
      await createPage(payload);
      reset();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || error?.data?.error || "Folder could not be created. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={reset} position={EModalPosition.TOP} width={EModalWidth.LG}>
      <form onSubmit={handleSubmit} className="space-y-5 p-5">
        <h3 className="text-18 font-medium text-secondary">Create folder</h3>
        <Input
          id="folder-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Folder name"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={reset} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" disabled={!name.trim()} loading={isSubmitting}>
            {isSubmitting ? "Adding" : "Add folder"}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}
