import { expect, test } from "bun:test";
import { ExtractedEventSchema } from "@plugins/apps/plugins/events/plugins/events-core/core";
import type { eventsTable } from "@plugins/apps/plugins/events/plugins/events-core/server";
import { echoIsLossless, echoRows, toExtractedEvent } from "./echo";

type EventRow = typeof eventsTable.$inferSelect;

const stamps = {
  firstSeenAt: new Date("2026-08-01T10:00:00Z"),
  lastSeenAt: new Date("2026-08-02T10:00:00Z"),
  disappearedAt: null,
  createdAt: new Date("2026-08-01T10:00:00Z"),
  updatedAt: new Date("2026-08-02T10:00:00Z"),
};

/**
 * The populated fixture's own timestamps, hoisted rather than read back off the
 * row in the round-trip expectation: `EventRow.endsAt` types as `Date | null`
 * (the column is nullable), while `ExtractedEvent["endsAt"]` is `Date |
 * undefined` — so `expect(…).toEqual({ endsAt: fullRow.endsAt })` is a tsc
 * error, not a loose comparison. Naming the values keeps the assertion
 * value-for-value against the same `Date` instances, with no cast.
 */
const fullStartsAt = new Date("2026-09-04T19:00:00Z");
const fullEndsAt = new Date("2026-09-04T23:30:00Z");

/** Every optional populated — the case where an echo has the most to lose. */
const fullRow: EventRow = {
  id: "evt-1",
  sourceId: "evs-manual",
  externalId: "hand-1",
  title: "Concert at the Bataclan",
  description: "Doors at 19h",
  startsAt: fullStartsAt,
  endsAt: fullEndsAt,
  allDay: false,
  venue: "Bataclan",
  city: "Paris",
  url: "https://example.test/concert",
  imageUrl: "https://example.test/poster.jpg",
  price: "22 €",
  category: "music",
  tags: ["rock", "live"],
  recurring: true,
  recurrenceLabel: "every Thursday",
  seriesKey: "bataclan-thursdays",
  ...stamps,
};

/** Every optional empty — the case where an echo can most easily invent values. */
const sparseRow: EventRow = {
  id: "evt-2",
  sourceId: "evs-manual",
  externalId: "hand-2",
  title: "Book club",
  description: null,
  startsAt: new Date("2026-09-10T18:00:00Z"),
  endsAt: null,
  allDay: true,
  venue: null,
  city: null,
  url: null,
  imageUrl: null,
  price: null,
  category: "community",
  tags: [],
  recurring: false,
  recurrenceLabel: null,
  seriesKey: null,
  ...stamps,
};

test("the compile-time lossless guard is wired", () => {
  // Its real job is done by tsc: `EchoIsLossless` is `true` only while every
  // non-engine `events` column has an `ExtractedEvent` field to travel in. This
  // asserts the guard is reachable, so removing it fails here too.
  expect(echoIsLossless).toBe(true);
});

test("the engine's own re-validation accepts the echo", () => {
  // `planEventWrites` re-parses whatever a source type returns and throws a
  // ZodError (classified TERMINAL) on a violation. An echo that failed here
  // would park a healthy manual source in `status: "error"`.
  expect(() =>
    ExtractedEventSchema.array().parse(echoRows([fullRow, sparseRow])),
  ).not.toThrow();
});

test("a populated row round-trips value-for-value", () => {
  const [echoed] = ExtractedEventSchema.array().parse([
    toExtractedEvent(fullRow),
  ]);
  expect(echoed).toEqual({
    externalId: "hand-1",
    title: "Concert at the Bataclan",
    description: "Doors at 19h",
    startsAt: fullStartsAt,
    endsAt: fullEndsAt,
    allDay: false,
    venue: "Bataclan",
    city: "Paris",
    url: "https://example.test/concert",
    imageUrl: "https://example.test/poster.jpg",
    price: "22 €",
    category: "music",
    tags: ["rock", "live"],
    recurring: true,
    recurrenceLabel: "every Thursday",
    seriesKey: "bataclan-thursdays",
  });
});

test("an empty column echoes as absent, which the engine writes back as null", () => {
  const echoed = toExtractedEvent(sparseRow);
  // Absent, not `null`: `ExtractedEventSchema`'s optionals are `.optional()` and
  // would REJECT an explicit null, which is the difference between a working
  // manual source and a terminal ZodError on every sparse row.
  expect(echoed.description).toBeUndefined();
  expect(echoed.endsAt).toBeUndefined();
  expect(echoed.price).toBeUndefined();
  // `planEventWrites` maps both `undefined` and `null` back to `null` with `??`,
  // so the stored column is unchanged either way.
  expect(echoed.description ?? null).toBe(sparseRow.description);
  expect(echoed.price ?? null).toBe(sparseRow.price);
});

test("the echo vouches for every live row, so no refresh can disappear one", () => {
  const live = [fullRow, sparseRow];
  // What the engine derives: `resolveExternalId` takes the supplied identity when
  // a source type provides one, so the seen-set is the stored identities exactly.
  const seenExternalIds = ExtractedEventSchema.array()
    .parse(echoRows(live))
    .map((event) => event.externalId);
  expect(seenExternalIds).toEqual(["hand-1", "hand-2"]);

  // `markEventsDisappeared` stamps every live row whose identity is NOT in that
  // set. Nothing qualifies — which is the whole guarantee of this source type.
  const wouldDisappear = live.filter(
    (row) => !seenExternalIds.includes(row.externalId),
  );
  expect(wouldDisappear).toEqual([]);
});

test("a manual source with no events yet echoes nothing and loses nothing", () => {
  // The empty seen-set is the dangerous case in general — `markEventsDisappeared`
  // reads it as "the source listed nothing" and stamps the lot. Harmless here and
  // ONLY here, because the set being empty means there was nothing to stamp.
  expect(echoRows([])).toEqual([]);
});
