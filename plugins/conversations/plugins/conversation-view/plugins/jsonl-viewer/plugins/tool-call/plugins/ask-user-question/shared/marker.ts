/**
 * Marker prefix prepended to the serialized answer turn by answer-form.tsx.
 * Used both to serialize (answer-form) and to locate/parse the follow-up
 * answer turn in the JSONL event stream (ask-user-question renderer).
 */
export const ANSWER_MARKER = "Answering your questions:";
