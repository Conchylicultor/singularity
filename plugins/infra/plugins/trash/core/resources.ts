import { liveCollection } from "@plugins/network/plugins/live/core";
import { liveText } from "@plugins/network/plugins/live/plugins/filter/core";
import { TrashEntrySchema } from "./schemas";

// The trash ledger as a live collection: a bounded window, newest-deleted first
// (100, grown to at most 500), plus its `:rows` / `:groups` siblings. A source's
// trash is the window filtered on `sourceId` —
// `useLive(trashEntries, { where: { sourceId } })`. The ledger is bounded only by
// the 30-day purge, so the window is what keeps a reader's list bounded.
export const trashEntries = liveCollection("trash-entries", {
  row: TrashEntrySchema,
  id: "id",
  filterable: { sourceId: liveText() },
  sortable: ["deletedAt"],
  default: { orderBy: [["deletedAt", "desc"]], limit: 100 },
  maxLimit: 500,
});
