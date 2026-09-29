import { liveCollection } from "@plugins/network/plugins/live/core";
import {
  liveInstant,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { OpKindSchema, OpRowSchema, TerminalOutcomeSchema } from "./schemas";

/**
 * Every op still in flight (`closed_by IS NULL`), oldest first — the set the
 * op-status banner and chip render. ONE default-tuple subscription for the
 * whole host: a surface filters by `opSlug` on the client rather than opening a
 * tuple per worktree.
 *
 * `preload: "boot"`: the banner is first-paint chrome. The rows may be stale for
 * the moment between boot and the first drain, which the ingester runs before
 * anything else in `onReady`.
 */
export const opsInFlight = liveCollection("op-store.in-flight", {
  row: OpRowSchema,
  id: "opId",
  filterable: { opSlug: liveText(), kind: liveText(OpKindSchema) },
  sortable: ["requestedAt"],
  default: { orderBy: [["requestedAt", "asc"]], limit: 200 },
  maxLimit: 500,
  preload: "boot",
});

/**
 * Every stored op, in flight or closed (30 days, the retention window), newest
 * first — the Ops Gantt / detail / stats read model. A time window is
 * `where: { requestedAt: { gte: cutoff } }` (quantize the cutoff so the tuple
 * is stable); one op is `useLiveRow(opsHistory, opId)`.
 */
export const opsHistory = liveCollection("op-store.history", {
  row: OpRowSchema,
  id: "opId",
  filterable: {
    opSlug: liveText(),
    kind: liveText(OpKindSchema),
    outcome: liveText(TerminalOutcomeSchema),
    requestedAt: liveInstant(),
    completedAt: liveInstant(),
  },
  sortable: ["requestedAt", "completedAt"],
  default: { orderBy: [["requestedAt", "desc"]], limit: 500 },
  maxLimit: 2000,
});
