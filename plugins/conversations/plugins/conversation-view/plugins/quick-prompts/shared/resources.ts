import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const QuickPromptSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  rank: z.string(),
});

export type QuickPrompt = z.infer<typeof QuickPromptSchema>;

export const quickPromptsResource = resourceDescriptor<QuickPrompt[]>(
  "quick-prompts",
  z.array(QuickPromptSchema),
);
