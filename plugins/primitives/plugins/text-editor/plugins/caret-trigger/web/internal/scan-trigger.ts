// Pure string-level trigger scan: given the text before the caret and a trigger
// string, find the rightmost trigger occurrence and the query that follows it.
// No Lexical, no DOM — trivially unit-testable, and the single home for the
// `lastIndexOf` semantics every caret menu relies on.

export interface TriggerScan {
  triggerIndex: number;
  query: string;
}

/**
 * The rightmost `trigger` in `textBeforeCaret` and the text after it, or `null`
 * when the trigger is absent. `lastIndexOf` picks the occurrence closest to the
 * caret, so two triggers in one node resolve to the rightmost. A caret sitting
 * inside a partially-typed multi-char trigger (the lone `[` of `[[`) yields
 * `null` — `lastIndexOf("[[")` doesn't match a single `[`.
 */
export function scanTrigger(textBeforeCaret: string, trigger: string): TriggerScan | null {
  const triggerIndex = textBeforeCaret.lastIndexOf(trigger);
  if (triggerIndex === -1) return null;
  return { triggerIndex, query: textBeforeCaret.slice(triggerIndex + trigger.length) };
}
