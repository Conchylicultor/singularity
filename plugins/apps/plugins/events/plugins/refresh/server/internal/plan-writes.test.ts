import { describe, expect, test } from "bun:test";
import type { EventDate } from "@plugins/apps/plugins/events/plugins/event-date/core";
import type { ExtractedEvent } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { deriveExternalId } from "./external-id";
import { planEventWrites } from "./plan-writes";

// The write plan is the whole diff decision, and it is pure — so the counts the
// run ledger reports and the set `markEventsDisappeared` is told to spare are
// assertable with no database in sight. `now` is a parameter, so "what does this
// plan look like next Tuesday" is a test, not a mock.

const NOW = new Date("2026-08-01T12:00:00Z");

const once = (iso: string): EventDate => ({
  kind: "once",
  startsAt: new Date(iso),
});

function event(over: Partial<ExtractedEvent> = {}): ExtractedEvent {
  return {
    title: "Techno Night",
    date: once("2026-08-06T21:00:00Z"),
    category: "club",
    ...over,
  };
}

const plan = (
  events: readonly ExtractedEvent[],
  now: Date = NOW,
): ReturnType<typeof planEventWrites> => planEventWrites("s1", events, { now });

describe("planEventWrites", () => {
  test("maps an extraction onto one write per event", () => {
    const p = plan([event({ title: "A" }), event({ title: "B" })]);
    expect(p.inputs).toHaveLength(2);
    expect(p.seenExternalIds).toHaveLength(2);
    expect(p.inputs.map((i) => i.externalId)).toEqual(p.seenExternalIds);
    expect(p.inputs.map((i) => i.title)).toEqual(["A", "B"]);
  });

  test("stamps every row with the engine-derived identity", () => {
    const [row] = plan([event()]).inputs;
    expect(row?.sourceId).toBe("s1");
    expect(row?.externalId).toBe(
      deriveExternalId("s1", "Techno Night", event().date),
    );
  });

  test("honours an externalId the source type supplied", () => {
    expect(plan([event({ externalId: "shotgun-42" })]).seenExternalIds).toEqual([
      "shotgun-42",
    ]);
  });

  test("writes absent optional fields as explicit null, not undefined", () => {
    // An omitted key would leave the PREVIOUS value in place on the upsert's
    // conflict path — a price the venue removed would linger forever.
    const [row] = plan([event()]).inputs;
    expect(row?.description).toBeNull();
    expect(row?.venue).toBeNull();
    expect(row?.price).toBeNull();
    expect(row?.endsAt).toBeNull();
    expect(row?.recurrenceLabel).toBeNull();
  });

  test("applies the engine's defaults for the flag/list fields", () => {
    const [row] = plan([event()]).inputs;
    expect(row?.allDay).toBe(false);
    expect(row?.recurring).toBe(false);
    expect(row?.tags).toEqual([]);
  });

  test("carries the supplied values through", () => {
    const [row] = plan([
      event({
        description: "warehouse",
        date: {
          kind: "once",
          startsAt: new Date("2026-08-06T21:00:00Z"),
          endsAt: new Date("2026-08-07T05:00:00Z"),
        },
        venue: "Fitzroy",
        city: "Paris",
        url: "https://example.test/e",
        imageUrl: "https://example.test/i.jpg",
        price: "12–18 €",
        tags: ["techno", "late"],
      }),
    ]).inputs;
    expect(row?.venue).toBe("Fitzroy");
    expect(row?.price).toBe("12–18 €");
    expect(row?.tags).toEqual(["techno", "late"]);
    expect(row?.endsAt).toEqual(new Date("2026-08-07T05:00:00Z"));
  });

  describe("the denormalized columns are projections of `date`", () => {
    test("a one-off projects its own instant and no recurrence", () => {
      const [row] = plan([event()]).inputs;
      expect(row?.date).toEqual(once("2026-08-06T21:00:00Z"));
      expect(row?.startsAt).toEqual(new Date("2026-08-06T21:00:00Z"));
      expect(row?.recurring).toBe(false);
      expect(row?.recurrenceLabel).toBeNull();
    });

    test("a series is ONE row carrying its rule verbatim", () => {
      const date: EventDate = {
        kind: "recurring",
        startsAt: new Date("2026-08-06T21:00:00Z"),
        rule: { freq: "weekly", interval: 1, byWeekday: ["th"] },
        label: "every Thursday",
      };
      const p = plan([event({ date })]);
      expect(p.inputs).toHaveLength(1);
      const [row] = p.inputs;
      // Written verbatim: `date` is the authority, the columns are its shadow.
      expect(row?.date).toEqual(date);
      expect(row?.recurring).toBe(true);
      expect(row?.recurrenceLabel).toBe("every Thursday");
    });
  });

  describe("anchor normalization", () => {
    test("re-derives a series anchor the extractor got wrong", () => {
      // The model anchored a weekly Thursday on a Tuesday. Corrected from the
      // rule rather than trusted — the stored anchor is a real occurrence.
      const [row] = plan([
        event({
          date: {
            kind: "recurring",
            startsAt: new Date("2026-08-04T21:00:00Z"), // a Tuesday
            rule: { freq: "weekly", interval: 1, byWeekday: ["th"] },
          },
        }),
      ]).inputs;
      expect(row?.startsAt.getUTCDay()).toBe(4); // Thursday
      expect(row?.startsAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    });

    test("advances a series whose anchor is already in the past", () => {
      const [row] = plan(
        [
          event({
            date: {
              kind: "recurring",
              startsAt: new Date("2026-08-06T21:00:00Z"),
              rule: { freq: "weekly", interval: 1, byWeekday: ["th"] },
            },
          }),
        ],
        new Date("2026-08-20T12:00:00Z"),
      ).inputs;
      expect(row?.startsAt.getTime()).toBeGreaterThanOrEqual(
        new Date("2026-08-20T12:00:00Z").getTime(),
      );
    });

    test("moving the anchor does NOT move the identity", () => {
      // The point of the whole change: the same series re-extracted a month
      // later updates one row rather than inserting a second and burying it.
      const date = (startsAt: string): EventDate => ({
        kind: "recurring",
        startsAt: new Date(startsAt),
        rule: { freq: "weekly", interval: 1, byWeekday: ["th"] },
      });
      const early = plan([event({ date: date("2026-08-06T21:00:00Z") })]);
      const late = plan(
        [event({ date: date("2026-09-10T21:00:00Z") })],
        new Date("2026-09-05T12:00:00Z"),
      );
      expect(late.seenExternalIds).toEqual(early.seenExternalIds);
    });

    test("keeps a one-off whose date has already passed", () => {
      // A one-off does not "run out". Dropping it would remove it from the
      // seen-set, and `markEventsDisappeared` would then bury a past event the
      // page still lists — or, for a manual source, one the user typed.
      const p = plan([event()], new Date("2026-12-01T12:00:00Z"));
      expect(p.inputs).toHaveLength(1);
      expect(p.inputs[0]?.startsAt).toEqual(new Date("2026-08-06T21:00:00Z"));
    });

    test("drops an exhausted series — over, not broken", () => {
      // `until` has passed: there is no occurrence left to anchor. The event
      // leaves the plan AND the seen-set, so its row is stamped disappeared,
      // which is exactly what "this series has ended" should look like.
      const p = plan(
        [
          event({
            date: {
              kind: "recurring",
              startsAt: new Date("2026-08-06T21:00:00Z"),
              rule: {
                freq: "weekly",
                interval: 1,
                byWeekday: ["th"],
                until: new Date("2026-08-20T00:00:00Z"),
              },
            },
          }),
        ],
        new Date("2026-09-01T12:00:00Z"),
      );
      expect(p).toEqual({ inputs: [], seenExternalIds: [] });
    });
  });

  test("collapses duplicates within one extraction, last wins", () => {
    // Same title + same date ⇒ same identity: the page listed it twice.
    const p = plan([event({ venue: "first" }), event({ venue: "second" })]);
    expect(p.inputs).toHaveLength(1);
    expect(p.seenExternalIds).toHaveLength(1);
    expect(p.inputs[0]?.venue).toBe("second");
  });

  test("two one-off nights of the same title stay distinct rows", () => {
    const p = plan([
      event(),
      event({ date: once("2026-08-13T21:00:00Z") }),
    ]);
    expect(p.inputs).toHaveLength(2);
  });

  test("is idempotent: the same extraction plans byte-identical rows", () => {
    const a = plan([event({ title: "A" }), event()]);
    const b = plan([event({ title: "A" }), event()]);
    expect(a).toEqual(b);
  });

  test("an empty extraction plans no writes and spares nothing", () => {
    // A source that genuinely lists nothing: every prior event disappears.
    expect(plan([])).toEqual({ inputs: [], seenExternalIds: [] });
  });

  test("throws on an extraction that violates the contract", () => {
    const bad = [{ title: "A" }] as unknown as ExtractedEvent[];
    expect(() => plan(bad)).toThrow();
  });

  test("throws on an unparseable date rather than writing a broken row", () => {
    const bad = [
      { ...event(), date: { kind: "once", startsAt: new Date("nonsense") } },
    ] as ExtractedEvent[];
    expect(() => plan(bad)).toThrow();
  });
});
