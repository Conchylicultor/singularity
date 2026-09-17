import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { IpCountryResult } from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/ip-country/server";
import {
  channelOf,
  utcDay,
  type CollectBody,
  type CollectResponse,
  type EngagementBody,
  type EventBody,
  type PageviewBody,
} from "../../core";
import { parseReferrer, primaryLanguage, visitorHash } from "./request-context";
import { analyticsHits, analyticsSalts, analyticsVisits } from "./tables";
import { isBotUserAgent, parseUserAgent } from "./user-agent";
import { liveVisitCutoff } from "./visit-grouping";

/** Any drizzle handle collect can write through: the app's `db`, or a test DB. */
export type AnalyticsDb = NodePgDatabase;
type Tx = Parameters<Parameters<AnalyticsDb["transaction"]>[0]>[0];

/** What the request itself says about the visitor. Used in memory, never stored as-is. */
export interface CollectContext {
  ip: string;
  userAgent: string;
  acceptLanguage: string | null;
  now: Date;
}

/**
 * Which country an IP is in. The route passes the machine's DB-IP lookup
 * (`lookupCountry`); a test passes one over its own snapshot fixture.
 */
export type CountryLookup = (ip: string) => IpCountryResult;

/**
 * The stored country for a new visit: the code when the lookup found one,
 * otherwise null — an unlisted address and "no snapshot downloaded yet" both
 * read as `(none)` in the report.
 */
function countryOf(lookupCountry: CountryLookup, ip: string): string | null {
  const result = lookupCountry(ip);
  return result.kind === "found" ? result.country : null;
}

/**
 * Record one collect body. Bots are ignored before anything touches the DB.
 * Pageviews and events find or open the visitor's visit under a per-hash
 * advisory lock, so two hits racing from one page load land in ONE visit.
 */
export async function recordCollect(
  dbx: AnalyticsDb,
  body: CollectBody,
  ctx: CollectContext,
  lookupCountry: CountryLookup,
): Promise<CollectResponse> {
  if (isBotUserAgent(ctx.userAgent)) {
    return { outcome: "ignored", reason: "bot" };
  }
  switch (body.kind) {
    case "pageview":
      return recordPageview(dbx, body, ctx, lookupCountry);
    case "event":
      return recordEvent(dbx, body, ctx, lookupCountry);
    case "engagement":
      return recordEngagement(dbx, body, ctx.now);
  }
}

// ── salt ─────────────────────────────────────────────────────────────────

// Per-handle memo of today's salt: one read per UTC day per process instead of
// one per hit. Keyed by the handle so a test DB never sees the app DB's salt.
const saltMemo = new WeakMap<object, { day: string; salt: string }>();

/** Today's salt, created on first use. Concurrent creators converge on one row. */
export async function dailySalt(
  dbx: AnalyticsDb,
  day: string,
): Promise<string> {
  const memo = saltMemo.get(dbx);
  if (memo?.day === day) return memo.salt;
  await dbx
    .insert(analyticsSalts)
    .values({ day, salt: randomBytes(32).toString("hex") })
    .onConflictDoNothing();
  const [row] = await dbx
    .select({ salt: analyticsSalts.salt })
    .from(analyticsSalts)
    .where(eq(analyticsSalts.day, day));
  if (!row) {
    throw new Error(
      `analytics: salt for ${day} vanished right after it was ensured`,
    );
  }
  saltMemo.set(dbx, { day, salt: row.salt });
  return row.salt;
}

// ── visits ───────────────────────────────────────────────────────────────

async function withVisitorLock<T>(
  dbx: AnalyticsDb,
  hash: string,
  body: (tx: Tx) => Promise<T>,
): Promise<T> {
  return dbx.transaction(async (tx) => {
    // Transaction-scoped, so PgBouncer's transaction pooling keeps it sound.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`analytics:${hash}`}, 0))`,
    );
    return body(tx);
  });
}

async function findLiveVisitId(
  tx: Tx,
  hash: string,
  now: Date,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: analyticsVisits.id })
    .from(analyticsVisits)
    .where(
      and(
        eq(analyticsVisits.visitorHash, hash),
        gt(analyticsVisits.lastAt, liveVisitCutoff(now)),
      ),
    )
    .orderBy(desc(analyticsVisits.lastAt))
    .limit(1);
  return row?.id ?? null;
}

async function openVisit(
  tx: Tx,
  opts: {
    hash: string;
    host: string;
    path: string;
    referrer: string | undefined;
    utm: PageviewBody["utm"];
    ctx: CollectContext;
    lookupCountry: CountryLookup;
  },
): Promise<string> {
  const { ctx } = opts;
  const referrer = parseReferrer(opts.referrer, opts.host);
  const [row] = await tx
    .insert(analyticsVisits)
    .values({
      visitorHash: opts.hash,
      day: utcDay(ctx.now),
      startedAt: ctx.now,
      lastAt: ctx.now,
      host: opts.host,
      entryPath: opts.path,
      exitPath: opts.path,
      exitAt: ctx.now,
      referrerHost: referrer?.host ?? null,
      referrerPath: referrer?.path ?? null,
      channel: channelOf(referrer?.host ?? null, opts.utm),
      utmSource: opts.utm?.source ?? null,
      utmMedium: opts.utm?.medium ?? null,
      utmCampaign: opts.utm?.campaign ?? null,
      // Looked up once, when the visit opens: a hit joining a live visit keeps
      // its country, like device and entry page. The IP itself is not stored.
      country: countryOf(opts.lookupCountry, ctx.ip),
      language: primaryLanguage(ctx.acceptLanguage),
      ...parseUserAgent(ctx.userAgent),
    })
    .returning({ id: analyticsVisits.id });
  if (!row) throw new Error("analytics: visit insert returned no row");
  return row.id;
}

