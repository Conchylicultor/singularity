import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { runWithoutProfiling } from "@plugins/infra/plugins/runtime-profiler/core";
import { getServerBuildId } from "@plugins/build/server";
import { reportDetailRoute } from "@plugins/reports/core";
import { debugApp } from "@plugins/apps/plugins/debug/plugins/shell/core";
import { recordNotification } from "@plugins/shell/plugins/notifications/server";
import { _reports } from "./tables";
import { bumpWindowAndCheck } from "./velocity";
import { isNoiseReport } from "./noise-rules";
import { ReportKind } from "./report-kinds";
import type { ReportInput } from "../../shared/types";

export interface RecordReportResult {
  reportId: string | null;
  taskId: string | null;
  rateLimited: boolean;
}

// The generic one-line summary is unbounded (an aggregated error can be hundreds
// of KB). Clamp it at the ingestion boundary so nothing downstream — the row,
// the notification, the task title — can ever exceed this. Kind-specific payload
// (stack, etc.) is clamped by the kind's renderTask when it builds the task
// description, where the ballooning actually hurt (markdown render).
const MESSAGE_MAX = 4_000;

// Truncate the middle, keeping head + tail. The closing context of an aggregated
// error matters as much as the opening, so we drop the redundant middle.
function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  const head = Math.ceil(max / 2);
  const tail = max - head;
  const omitted = value.length - max;
  return `${value.slice(0, head)}\n… [truncated ${omitted} chars] …\n${value.slice(value.length - tail)}`;
}

// The noise pipeline classifies on a small, generic shape. Crash-shaped fields
// (errorType / stack) that noise rules inspect live in the kind's `data` payload;
// we surface them here as plain strings if present. A kind that has no such
// fields simply yields nulls and matches no crash-specific noise rule.
function noiseFieldsFrom(data: Record<string, unknown>): {
  errorType: string | null;
  stack: string | null;
} {
  const errorType = typeof data.errorType === "string" ? data.errorType : null;
  const stack = typeof data.stack === "string" ? data.stack : null;
  return { errorType, stack };
}

