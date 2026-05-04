import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { RankSchema } from "@plugins/primitives/plugins/rank/shared";

export const QuickPromptSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  rank: RankSchema,
});

export type QuickPrompt = z.infer<typeof QuickPromptSchema>;

export const quickPromptsResource = resourceDescriptor<QuickPrompt[]>(
  "quick-prompts",
  z.array(QuickPromptSchema),
);
