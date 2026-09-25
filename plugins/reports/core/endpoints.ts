import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { ServerFilterWireSchema } from "@plugins/primitives/plugins/data-view/core";
import {
  liveBoolean,
  liveInstant,
  liveNumber,
  liveText,
} from "@plugins/network/plugins/live/plugins/filter/core";
import { ReportSchema } from "./resources";

// Wire mirror of the data-view `SortRule`. data-view/core exports the TYPE but
// no zod schema for it, so every server-delegated query body declares its own
// (the `queryRuns` / `queryReleaseHistory` precedent).
const SortRuleSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

/**
 * What the Reports server can filter on, by filter-language domain — the ONE
 * declaration both runtimes read: the web `dataSource.filterable` (so the
 * Filter control offers exactly these) and the server column map
 * (`bindColumns`) the handler strict-decodes against. `message` and
 * `fingerprint` have no field: they are searched only.
 */
export const REPORTS_FILTERABLE = {
  kind: liveText(),
  source: liveText(),
  noise: liveBoolean(),
  rateLimited: liveBoolean(),
  count: liveNumber(),
  lastSeenAt: liveInstant(),
  message: liveText(),
  fingerprint: liveText(),
};

/** The text columns the search box matches (any of, case-insensitively). */
export const REPORTS_SEARCHABLE = ["message", "kind", "fingerprint"] as const;

/**
 * Exactly `ServerDataSourceSpec.fetchPage`'s argument object: the DataView host
 * owns the live sort / filter state and hands it over verbatim — the filter
 * lowered (search folded in), decoded strictly against REPORTS_FILTERABLE.
 */
export const QueryReportsBodySchema = z.object({
  sort: z.array(SortRuleSchema),
  filter: ServerFilterWireSchema.optional(),
  cursor: z.string().nullable(),
  limit: z.number().int().positive().max(200),
  /** The DataView surface id (its `storageKey`), injected by the host. */
  dataViewId: z.string(),
});
export type QueryReportsBody = z.infer<typeof QueryReportsBodySchema>;

/** Exactly `ServerPage<Report>`. */
export const QueryReportsResponseSchema = z.object({
  items: z.array(ReportSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type QueryReportsResponse = z.infer<typeof QueryReportsResponseSchema>;

/**
 * One window of the Reports DataView, newest first by default.
 *
 * POST so the structured filter tree rides in the body. Filter / sort /
 * search compile to SQL and pagination is keyset (cursor), never OFFSET. The
 * list refreshes in place when `reports.revision` moves.
 */
export const queryReports = defineEndpoint({
  route: "POST /api/reports/query",
  body: QueryReportsBodySchema,
  response: QueryReportsResponseSchema,
});

export const ReportFacetsSchema = z.object({
  kinds: z.array(z.string()),
  sources: z.array(z.string()),
});
export type ReportFacets = z.infer<typeof ReportFacetsSchema>;

/**
 * The distinct kinds and sources present in the table — the options of the
 * DataView's enum filters. The list itself is paged, so these cannot be derived
 * from the loaded rows without listing only what happens to be on screen.
 */
export const reportFacets = defineEndpoint({
  route: "GET /api/reports/facets",
  response: ReportFacetsSchema,
  dedupe: true,
});

/**
 * One report, or `null` when no row has that id.
 *
 * `null` is an ANSWER ("the table was read and holds no such row"), not an
 * absence of one: a transport failure is a rejection, so the detail pane can
 * tell "this report is gone" apart from "nobody could tell me" — the reason this
 * is a nullable field over a 200 rather than a 404 (the `getRun` precedent).
 */
export const ReportByIdResponseSchema = z.object({
  report: ReportSchema.nullable(),
});
export type ReportByIdResponse = z.infer<typeof ReportByIdResponseSchema>;

export const getReport = defineEndpoint({
  route: "GET /api/reports/:id",
  response: ReportByIdResponseSchema,
  dedupe: true,
});
