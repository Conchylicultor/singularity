import { z } from "zod";

/**
 * A block detached from its document — type, payload, expanded flag, and nested
 * children — with NO ids, ranks, or document scope. This is the portable shape
 * used by copy/paste (clipboard) and duplicate: the server re-mints ids and
 * ranks on insert via `insertForest`, so a serialized forest can be pasted into
 * any document (including a different one) safely.
 */
export interface SerializedBlock {
  type: string;
  // Optional to match `z.unknown()`'s inference; treated as `{}` when absent.
  data?: unknown;
  expanded: boolean;
  children: SerializedBlock[];
}

export const SerializedBlockSchema: z.ZodType<SerializedBlock> = z.lazy(() =>
  z.object({
    type: z.string(),
    data: z.unknown(),
    expanded: z.boolean(),
    children: z.array(SerializedBlockSchema),
  }),
);