// Single entry point used by the HTTP handler, the boot-time flush, and the
// process-level crash hooks. Every source collapses here so dedup lives in one
// place. The engine is fully generic: it looks up the matching ReportKindSpec
// and delegates schema validation, fingerprinting, and presentation to it. It
// never names a kind. No report auto-creates a task — investigation tasks are
// filed on demand by investigateReport().
export async function recordReport(
  input: ReportInput,
): Promise<RecordReportResult> {
  const { kind, source, message: rawMessage, url, userAgent, clientId, buildId } =
    input;

  const spec = ReportKind.getContributions().find((k) => k.kind === kind);
  if (!spec) {
    // Fail loudly: a report whose kind has no registered spec is a wiring bug,
    // not a runtime condition to paper over with a default.
    throw new Error(
      `recordReport: no ReportKind registered for kind "${kind}". ` +
        `Registered kinds: ${ReportKind.getContributions()
          .map((k) => k.kind)
          .join(", ") || "(none)"}`,
    );
  }

  // Validate the per-kind payload against the kind's schema. parse() throws on a
  // malformed payload — again, a wiring bug we want surfaced, not swallowed. We
  // store the wire-level `data` (already a Record) so the persisted jsonb keeps
  // the exact shape the kind validated.
  const data = input.data;
  const parsed = spec.schema.parse(data);
  const fp = await spec.fingerprint(parsed);
  const worktree = process.env.SINGULARITY_WORKTREE ?? "unknown";
  const message = clamp(rawMessage ?? "", MESSAGE_MAX);
  const limited = bumpWindowAndCheck(fp);
  // A report whose originating bundle's build id differs from the server's
  // current build id came from an outdated frontend tab — benign version-skew.
  const serverBuildId = getServerBuildId();
  const staleOrigin =
    buildId != null && serverBuildId != null && buildId !== serverBuildId;
  const { errorType, stack } = noiseFieldsFrom(data);
  const noise = isNoiseReport({
    source,
    errorType,
    message: rawMessage ?? "",
    stack,
    staleOrigin,
  });

  const id = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Wrapped in runWithoutProfiling: the reports insert/upsert is itself a `db`
  // span that would otherwise re-feed the slow-op recorder, which then files a
  // report, which writes again — a self-amplifying loop. Suppressing here covers
  // every report kind (crash + slow-op). The ALS propagates through the awaited
  // query, so the connection-acquire and query spans are suppressed too.
  const [row] = await runWithoutProfiling(async () => {
    // The await MUST run inside the suppression scope. A bare `() => db…`
    // returns the lazy query unexecuted, so its execution (and the acquire +
    // query spans) would run after the ALS scope exits — defeating suppression
    // and re-opening the self-feedback loop.
    const rows = await db
      .insert(_reports)
      .values({
        id,
        kind,
        fingerprint: fp,
        worktree,
        source,
        message,
        url: url ?? null,
        userAgent: userAgent ?? null,
        data,
        rateLimited: limited,
        noise,
        lastClientId: clientId ?? null,
        lastBuildId: buildId ?? null,
      })
      .onConflictDoUpdate({
        target: [_reports.fingerprint, _reports.worktree],
        // Repeats land on the same row (the fingerprint is stable per kind): bump
        // the count, refresh the latest message + payload + attribution.
        set: {
          message,
          data,
          count: sql`${_reports.count} + 1`,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
          rateLimited: sql`${_reports.rateLimited} OR ${limited}`,
          noise,
          lastClientId: clientId ?? null,
          lastBuildId: buildId ?? null,
        },
      })
      .returning();
    return rows;
  });

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) return { reportId: null, taskId: null, rateLimited: limited };

  // Gate on the per-call `limited`, NOT the persisted `row.rateLimited`. The
  // throttle is ephemeral by design (see velocity.ts) — it suppresses bell
  // churn only while a fingerprint is actively bursting. `row.rateLimited` is an
  // OR-accumulated display flag ("was ever rate-limited") that is never reset, so
  // gating on it would permanently mute any long-lived singleton fingerprint
  // (e.g. the slow-op rollup) after its first burst.
  if (limited) {
    // Keep the row's count accurate but don't churn the bus.
    return { reportId: row.id, taskId: row.taskId, rateLimited: true };
  }

  // Mirror a "[Stale tab]" marker into the bell so the notification itself reads
  // as benign version-skew at a glance.
  const stalePrefix = staleOrigin ? "[Stale tab] " : "";
  const desc = `${stalePrefix}${row.message}`;
  // The bell notification is always keyed by the stable report id — exactly one
  // row per fingerprint, which updates in place. The kind's re-arm policy is the
  // re-surface window, not the dedup key: without a cooldown (default) the row
  // updates silently and never resurfaces once read (right for crashes: one
  // tracked report per distinct crash); with a cooldown the row re-surfaces as a
  // fresh unread alert once that long since it last surfaced, while reports in
  // between only bump its count (right for slow ops: a recurring metric). This
  // keeps the bell at one row per distinct problem instead of one per
  // (report × time-bucket), which previously grew the undismissed set without
  // bound. See research/perfs/2026-06-29-notifications-unbounded-resource-root-cause.md.
  const cooldownMs = spec.meta.notifCooldownMs;
  void recordNotification({
    type: "report",
    title: staleOrigin ? `${spec.meta.notif} (stale tab)` : spec.meta.notif,
    description: desc.length > 140 ? `${desc.slice(0, 137)}...` : desc,
    variant: spec.meta.variant,
    muted: row.noise,
    dedupeKey: row.id,
    resurfaceAfterMs: cooldownMs,
    // Deep-link to the report's detail sidepane in Debug → Reports, never a task.
    // Investigation tasks are filed on demand from that pane.
    linkTo: reportDetailRoute.link(debugApp, { reportId: row.id }),
    metadata: {
      reportId: row.id,
      source: row.source,
      fingerprint: fp,
      clientId: clientId ?? null,
      buildId: buildId ?? null,
    },
  });
  return { reportId: row.id, taskId: row.taskId, rateLimited: false };
}
