import { describe, expect, it } from "bun:test";
import { applyFilters } from "./filters";
import { buildCourseSeries, type CourseSeries } from "./series";
import type { CourseRow } from "./rows";
import type { SalsanuevaSourceConfig } from "../../core";

const EMPTY: SalsanuevaSourceConfig = {
  type: [],
  activity: [],
  sub_activity: [],
  course_level: [],
  location_name: [],
  coach: [],
  days: [],
};

function course(over: Partial<CourseRow>): CourseSeries {
  const row: CourseRow = {
    // 2026-09-01 is a Tuesday.
    start: "2026-09-01T19:00:00+0200",
    type: "Adulte",
    activity: "Bachata",
    sub_activity: "Bachata Moderna",
    course_level: "Débutant",
    course_date: "2026-09-01",
    course_start: "19:00",
    course_duration: 60,
    classroom: "SalsaNueva 12è  - PAVLOVA",
    location: { name: "SalsaNueva 12è" },
    coachs: [{ name: "Clara" }],
    ...over,
  };
  return buildCourseSeries([row])[0]!;
}

const BACHATA = course({});
const SALSA = course({
  activity: "Salsa Cubaine",
  sub_activity: "Salsa Cubaine",
  course_level: "Ts niveaux",
  location: { name: "SalsaNueva 20è" },
  classroom: "SalsaNueva 20è - HALL 1",
  coachs: [{ name: "Ivan" }],
  // 2026-09-03 is a Thursday.
  start: "2026-09-03T20:00:00+0200",
  course_date: "2026-09-03",
});

describe("applyFilters", () => {
  it("keeps everything when nothing is selected", () => {
    const { kept } = applyFilters([BACHATA, SALSA], EMPTY);
    expect(kept).toHaveLength(2);
  });

  it("keeps a course matching any value of a filter", () => {
    const { kept } = applyFilters([BACHATA, SALSA], {
      ...EMPTY,
      activity: ["Bachata", "Kizomba"],
    });
    expect(kept.map((c) => c.key.activity)).toEqual(["Bachata"]);
  });

  it("requires every non-empty filter to match", () => {
    const { kept } = applyFilters([BACHATA, SALSA], {
      ...EMPTY,
      activity: ["Bachata"],
      location_name: ["SalsaNueva 20è"],
    });
    expect(kept).toEqual([]);
  });

  it("filters by the French day the school's own page uses", () => {
    const { kept } = applyFilters([BACHATA, SALSA], {
      ...EMPTY,
      days: ["Jeudi"],
    });
    expect(kept.map((c) => c.key.activity)).toEqual(["Salsa Cubaine"]);
  });

  it("matches a course when any of its teachers is selected", () => {
    const { kept } = applyFilters([BACHATA, SALSA], {
      ...EMPTY,
      coach: ["Ivan"],
    });
    expect(kept.map((c) => c.key.activity)).toEqual(["Salsa Cubaine"]);
  });

  it("reports a selected value the schedule no longer offers", () => {
    const { kept, unmatched } = applyFilters([BACHATA, SALSA], {
      ...EMPTY,
      activity: ["Bachata", "Lindy Hop"],
    });
    expect(kept).toHaveLength(1);
    expect(unmatched).toEqual([{ key: "activity", values: ["Lindy Hop"] }]);
  });

  it("does not report a value that merely lost to another filter", () => {
    // Both dances exist; the level filter is what removed the salsa. Testing
    // availability against the survivors would have called "Salsa Cubaine"
    // extinct.
    const { unmatched } = applyFilters([BACHATA, SALSA], {
      ...EMPTY,
      activity: ["Bachata", "Salsa Cubaine"],
      course_level: ["Débutant"],
    });
    expect(unmatched).toEqual([]);
  });
});
