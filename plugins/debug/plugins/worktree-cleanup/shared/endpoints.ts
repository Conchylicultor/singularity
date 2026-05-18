import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const listWorktrees = defineEndpoint({
  route: "GET /api/debug/worktrees",
});

export const BulkDeleteWorktreesBodySchema = z.object({
  ids: z.array(z.string()),
});
export type BulkDeleteWorktreesBody = z.infer<typeof BulkDeleteWorktreesBodySchema>;

export const bulkDeleteWorktrees = defineEndpoint({
  route: "POST /api/debug/worktrees/bulk-delete",
  body: BulkDeleteWorktreesBodySchema,
});

export const deleteWorktree = defineEndpoint({
  route: "DELETE /api/debug/worktrees/:id",
});
