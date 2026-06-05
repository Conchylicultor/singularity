import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// Single source of truth for a worktree row — shared by the server handler
// (return shape) and the web panel, which parses/validates each streamed NDJSON
// row with this schema rather than blindly JSON-parsing whatever the gateway returns.
export const WorktreeEntrySchema = z.object({
  attemptId: z.string(),
  taskId: z.string(),
  taskTitle: z.string(),
  taskStatus: z.string(),
  attemptStatus: z.string(),
  worktreePath: z.string(),
  createdAt: z.string(),
  dirExists: z.boolean(),
  dbExists: z.boolean(),
  unpushedCount: z.number(),
  isDirty: z.boolean(),
  isSafe: z.boolean(),
});
export type WorktreeEntry = z.infer<typeof WorktreeEntrySchema>;

// Streamed as NDJSON (no `response` schema) — see server/internal/handle-list.ts.
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
  response: z.object({
    succeeded: z.number(),
    failed: z.array(z.object({ id: z.string(), error: z.string() })),
  }),
});

export const deleteWorktree = defineEndpoint({
  route: "DELETE /api/debug/worktrees/:id",
});
