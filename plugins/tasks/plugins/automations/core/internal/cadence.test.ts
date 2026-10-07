import { describe, expect, test } from "bun:test";
import { cadenceCron, cadenceWords } from "./cadence";
import type { ScheduleSettings } from "./settings";

const base: ScheduleSettings = {
  cadence: "day",
  at: "06:00",
  everyDays: 3,
  weekday: "mon",
  cron: "0 6 * * *",
};

describe("cadenceCron", () => {
  test("daily at a local time, UTC+2 ⇒ two hours earlier", () => {
    expect(cadenceCron(base, 120)).toEqual({ ok: true, cron: "0 4 * * *" });
  });

  test("weekly crossing midnight moves the weekday", () => {
    // Monday 01:30 at UTC+2 is Sunday 23:30 UTC.
    const s = { ...base, cadence: "week" as const, at: "01:30" };
    expect(cadenceCron(s, 120)).toEqual({ ok: true, cron: "30 23 * * 0" });
    // Sunday 22:00 at UTC-5 is Monday 03:00 UTC.
    const sun = { ...s, weekday: "sun" as const, at: "22:00" };
    expect(cadenceCron(sun, -300)).toEqual({ ok: true, cron: "0 3 * * 1" });
  });

  test("weekly in UTC keeps the weekday (Monday = 1)", () => {
    const s = { ...base, cadence: "week" as const };
    expect(cadenceCron(s, 0)).toEqual({ ok: true, cron: "0 6 * * 1" });
  });

  test("hourly follows a half-hour offset", () => {
    const s = { ...base, cadence: "hour" as const };
    expect(cadenceCron(s, 330)).toEqual({ ok: true, cron: "30 * * * *" });
    expect(cadenceCron(s, 0)).toEqual({ ok: true, cron: "0 * * * *" });
  });

  test("every N days steps the day of the month", () => {
    const s = { ...base, cadence: "days" as const, everyDays: 3 };
    expect(cadenceCron(s, 0)).toEqual({ ok: true, cron: "0 6 */3 * *" });
    expect(cadenceCron({ ...s, everyDays: 1 }, 0).ok).toBe(false);
  });

  test("custom cron is taken as UTC and validated", () => {
    const s = { ...base, cadence: "cron" as const, cron: " 15  2 * * 1-5 " };
    expect(cadenceCron(s, 120)).toEqual({ ok: true, cron: "15 2 * * 1-5" });
    expect(cadenceCron({ ...s, cron: "every day" }, 0).ok).toBe(false);
    expect(cadenceCron({ ...s, cron: "0 6 * *" }, 0).ok).toBe(false);
  });

  test("a malformed time is refused", () => {
    expect(cadenceCron({ ...base, at: "25:00" }, 0).ok).toBe(false);
    expect(cadenceCron({ ...base, at: "6:00" }, 0).ok).toBe(false);
  });
});

describe("cadenceWords", () => {
  test("says each preset in the person's time", () => {
    expect(cadenceWords(base)).toBe("Daily at 06:00");
    expect(cadenceWords({ ...base, cadence: "week" })).toBe("Mondays at 06:00");
    expect(cadenceWords({ ...base, cadence: "days" })).toBe(
      "Every 3 days at 06:00",
    );
    expect(cadenceWords({ ...base, cadence: "hour" })).toBe("Every hour");
  });
});
