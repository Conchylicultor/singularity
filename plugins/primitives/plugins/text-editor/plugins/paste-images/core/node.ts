import { defineInlineTokenNode } from "@plugins/primitives/plugins/text-editor/plugins/token-extension/plugins/node/core";
import { attachmentMarkdown, isAttachmentUrl } from "./internal/markdown";

/**
 * The pasted-attachment-image token family's ONE declaration. Its token is
 * ordinary image markdown pointing at an attachment — `![alt](/api/attachments/<id>)`.
 *
 * A `type` alias, never an `interface`: TypeScript grants an implicit index
 * signature to the former only, and without it this does not satisfy the
 * `F extends TokenFields` constraint — `defineInlineTokenNode` rejects it.
 */
export type ImageFields = { attachmentId: string; alt: string };

/**
 * `textContent: "empty"` — a thumbnail is an object in the line, not characters,
 * and the markdown that describes it is written by the extension's serializer.
 */
export const imageNode = defineInlineTokenNode<ImageFields>({
  type: "paste-image",
  fields: ["attachmentId", "alt"],
  token: ({ attachmentId, alt }) => attachmentMarkdown(attachmentId, alt),
  // Image markdown pointing ANYWHERE ELSE is not this token: returning null
  // leaves those bytes as plain text rather than swallowing the span.
  fieldsOf: (match) => {
    const attachmentId = isAttachmentUrl(match[2]!);
    return attachmentId === null ? null : { attachmentId, alt: match[1] ?? "" };
  },
  textContent: "empty",
});
