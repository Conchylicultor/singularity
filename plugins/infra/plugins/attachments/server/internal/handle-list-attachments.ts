import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { listAttachmentsEndpoint } from "../../core";
import { getLink } from "./define-link";

// Single, registry-backed dispatcher for listing an owner's attachments.
// `ownerType` is a path value resolved against the defineLink registry, so
// adding a new list consumer requires zero route code — it just calls
// `Attachments.defineLink(table)`. Strips the server-only `diskPath` before
// responding so the payload matches the wire `AttachmentSchema`.
export const handleListAttachments = implement(
  listAttachmentsEndpoint,
  async ({ params }) => {
    const link = getLink(params.ownerType);
    if (!link) {
      throw new HttpError(404, `Unknown attachment owner type: ${params.ownerType}`);
    }
    const rows = await link.list(params.id);
    return rows.map(({ diskPath, ...wire }) => wire); // strip server-only path
  },
);
