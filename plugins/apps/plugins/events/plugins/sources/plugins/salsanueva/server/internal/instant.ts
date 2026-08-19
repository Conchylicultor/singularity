import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";

// `"2026-08-31T19:00:00+0200"` → an exact UTC instant.
//
// Parsed here rather than handed to `new Date(...)` for one reason: the school
// writes its offset WITHOUT the colon ISO 8601 asks for. Every JS engine in
// practice accepts it, but through its implementation-defined fallback parser —
// and the failure mode of that path is `Invalid Date`, a value that flows all the
// way into an `events` row as `NaN` before anybody notices. A strict parse turns
// the same input into a parked source carrying the offending string.
//
// Note what this file does NOT need: a timezone database. The school publishes
// the offset in force at each occurrence (+0200 in August, +0100 in November),
// so summer time is already resolved upstream. Contrast `dmda`, which is handed
// a bare wall clock and has to reconstruct the offset through `Intl`.

/** `YYYY-MM-DDTHH:MM:SS` followed by `Z`, `±HHMM` or `±HH:MM`. */
const PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:Z|([+-])(\d{2}):?(\d{2}))$/;

/**
 * Parse one published course instant.
 *
 * Throws `NonRetryableError` on anything it cannot read — never a `null` a
 * caller could drop on the floor. That choice is load-bearing: `extract` returns
 * the source's FULL current set, so a row silently skipped is a row the engine
 * stamps `disappearedAt` on. A school that changes its date format must park the
 * source, not empty it.
 */
export function parseCourseInstant(text: string): Date {
  const match = PATTERN.exec(text.trim());
  if (match === null) {
    throw new NonRetryableError(`Unreadable course start: "${text}"`);
  }

  const [, y, mo, d, h, mi, s, sign, offsetH, offsetM] = match;
  const year = Number(y);
  const month = Number(mo) - 1;
  const day = Number(d);

  // `Date.UTC` rolls `2026-02-30` over to March rather than refusing, and would
  // happily take hour 47 — so the parts are checked here, before it sees them.
  if (Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) {
    throw new NonRetryableError(`Impossible time in course start: "${text}"`);
  }
  const probe = new Date(Date.UTC(year, month, day));
  if (probe.getUTCMonth() !== month || probe.getUTCDate() !== day) {
    throw new NonRetryableError(`Impossible date in course start: "${text}"`);
  }

  const wallClock = Date.UTC(
    year,
    month,
    day,
    Number(h),
    Number(mi),
    Number(s),
  );

  // `Z` (no sign group) is already UTC. Otherwise the wall clock is ahead of UTC
  // by the offset east of Greenwich, so subtract it.
  const offsetMs =
    sign === undefined
      ? 0
      : (sign === "-" ? -1 : 1) *
        (Number(offsetH) * 60 + Number(offsetM)) *
        60_000;

  return new Date(wallClock - offsetMs);
}
