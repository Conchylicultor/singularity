import { pageBlocksStarred } from "./tables";

export async function setPageStarred(pageId: string, starred: boolean): Promise<void> {
  if (starred) {
    await pageBlocksStarred.upsert(pageId, {});
  } else {
    await pageBlocksStarred.delete(pageId);
  }
}
