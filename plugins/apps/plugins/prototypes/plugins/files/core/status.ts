import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";

// The wire half of a prototype's status: whether the user has marked it Done.
// ONE record per prototype, shared by every surface (main, every worktree
// deploy, every browser, the CLI), stored beside the picks as
// `_status/<id>.json` (`shared/status.ts`). Like the picks, it is about the
// prototype, not part of its design, so it never enters the folder.

/** A prototype's status as STORED. No file is `{ done: false }`. */
export interface PrototypeStatus {
  /** The user has marked this prototype Done. */
  readonly done: boolean;
}

export const PrototypeStatusSchema = z.object({
  done: z.boolean(),
}) satisfies ZodParser<PrototypeStatus>;

/** The status of a prototype that has none recorded. */
export const NO_PROTOTYPE_STATUS: PrototypeStatus = { done: false };

/**
 * One change to a prototype's status. A field per change (only `done` today),
 * never the whole record, so a later field set elsewhere cannot be clobbered.
 */
export const PrototypeStatusChangeSchema = z.object({ done: z.boolean() });
export type PrototypeStatusChange = z.infer<typeof PrototypeStatusChangeSchema>;

/** `status` with `change` applied — the one fold. */
export function applyPrototypeStatusChange(
  status: PrototypeStatus,
  change: PrototypeStatusChange,
): PrototypeStatus {
  return { ...status, done: change.done };
}

/**
 * Every recorded status, keyed by prototype id (push). A prototype missing from
 * the map has no status recorded — `NO_PROTOTYPE_STATUS`, a legitimate answer.
 * One small record per prototype, so it is bounded by the prototype list it
 * annotates (which the gallery already holds whole). Notified by the writer
 * the moment it writes, and by the watcher on every other backend.
 */
export const prototypeStatusesResource = resourceDescriptor<
  Record<string, PrototypeStatus>
>("prototypes.statuses", z.record(z.string(), PrototypeStatusSchema), {});

/** The status recorded for `name` in a statuses map. */
export function statusOf(
  statuses: Record<string, PrototypeStatus>,
  name: string,
): PrototypeStatus {
  return statuses[name] ?? NO_PROTOTYPE_STATUS;
}

/**
 * Apply one change to a prototype's status. 404 for an unknown prototype. An
 * automated browser session's change is recorded in the agent-write ledger and
 * put back at the end of its run.
 */
export const setPrototypeStatus = defineEndpoint({
  route: "PUT /api/prototypes/:name/status",
  body: PrototypeStatusChangeSchema,
});
