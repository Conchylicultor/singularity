import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { db } from "@plugins/database/server";
import { chordProgressResource } from "../../core";
import { loadChordProgress } from "./progress";

// The learner's standing, read again when an answer is saved. Invalidate: a
// change sends each observing tab a version stamp, and the tab reads its own
// (time zone, chord set) tuple again. The change feed carries each committed
// `chord_answers` insert here; a round is always written in the same
// transaction as its answers, so `chord_rounds` needs no route of its own.
// `mode` is written out: the keyed-resource-scope check reads a call without it
// as the keyed form.
export const chordProgressServerResource = defineResource(
  chordProgressResource,
  {
    mode: "invalidate",
    identityTable: "chord_answers",
    loader: (params) => loadChordProgress(db, params),
  },
);
