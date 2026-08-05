import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * The verbs over a deployment, as the app launches them.
 *
 * **The CLI is the engine; this is only a launcher.** `./singularity deploy
 * converge|ship` owns every refusal, every host mutation and the health gate —
 * the endpoint spawns exactly that command and streams its output. Nothing about
 * converge or ship is re-implemented server-side, which is the same split
 * `release` (CLI) / Studio (UI) already uses.
 *
 * `update` is the exception that proves it: it is **not** a CLI subcommand but a
 * sequence of the two real ones with an engine release between them —
 * `converge → [build a candidate, unless one is already current] → ship
 * --release <runId>`. It re-implements no refusal, no host mutation and no
 * health gate; it only orders things the caller would otherwise have to order by
 * hand. It is the app's one primary action; `converge` and `ship` stay because
 * the row actions and scripted callers still name them individually.
 */
export const DeployVerbSchema = z.enum(["converge", "ship", "update"]);
export type DeployVerb = z.infer<typeof DeployVerbSchema>;

/**
 * Which leg of an `update` is running.
 *
 * Reported as a field rather than parsed out of the log, because the log is the
 * CLI's prose and a UI that scraped it would break the first time a message
 * changed. Null for `converge` and `ship`, whose verb already names their only
 * phase — so "a single-verb run has no phase" is a fact of the type, not a
 * convention.
 */
export const DeployPhaseSchema = z.enum(["converge", "build", "ship"]);
export type DeployPhase = z.infer<typeof DeployPhaseSchema>;

/**
 * The durable log channel every CLI spawn streams into — the shape release uses
 * (`RELEASE_LOG_CHANNEL`), so the UI's log panel is the same panel.
 *
 * It is ONE channel rather than one per deployment: a run is exclusive per
 * server (the endpoint refuses a concurrent one), the CLI prefixes each run with
 * its own argv line, and a channel is a declared, rotation-bounded file sink —
 * minting one per deployment row would make that bound a function of runtime
 * data.
 */
export const DEPLOY_LOG_CHANNEL = "deploy";

/**
 * The state of the most recent run — `converge`, `ship` or `update` — for one
 * deployment: the **live view**.
 *
 * In-memory state projected into a live resource (the `release.previews` shape),
 * because that is what a live view is: a run's progress belongs to the process
 * driving the child, and a restart takes both. What it is NOT is the record —
 * `deploy_runs` is (see {@link DeployRunRecordSchema}), written by the same two
 * functions that write this map. The pair is deliberate and neither replaces the
 * other:
 *
 * - this answers *what is happening right now*, at phase granularity, with no
 *   query — and is empty after a restart, honestly, because nothing is
 *   happening any more (the spawned CLI is not detached, so the restart took it);
 * - the table answers *what happened*, across restarts, for every run.
 */
export const DeployRunSchema = z.object({
  /**
   * This run's identity — the same string as its `deploy_runs.id`, so the live
   * view and the ledger row name ONE run rather than two records that have to be
   * matched up by timestamp.
   */
  id: z.string(),
  /** `deploy_deployments.id` — one entry per deployment, the map's key. */
  deploymentId: z.string(),
  /** Copied off the row so a consumer can reason about server exclusivity. */
  serverId: z.string(),
  compositionId: z.string(),
  verb: DeployVerbSchema,
  /**
   * Which leg of an `update` is running (or was running when it ended), and null
   * for the two single-verb runs — see {@link DeployPhaseSchema}. The one thing
   * a progress report needs that the verb alone cannot say.
   */
  phase: DeployPhaseSchema.nullable(),
  /**
   * The release run id this `ship` pinned (`--release <runId>`), or null.
   *
   * Null covers "this was a converge", "this ship named no run and took whatever
   * `latest-<platform>` pointed at", and "this update has not reached its ship
   * leg yet" — the cases where there is no pinned id to record, which is exactly
   * what the CLI was told. An `update` fills it at the instant it resolves the
   * bundle, so the record can never claim to be shipping without naming what.
   * Recorded so
   * *what is live on this box* is answerable from the run record instead of by
   * reading back the argv line out of the log channel.
   *
   * Deliberately NOT validated semantically here: whether that run exists, is
   * packed, matches the composition and matches the host's platform is
   * `resolveBundle`'s verdict, and re-checking it here would be a second
   * implementation of discovery. The CLI owns every refusal.
   */
  release: z.string().nullable(),
  /**
   * The commit the bundle this run is shipping was built from
   * (`RELEASE.json.commitSha`), or null.
   *
   * Set in the same write as `release`, from the resolved bundle's manifest —
   * the only place the answer is actually known. It stays null wherever it
   * genuinely is not: a converge ships nothing, and a bare `ship` lets the CLI
   * pick `latest-<platform>` inside its own process, so this app never saw which
   * bundle went out. HEAD is deliberately NOT substituted: the sha of the tree
   * this backend was built from is not the sha of the bytes on the box, and a
   * plausible wrong answer is worse than an absent one.
   */
  commitSha: z.string().nullable(),
  status: z.enum(["running", "succeeded", "failed"]),
  startedAt: z.string(),
  /** Null while `running`. */
  finishedAt: z.string().nullable(),
  /** Null while running, and when the command could not be spawned at all. */
  exitCode: z.number().int().nullable(),
  /**
   * On failure: the CLI's own words. A refusal is never summarised or
   * reinterpreted here — the whole point is that "the command refused, and this
   * is what it said" reaches the user instead of a generic failure.
   */
  message: z.string().nullable(),
});
export type DeployRun = z.infer<typeof DeployRunSchema>;

