import type { ServerPluginDefinition } from "@server/types";
import { handleUpload } from "./internal/handle-upload";
import { handleAttach } from "./internal/handle-attach";
import { handleGet } from "./internal/handle-get";
import { handleList } from "./internal/handle-list";
import { handleDelete } from "./internal/handle-delete";
import { startOrphanSweep } from "./internal/orphan-sweep";
import { ensureAttachmentsRoot } from "./internal/paths";

export {
  _attachments,
  attachAttachment,
  deleteAttachment,
  deleteAttachmentsForOwner,
  getAttachment,
  listAttachmentsForOwner,
} from "./api";

export default {
  id: "attachments",
  name: "Attachments",
  description:
    "Polymorphic file attachments on disk (UUID-named under ~/.singularity/attachments/). Staged upload with orphan sweep.",
  httpRoutes: {
    "POST /api/attachments": handleUpload,
    "GET /api/attachments": handleList,
    "POST /api/attachments/:id/attach": handleAttach,
    "GET /api/attachments/:id": handleGet,
    "DELETE /api/attachments/:id": handleDelete,
  },
  onReady: async () => {
    await ensureAttachmentsRoot();
    startOrphanSweep();
  },
} satisfies ServerPluginDefinition;
