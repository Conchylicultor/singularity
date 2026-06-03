import { and, eq, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _documents, _blocks } from "@plugins/page/plugins/editor/server";
import { PageLinks } from "./extractor";
import { backlinksResource } from "./resources";
import { _pageLinks } from "./tables";

// Rebuild the outgoing link edges for a single source document.
//
// 1. Load the document's blocks.
// 2. Dispatch each block generically by `block.type` over the collected
//    extractors (collection-consumer separation — never names a block type).
// 3. Dedupe targets, drop self-references and ids that don't exist in
//    page_documents.
// 4. Diff against the existing page_links rows for this source; insert added
//    edges, delete removed ones.
// 5. Notify `backlinksResource` for every affected target (old ∪ new) so
//    those pages' panels refresh live.
export async function reindexDocument(documentId: string): Promise<void> {
  // type → extract, built fresh each call so newly-registered extractors are
  // always honored. `getContributions()` reads the populated server registry.
  const extractors = new Map<string, (data: unknown) => string[]>();
  for (const c of PageLinks.Extractor.getContributions()) {
    extractors.set(c.type, c.extract);
  }

  const blocks = await db
    .select({ type: _blocks.type, data: _blocks.data })
    .from(_blocks)
    .where(eq(_blocks.documentId, documentId));

  const targets = new Set<string>();
  for (const block of blocks) {
    const extract = extractors.get(block.type);
    if (!extract) continue;
    for (const id of extract(block.data)) {
      if (id && id !== documentId) targets.add(id);
    }
  }

  // Validate targets against page_documents — drop links to non-existent pages.
  let validTargets = new Set<string>();
  if (targets.size > 0) {
    const existing = await db
      .select({ id: _documents.id })
      .from(_documents)
      .where(inArray(_documents.id, [...targets]));
    validTargets = new Set(existing.map((r) => r.id));
  }

  const existingEdges = await db
    .select({ targetDocumentId: _pageLinks.targetDocumentId })
    .from(_pageLinks)
    .where(eq(_pageLinks.sourceDocumentId, documentId));
  const oldTargets = new Set(existingEdges.map((r) => r.targetDocumentId));

  const toInsert = [...validTargets].filter((t) => !oldTargets.has(t));
  const toDelete = [...oldTargets].filter((t) => !validTargets.has(t));

  if (toInsert.length > 0) {
    await db.insert(_pageLinks).values(
      toInsert.map((targetDocumentId) => ({
        sourceDocumentId: documentId,
        targetDocumentId,
      })),
    );
  }
  if (toDelete.length > 0) {
    await db
      .delete(_pageLinks)
      .where(
        and(
          eq(_pageLinks.sourceDocumentId, documentId),
          inArray(_pageLinks.targetDocumentId, toDelete),
        ),
      );
  }

  // Affected targets = old ∪ new; notify each so its backlinks panel refreshes.
  const affected = new Set<string>([...oldTargets, ...validTargets]);
  for (const pageId of affected) {
    backlinksResource.notify({ pageId });
  }
}
