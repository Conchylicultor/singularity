import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const StoryMarkSchema = z.object({
  pageId: z.string(),
  defaultRendererId: z.string().nullable(),
  updatedAt: z.coerce.date(),
});
export type StoryMark = z.infer<typeof StoryMarkSchema>;

// Keyed by pageId → O(1) useIsStory lookup; Object.values for useStories.
export const StoryMarksPayloadSchema = z.record(z.string(), StoryMarkSchema);
export type StoryMarksPayload = z.infer<typeof StoryMarksPayloadSchema>;

export const storiesResource = resourceDescriptor<StoryMarksPayload>(
  "stories",
  StoryMarksPayloadSchema,
  {},
);
