import type { PluginDefinition } from "@core";

export { uploadAttachment } from "./internal/upload";
export type { UploadedAttachment } from "./internal/upload";
export { listAttachments } from "./internal/list";
export type { Attachment } from "./internal/list";

export default {
  id: "attachments",
  name: "Attachments",
  description:
    "Polymorphic file attachments. Exposes uploadAttachment() helper; storage/serve on the server plugin.",
  contributions: [],
} satisfies PluginDefinition;
