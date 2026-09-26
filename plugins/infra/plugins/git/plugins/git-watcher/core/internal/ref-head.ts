import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";

export const RefHeadSchema = z.object({
  sha: z.string().nullable(),
});

export type RefHead = z.infer<typeof RefHeadSchema>;

/**
 * The sha one tracked ref (`refs/heads/main`, or this checkout's own branch)
 * points at, `null` when the ref does not exist. Server-only in practice: its
 * readers are other values' `recomputeOn` (a ref advance is what moves a
 * deployment, an attempt's standing, a commits graph).
 */
export const refHead = liveValue("git-watcher.refHead", {
  schema: RefHeadSchema,
  params: ["refName"],
});
