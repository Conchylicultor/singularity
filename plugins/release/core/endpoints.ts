import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { FilterGroupSchema } from "@plugins/primitives/plugins/data-view/core";
import { ReleaseRunSchema } from "./resources";

// Wire mirror of the data-view `SortRule` (no zod schema is exported from
// data-view/core, so it's declared here for body validation).
export const SortRuleSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

// Trigger a local composition release. Mirrors build's `POST /api/build`, but a
// release is parameterized by (composition, target) so the body carries both.
export const triggerReleaseEndpoint = defineEndpoint({
  route: "POST /api/release",
  body: z.object({ composition: z.string(), target: z.string() }),
});

// Start a local preview of a finished release artifact (spawns its `launch`).
export const previewEndpoint = defineEndpoint({
  route: "POST /api/release/runs/:id/preview",
});

// Stop a running preview (kills the process group, removes its data dir).
export const stopPreviewEndpoint = defineEndpoint({
  route: "POST /api/release/runs/:id/preview/stop",
});

const ReleaseLogLineSchema = z.object({
  text: z.string(),
  stream: z.enum(["stdout", "stderr"]),
});

export const ReleaseLogsResponseSchema = z.object({
  lines: z.array(ReleaseLogLineSchema),
});

export type ReleaseLogLine = z.infer<typeof ReleaseLogLineSchema>;
export type ReleaseLogsResponse = z.infer<typeof ReleaseLogsResponseSchema>;

// Persisted fallback logs for a finished run (the live `/ws/logs` stream only
// covers in-flight runs; after it ends the detail pane reads this).
export const releaseLogsEndpoint = defineEndpoint({
  route: "GET /api/release/runs/:id/logs",
  response: ReleaseLogsResponseSchema,
});

export const QueryReleaseHistoryBodySchema = z.object({
  // The composition this history window is scoped to (the one extra field over
  // the all-conversations query body — a composition's runs, not the worktree's).
  composition: z.string(),
  sort: z.array(SortRuleSchema),
  filter: FilterGroupSchema.nullable(),
  query: z.string(),
  cursor: z.string().nullable(),
  limit: z.number().int().positive().max(200),
  // The DataView surface id (its `storageKey`), injected by `useServerDataSource`.
  // The handler passes it to `augmentServerQuery` so per-surface augmentations
  // (custom columns) can bind their values into the query.
  dataViewId: z.string(),
});
export type QueryReleaseHistoryBody = z.infer<typeof QueryReleaseHistoryBodySchema>;

export const QueryReleaseHistoryResponseSchema = z.object({
  items: z.array(ReleaseRunSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

// POST so the structured FilterGroup tree rides in the body. Filter/sort/search
// compile to SQL server-side; pagination is keyset (cursor), not OFFSET. Scoped
// to one composition so a composition's full run history is browsable, no cap.
export const queryReleaseHistory = defineEndpoint({
  route: "POST /api/release/history/query",
  body: QueryReleaseHistoryBodySchema,
  response: QueryReleaseHistoryResponseSchema,
});
