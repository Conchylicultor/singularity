import type { PluginDefinition } from "@core";

export { PromptEditor } from "./components/prompt-editor";
export { AttachmentThumbnail } from "./components/attachment-thumbnail";
export { Lightbox } from "./components/lightbox";

export {
  attachmentUrl,
  attachmentMarkdown,
  extractAttachmentIds,
  rewriteAttachmentMarkdown,
  isAttachmentUrl,
  ATTACHMENT_MARKDOWN_RE,
} from "../shared";

export default {
  id: "paste-images",
  name: "Paste Images",
  description:
    "Lexical-based prompt editor with paste-image support and rich thumbnails (hover-× remove, click-to-expand lightbox). Pasted images upload to the attachments primitive; editor serializes to markdown with `![](/api/attachments/<id>)` refs.",
  contributions: [],
} satisfies PluginDefinition;
