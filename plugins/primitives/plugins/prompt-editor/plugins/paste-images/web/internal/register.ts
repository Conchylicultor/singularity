import { registerNodeExtension } from "@plugins/primitives/plugins/prompt-editor/web";
import { ImageNode, $createImageNode, $isImageNode } from "./image-node";
import {
  ATTACHMENT_MARKDOWN_RE,
  isAttachmentUrl,
  attachmentMarkdown,
} from "./markdown";

registerNodeExtension({
  node: ImageNode,
  serializeNode: (node) => {
    if (!$isImageNode(node)) return null;
    return attachmentMarkdown(node.getAttachmentId(), node.getAlt());
  },
  deserializePattern: ATTACHMENT_MARKDOWN_RE,
  createNodeFromMatch: (match) => {
    const id = isAttachmentUrl(match[2]!);
    if (!id) return null;
    return $createImageNode({ attachmentId: id, alt: match[1] ?? "" });
  },
});
