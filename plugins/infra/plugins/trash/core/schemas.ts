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
