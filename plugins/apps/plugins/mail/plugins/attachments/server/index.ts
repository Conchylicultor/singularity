import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { mailAttachmentDownloadEndpoint } from "../core";
import { handleMailAttachmentDownload } from "./internal/handlers";

export default {
  description:
    "Lazy Gmail attachment blob download: fetches an attachment's bytes on demand (reading-pane chip click or inline cid: image), caches them via infra/attachments, stamps mail_attachments.stored_attachment_id, and serves the same-origin URL.",
  contributions: [],
  httpRoutes: {
    [mailAttachmentDownloadEndpoint.route]: handleMailAttachmentDownload,
  },
} satisfies ServerPluginDefinition;
