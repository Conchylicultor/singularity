import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { uploadAttachment } from "./internal/upload";
export type { UploadedAttachment } from "./internal/upload";
export { listAttachments } from "./internal/list";
export type { Attachment } from "./internal/list";

export default {
  description:
    "Polymorphic file attachments. Exposes uploadAttachment() helper; storage/serve on the server plugin.",
  contributions: [],
} satisfies PluginDefinition;
