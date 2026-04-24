import type { PluginDefinition } from "@core";

export { uploadAttachment } from "./internal/upload";
export type { UploadedAttachment } from "./internal/upload";

export default {
  id: "attachments",
  name: "Attachments",
  description:
    "Polymorphic file attachments. Exposes uploadAttachment() helper; storage/serve on the server plugin.",
  contributions: [],
} satisfies PluginDefinition;
