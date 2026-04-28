import type { ServerPluginDefinition } from "@server/types";
import { handleUpload } from "./internal/handle-upload";
import { handleGet } from "./internal/handle-get";
import { handleDelete } from "./internal/handle-delete";
import { startOrphanSweep } from "./internal/orphan-sweep";
import { ensureAttachmentsRoot } from "./internal/paths";

export { _attachments } from "./internal/tables";
export { deleteAttachment, getAttachment } from "./internal/operations";
export { Attachments } from "./internal/attachments";

export default {
  id: "attachments",
  name: "Attachments",
  description:
    "Attachments on disk (UUID-named under ~/.singularity/attachments/). Consumers declare ownership with Attachments.defineLink(ownerTable); orphan sweep reclaims unreferenced rows past TTL.",
  loadBearing: true,
  httpRoutes: {
    "POST /api/attachments": handleUpload,
    "GET /api/attachments/:id": handleGet,
    "DELETE /api/attachments/:id": handleDelete,
  },
  onReady: async () => {
    await ensureAttachmentsRoot();
    startOrphanSweep();
  },
} satisfies ServerPluginDefinition;
