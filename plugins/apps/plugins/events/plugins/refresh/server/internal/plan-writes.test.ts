import { describe, expect, test } from "bun:test";
import type { ExtractedEvent } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { deriveExternalId } from "./external-id";
import { planEventWrites } from "./plan-writes";

// The write plan is the whole diff decision, and it is pure — so the counts the
// run ledger reports and the set `markEventsDisappeared` is told to spare are
// assertable with no database in sight.

function event(over: Partial<ExtractedEvent> = {}): ExtractedEvent {
  return {
    title: "Techno Night",
    startsAt: new Date("2026-08-06T21:00:00Z"),
    category: "club",
    ...over,
  };
}

describe("planEventWrites", () => {
  test("maps an extraction onto one write per event", () => {
    const plan = planEventWrites("s1", [
      event({ title: "A" }),
      event({ title: "B" }),
    ]);
    expect(plan.inputs).toHaveLength(2);
    expect(plan.seenExternalIds).toHaveLength(2);
    expect(plan.inputs.map((i) => i.externalId)).toEqual(plan.seenExternalIds);
    expect(plan.inputs.map((i) => i.title)).toEqual(["A", "B"]);
  });

  test("stamps every row with the engine-derived identity", () => {
    const [row] = planEventWrites("s1", [event()]).inputs;
    expect(row?.sourceId).toBe("s1");
    expect(row?.externalId).toBe(
      deriveExternalId("s1", "Techno Night", event().startsAt),
    );
  });

  test("honours an externalId the source type supplied", () => {
    const plan = planEventWrites("s1", [event({ externalId: "shotgun-42" })]);
    expect(plan.seenExternalIds).toEqual(["shotgun-42"]);
  });

  test("writes absent optional fields as explicit null, not undefined", () => {
    // An omitted key would leave the PREVIOUS value in place on the upsert's
    // conflict path — a price the venue removed would linger forever.
    const [row] = planEventWrites("s1", [event()]).inputs;
    expect(row?.description).toBeNull();
    expect(row?.venue).toBeNull();
    expect(row?.price).toBeNull();
    expect(row?.endsAt).toBeNull();
    expect(row?.seriesKey).toBeNull();
  });

  test("applies the engine's defaults for the flag/list fields", () => {
    const [row] = planEventWrites("s1", [event()]).inputs;
    expect(row?.allDay).toBe(false);
    expect(row?.recurring).toBe(false);
    expect(row?.tags).toEqual([]);
  });

  test("carries the supplied values through", () => {
    const [row] = planEventWrites("s1", [
      event({
        description: "warehouse",
        endsAt: new Date("2026-08-07T05:00:00Z"),
        allDay: true,
        venue: "Fitzroy",
        city: "Paris",
        url: "https://example.test/e",
        imageUrl: "https://example.test/i.jpg",
        price: "12–18 €",
        tags: ["techno", "late"],
        recurring: true,
        recurrenceLabel: "every Thursday",
        seriesKey: "thursday-techno",
      }),
    ]).inputs;
    expect(row?.venue).toBe("Fitzroy");
    expect(row?.price).toBe("12–18 €");
    expect(row?.tags).toEqual(["techno", "late"]);
    expect(row?.recurring).toBe(true);
    expect(row?.recurrenceLabel).toBe("every Thursday");
  });

  test("collapses duplicates within one extraction, last wins", () => {
    // Same title + same night ⇒ same identity: the page listed it twice.
    const plan = planEventWrites("s1", [
      event({ venue: "first" }),
      event({ venue: "second" }),
    ]);
    expect(plan.inputs).toHaveLength(1);
    expect(plan.seenExternalIds).toHaveLength(1);
    expect(plan.inputs[0]?.venue).toBe("second");
  });

  test("materialized occurrences of one series stay distinct rows", () => {
    const plan = planEventWrites("s1", [
      event({ seriesKey: "s", recurring: true }),
      event({
        seriesKey: "s",
        recurring: true,
        startsAt: new Date("2026-08-13T21:00:00Z"),
      }),
    ]);
    expect(plan.inputs).toHaveLength(2);
  });

  test("is idempotent: the same extraction plans byte-identical rows", () => {
    const a = planEventWrites("s1", [event({ title: "A" }), event()]);
    const b = planEventWrites("s1", [event({ title: "A" }), event()]);
    expect(a).toEqual(b);
  });

  test("an empty extraction plans no writes and spares nothing", () => {
    // A source that genuinely lists nothing: every prior event disappears.
    expect(planEventWrites("s1", [])).toEqual({
      inputs: [],
      seenExternalIds: [],
    });
  });

  test("throws on an extraction that violates the contract", () => {
    const bad = [{ title: "A" }] as unknown as ExtractedEvent[];
    expect(() => planEventWrites("s1", bad)).toThrow();
  });

  test("throws on an unparseable date rather than writing a broken row", () => {
    const bad = [
      { ...event(), startsAt: new Date("nonsense") },
    ] as ExtractedEvent[];
    expect(() => planEventWrites("s1", bad)).toThrow();
  });
});
