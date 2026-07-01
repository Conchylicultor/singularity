import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@plugins/database/server";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import {
  ClaudeCliCallSchema,
  type ClaudeCliCall,
} from "../../core/resources";
import { _claudeCliCalls } from "./tables";

export const RECENT_CALLS_LIMIT = 1000;

// The table row type and the `ClaudeCliCall` wire schema both derive from the
// single `claudeCliCallFields` record (core), so `_claudeCliCalls.$inferSelect`
// matches `ClaudeCliCall` by construction — the loader returns `db.select()`
// rows verbatim, no projection.
export const claudeCliCallsResource = defineResource({
  key: "claude-cli-calls",
  mode: "push",
  schema: z.array(ClaudeCliCallSchema),
  loader: async (): Promise<ClaudeCliCall[]> =>
    db
      .select()
      .from(_claudeCliCalls)
      .orderBy(desc(_claudeCliCalls.createdAt))
      .limit(RECENT_CALLS_LIMIT),
});
