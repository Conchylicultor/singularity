import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

// The machine watcher's (sentinel worker's) supervision status — what main's
// worker host knows about whether the watcher is actually running.
//
// Until 2026-09-16 the only trace of a dead watcher was one log line: the worker
// crashed at load for a day, builds kept piling onto a machine with ~70 MB free,
// and nothing on screen said the duress guard was gone. So the status is a
// value main holds, writes to a host-global file on every transition, and every
// backend serves as a live resource behind the health report's "Machine
// watcher" row. Design:
// research/2026-09-16-global-sentinel-worker-identity-and-loud-death.md (Part 3).

/** The report kind filed once when main gives up respawning the watcher. */
export const SENTINEL_DOWN_KIND = "sentinel-down";

const deathFields = {
  /** Worker deaths since it last reached `ready`. */
  deaths: z.number().int().nonnegative(),
  /** The most recent worker `error` event's message, if one fired. */
  lastError: z.string().nullable(),
};

export const SentinelStatusSchema = z.discriminatedUnion("state", [
  /** Spawned, waiting for the worker's `ready`. */
  z.object({ state: z.literal("starting"), since: z.number() }),
  /** The worker is ticking and owns the duress latch. */
  z.object({ state: z.literal("running"), since: z.number() }),
  /** The worker died and a respawn is scheduled. */
  z.object({
    state: z.literal("respawning"),
    since: z.number(),
    ...deathFields,
  }),
  /** Main gave up after repeated immediate deaths: nothing guards the machine. */
  z.object({ state: z.literal("down"), since: z.number(), ...deathFields }),
  /** Main stopped the watcher on shutdown. */
  z.object({ state: z.literal("stopped"), since: z.number() }),
  /** `sentinel.enabled` is off in config, so main never started it. */
  z.object({ state: z.literal("disabled"), since: z.number() }),
]);
export type SentinelStatus = z.infer<typeof SentinelStatusSchema>;

/** The host-global status file's content: the status plus the pid that wrote it. */
export const SentinelStatusRecordSchema = z.object({
  status: SentinelStatusSchema,
  /** The backend process holding the watcher — a status is only as live as it. */
  pid: z.number().int().positive(),
});
export type SentinelStatusRecord = z.infer<typeof SentinelStatusRecordSchema>;

/**
 * What a backend can say about the watcher, read from the status file.
 *
 * - `none` — no file: no backend on this machine has ever run the watcher.
 * - `recorded` — the last status main wrote, and whether the process that wrote
 *   it is still alive (a `running` written by a dead process is not running).
 * - `unreadable` — the file exists but does not parse; the reason, never a guess.
 */
export const SentinelWatchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }),
  z.object({
    kind: z.literal("recorded"),
    status: SentinelStatusSchema,
    pid: z.number(),
    ownerAlive: z.boolean(),
  }),
  z.object({ kind: z.literal("unreadable"), reason: z.string() }),
]);
export type SentinelWatch = z.infer<typeof SentinelWatchSchema>;

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
export const SentinelDownPayloadSchema = z.object({
  /** When main gave up, epoch ms. */
  since: z.number(),
  ...deathFields,
});
export type SentinelDownPayload = z.infer<typeof SentinelDownPayloadSchema>;
