import { createHash } from "node:crypto";
import { NonRetryableError } from "@plugins/infra/plugins/jobs/server";
import {
  parsePublicUrl,
  safeFetch,
} from "@plugins/infra/plugins/safe-fetch/server";
import type {
  ProbeContext,
  ProbeResult,
} from "@plugins/apps/plugins/events/plugins/events-core/server";
import { SALSANUEVA_ORIGIN, type SalsanuevaSourceConfig } from "../../core";
import { buildCourseSeries, type CourseSeries } from "./series";
import { CoursesResponseSchema, type CourseRow } from "./rows";
import { readSalsanuevaSourceConfig } from "./source-config";

/**
 * The endpoint the school's own planning page calls. Hardcoded, because this
 * source type IS this school — a URL field would only be a way to point it
 * somewhere it cannot read. Found the same way `dmda`'s was: render the page once
 * headlessly and watch its XHRs. The page ships an empty container and fills it
 * from this call, which is why the generic `url` type reads it as a venue with no
 * events.
 */
const ENDPOINT = `${SALSANUEVA_ORIGIN}/wp-json/v1/blb/courses`;

/**
 * Query parameters the page sends and the API ignores, kept because sending what
 * the page sends is the cheapest way to stay on its supported path. `club_id`
 * demonstrably changes nothing in the response today; that is not a licence to
 * invent a value, so it stays the page's.
 */
const CLUB_ID = "13958";
const BOOKING_TYPE = "bs";

/**
 * How far ahead to read, in weeks, matching the school's own page.
 *
 * Not a page-size knob — it is what makes the weekly grouping trustworthy. A
 * short window straddling the autumn holidays would show the children's courses
 * pausing as "these courses no longer exist", and the engine would stamp
 * `disappearedAt` on every one of them. The API caps the range at wherever the
 * published term ends anyway.
 */
const WEEKS_AHEAD = 16;

const DAY_MS = 24 * 60 * 60 * 1000;

/** What `probe` hands `extract`: the window, already read and already grouped. */
export interface SalsanuevaPayload {
  series: CourseSeries[];
}

/**
 * The Monday of the week containing `now`, as `YYYY-MM-DD` in UTC.
 *
 * UTC, not Paris: this only picks which days to ASK for, and asking from a
 * Monday that is a few hours off costs nothing — while a timezone conversion
 * here would be a second, silently different notion of "the school's week" from
 * the one `series.ts` derives from `course_date`.
 */
function startOfWeek(now: Date): number {
  const day = Math.floor(now.getTime() / DAY_MS);
  // Day 0 (1970-01-01) was a Thursday, so Monday is day ≡ 4 (mod 7).
  return day - ((((day - 4) % 7) + 7) % 7);
}

function dayString(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/**
 * A 4xx is this plugin's own endpoint being wrong (the school moved its API) —
 * terminal, so the source parks with something actionable rather than retrying
 * an identically-failing request. 408/429 and 5xx are the server having a
 * moment: a plain throw, which the refresh job retries.
 */
function assertFetched(res: Response, url: URL): void {
  if (res.ok) return;
  const detail = `${res.status} fetching ${url.toString()}`;
  if (
    res.status >= 400 &&
    res.status < 500 &&
    res.status !== 408 &&
    res.status !== 429
  ) {
    throw new NonRetryableError(`Courses API returned ${detail}`);
  }
  throw new Error(`Courses API returned ${detail}`);
}

/**
 * The cache key: the courses this source publishes, plus the WEEK it read them
 * in.
 *
 * **Individual occurrence dates are excluded.** The window slides forward every
 * day, so hashing them would report "changed" on every tick for a schedule
 * nobody touched — `dmda`'s signed-blob-URL doctrine, met from the other
 * direction: there the churn was in the answer, here it is in the question.
 *
 * **The week is included, and it is not a hedge.** A recurring event stores an
 * anchor, and the engine re-derives that anchor from the clock at WRITE time —
 * so a row's "When" is only as fresh as its last extraction. A fingerprint blind
 * to the week would freeze every course's next occurrence on whatever day the
 * source was first read. Folding the week in re-extracts once a week, which for
 * this type is pure CPU over data `probe` has already grouped.
 *
 * What that combination costs, stated plainly: a course moved to a different
 * week with nothing else about it changed is picked up at the next week roll,
 * not immediately.
 */
function fingerprintSeries(
  series: readonly CourseSeries[],
  weekStart: number,
): string {
  const canonical = [...series]
    .map((s) => [
      s.externalId,
      s.date.kind,
      s.date.kind === "recurring" ? s.date.rule.interval : 0,
      [...s.coaches].sort(),
      s.first.image ?? "",
      s.first.description ?? "",
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return createHash("sha256")
    .update(JSON.stringify({ weekStart, canonical }))
    .digest("hex");
}

/**
 * The cheap phase: read the school's whole published term as JSON and
 * fingerprint the courses in it.
 *
 * "Cheap" is one request — the API takes a date range and returns everything in
 * it, with no pagination. It is not a small request (a term of occurrences, each
 * carrying its course's full blurb), which is exactly why the fingerprint has to
 * be worth something: on an unchanged schedule this is the only cost a tick pays.
 */
export async function probeSalsanuevaCourses(
  ctx: ProbeContext<SalsanuevaSourceConfig>,
): Promise<ProbeResult<SalsanuevaPayload>> {
  // Read for its failure, not its value: a row whose stored config no longer
  // fits must park HERE, before a request goes out, rather than after `extract`
  // has already grouped a term's worth of courses.
  readSalsanuevaSourceConfig(ctx.config);

  const from = startOfWeek(new Date());
  const url = parsePublicUrl(
    `${ENDPOINT}?from_date=${dayString(from)}&to_date=${dayString(from + WEEKS_AHEAD * 7)}` +
      `&club_id=${CLUB_ID}&booking_type=${BOOKING_TYPE}&v=2`,
  );
  const res = await safeFetch(url, { headers: { accept: "application/json" } });
  assertFetched(res, url);

  const parsed = CoursesResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    // The school changed its wire shape. Deterministic, so terminal — and loud,
    // because the alternative is a source that quietly reads zero courses.
    throw new NonRetryableError(
      `Courses API did not match the expected shape: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }
  if (!parsed.data.success) {
    throw new NonRetryableError(
      `Courses API refused the request: ${parsed.data.code}`,
    );
  }

  // No `data` key is how the API says "no courses in that range" — the honest
  // answer for a window past the end of the published term, and NOT an error.
  const rows: CourseRow[] = parsed.data.data ?? [];
  const series = buildCourseSeries(rows);
  return {
    fingerprint: fingerprintSeries(series, from),
    payload: { series },
  };
}
