import { db } from "@plugins/database/server";
import { serveValue } from "@plugins/network/plugins/live/server";
import { loadListedChords } from "@plugins/apps/plugins/chord/plugins/curriculum/server";
import { chordProgress } from "../../core";
import { loadChordProgress } from "./progress";

// The learner's standing, pushed again when an answer is saved: the change feed
// carries each committed `chord_answers` / `chord_rounds` write here (the
// loader's captured read-set), and every subscribed (time zone, chord set)
// tuple is recomputed and pushed.
//
// The Rare pool is every chord the catalog does not list, so the loader needs
// the catalog. While the index is not loaded there is no catalog to say which
// chords are rare, and the read FAILS loudly rather than answering a pool it
// cannot know: the trainer subscribes only once `chord.catalog` is ready (it
// renders its loading state before), so a subscriber only meets this if the
// index unloads under it — and then the trainer has gone back to loading.
export const chordProgressServed = serveValue(chordProgress, {
  source: "db",
  loader: async (params) => {
    const listed = await loadListedChords();
    if (listed.kind === "not-ready") {
      throw new Error(
        "chord.progress: the song index is not loaded, so no catalog says which chords are rare; subscribe once chord.catalog is ready",
      );
    }
    return loadChordProgress(db, params, listed.listed);
  },
});
