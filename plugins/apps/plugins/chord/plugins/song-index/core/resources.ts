import { liveValue } from "@plugins/network/plugins/live/core";
import { IndexStatusSchema } from "./index-status";

/**
 * The live status. Reading it never starts work: only `ensure` does, so a debug
 * surface that shows it cannot trigger a download.
 *
 * No placeholder: until the server's first value lands the read is `pending`
 * (which is not `not-requested` — that is the server's answer).
 */
export const chordIndexStatus = liveValue("chord.index-status", {
  schema: IndexStatusSchema,
});
