import { describe, expect, it } from "bun:test";
import { parseFrenchVisitDate } from "./french-date";

// Every literal date string below is one the site actually served on
// 2026-08-08, so these pin the real contract rather than an imagined one.

const TODAY = new Date("2026-08-08T12:00:00Z");

describe("parseFrenchVisitDate", () => {
  it("resolves the omitted year from the published weekday", () => {
    // 2026-08-09 is a Sunday; 2027-08-09 is a Monday. The weekday IS the year.
    const date = parseFrenchVisitDate("Dimanche 09 Août à 10h00", TODAY);
    expect(date.kind).toBe("once");
    expect(date.startsAt.toISOString()).toBe("2026-08-09T08:00:00.000Z");
  });

  it("reads the time as Paris wall-clock, not UTC (summer, UTC+2)", () => {
    const date = parseFrenchVisitDate("Samedi 10 Octobre à 15h30", TODAY);
    expect(date.startsAt.toISOString()).toBe("2026-10-10T13:30:00.000Z");
  });

  it("follows the DST change into winter (UTC+1)", () => {
    // 2026-11-08 is a Sunday, and Paris has fallen back to UTC+1 by then — so
    // the same 10h00 is an hour later in UTC than an August walk.
    const date = parseFrenchVisitDate("Dimanche 08 Novembre à 10h00", TODAY);
    expect(date.startsAt.toISOString()).toBe("2026-11-08T09:00:00.000Z");
  });

  it("rolls into next year when this year's date has the wrong weekday", () => {
    // 2026-03-06 is a Friday; the next Saturday 06 March is in 2027.
    const date = parseFrenchVisitDate("Samedi 06 Mars à 10h00", TODAY);
    expect(date.startsAt.toISOString()).toBe("2027-03-06T09:00:00.000Z");
  });

  it("is case- and accent-normalizing", () => {
    const upper = parseFrenchVisitDate("DIMANCHE 09 AOÛT à 10h00", TODAY);
    const decomposed = parseFrenchVisitDate(
      "Dimanche 09 Août à 10h00".normalize("NFD"),
      TODAY,
    );
    expect(upper.startsAt.toISOString()).toBe("2026-08-09T08:00:00.000Z");
    expect(decomposed.startsAt.toISOString()).toBe("2026-08-09T08:00:00.000Z");
  });

  it("parses every date string the live listing served", () => {
    const live = [
      "Dimanche 09 Août à 10h00",
      "Dimanche 16 Août à 10h00",
      "Vendredi 21 Août à 10h00",
      "Samedi 22 Août à 10h00",
      "Vendredi 28 Août à 15h00",
      "Dimanche 30 Août à 10h00",
      "Dimanche 13 Septembre à 10h00",
      "Samedi 26 Septembre à 10h00",
      "Dimanche 27 Septembre à 11h00",
      "Samedi 03 Octobre à 10h00",
      "Dimanche 04 Octobre à 11h00",
      "Samedi 10 Octobre à 15h30",
    ];
    for (const text of live) {
      const date = parseFrenchVisitDate(text, TODAY);
      expect(date.startsAt.getTime()).toBeGreaterThan(TODAY.getTime());
    }
  });

  // The throwing cases are the load-bearing ones: this extractor reports the
  // source's FULL set, so anything it drops silently gets `disappearedAt`
  // stamped on it by the engine.

  it("throws on a shape it does not recognize", () => {
    expect(() => parseFrenchVisitDate("9 August 2026, 10am", TODAY)).toThrow(
      /Unreadable visit date/,
    );
  });

  it("throws on an unknown month rather than guessing", () => {
    expect(() =>
      parseFrenchVisitDate("Dimanche 09 Smarch à 10h00", TODAY),
    ).toThrow(/Unknown French month/);
  });

  it("throws when no year makes the weekday and the date agree", () => {
    // 30 February never falls on anything.
    expect(() =>
      parseFrenchVisitDate("Lundi 30 Février à 10h00", TODAY),
    ).toThrow(/No plausible year/);
  });

  it("throws on an impossible clock time", () => {
    expect(() =>
      parseFrenchVisitDate("Dimanche 09 Août à 25h00", TODAY),
    ).toThrow(/Impossible time/);
  });
});
