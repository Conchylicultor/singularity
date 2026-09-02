import type { ZodParser } from "@plugins/packages/plugins/zod-parser/core";
import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { RecordNotificationInput } from "@plugins/shell/plugins/notifications/server";
import type { _reports } from "./tables";

// The bell-notification variant a kind's report files. Single-sourced from the
// notifications consumer so it can never drift from what recordNotification
// accepts (error | warning | info | success).
export type ReportKindVariant = RecordNotificationInput["variant"];

// The drizzle row type of the reports table. Each kind renders its task from a
// full row (generic columns + its validated `data` jsonb payload).
export type ReportRow = typeof _reports.$inferSelect;

// A report kind is a self-contained contribution: it owns the shape of its
// jsonb payload (`schema`), how repeats dedup (`fingerprint`), how it presents
// in the task tag / bell / badge (`meta`), and how its filed task reads
// (`renderTask`). `reports` core never names a kind — it looks up the matching
// spec by `kind` string and delegates everything kind-specific to it.
export interface ReportKindSpec<TData = unknown> {
  kind: string;
  // Validates the jsonb payload on ingest. The validated value is what gets
  // persisted into the generic `data` column and handed back to fingerprint /
  // renderTask consumers.
  schema: ZodParser<TData>;
  // Dedup strategy: repeats sharing a fingerprint collapse onto one row.
  fingerprint(data: TData): Promise<string> | string;
  // When true, this kind bypasses the duress shed gate in recordReport. The
  // engine names no kind — a kind DECLARES itself exempt. Reserve for kinds
  // whose loss would break the shedding accounting itself: the duress-shed
  // flush summary is filed at the tail of a flush, and a re-trip during that
  // flush would otherwise shed (and, on buffer overflow, silently drop) the
  // very record of what was shed.
  duressExempt?: boolean;
  // When true, this kind bypasses the cross-fingerprint fan-out ceiling in
  // recordReport (see fan-out.ts). Same shape as duressExempt above, and
  // reserved for the same one reason: the `report-storm` rollup IS the
  // mechanism's accounting, so collapsing it would make a storm erase its own
  // record. Never set this to keep a noisy kind's alerts flowing — the ceiling
  // refills every window, so a persistent problem already mints its own row.
  fanOutExempt?: boolean;
  meta: {
    tag: string;
    notif: string;
    variant: ReportKindVariant;
    // This kind's own fan-out ceiling: how many DISTINCT fingerprints of it may
    // raise their own alert per window. Only ever a RAISE — the engine takes
    // the max of this and the `reports.fanOutPerWindow` config, so there is no
    // spelling for "no ceiling". Must be a positive integer; anything else
    // throws at admit rather than quietly disabling the mechanism.
    fanOutPerWindow?: number;
    // Notification re-arm policy. When set, the bell notification re-alerts:
    // each cooldown window starts a fresh unread row, while all reports within a
    // window coalesce onto that one row (no spam). Omit (default) for
    // identity-dedup kinds like crash that should never resurface once seen —
    // those collapse forever onto a single row keyed by the report id.
    notifCooldownMs?: number;
  };
  renderTask(row: ReportRow): { title: string; description: string };
}

export const ReportKind = defineServerContribution<ReportKindSpec>(
  "report-kind",
  { docLabel: (k) => k.kind },
);
