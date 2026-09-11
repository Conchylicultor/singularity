import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { TextEditorSlots } from "@plugins/primitives/plugins/text-editor/web";
import { ImageUploadPlugin } from "./internal/image-upload-plugin";
import "./internal/register";

export { AttachmentThumbnail } from "./components/attachment-thumbnail";
export {
  attachmentUrl,
  attachmentMarkdown,
  extractAttachmentIds,
  rewriteAttachmentMarkdown,
  isAttachmentUrl,
  ATTACHMENT_MARKDOWN_RE,
} from "./internal/markdown";

export default {
  description:
    "Image paste/drop support for the text editor. Uploads images via the attachments primitive and renders them as inline thumbnail chips that open the full-window image viewer.",
  contributions: [
    TextEditorSlots.Plugin({
      id: "paste-images",
      component: ImageUploadPlugin,
    }),
  ],
} satisfies PluginDefinition;
