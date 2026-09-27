import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { chordCurriculum } from "../../core";
import { loadSelection } from "./state";

// What the learner has chosen, pushed again on every change: the change feed
// carries each committed `chord_curriculum` write here (the loader's captured
// read-set), and the new selection goes to every observing tab.
export const chordCurriculumServed = serveValue(chordCurriculum, {
  source: "db",
  loader: () => loadSelection(db),
});
