import { text } from "drizzle-orm/pg-core";
import { defineTriggerEvent } from "@plugins/infra/plugins/events/server";

/** A UG song's sheet markup was written: created, or saved with a different `content`. */
export interface UgTabSavedPayload extends Record<string, unknown> {
  songId: string;
}

// Emitted by the create and update routes only when `content` changed, so a
// metadata-only save (a re-PUT of the same tab) does not announce a new sheet.
// UG knows nothing of who listens: the alignment child binds it to its job.
export const { event: ugTabSaved, table: _ugTabSavedTriggers } =
  defineTriggerEvent<UgTabSavedPayload>({
    name: "sonata.ug.tabSaved",
    filters: {
      songId: text("song_id"),
    },
  });
