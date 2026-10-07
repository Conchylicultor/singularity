import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { chordCatalog, chordCurriculum } from "../../core";
import { loadCatalogState } from "./catalog";
import { loadSelection } from "./state";

// What the learner has chosen, pushed again on every change: the change feed
// carries each committed `chord_curriculum` write here (the loader's captured
// read-set), and the new selection goes to every observing tab.
export const chordCurriculumServed = serveValue(chordCurriculum, {
  source: "db",
  loader: () => loadSelection(db),
});

// The catalog of the song index. The loader reads the index's two state rows
// (`chord_index_state`, `chord_index_request`) every time, so the change feed
// pushes it when a load moves — `not-ready` straight from the status while it
// runs, the catalog once it lands. The window rows it is built from are out
// of the change feed and read only when the index changed (`catalog.ts`).
export const chordCatalogServed = serveValue(chordCatalog, {
  source: "db",
  loader: () => loadCatalogState(),
});
