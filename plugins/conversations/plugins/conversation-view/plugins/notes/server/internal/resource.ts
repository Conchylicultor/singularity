import { windowQueryResource } from "@plugins/infra/plugins/query-resource/server";
import { conversationNotesResource as conversationNotesDescriptor } from "../../shared";
import { conversationNotes } from "./tables";

const t = conversationNotes.table;

// Compiled bounded POINT resource: the loader reads only the subscribed id set
// (`WHERE parent_id IN (ids)`), and the change-feed routes a note upsert/delete
// to a tuple iff the changed conversation ids intersect its set — so a note edit
// never sweeps the whole table. The PK column `parent_id` is projected under the
// ALIAS `conversationId` (the point identity); `point.by` IS that identity pk.
// No orderBy — point sets are unordered.
export const conversationNotesResource = windowQueryResource(conversationNotesDescriptor, {
  from: t,
  select: {
    conversationId: t.parentId,
    notes: t.notes,
    updatedAt: t.updatedAt,
  },
  point: { by: t.parentId },
});
