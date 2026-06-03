import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { deleteDocument } from "../../core/endpoints";
import { _documents } from "./tables";
import { documentsLiveResource, blocksLiveResource } from "./resources";
import { DocumentLifecycle } from "./document-hooks";
import { collectDocumentSubtree } from "./collect-subtree";

export const handleDeleteDocument = implement(deleteDocument, async ({ params }) => {
  // The FK cascade silently removes the whole subtree (descendants + blocks +
  // page_links edges). Snapshot the subtree and let registered hooks capture any
  // derived state that depends on those soon-to-vanish rows before they go.
  const subtreeIds = await collectDocumentSubtree(params.id);
  const afterCallbacks: Array<() => void | Promise<void>> = [];
  for (const hook of DocumentLifecycle.BeforeDelete.getContributions()) {
    const after = await hook.beforeDelete(subtreeIds);
    if (after) afterCallbacks.push(after);
  }

  const [row] = await db
    .delete(_documents)
    .where(eq(_documents.id, params.id))
    .returning();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(404, "Not found");
  documentsLiveResource.notify();
  // The deleted doc's blocks are FK-cascade-removed; notify that document's
  // (now-empty) per-document blocks resource so any open subscriber reloads.
  blocksLiveResource.notify({ documentId: params.id });
  // Hooks re-push state that depended on the cascade-deleted rows (e.g. the
  // backlinks panels of pages the deleted subtree linked to).
  for (const after of afterCallbacks) await after();
});
