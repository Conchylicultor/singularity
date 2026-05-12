import { z } from "zod";

export const PluginHealthReviewSchema = z.object({
  id: z.string(),
  pluginId: z.string(),
  axis: z.string(),
  commitHash: z.string(),
  conversationId: z.string().nullable(),
  createdAt: z.string(),
});
export type PluginHealthReview = z.infer<typeof PluginHealthReviewSchema>;

export const PluginStalenessSchema = z.object({
  axis: z.string(),
  commitsSince: z.number(),
  apiChanged: z.boolean(),
});
export type PluginStaleness = z.infer<typeof PluginStalenessSchema>;

export const ReviewTaskSummarySchema = z.object({
  taskId: z.string(),
  title: z.string(),
  status: z.string(),
});
export type ReviewTaskSummary = z.infer<typeof ReviewTaskSummarySchema>;
