import { storyMark } from "./tables";

export async function getStoryMark(pageId: string) {
  return storyMark.get(pageId);
}

// Upsert when a mark is given, delete when null. Notifies the live-state
// resource so every surface re-renders. No page-exists check — the FK to
// page_blocks enforces it and fails loud on a bogus pageId.
export async function setStoryMark(
  pageId: string,
  mark: { defaultRendererId: string | null } | null,
): Promise<void> {
  if (mark) {
    await storyMark.upsert(pageId, { defaultRendererId: mark.defaultRendererId });
  } else {
    await storyMark.delete(pageId);
  }
}
