import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { db } from "@plugins/database/server";
import { chordCurriculumResource } from "../../core";
import { loadSelection } from "./state";

// What the learner has chosen, read again on every change. Invalidate: the
// change feed carries each committed `chord_curriculum` write here, every
// observing tab gets a version stamp and reads the value back. `mode` is
// written out: the keyed-resource-scope check reads a call without it as the
// keyed form.
export const chordCurriculumServerResource = defineResource(
  chordCurriculumResource,
  {
    mode: "invalidate",
    identityTable: "chord_curriculum",
    loader: () => loadSelection(db),
  },
);
