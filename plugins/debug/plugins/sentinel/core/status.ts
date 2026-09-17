import type { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import {
  SentinelDownStatusSchema,
  SentinelWatchSchema,
  type SentinelWatch,
} from "@plugins/debug/plugins/sentinel/plugins/status-file/core";

// The machine watcher's (sentinel worker's) supervision status — what main's
// worker host knows about whether the watcher is actually running.
//
// Until 2026-09-16 the only trace of a dead watcher was one log line: the worker
// crashed at load for a day, builds kept piling onto a machine with ~70 MB free,
// and nothing on screen said the duress guard was gone. So the status is a
// value main holds, writes to a host-global file on every transition, and every
// backend serves as a live resource behind the health report's "Machine
// watcher" row. The status and the file's shapes live in the `status-file`
// leaf plugin (the build CLI reads the file too). Design:
// research/2026-09-16-global-sentinel-worker-identity-and-loud-death.md (Part 3).

/** The report kind filed once when main gives up respawning the watcher. */
export const SENTINEL_DOWN_KIND = "sentinel-down";

/**
 * The watcher's status as every backend reads it from the host-global file.
 * A single small value (bounded by its schema), pushed when the file changes.
 */
export const sentinelStatusResource = resourceDescriptor<SentinelWatch>(
  "sentinel.status",
  SentinelWatchSchema,
  { kind: "none" },
);

/** The `sentinel-down` report's payload. */
export const SentinelDownPayloadSchema = SentinelDownStatusSchema.omit({
  state: true,
});
export type SentinelDownPayload = z.infer<typeof SentinelDownPayloadSchema>;
