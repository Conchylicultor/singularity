import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { RankSchema } from "@plugins/primitives/plugins/rank/core";

export const ReviewSectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  patterns: z.array(z.string()),
  rank: RankSchema,
});

export type ReviewSection = z.infer<typeof ReviewSectionSchema>;

export const reviewSectionsResource = resourceDescriptor<ReviewSection[]>(
  "review-sections",
  z.array(ReviewSectionSchema),
  [],
);
