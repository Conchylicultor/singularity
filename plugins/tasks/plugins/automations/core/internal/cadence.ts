import { WEEKDAY_LABELS, WEEKDAYS, type ScheduleSettings } from "./settings";

/** A schedule turned into the UTC crontab the job scheduler runs, or why not. */
export type CadenceCron =
  { ok: true; cron: string } | { ok: false; error: string };

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CRON_FIELD = /^[\d*,/-]+$/;

/**
 * The 5-field UTC crontab a schedule means. The presets are local wall-clock
 * times, converted with `utcOffsetMinutes` (local = UTC + offset, the sign
 * `-new Date().getTimezoneOffset()` has): a time that crosses midnight in UTC
 * moves a weekly schedule's weekday with it. `cron` is taken as UTC, as typed.
 *
 * The offset is the one in force when the schedule is installed, so a schedule
 * is re-derived whenever its settings change and at every boot — across a DST
 * change it drifts by an hour until then.
 *
 * `days` steps the day of the month (`*\/N`), so a month whose length is not a
 * multiple of N runs the step again from the 1st.
 */
export function cadenceCron(
  schedule: ScheduleSettings,
  utcOffsetMinutes: number,
): CadenceCron {
  if (schedule.cadence === "cron") {
    const fields = schedule.cron.trim().split(/\s+/);
    if (fields.length !== 5 || !fields.every((f) => CRON_FIELD.test(f))) {
      return {
        ok: false,
        error: `"${schedule.cron}" is not a 5-field crontab (minute hour day month weekday)`,
      };
    }
    return { ok: true, cron: fields.join(" ") };
  }
  if (schedule.cadence === "hour") {
    const minute = mod(-utcOffsetMinutes, 60);
    return { ok: true, cron: `${minute} * * * *` };
  }
  const at = HHMM.exec(schedule.at);
  if (at === null) {
    return { ok: false, error: `"${schedule.at}" is not a time (HH:MM)` };
  }
  const local = Number(at[1]) * 60 + Number(at[2]);
  const utc = local - utcOffsetMinutes;
  const dayShift = Math.floor(utc / 1440);
  const inDay = mod(utc, 1440);
  const hour = Math.floor(inDay / 60);
  const minute = inDay % 60;
  switch (schedule.cadence) {
    case "day":
      return { ok: true, cron: `${minute} ${hour} * * *` };
    case "days": {
      const n = schedule.everyDays;
      if (!Number.isInteger(n) || n < 2 || n > 30) {
        return { ok: false, error: `every ${n} days is not between 2 and 30` };
      }
      return { ok: true, cron: `${minute} ${hour} */${n} * *` };
    }
    case "week": {
      // crontab weekdays: 0 = Sunday … 6 = Saturday; WEEKDAYS starts Monday.
      const dow = mod(WEEKDAYS.indexOf(schedule.weekday) + 1 + dayShift, 7);
      return { ok: true, cron: `${minute} ${hour} * * ${dow}` };
    }
  }
}

/** The schedule in words, in the person's own time ("Mondays at 06:00"). */
export function cadenceWords(schedule: ScheduleSettings): string {
  switch (schedule.cadence) {
    case "hour":
      return "Every hour";
    case "day":
      return `Daily at ${schedule.at}`;
    case "days":
      return `Every ${schedule.everyDays} days at ${schedule.at}`;
    case "week":
      return `${WEEKDAY_LABELS[schedule.weekday]}s at ${schedule.at}`;
    case "cron":
      return `Cron ${schedule.cron.trim()} (UTC)`;
  }
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
