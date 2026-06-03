import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleUpload } from "./internal/handle-upload";
import { handleGet } from "./internal/handle-get";
import { handleDelete } from "./internal/handle-delete";
import { startOrphanSweep } from "./internal/orphan-sweep";
import { ensureAttachmentsRoot } from "./internal/paths";
import {
  uploadAttachment,
  getAttachmentFile,
  deleteAttachmentEndpoint,
} from "../shared/endpoints";

export { _attachments } from "./internal/tables";
export { deleteAttachment, getAttachment } from "./internal/operations";
export { Attachments } from "./internal/attachments";
export type { AttachmentLink } from "./internal/define-link";

export default {
  name: "Attachments",
  description:
    "Attachments on disk (UUID-named under ~/.singularity/attachments/). Consumers declare ownership with Attachments.defineLink(ownerTable); orphan sweep reclaims unreferenced rows past TTL.",
  loadBearing: true,
  httpRoutes: {
    [uploadAttachment.route]: handleUpload,
    [getAttachmentFile.route]: handleGet,
    [deleteAttachmentEndpoint.route]: handleDelete,
  },
  onReady: async () => {
    await ensureAttachmentsRoot();
    startOrphanSweep();
  },
} satisfies ServerPluginDefinition;
