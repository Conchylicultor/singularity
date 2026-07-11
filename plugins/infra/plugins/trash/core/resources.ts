import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { TrashEntrySchema } from "./schemas";
import type { TrashEntry } from "./schemas";

// One source's trash, scoped by `sourceId`, newest-deleted first. Push mode
// broadcasts the whole array (small — one row per trashed root), so a subscriber
// always sees the current list. Mirrors `blocksLiveResource`'s per-param scoping;
// the shared descriptor is the single source of truth for key/schema/params, and
// the server derives its live resource from it via `defineResource(descriptor, …)`.
export const trashEntriesResource = resourceDescriptor<
  TrashEntry[],
  { sourceId: string }
>("trash-entries", z.array(TrashEntrySchema), []);
