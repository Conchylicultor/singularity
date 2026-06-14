import { z } from "zod";
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
  schema: z.ZodType<TData>;
  // Dedup strategy: repeats sharing a fingerprint collapse onto one row.
  fingerprint(data: TData): Promise<string> | string;
  meta: {
    tag: string;
    notif: string;
    variant: ReportKindVariant;
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
