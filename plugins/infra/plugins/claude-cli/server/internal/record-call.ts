import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import type { ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import { _claudeCliCalls } from "./tables";
import { RECENT_CALLS_LIMIT } from "./resources";

export interface RecordCallInput {
  model: ConversationModel;
  sourceName: string;
  sourceContext: Record<string, unknown> | null;
  prompt: string;
  system: string | null;
  output: string | null;
  error: string | null;
  durationMs: number;
}

// Records a single claude-cli call. Swallows its own errors — recording must
// never affect the calling path. Trims the table to the most recent N rows
// after every insert (cheap with the createdAt index).
export async function recordClaudeCliCall(input: RecordCallInput): Promise<void> {
  try {
    await db.insert(_claudeCliCalls).values({
      model: input.model,
      sourceName: input.sourceName,
      sourceContext: input.sourceContext,
      prompt: input.prompt,
      system: input.system,
      output: input.output,
      error: input.error,
      durationMs: input.durationMs,
    });
    await db.execute(sql`
      DELETE FROM claude_cli_calls
      WHERE id NOT IN (
        SELECT id FROM claude_cli_calls
        ORDER BY created_at DESC
        LIMIT ${RECENT_CALLS_LIMIT}
      )
    `);
  // eslint-disable-next-line promise-safety/no-bare-catch
  } catch (err) {
    console.warn("[claude-cli] failed to record call:", err);
  }
}
