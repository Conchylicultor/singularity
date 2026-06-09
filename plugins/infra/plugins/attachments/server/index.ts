import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleUpload } from "./internal/handle-upload";
import { handleGet } from "./internal/handle-get";
import { handleDelete } from "./internal/handle-delete";
import { handleListAttachments } from "./internal/handle-list-attachments";
import { orphanSweepJob } from "./internal/orphan-sweep";
import { ensureAttachmentsRoot } from "./internal/paths";
import {
  uploadAttachment,
  getAttachmentFile,
  deleteAttachmentEndpoint,
} from "../shared/endpoints";
import { listAttachmentsEndpoint } from "../core";

export { _attachments } from "./internal/tables";
export { createAttachment, deleteAttachment, getAttachment } from "./internal/operations";
export { Attachments } from "./internal/attachments";
export type { AttachmentLink } from "./internal/define-link";

export default {
  description:
    "Attachments on disk (UUID-named under ~/.singularity/attachments/). Consumers declare ownership with Attachments.defineLink(ownerTable); orphan sweep reclaims unreferenced rows past TTL.",
  loadBearing: true,
  httpRoutes: {
    [uploadAttachment.route]: handleUpload,
    [getAttachmentFile.route]: handleGet,
    [deleteAttachmentEndpoint.route]: handleDelete,
    [listAttachmentsEndpoint.route]: handleListAttachments,
  },
  // orphanSweepJob declares `schedule` — the jobs worker runs it hourly.
  register: [orphanSweepJob],
  onReady: async () => {
    await ensureAttachmentsRoot();
  },
} satisfies ServerPluginDefinition;
