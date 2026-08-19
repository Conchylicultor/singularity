import { describe, expect, it } from "bun:test";
import { buildCourseSeries } from "./series";
import type { CourseRow } from "./rows";

// One live course, and a helper that moves it to another date — the only axis
// these tests vary. Field values are copied from the school's real response.
const BASE: CourseRow = {
  start: "2026-09-01T19:00:00+0200",
  type: "Adulte",
  image: "https://salsanueva.fr/wp-content/uploads/2026/06/bachata.jpg",
  activity: "Bachata",
  sub_activity: "Bachata Moderna",
  course_level: "Débutant",
  course_date: "2026-09-01",
  course_start: "19:00",
  course_end: "20:00",
  course_duration: 60,
  classroom: "SalsaNueva 12è  - PAVLOVA",
  location: { name: "SalsaNueva 12è", address: "10 rue Erard 75012 PARIS" },
  coachs: [{ name: "Clara" }],
};

function on(
  courseDate: string,
  offset = "+0200",
  over: Partial<CourseRow> = {},
): CourseRow {
  return {
    ...BASE,
    course_date: courseDate,
    start: `${courseDate}T19:00:00${offset}`,
    ...over,
  };
}

describe("buildCourseSeries", () => {
  it("collapses a term of occurrences into one weekly course", () => {
    const series = buildCourseSeries([
      on("2026-09-01"),
      on("2026-09-08"),
      on("2026-09-15"),
    ]);

    expect(series).toHaveLength(1);
    const [course] = series;
    expect(course!.date).toMatchObject({
      kind: "recurring",
      rule: { freq: "weekly", interval: 1, byWeekday: ["tu"] },
    });
    // The anchor is the first occurrence in the window; the engine re-anchors it
    // against the clock at write time.
    expect(course!.date.startsAt.toISOString()).toBe(
      "2026-09-01T17:00:00.000Z",
    );
    expect(course!.skipped).toEqual([]);
  });

  it("states no `until` — the window ends where publishing stops, not the course", () => {
    const [course] = buildCourseSeries([on("2026-09-01"), on("2026-09-08")]);
    expect(course!.date).toMatchObject({ kind: "recurring" });
    if (course!.date.kind !== "recurring") throw new Error("unreachable");
    expect(course!.date.rule.until).toBeUndefined();
    expect(course!.date.rule.count).toBeUndefined();
  });

  it("keeps a holiday gap weekly and reports the missing week", () => {
    const series = buildCourseSeries([
      on("2026-10-13"),
      // 2026-10-20 is half-term: the school skips it.
      on("2026-10-27"),
      on("2026-11-03"),
    ]);

    expect(series[0]!.date).toMatchObject({ rule: { interval: 1 } });
    expect(series[0]!.skipped).toEqual(["2026-10-20"]);
  });

  it("reads a genuinely fortnightly course as interval 2, with nothing skipped", () => {
    const series = buildCourseSeries([
      on("2026-09-01"),
      on("2026-09-15"),
      on("2026-09-29"),
    ]);
    expect(series[0]!.date).toMatchObject({
      rule: { freq: "weekly", interval: 2 },
    });
    expect(series[0]!.skipped).toEqual([]);
  });

  it("crosses the DST change without downgrading the course", () => {
    // 25 Oct 2026 is the European fall-back, so these two occurrences are 7 days
    // but 169 hours apart. Day arithmetic is what keeps that weekly.
    const series = buildCourseSeries([
      on("2026-10-20", "+0200"),
      on("2026-10-27", "+0100"),
    ]);
    expect(series[0]!.date).toMatchObject({
      rule: { freq: "weekly", interval: 1 },
    });
  });

  it("publishes a single sighting as a one-off, not as a weekly rule", () => {
    const [course] = buildCourseSeries([on("2026-09-01")]);
    expect(course!.date.kind).toBe("once");
  });

  it("falls back to the next occurrence when the rhythm is not weekly at all", () => {
    // `event-date` has no arm for an irregular published date list; its own
    // instruction is to publish the next occurrence and flag the shortfall.
    const [course] = buildCourseSeries([on("2026-09-01"), on("2026-09-04")]);
    expect(course!.date.kind).toBe("once");
  });

  it("keeps the same course at two studios as two courses", () => {
    const series = buildCourseSeries([
      on("2026-09-01"),
      on("2026-09-01", "+0200", {
        classroom: "SalsaNueva 20è - HALL 1",
        location: {
          name: "SalsaNueva 20è",
          address: "3 rue Duris 75020 PARIS",
        },
      }),
    ]);
    expect(series).toHaveLength(2);
    expect(series[0]!.externalId).not.toBe(series[1]!.externalId);
  });

  it("gives a course the same identity whatever week it is read in", () => {
    const september = buildCourseSeries([on("2026-09-01"), on("2026-09-08")]);
    const october = buildCourseSeries([on("2026-10-06"), on("2026-10-13")]);
    expect(october[0]!.externalId).toBe(september[0]!.externalId);
  });

  it("unions the teachers across the weeks, first seen first", () => {
    const [course] = buildCourseSeries([
      on("2026-09-01"),
      on("2026-09-08", "+0200", {
        coachs: [{ name: "Jerry" }, { name: "Clara" }],
      }),
    ]);
    expect(course!.coaches).toEqual(["Clara", "Jerry"]);
  });

  it("does not depend on the order the occurrences arrive in", () => {
    const forward = buildCourseSeries([on("2026-09-01"), on("2026-09-08")]);
    const backward = buildCourseSeries([on("2026-09-08"), on("2026-09-01")]);
    expect(backward[0]!.date.startsAt).toEqual(forward[0]!.date.startsAt);
    expect(backward[0]!.externalId).toBe(forward[0]!.externalId);
  });
});
