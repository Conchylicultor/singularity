import { describe, expect, test } from "bun:test";
import { EventDateSchema, RecurrenceRuleSchema, WEEKDAYS } from "./event-date";

describe("EventDateSchema", () => {
  test("parses a one-off date, coercing ISO strings", () => {
    const parsed = EventDateSchema.parse({
      kind: "once",
      startsAt: "2026-08-13T20:00:00Z",
      endsAt: "2026-08-13T23:00:00Z",
    });
    expect(parsed.kind).toBe("once");
    expect(parsed.startsAt.toISOString()).toBe("2026-08-13T20:00:00.000Z");
    expect(parsed.endsAt?.toISOString()).toBe("2026-08-13T23:00:00.000Z");
  });

  test("defaults an absent interval to 1, so the step is always positive", () => {
    expect(RecurrenceRuleSchema.parse({ freq: "weekly" }).interval).toBe(1);
    expect(
      RecurrenceRuleSchema.parse({ freq: "weekly", interval: 3 }).interval,
    ).toBe(3);
  });

  test("rejects a non-positive interval", () => {
    expect(() =>
      RecurrenceRuleSchema.parse({ freq: "weekly", interval: 0 }),
    ).toThrow();
  });

  test("rejects a month day outside 1..31", () => {
    expect(() =>
      RecurrenceRuleSchema.parse({ freq: "monthly", byMonthDay: [32] }),
    ).toThrow();
  });

  test("rejects an unknown weekday token", () => {
    expect(() =>
      RecurrenceRuleSchema.parse({ freq: "weekly", byWeekday: ["mon"] }),
    ).toThrow();
  });

  test("has exactly two arms — an explicit date list is a flag, not a third kind", () => {
    expect(() =>
      EventDateSchema.parse({
        kind: "dates",
        dates: ["2026-08-13", "2026-08-20"],
      }),
    ).toThrow();
  });

  test("weekdays are Monday-first, which every weekday index depends on", () => {
    expect([...WEEKDAYS]).toEqual(["mo", "tu", "we", "th", "fr", "sa", "su"]);
  });
});
