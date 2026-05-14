import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const PromptTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  rank: RankSchema,
  useCount: z.number(),
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export const promptTemplatesResource = resourceDescriptor<PromptTemplate[]>(
  "prompt-templates",
  z.array(PromptTemplateSchema),
  [],
);
