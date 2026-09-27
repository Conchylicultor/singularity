import { liveValue } from "@plugins/network/plugins/live/core";
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
