import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// The wire half of a prototype's version history. The store itself (one private
// git repo per prototype, beside the folder) is Node-only and lives in
// `shared/history/`; this is what the browser reads of it.
//
// Design: `research/2026-09-11-apps-prototype-version-history.md`.

/**
 * Why a version exists.
 *
 * - `baseline` — v0: the folder as it was when its history began (the blank
 *   template for a freshly minted prototype, the state on adoption otherwise).
 * - `turn` — the end of an agent turn that changed the folder.
 * - `restore` — "Restored vN": an older version made live again.
 * - `manual` — `./singularity prototype checkpoint`, or the "Before restore"
 *   save a restore makes of unsaved changes.
 */
export const PROTOTYPE_VERSION_KINDS = [
  "baseline",
  "turn",
  "restore",
  "manual",
] as const;
export type PrototypeVersionKind = (typeof PROTOTYPE_VERSION_KINDS)[number];

/** One recorded version of a prototype — one commit in its history repo. */
export const PrototypeVersionSchema = z.object({
  /**
   * Position, oldest → newest: `0` is the baseline. Derived from the commit's
   * place in the history, never stored, so it cannot disagree with the order.
   */
  n: z.number().int(),
  /** Full commit sha — what addresses the version's files. */
  sha: z.string(),
  /** ISO-8601 commit time. */
  at: z.string(),
  kind: z.enum(PROTOTYPE_VERSION_KINDS),
  /** The commit's subject line: the request for a turn, "Restored v3", … */
  subject: z.string(),
  /** The conversation whose turn recorded it; `null` for every other kind. */
  conversationId: z.string().nullable(),
  /** The assistant message that ended that turn; `null` for every other kind. */
  messageId: z.string().nullable(),
});
export type PrototypeVersion = z.infer<typeof PrototypeVersionSchema>;

/** A prototype's whole history, as the stepper reads it. */
export const PrototypeHistorySchema = z.object({
  /** Oldest → newest; `versions[i].n === i`. */
  versions: z.array(PrototypeVersionSchema),
  /**
   * The folder differs from the newest version — an edit no turn has recorded
   * yet (a hand edit, a plain terminal Claude). Shown as "Live · unsaved
   * changes" past the last version; folded into the next version recorded.
   */
  dirty: z.boolean(),
});
export type PrototypeHistory = z.infer<typeof PrototypeHistorySchema>;

/**
 * One prototype's history (push, keyed by `name`). Re-broadcast when a version
 * is recorded — by any backend, since the store is host-global — and when the
 * folder is edited, which is what flips `dirty`.
 */
export const prototypeHistoryResource = resourceDescriptor<
  PrototypeHistory,
  { name: string }
>("prototypes.history", PrototypeHistorySchema, { versions: [], dirty: false });

/**
 * Make an older version live again: saves unsaved changes first (a `manual`
 * "Before restore" version), writes the old files back, and records a
 * `restore` version "Restored vN" — which is what it answers with. Nothing is
 * ever lost. 404 for an unknown prototype or a sha that is not one of its
 * versions.
 */
export const restorePrototypeVersion = defineEndpoint({
  route: "POST /api/prototypes/:name/versions/:sha/restore",
  response: PrototypeVersionSchema,
});
