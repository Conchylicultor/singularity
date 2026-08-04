import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

/**
 * The two verbs over a deployment, as the app launches them.
 *
 * **The CLI is the engine; this is only a launcher.** `./singularity deploy
 * converge|ship` owns every refusal, every host mutation and the health gate —
 * the endpoint spawns exactly that command and streams its output. Nothing about
 * converge or ship is re-implemented server-side, which is the same split
 * `release` (CLI) / Studio (UI) already uses.
 */
export const DeployVerbSchema = z.enum(["converge", "ship"]);
export type DeployVerb = z.infer<typeof DeployVerbSchema>;

/**
 * The durable log channel both verbs stream into — the shape release uses
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
 * The state of the most recent `converge` / `ship` for one deployment.
 *
 * Deliberately **not** a table. The plan is explicit that D4 adds no run ledger
 * (`plugins/release/CLAUDE.md`'s deploy handoff note: keep the run model in
 * release, let Deploy own where the artifact lands), so this is in-memory state
 * projected into a live resource — the `release.previews` shape, not the
 * `release_runs` one. Two consequences, both deliberate:
 *
 * - a backend restart forgets it (and takes the child process with it), so a
 *   long unattended deploy belongs on the CLI, not in the app;
 * - the durable record of what happened is the `deploy` log channel's JSONL,
 *   which survives the restart.
 */
export const DeployRunSchema = z.object({
  /** `deploy_deployments.id` — one entry per deployment, the map's key. */
  deploymentId: z.string(),
  /** Copied off the row so a consumer can reason about server exclusivity. */
  serverId: z.string(),
  compositionId: z.string(),
  verb: DeployVerbSchema,
  /**
   * The release run id this `ship` pinned (`--release <runId>`), or null.
   *
   * Null covers both "this was a converge" and "this ship named no run and took
   * whatever `latest-<platform>` pointed at" — the two cases where there is no
   * pinned id to record, which is exactly what the CLI was told. Recorded so
   * *what is live on this box* is answerable from the run record instead of by
   * reading back the argv line out of the log channel.
   *
   * Deliberately NOT validated semantically here: whether that run exists, is
   * packed, matches the composition and matches the host's platform is
   * `resolveBundle`'s verdict, and re-checking it here would be a second
   * implementation of discovery. The CLI owns every refusal.
   */
  release: z.string().nullable(),
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