async function hashFor(
  dbx: AnalyticsDb,
  host: string,
  ctx: CollectContext,
): Promise<string> {
  const salt = await dailySalt(dbx, utcDay(ctx.now));
  return visitorHash({ salt, ip: ctx.ip, userAgent: ctx.userAgent, host });
}

// ── hits ─────────────────────────────────────────────────────────────────

async function recordPageview(
  dbx: AnalyticsDb,
  body: PageviewBody,
  ctx: CollectContext,
  lookupCountry: CountryLookup,
): Promise<CollectResponse> {
  const hash = await hashFor(dbx, body.host, ctx);
  return withVisitorLock(dbx, hash, async (tx) => {
    const visitId =
      (await findLiveVisitId(tx, hash, ctx.now)) ??
      (await openVisit(tx, {
        hash,
        host: body.host,
        path: body.path,
        referrer: body.referrer,
        utm: body.utm,
        ctx,
        lookupCountry,
      }));
    const [hit] = await tx
      .insert(analyticsHits)
      .values({ visitId, ts: ctx.now, kind: "pageview", path: body.path })
      .returning({ id: analyticsHits.id });
    if (!hit) throw new Error("analytics: pageview insert returned no row");
    await tx
      .update(analyticsVisits)
      .set({
        pageviews: sql`${analyticsVisits.pageviews} + 1`,
        exitPath: body.path,
        exitAt: ctx.now,
        exitPageviewId: hit.id,
        exitEngagedMs: 0,
        lastAt: ctx.now,
      })
      .where(eq(analyticsVisits.id, visitId));
    return { outcome: "pageview", pageviewId: hit.id };
  });
}

/**
 * An event joins the visitor's live visit. With none (the tab sat open past
 * the 30-minute gap, or the salt rotated at midnight) it opens one at the
 * event's page: an event is still a sign someone is there.
 */
async function recordEvent(
  dbx: AnalyticsDb,
  body: EventBody,
  ctx: CollectContext,
  lookupCountry: CountryLookup,
): Promise<CollectResponse> {
  const hash = await hashFor(dbx, body.host, ctx);
  return withVisitorLock(dbx, hash, async (tx) => {
    const visitId =
      (await findLiveVisitId(tx, hash, ctx.now)) ??
      (await openVisit(tx, {
        hash,
        host: body.host,
        path: body.path,
        referrer: undefined,
        utm: undefined,
        ctx,
        lookupCountry,
      }));
    await tx.insert(analyticsHits).values({
      visitId,
      ts: ctx.now,
      kind: "event",
      path: body.path,
      eventName: body.name,
      eventProps: body.props ?? null,
    });
    await tx
      .update(analyticsVisits)
      .set({ events: sql`${analyticsVisits.events} + 1`, lastAt: ctx.now })
      .where(eq(analyticsVisits.id, visitId));
    return { outcome: "event" };
  });
}

/**
 * The beacon carries the pageview's CUMULATIVE visible time, so the stored
 * value only ever rises to the largest one reported and a repeated beacon adds
 * nothing. The visit's sum moves by the same delta, and its exit time on page
 * follows when this pageview is still the visit's last one.
 */
async function recordEngagement(
  dbx: AnalyticsDb,
  body: EngagementBody,
  now: Date,
): Promise<CollectResponse> {
  return dbx.transaction(async (tx) => {
    const [hit] = await tx
      .select({
        visitId: analyticsHits.visitId,
        engagedMs: analyticsHits.engagedMs,
      })
      .from(analyticsHits)
      .where(
        and(
          eq(analyticsHits.id, body.pageviewId),
          eq(analyticsHits.kind, "pageview"),
        ),
      )
      .for("update");
    if (!hit) return { outcome: "ignored", reason: "unknown-pageview" };
    const engagedMs = Math.max(hit.engagedMs, body.engagedMs);
    const delta = engagedMs - hit.engagedMs;
    await tx
      .update(analyticsHits)
      .set({ engagedMs })
      .where(eq(analyticsHits.id, body.pageviewId));
    await tx
      .update(analyticsVisits)
      .set({
        engagedMs: sql`${analyticsVisits.engagedMs} + ${delta}`,
        exitEngagedMs: sql`CASE WHEN ${analyticsVisits.exitPageviewId} = ${body.pageviewId} THEN ${engagedMs} ELSE ${analyticsVisits.exitEngagedMs} END`,
        lastAt: sql`GREATEST(${analyticsVisits.lastAt}, ${now})`,
      })
      .where(eq(analyticsVisits.id, hit.visitId));
    return { outcome: "engagement" };
  });
}
