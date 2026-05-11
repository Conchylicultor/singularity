import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { RankSchema } from "@plugins/primitives/plugins/rank/shared";

export const LaunchPromptSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  model: z.enum(["sonnet", "opus"]),
  rank: RankSchema,
});

export type LaunchPrompt = z.infer<typeof LaunchPromptSchema>;

export const launchPromptsResource = resourceDescriptor<LaunchPrompt[]>(
  "launch-prompts",
  z.array(LaunchPromptSchema),
  [],
);
