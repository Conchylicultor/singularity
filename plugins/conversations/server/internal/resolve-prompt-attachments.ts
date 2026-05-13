import { getAttachment } from "@plugins/infra/plugins/attachments/server";
import {
  extractAttachmentIds,
  rewriteAttachmentMarkdown,
} from "@plugins/primitives/plugins/prompt-editor/plugins/paste-images/core";

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
  const rewritten = rewriteAttachmentMarkdown(text, (id) => {
    const path = pathById.get(id);
    return path ? `@${path}` : "";
  });
  return { text: rewritten, attachmentIds: Array.from(pathById.keys()) };
}
