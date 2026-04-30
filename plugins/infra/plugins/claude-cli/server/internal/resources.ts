import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@server/db/client";
import { defineResource } from "@server/resources";
import {
  ClaudeCliCallSchema,
  type ClaudeCliCall,
} from "../../shared/resources";
import { _claudeCliCalls } from "./tables";

export const RECENT_CALLS_LIMIT = 1000;

export const claudeCliCallsResource = defineResource({
  key: "claude-cli-calls",
  mode: "push",
  schema: z.array(ClaudeCliCallSchema),
  loader: async (): Promise<ClaudeCliCall[]> => {
    const rows = await db
      .select()
      .from(_claudeCliCalls)
      .orderBy(desc(_claudeCliCalls.createdAt))
      .limit(RECENT_CALLS_LIMIT);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      model: r.model as ClaudeCliCall["model"],
      sourceName: r.sourceName,
      sourceContext: r.sourceContext ?? null,
      prompt: r.prompt,
      system: r.system,
      output: r.output,
      error: r.error,
      durationMs: r.durationMs,
    }));
  },
});
