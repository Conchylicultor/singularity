import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { AttachmentUpload } from "./components/attachment-upload";

export default {
  description:
    "Shared web infra for attachment-owning page blocks: the reusable <AttachmentUpload> empty-state (click/drop/paste) funnel.",
} satisfies PluginDefinition;
