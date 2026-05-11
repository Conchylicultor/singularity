import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const ClaudeCliCallSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.coerce.date(),
  model: z.enum(["haiku", "sonnet", "opus"]),
  sourceName: z.string(),
  sourceContext: z.record(z.unknown()).nullable(),
  prompt: z.string(),
  system: z.string().nullable(),
  output: z.string().nullable(),
  error: z.string().nullable(),
  durationMs: z.number().int(),
});
export type ClaudeCliCall = z.infer<typeof ClaudeCliCallSchema>;

export const claudeCliCallsResource = resourceDescriptor<ClaudeCliCall[]>(
  "claude-cli-calls",
  z.array(ClaudeCliCallSchema),
  [],
);
