import { describe, expect, test } from "bun:test";
import type { ExtractedEvent } from "@plugins/apps/plugins/events/plugins/events-core/core";
import {
  deriveEventRowId,
  deriveExternalId,
  normalizeTitle,
  resolveExternalId,
  startsAtDateKey,
} from "./external-id";

// Identity is what makes re-extraction idempotent, so these assert the two
// properties the upsert depends on: the SAME event re-extracted keeps its id,
// and two DIFFERENT events never share one.

function event(over: Partial<ExtractedEvent> = {}): ExtractedEvent {
  return {
    title: "Techno Night",
    startsAt: new Date("2026-08-06T21:00:00Z"),
    category: "club",
    ...over,
  };
}

describe("normalizeTitle", () => {
  test("folds case, collapses whitespace, trims", () => {
    expect(normalizeTitle("  Techno   NIGHT \n")).toBe("techno night");
  });

  test("normalizes compatibility forms so one title is one identity", () => {
    expect(normalizeTitle("ﬁesta")).toBe(normalizeTitle("fiesta"));
  });
});

describe("startsAtDateKey", () => {
  test("is the UTC calendar day", () => {
    expect(startsAtDateKey(new Date("2026-08-06T21:00:00Z"))).toBe("2026-08-06");
  });

  test("throws on an invalid date rather than minting a wrong id", () => {
    expect(() => startsAtDateKey(new Date("nonsense"))).toThrow(
      /invalid startsAt/,
    );
  });
});

describe("deriveExternalId", () => {
  const startsAt = new Date("2026-08-06T21:00:00Z");

  test("is stable across re-extraction", () => {
    expect(deriveExternalId("s1", "Techno Night", startsAt)).toBe(
      deriveExternalId("s1", "Techno Night", startsAt),
    );
  });

  test("ignores title casing and whitespace churn", () => {
    expect(deriveExternalId("s1", "  TECHNO   night ", startsAt)).toBe(
      deriveExternalId("s1", "Techno Night", startsAt),
    );
  });

  test("ignores a door-time nudge within the same day", () => {
    expect(
      deriveExternalId("s1", "Techno Night", new Date("2026-08-06T21:30:00Z")),
    ).toBe(deriveExternalId("s1", "Techno Night", startsAt));
  });

  test("separates the next occurrence of a recurring event", () => {
    expect(
      deriveExternalId("s1", "Techno Night", new Date("2026-08-13T21:00:00Z")),
    ).not.toBe(deriveExternalId("s1", "Techno Night", startsAt));
  });

  test("separates two sources listing the same event", () => {
    expect(deriveExternalId("s2", "Techno Night", startsAt)).not.toBe(
      deriveExternalId("s1", "Techno Night", startsAt),
    );
  });

  test("separates two events on the same night", () => {
    expect(deriveExternalId("s1", "Jazz Night", startsAt)).not.toBe(
      deriveExternalId("s1", "Techno Night", startsAt),
    );
  });
});

describe("resolveExternalId", () => {
  test("prefers the source type's own id", () => {
    expect(resolveExternalId("s1", event({ externalId: "shotgun-42" }))).toBe(
      "shotgun-42",
    );
  });

  test("treats a blank supplied id as absent", () => {
    // Honouring `"   "` literally would collapse a whole run onto one row.
    expect(resolveExternalId("s1", event({ externalId: "   " }))).toBe(
      resolveExternalId("s1", event()),
    );
  });

  test("falls back to the derived hash", () => {
    expect(resolveExternalId("s1", event())).toBe(
      deriveExternalId("s1", "Techno Night", event().startsAt),
    );
  });
});

describe("deriveEventRowId", () => {
  test("is a pure function of the identity", () => {
    expect(deriveEventRowId("s1", "x")).toBe(deriveEventRowId("s1", "x"));
    expect(deriveEventRowId("s1", "x")).toMatch(/^evt-[0-9a-f]{32}$/);
  });

  test("differs per source and per identity", () => {
    expect(deriveEventRowId("s2", "x")).not.toBe(deriveEventRowId("s1", "x"));
    expect(deriveEventRowId("s1", "y")).not.toBe(deriveEventRowId("s1", "x"));
  });
});
