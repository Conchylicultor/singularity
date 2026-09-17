import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { IndexStatusSchema, type IndexStatus } from "./index-status";

/**
 * The live status. Reading it never starts work: only `ensure` does, so a debug
 * surface that shows it cannot trigger a download.
 */
export const chordIndexStatusResource = resourceDescriptor<IndexStatus>(
  "chord.index-status",
  IndexStatusSchema,
  { kind: "not-requested" },
);
