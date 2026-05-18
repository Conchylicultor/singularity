import { taskAttachments } from "@plugins/tasks-core/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { getTaskAttachments } from "../../core/endpoints";

export const handleTaskAttachments = implement(getTaskAttachments, async ({ params }) => {
  const rows = await taskAttachments.list(params.id);
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    mime: r.mime,
    size: r.size,
    createdAt: r.createdAt,
  }));
});
