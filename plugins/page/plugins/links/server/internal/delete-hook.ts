import { inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { DocumentDeleteHook } from "@plugins/page/plugins/editor/server";
import { backlinksResource } from "./resources";
import { _pageLinks } from "./tables";

// A deleted subtree's outgoing page_links edges are FK-cascade-wiped. Snapshot
// the target pages BEFORE the delete, then re-push their backlinks panels AFTER
// (loader returns the fresh list, minus the deleted sources). Targets inside the
// deleted subtree are skipped — their own panels are gone.
export const backlinksDeleteHook: DocumentDeleteHook = {
  beforeDelete: async (documentIds) => {
    const deleted = new Set(documentIds);
    const rows = await db
      .select({ targetDocumentId: _pageLinks.targetDocumentId })
      .from(_pageLinks)
      .where(inArray(_pageLinks.sourceDocumentId, documentIds));
    const affected = new Set(
      rows.map((r) => r.targetDocumentId).filter((t) => !deleted.has(t)),
    );
    return () => {
      for (const pageId of affected) backlinksResource.notify({ pageId });
    };
  },
};
