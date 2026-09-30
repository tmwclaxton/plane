import type { TLogoProps, TPage } from "@plane/types";

export const PAGE_FOLDER_LOGO: TLogoProps = {
  in_use: "icon",
  icon: {
    name: "Folder",
    color: "#3d6b48",
  },
};

export function isPageFolder(page?: Pick<TPage, "view_props"> | null): boolean {
  return page?.view_props?.is_folder === true;
}

export function pageParentId(page?: Pick<TPage, "parent"> | null): string | null {
  return page?.parent ?? null;
}

export function canMovePageToParent(
  pages: Record<string, Pick<TPage, "id" | "parent"> | undefined>,
  pageId: string,
  parentId: string | null
): boolean {
  if (!parentId) {
    return true;
  }
  if (pageId === parentId) {
    return false;
  }
  const seen = new Set<string>();
  let current: string | null = parentId;
  while (current) {
    if (current === pageId) {
      return false;
    }
    if (seen.has(current)) {
      return false;
    }
    seen.add(current);
    current = pages[current]?.parent ?? null;
  }
  return true;
}

export function folderPathLabel(
  pages: Record<string, Pick<TPage, "id" | "name" | "parent"> | undefined>,
  folderId: string
): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let current: string | null = folderId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const page = pages[current];
    if (!page) {
      break;
    }
    parts.unshift(page.name?.trim() || "Untitled");
    current = page.parent ?? null;
  }
  return parts.join(" / ");
}
