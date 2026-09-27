import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { chordProgress } from "../../core";
import { loadChordProgress } from "./progress";

// The learner's standing, pushed again when an answer is saved: the change feed
// carries each committed `chord_answers` / `chord_rounds` write here (the
// loader's captured read-set), and every subscribed (time zone, chord set)
// tuple is recomputed and pushed.
export const chordProgressServed = serveValue(chordProgress, {
  source: "db",
  loader: (params) => loadChordProgress(db, params),
});
