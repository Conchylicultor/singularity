import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { FilterGroupSchema } from "@plugins/primitives/plugins/data-view/core";
import { PlatformTagSchema } from "./platforms";
import { ReleaseCandidateResponseSchema } from "./candidate";
import { ReleaseRunSchema } from "./resources";

// Wire mirror of the data-view `SortRule` (no zod schema is exported from
// data-view/core, so it's declared here for body validation).
export const SortRuleSchema = z.object({
  fieldId: z.string(),
  direction: z.enum(["asc", "desc"]),
});

/**
 * WHY a release is being cut — the one input that decides whether the artifact
 * is shippable.
 *
 * A discriminated union rather than `{ dev?: boolean; platform?: PlatformTag }`,
 * so **"a candidate always names its platform"** is unrepresentable-otherwise at
 * the call site instead of being a rule the argv builder has to remember. The
 * two members map onto exactly two argv shapes:
 *
 * - `staged` → `--dev`, host platform: staged only, never packed, claims no
 *   `latest-<platform>` pointer. This is Studio's existing behaviour, byte for
 *   byte.
 * - `candidate` → `--platform <tag>` and NO `--dev`: it must PACK, or it is not
 *   shippable, and it must be built for the platform the target host reports.
 */
export const ReleaseIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("staged") }),
  z.object({ kind: z.literal("candidate"), platform: PlatformTagSchema }),
]);
export type ReleaseIntent = z.infer<typeof ReleaseIntentSchema>;

/**
 * The intent an omitted `intent` means. Named rather than inlined so the ONE
 * place the omission is resolved (`handleRelease`) and any consumer reasoning
 * about it read the same value.
 */
export const STAGED_INTENT: ReleaseIntent = { kind: "staged" };

// Trigger a local composition release. Mirrors build's `POST /api/build`, but a
// release is parameterized by (composition, target) so the body carries both.
//
// `intent` is optional and means {@link STAGED_INTENT} when absent — so a caller
// that predates candidates (Studio) keeps producing exactly the runs it did
// before, with no edit. It is `.optional()` rather than `.default()` because
// `defineEndpoint` types the client-side body from the schema's OUTPUT type: a
// default would make `intent` a required property for every caller, which is the
// opposite of "the omitted case is byte-identical to today".
export const triggerReleaseEndpoint = defineEndpoint({
  route: "POST /api/release",
  body: z.object({
    composition: z.string(),
    target: z.string(),
    intent: ReleaseIntentSchema.optional(),
  }),
});

/**
 * What `ship` would pick for one `(composition, platform)`, and where it came
 * from. See {@link ReleaseCandidateResponseSchema} for the three fields.
 *
 * **Owned by `release`, not by `deploy`.** "Which run would ship for composition
 * C on platform P" is a release-engine question whose only deploy-specific input
 * is P — which a deploy UI already has from the server's health probe. Putting
 * it here means the feature adds no server-side plugin edge from deploy to
 * release at all.
 *
 * A plain deduped GET rather than a live resource, deliberately: a
 * per-composition collection resource would be unbounded, which the bounded
 * working-set contract forbids. Consumers refetch on the existing
 * `release.history-revision` tick, which already fires on every new run and
 * status flip.
 */
export const releaseCandidateEndpoint = defineEndpoint({
  route: "GET /api/release/candidate",
  query: z.object({
    composition: z.string().min(1),
    platform: PlatformTagSchema,
  }),
  response: ReleaseCandidateResponseSchema,
  // Every deployment row of the same composition asks the identical question;
  // the answer costs a directory walk plus two `git` spawns, so collapsing a
  // burst onto one handler run is free correctness.
  dedupe: true,
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

/**
 * Wrapped in an object rather than a bare `ReleaseRunSchema.nullable()`, and
 * that is load-bearing, not style: `implement()` turns a `null` handler return
 * into **204**, and `fetchEndpoint` turns a 204 into `undefined`. A top-level
 * nullable response would therefore reach the client as `undefined` — the same
 * value a still-loading query has — collapsing "this composition has never been
 * released" into "we have not asked yet". The wrapper keeps the answer a 200
 * with an explicit `run: null`.
 */
export const ReleaseLatestRunResponseSchema = z.object({
  run: ReleaseRunSchema.nullable(),
});
export type ReleaseLatestRunResponse = z.infer<typeof ReleaseLatestRunResponseSchema>;

/**
 * The newest run of `composition` in this namespace, **whatever its state** —
 * running, failed, or succeeded.
 *
 * The sibling of `releaseCandidateEndpoint`, and the two are not
 * interchangeable: that one answers *what would ship* (a resolved bundle on
 * disk, so it structurally cannot show a build that is still running or one that
 * just failed), this one answers *what is the newest run*. A pipeline UI needs
 * both — the first to gate Ship, the second to say "a build is in flight" or
 * "the last build failed".
 *
 * A GET, so consumers use `useEndpoint` rather than hand-rolling a `useQuery`
 * over the POST history query with a fabricated `dataViewId` — that endpoint is
 * a server-delegated **DataView** source, and borrowing it off-label breaks the
 * moment a `DataViewServer.QueryAugmentor` matches the invented surface id.
 *
 * `release_runs_ns_comp_started_idx` — `(namespace, composition, started_at
 * DESC)` — covers this exactly; it needs no index of its own.
 */
export const releaseLatestRunEndpoint = defineEndpoint({
  route: "GET /api/release/latest",
  query: z.object({ composition: z.string().min(1) }),
  response: ReleaseLatestRunResponseSchema,
  dedupe: true,
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
