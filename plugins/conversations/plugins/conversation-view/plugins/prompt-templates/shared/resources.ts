import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";
import { RankSchema } from "@plugins/primitives/plugins/rank/shared";

export const PromptTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  prompt: z.string(),
  rank: RankSchema,
});

export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export const promptTemplatesResource = resourceDescriptor<PromptTemplate[]>(
  "prompt-templates",
  z.array(PromptTemplateSchema),
  [],
);
