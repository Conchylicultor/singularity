import { z } from "zod";

// The jsonb payload for a `read-set-shrink` report. One report per distinct
// resource key (fingerprint `read-set-shrink:<resourceKey>`); the row `count`
// discriminates a one-time code-change shed (count 1) from a recurring
// conditional-query shed (count grows). Carries the dropped tables plus the full
// before/after read-sets for the reader to eyeball.
export const ReadSetShrinkPayloadSchema = z.object({
  resourceKey: z.string(),
  droppedTables: z.array(z.string()),
  oldTables: z.array(z.string()),
  newTables: z.array(z.string()),
});
export type ReadSetShrinkPayload = z.infer<typeof ReadSetShrinkPayloadSchema>;
