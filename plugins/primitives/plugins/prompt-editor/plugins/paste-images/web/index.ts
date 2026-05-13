import type { PluginDefinition } from "@core";
import { PromptEditorSlots } from "@plugins/primitives/plugins/prompt-editor/web";
import { ImageUploadPlugin } from "./internal/image-upload-plugin";
import "./internal/register";

export { AttachmentThumbnail } from "./components/attachment-thumbnail";
export { Lightbox } from "./components/lightbox";
export {
  attachmentUrl,
  attachmentMarkdown,
  extractAttachmentIds,
  rewriteAttachmentMarkdown,
  isAttachmentUrl,
  ATTACHMENT_MARKDOWN_RE,
} from "./internal/markdown";

export default {
  id: "paste-images",
  name: "Paste Images",
  description:
    "Image paste/drop support for the prompt editor. Uploads images via the attachments primitive and renders inline thumbnails with lightbox expand.",
  contributions: [
    PromptEditorSlots.Plugin({
      id: "paste-images",
      component: ImageUploadPlugin,
    }),
  ],
} satisfies PluginDefinition;
