import { z } from "zod";
import { liveValue } from "@plugins/network/plugins/live/core";

/**
 * One app's usage, summed over its daily rows. "7d" is today plus the six
 * days before it; "total" is everything still retained (two years, see the
 * server's retention).
 */
export const AppUsageSummaryRowSchema = z.object({
  appId: z.string(),
  launches7d: z.number(),
  focusedMs7d: z.number(),
  launchesTotal: z.number(),
  focusedMsTotal: z.number(),
  // Crosses the wire as an ISO string.
  lastOpenedAt: z.coerce.date().nullable(),
});
export type AppUsageSummaryRow = z.infer<typeof AppUsageSummaryRowSchema>;

/**
 * Every app ever used, with its summary — one row per app id, so the payload
 * is bounded by the app registry (tens), not by time.
 */
export const appUsageSummary = liveValue("app-usage.summary", {
  schema: z.array(AppUsageSummaryRowSchema),
});
