import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { serializePageContent } from "@plugins/page/plugins/editor/server";
import { serializeForestToMarkdown } from "@plugins/page/plugins/editor/core";
import { markdownNodesOfRows } from "../../core";
import { serverMarkdownContext } from "./markdown-context";

/**
 * A page's content as the markdown an agent edits.
 *
 * `markdownNodesOfRows` stamps each row's id onto its node, which is what makes
 * `<page id="…"/>` a POINTER a later apply can reconcile against the existing
 * shell rather than a tag it has to re-mint. It is also the same walk the
 * planner flattens the stored side with — the two must not diverge, or the
 * apply would be a diff against a document nobody ever saw.
 */
export async function readPageAsMarkdown(pageId: string): Promise<string> {
  const snapshot = await serializePageContent(pageId);
  if (!snapshot) {
    throw new HttpError(404, `page ${pageId} does not exist`);
  }
  return serializeForestToMarkdown(
    markdownNodesOfRows(snapshot.blocks, pageId),
    serverMarkdownContext(),
  );
}
