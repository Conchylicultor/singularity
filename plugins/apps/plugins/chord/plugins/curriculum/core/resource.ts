import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { firstSelection } from "./path";
import { SelectionSchema, type Selection } from "./selection";

/**
 * What the learner has chosen. Pushed again on every change.
 *
 * The descriptor API requires an initial value; this one is the true starting
 * point, but it is still never what a surface shows: `useResource` seeds it at
 * `dataUpdatedAt === 0` and answers `pending` until the server's first value
 * lands, so the trainer renders its loading state rather than buttons that
 * might be about to change.
 */
export const chordCurriculumResource = resourceDescriptor<Selection>(
  "chord.curriculum",
  SelectionSchema,
  firstSelection(),
);
