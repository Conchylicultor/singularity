import { describe, expect, test } from "bun:test";
import type {
  EventDate,
  RecurrenceRule,
} from "@plugins/apps/plugins/events/plugins/event-date/core";
import type { ExtractedEvent } from "@plugins/apps/plugins/events/plugins/events-core/core";
import {
  deriveEventRowId,
  deriveExternalId,
  normalizeTitle,
  resolveExternalId,
} from "./external-id";

// Identity is what makes re-extraction idempotent, so these assert the two
// properties the upsert depends on: the SAME event re-extracted keeps its id,
// and two DIFFERENT events never share one.

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

describe("normalizeTitle", () => {
  test("folds case, collapses whitespace, trims", () => {
    expect(normalizeTitle("  Techno   NIGHT \n")).toBe("techno night");
  });

  test("normalizes compatibility forms so one title is one identity", () => {
    expect(normalizeTitle("ﬁesta")).toBe(normalizeTitle("fiesta"));
  });
});

describe("deriveExternalId", () => {
  const date = once("2026-08-06T21:00:00Z");

  test("a one-off id is UNCHANGED from the pre-recurrence derivation", () => {
    // THE regression guard on the format migration. This digest is the output of
    // the PRE-CHANGE `deriveExternalId(sourceId, title, startsAt)` for these
    // inputs — obtained by running that file as it stood in git, not by copying
    // what the new code prints, or the test would only assert itself.
    //
    // It pins two things at once: that `eventDateIdentityKey`'s `once` arm still
    // returns the UTC day key, and `SEP` (a NUL byte, hence invisible in the
    // source it is written in). If either moves, every existing one-off row's
    // identity moves with it — and the next refresh inserts a duplicate of each
    // and buries the original as disappeared. A duplicate storm the user sees,
    // on deploy.
    expect(deriveExternalId("s1", "Techno Night", date)).toBe(
      "9c2698ba02b09012e4e435a367353aa28f20292bd1b5de592ad97ff8e88b0f49",
    );
  });

  test("is stable across re-extraction", () => {
    expect(deriveExternalId("s1", "Techno Night", date)).toBe(
      deriveExternalId("s1", "Techno Night", date),
    );
  });

  test("ignores title casing and whitespace churn", () => {
    expect(deriveExternalId("s1", "  TECHNO   night ", date)).toBe(
      deriveExternalId("s1", "Techno Night", date),
    );
  });

  test("ignores a door-time nudge within the same day", () => {
    expect(
      deriveExternalId("s1", "Techno Night", once("2026-08-06T21:30:00Z")),
    ).toBe(deriveExternalId("s1", "Techno Night", date));
  });

  test("separates two one-off events on different nights", () => {
    expect(
      deriveExternalId("s1", "Techno Night", once("2026-08-13T21:00:00Z")),
    ).not.toBe(deriveExternalId("s1", "Techno Night", date));
  });

  test("a series keeps ONE identity however far its anchor has moved", () => {
    // The whole reason identity moved off `startsAt`. Next week's extraction
    // reports a later anchor for the same weekly night; hashing that anchor
    // would mint a second row every week and bury the first as disappeared.
    const rule: RecurrenceRule = {
      freq: "weekly",
      interval: 1,
      byWeekday: ["th"],
    };
    const thisWeek: EventDate = {
      kind: "recurring",
      startsAt: new Date("2026-08-06T21:00:00Z"),
      rule,
    };
    const nextWeek: EventDate = {
      kind: "recurring",
      startsAt: new Date("2026-08-13T21:00:00Z"),
      rule,
    };
    expect(deriveExternalId("s1", "Techno Night", nextWeek)).toBe(
      deriveExternalId("s1", "Techno Night", thisWeek),
    );
  });

  test("a series is not the same event as a one-off on its anchor day", () => {
    const series: EventDate = {
      kind: "recurring",
      startsAt: new Date("2026-08-06T21:00:00Z"),
      rule: { freq: "weekly", interval: 1, byWeekday: ["th"] },
    };
    expect(deriveExternalId("s1", "Techno Night", series)).not.toBe(
      deriveExternalId("s1", "Techno Night", date),
    );
  });

  test("separates two sources listing the same event", () => {
    expect(deriveExternalId("s2", "Techno Night", date)).not.toBe(
      deriveExternalId("s1", "Techno Night", date),
    );
  });

  test("separates two events on the same night", () => {
    expect(deriveExternalId("s1", "Jazz Night", date)).not.toBe(
      deriveExternalId("s1", "Techno Night", date),
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
      deriveExternalId("s1", "Techno Night", event().date),
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
