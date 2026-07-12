import { z } from "zod";

// One soft-deleted root entity, awaiting restore or purge. Domain-agnostic: the
// primitive never knows what a `sourceId` names (e.g. "pages") or what
// `rootEntityId` points at (a page id). `label` is captured at trash time so the
// Trash UI can render the entry even after the underlying row is gone, and `meta`
// is an opaque per-source bag (JSON) the source may read back on restore/purge.
// Deliberately NO drizzle import here — `core/` is web-safe and importable from
// any runtime; the wire shape is derived from this schema alone.
export const TrashEntrySchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  rootEntityId: z.string(),
  label: z.string(),
  deletedAt: z.coerce.date(),
  meta: z.record(z.unknown()),
});
export type TrashEntry = z.infer<typeof TrashEntrySchema>;

/**
 * What a trashing mutation returns: either it trashed something — and hands back
 * the ledger handle needed to restore it (`sourceId` + `entryId`) — or it did
 * not (the domain decided the delete was a genuine hard delete, e.g. a page-free
 * block subtree), in which case there is NOTHING to undo.
 *
 * Deliberately a discriminated union and not `{ trashed: boolean; entryId?:
 * string }`: a nullable `entryId` is an absorbable failure — a consumer would
 * quietly skip recording an undo entry for a mutation that really did trash,
 * with no type error. Here "I trashed" and "I have a handle" are the same fact.
 */
export const TrashOutcomeSchema = z.discriminatedUnion("trashed", [
  z.object({
    trashed: z.literal(true),
    sourceId: z.string(),
    entryId: z.string(),
  }),
  z.object({ trashed: z.literal(false) }),
]);
export type TrashOutcome = z.infer<typeof TrashOutcomeSchema>;
