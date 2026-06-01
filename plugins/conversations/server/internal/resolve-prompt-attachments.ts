import { getAttachment } from "@plugins/infra/plugins/attachments/server";
import {
  extractAttachmentIds,
  rewriteAttachmentMarkdown,
} from "@plugins/primitives/plugins/text-editor/plugins/paste-images/core";

// Convert in-prompt attachment refs (`![alt](/api/attachments/<id>)`) into
// Claude's disk-path syntax (`@<absolute-path>`). Missing attachments are
// stripped — better to drop a dangling ref than to surface a 404 URL into
// the prompt the agent sees.
//
// Returns the rewritten prompt text plus the set of resolved attachment ids
// (so the caller can link them to whatever owner row they're submitting
// against — conversation, task, etc.).
export async function resolveAttachmentRefs(text: string): Promise<{
  text: string;
  attachmentIds: string[];
}> {
  const referenced = extractAttachmentIds(text);
  if (referenced.length === 0) {
    return { text, attachmentIds: [] };
  }
  const pathById = new Map<string, string>();
  await Promise.all(
    referenced.map(async (id) => {
      const att = await getAttachment(id);
      if (att) pathById.set(id, att.diskPath);
    }),
  );
  // Trailing space is load-bearing: two adjacent image nodes serialize as
  // `![](url1)![](url2)` with no separator. Without the space they'd fuse into
  // `@path1@path2`, which Claude's `@`-reference expansion (and our transcript
  // parser) both read as a single bogus path — so only the first image, or
  // neither, gets attached. The space keeps each `@<path>` a distinct token.
  const rewritten = rewriteAttachmentMarkdown(text, (id) => {
    const path = pathById.get(id);
    return path ? `@${path} ` : "";
  });
  return { text: rewritten, attachmentIds: Array.from(pathById.keys()) };
}