/**
 * Every deployment's most recent run, keyed by deployment id.
 *
 * Not DB-backed, so the bounded-working-set contract does not apply: the map
 * holds at most one entry per deployment row, and deployments are
 * `(composition × server)` pairs a human authors — the same inherently tiny,
 * domain-bounded set `deploy.deployments` itself is.
 */
export const deployRunsResource = resourceDescriptor<Record<string, DeployRun>>(
  "deploy.runs",
  z.record(z.string(), DeployRunSchema),
  {},
);

/**
 * One `deploy_runs` row: the **record** of a run, as the history query returns it.
 *
 * The live view above and this are the same run seen from two distances, which
 * is why they share an `id` and not a schema. The differences are all
 * deliberate:
 *
 * - `phaseFailed` instead of `phase` — a *finished* run's live phase is only
 *   interesting when it is the leg that killed it, and stamping it under that
 *   name means nothing has to remember the convention to read the row;
 * - dates, not ISO strings — this shape is fed to a DataView, where a `date`
 *   field sorts and filters on a real `Date`.
 */
export const DeployRunRecordSchema = z.object({
  id: z.string(),
  deploymentId: z.string(),
  /**
   * Copied off the deployment rather than joined, so the row states which box it
   * happened to without needing the deployment to still exist... which, in fact,
   * it must (the FK cascades). It is here because a run record that cannot say
   * *where* is not a record of a deploy.
   */
  serverId: z.string(),
  compositionId: z.string(),
  verb: DeployVerbSchema,
  /** The pinned release run id (`ship --release`), or null — as on the live run. */
  releaseRunId: z.string().nullable(),
  /** The commit that bundle was built from, or null — as on the live run. */
  commitSha: z.string().nullable(),
  /**
   * `running` is a legitimate row to read back, and a *stale* one: a backend
   * that died mid-run leaves it, because the process that would have stamped the
   * outcome is the process that went away. Reading a `running` row whose backend
   * is long gone is the honest record of exactly that, and better than a sweep
   * inventing a terminal status nobody observed.
   */
  status: z.enum(["running", "succeeded", "failed"]),
  /** Which leg an `update` died on. Null unless the run failed on one. */
  phaseFailed: DeployPhaseSchema.nullable(),
  startedAt: z.coerce.date(),
  finishedAt: z.coerce.date().nullable(),
  exitCode: z.number().int().nullable(),
  /** On failure: the CLI's own words, stored and rendered verbatim. */
  message: z.string().nullable(),
});
export type DeployRunRecord = z.infer<typeof DeployRunRecordSchema>;

/**
 * Scalar invalidation tick for the deploy ledger — a cheap `{ rev }` hash the
 * server pushes only when `deploy_runs` actually changes.
 *
 * The history DataView is a server-delegated keyset query, so it keeps this OUT
 * of its query key and refetches its loaded window in place when `rev` moves.
 * A per-deployment live resource over the rows themselves would be an unbounded
 * collection, which the working-set contract forbids; a scalar hash is bounded
 * by construction. Mirrors `release.history-revision` exactly.
 */
export const deployRunsRevisionResource = resourceDescriptor<{ rev: string }>(
  "deploy.runs-revision",
  z.object({ rev: z.string() }),
  { rev: "" },
);
