import { describe, expect, it } from "bun:test";
import { CoursesResponseSchema } from "./rows";

// Pinned against what the school's API really serves, not against what its field
// names suggest it serves.

describe("CoursesResponseSchema", () => {
  it("accepts a live course row", () => {
    const parsed = CoursesResponseSchema.parse({
      success: true,
      statusCode: 200,
      code: "schedules_found",
      message: "Schedules found",
      data: [
        {
          start: "2026-08-31T19:00:00+0200",
          type: "Adulte",
          image: "https://salsanueva.fr/wp-content/uploads/2026/06/dh.jpg",
          activity: "Dancehall",
          description: "<p>Le Dancehall est une danse jamaïcaine</p>",
          sub_activity: "DanceHall Mix",
          coachs: [
            { name: "Elsa", profile: "https://salsanueva.fr/professeur/elsa/" },
          ],
          course_level: "Ts niveaux",
          course_date: "2026-08-31",
          course_start: "19:00",
          course_duration: 60,
          course_end: "20:00",
          course_schedule_id: 125448,
          classroom_id: 496,
          classroom: "SalsaNueva 12è  - PAVLOVA",
          course_purchase: "https://salsanueva.fr/commande/?gym_id=146",
          location: {
            name: "SalsaNueva 12è",
            phone: "+33 7 82 61 31 25",
            address: "10 rue Erard 75012 PARIS",
            color: "#e76f51",
          },
        },
      ],
    });
    expect(parsed.data).toHaveLength(1);
    expect(parsed.data![0]!.location.name).toBe("SalsaNueva 12è");
  });

  it("accepts a window with no courses at all — the API omits `data` entirely", () => {
    // How the school says "the published term does not reach that far". Not an
    // error, and the reason `data` is optional rather than defaulted.
    const parsed = CoursesResponseSchema.parse({
      success: true,
      statusCode: 200,
      code: "schedules_found",
      message: "Schedules found",
    });
    expect(parsed.data).toBeUndefined();
  });

  it("rejects a row missing a field the extractor builds identity from", () => {
    expect(() =>
      CoursesResponseSchema.parse({
        success: true,
        code: "schedules_found",
        data: [{ start: "2026-08-31T19:00:00+0200", type: "Adulte" }],
      }),
    ).toThrow();
  });
});
