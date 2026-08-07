import { describe, expect, test } from "bun:test";
import { RECURRENCE_FREQS, WEEKDAYS } from "./event-date";
import { EVENT_DATE_PROMPT_SPEC } from "./prompt-spec";

// A drift guard, not a prose review. A schema key the prompt never names is a key
// no model will fill; a token the prompt names but the schema rejects is a
// terminal extraction failure on a real page. Both are silent until a run fails,
// so both are asserted here.

describe("EVENT_DATE_PROMPT_SPEC", () => {
  test("documents both arms of the format", () => {
    expect(EVENT_DATE_PROMPT_SPEC).toContain('"once"');
    expect(EVENT_DATE_PROMPT_SPEC).toContain('"recurring"');
  });

  test("documents every rule key", () => {
    for (const key of [
      "freq",
      "interval",
      "byWeekday",
      "byMonthDay",
      "nthWeekday",
      "until",
      "count",
      "startsAt",
      "endsAt",
      "allDay",
      "label",
    ]) {
      expect(EVENT_DATE_PROMPT_SPEC).toContain(key);
    }
  });

  test("names exactly the vocabularies the schema accepts", () => {
    for (const freq of RECURRENCE_FREQS) {
      expect(EVENT_DATE_PROMPT_SPEC).toContain(freq);
    }
    for (const weekday of WEEKDAYS) {
      expect(EVENT_DATE_PROMPT_SPEC).toContain(weekday);
    }
  });

  test("carries an example for the shapes a model gets wrong unprompted", () => {
    expect(EVENT_DATE_PROMPT_SPEC).toContain('"byWeekday": ["mo", "th"]');
    expect(EVENT_DATE_PROMPT_SPEC).toContain('"byMonthDay": [1, 15]');
    expect(EVENT_DATE_PROMPT_SPEC).toContain('"nth": -1');
  });

  test("routes what the format cannot express to the global flags array", () => {
    expect(EVENT_DATE_PROMPT_SPEC).toContain('"flags"');
    expect(EVENT_DATE_PROMPT_SPEC).toMatch(/do NOT approximate/i);
  });

  test("forbids materializing a series as one event per occurrence", () => {
    expect(EVENT_DATE_PROMPT_SPEC).toMatch(/never one event per occurrence/i);
  });
});
