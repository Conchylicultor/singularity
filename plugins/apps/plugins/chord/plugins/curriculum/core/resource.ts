import { liveValue } from "@plugins/network/plugins/live/core";
import { CatalogStateSchema } from "./catalog";
import { SelectionSchema } from "./selection";

/**
 * What the learner has chosen, pushed again on every change. One object read
 * from one row, so no bound to state.
 *
 * No placeholder: until the server's first value lands the read is `pending`,
 * so the trainer renders its loading state rather than buttons that might be
 * about to change.
 */
export const chordCurriculum = liveValue("chord.curriculum", {
  schema: SelectionSchema,
});

/**
 * Every chord of the song index, in tracks and sections (`buildCatalog`):
 * `not-ready` until the index is loaded, then the catalog — pushed again when
 * a load finishes. One object, built once per loaded index; its size is the
 * index's distinct chords (1,808 on the full index, about 25 KB with the rare
 * groups' members), not anything the learner does.
 */
export const chordCatalog = liveValue("chord.catalog", {
  schema: CatalogStateSchema,
});
