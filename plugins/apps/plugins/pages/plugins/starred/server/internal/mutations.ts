import { nextRankIn } from "@plugins/primitives/plugins/rank/server";
import { pageBlocksStarred, _pageBlocksStarredExt } from "./tables";
import { starredPagesServerResource } from "./resource";

export async function setPageStarred(pageId: string, starred: boolean): Promise<void> {
  if (starred) {
    const rank = await nextRankIn(_pageBlocksStarredExt);
    await pageBlocksStarred.upsert(pageId, { rank: rank.toString() });
  } else {
    await pageBlocksStarred.delete(pageId);
  }
  starredPagesServerResource.notify();
}

export async function movePageStarred(pageId: string, rank: string): Promise<void> {
  await pageBlocksStarred.upsert(pageId, { rank });
  starredPagesServerResource.notify();
}
