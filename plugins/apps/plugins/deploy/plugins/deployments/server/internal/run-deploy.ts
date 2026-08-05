import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import { serverHealth } from "@plugins/apps/plugins/deploy/plugins/health/server";
import { runRelease } from "@plugins/release/server";
import { compareToHead, resolveBundle } from "@plugins/release/plugins/bundles/server";
import { bundleRefusalMessage } from "@plugins/release/plugins/bundles/core";
import { isPlatformTag, type PlatformTag } from "@plugins/release/core";
import type { Deployment } from "../../core/schemas";
import type { DeployRun } from "../../core/runs";
import type { RunDeploymentBody } from "../../core/endpoints";
import { deployLog } from "./deploy-log";
import {
  finishRun,
  recordRunStarted,
  runningOnServer,
  setRunPhase,
  startRun,
} from "./run-state";

/**
 * The prefix `./singularity deploy`'s `refuse()` puts on every named refusal.
 *
 * A failing run's `message` is the CLI's own words, and this is how the ONE line
 * that states the problem is picked out of a failure whose stderr also carries
 * the remote script's whole transcript. It is a coupling to the CLI's output
 * format, and the honest fix is a shared constant on the CLI side — but that file
 * is the engine and is deliberately not edited from here. When it does not match,
 * the fallback below is the last stderr line, which is never worse than a generic
 * "it failed".
 */
const REFUSAL_PREFIX = "deploy: ";

/** The target this app deploys. Web is the only implemented remote target. */
const RELEASE_TARGET = "web";

/** What one spawned CLI verb ended up doing — the shape `finishRun` stamps. */
interface VerbOutcome {
  /** Null when the command could not be spawned at all. */
  exitCode: number | null;
  message: string | null;
}

/**
 * Launch a verb for one deployment, streaming the CLI's output into the `deploy`
 * channel. Returns the `running` record; the outcome arrives via `deploy.runs`.
 *
 * **The exclusivity check and the state write are one synchronous turn**, which
 * is why the 409 lives here rather than in the handler: an `await` between
 * "nothing is running" and "mark it running" would be a TOCTOU window two clicks
 * could walk through. Scoped to the SERVER, not the deployment — converge writes
 * `/etc/caddy/Caddyfile` and runs `apt-get`, so two converges on one box race
 * even when they are different compositions. An `update` holds the server for
 * its whole sequence, which is right for the same reason: both of its legs
 * mutate host-wide state.
 */
export function startDeployRun(opts: {
  deployment: Deployment;
  body: RunDeploymentBody;
}): DeployRun {
  const { deployment, body } = opts;

  const busy = runningOnServer(deployment.serverId);
  if (busy) {
    throw new HttpError(
      409,
      busy.deploymentId === deployment.id
        ? `The ${busy.verb} of "${busy.compositionId}" is already running on this server.`
        : `The ${busy.verb} of "${busy.compositionId}" is already running on this server — ` +
            `converge and ship both mutate host-wide state (Caddy, apt, systemd), so they run one at a time.`,
    );
  }

  const run = startRun({ deployment, body });
  if (body.verb === "update") {
    void runTracked("deploy:update", () => drive(run, () => runUpdate(deployment, run)));
  } else {
    void runTracked("deploy:run", () => drive(run, () => runSingleVerb(deployment, run, body)));
  }
  return run;
}

/**
 * Open the ledger row, then run the verb.
 *
 * The row is written HERE rather than inside `startRun` because that claim must
 * stay synchronous (an await inside it reopens the exclusivity TOCTOU window),
 * and this is the first thing the async body does — so the record exists before
 * the CLI is spawned rather than only once it ends.
 *
 * A ledger write that fails ends the run instead of deploying unrecorded: this
 * table is the answer to "what is live on this box", and a deploy that silently
 * skipped it would corrupt that answer for every run after it. Ending the run
 * here also releases the server's exclusivity guard, which a bare throw would
 * leave held by a run that never started.
 */
async function drive(run: DeployRun, body: () => Promise<void>): Promise<void> {
  try {
    await recordRunStarted(run);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const line = `Could not record this run in the deploy ledger, so it was not started: ${message}`;
    deployLog.publish(`[failed] ${line}`, "stderr");
    await finishRun(run.deploymentId, { exitCode: null, message: line });
    return;
  }
  await body();
}

/**
 * `./singularity` from the checkout this backend was built from, so the CLI
 * resolves the SAME namespace: it reads its deployment record over HTTP from
 * `<worktree>.localhost:9000` and its server row from that worktree's DB fork,
 * both keyed on `currentWorktreeName()` — which the child inherits through
 * SINGULARITY_WORKTREE from this process's env (hence no `env` override).
 */
function deployArgv(
  deployment: Deployment,
  verb: "converge" | "ship",
  extra: readonly string[],
): string[] {
  return [
    "./singularity",
    "deploy",
    verb,
    deployment.compositionId,
    "--server",
    deployment.serverId,
    ...extra,
  ];
}

/** A `converge` or a `ship` on its own: one spawn, then the terminal stamp. */
async function runSingleVerb(
  deployment: Deployment,
  run: DeployRun,
  body: Extract<RunDeploymentBody, { verb: "converge" | "ship" }>,
): Promise<void> {
  const extra = body.verb === "ship" && body.release ? ["--release", body.release] : [];
  const outcome = await spawnVerb(deployment, body.verb, extra);
  await finishRun(run.deploymentId, outcome);
}

/**
 * The one-button sequence: converge the host, build a candidate unless the
 * existing bundle is already current, then ship exactly the run id that
 * resolved.
 *
 * Nothing here re-implements a refusal. The two host-mutating legs are the same
 * CLI commands the row actions launch, and the build/no-build decision is
 * `resolveBundle` + `compareToHead` — the same authority `ship` itself consults,
 * asked one step earlier so the user does not have to. Each leg's failure ends
 * the run with that leg's own words, and `phase` is left pointing at the leg
 * that failed.
 */
async function runUpdate(deployment: Deployment, run: DeployRun): Promise<void> {
  const composition = deployment.compositionId;

  /** End the run at a step that is not a CLI spawn (so there is no exit code). */
  async function fail(message: string): Promise<void> {
    deployLog.publish(`[failed] deploy update ${composition}: ${message}`, "stderr");
    await finishRun(run.deploymentId, { exitCode: null, message });
  }

  try {
    // Read the platform BEFORE touching the host: an update that cannot resolve
    // a bundle is going to fail anyway, and failing before the converge means
    // the user reads the real reason instead of a converge log they have to
    // scroll past. Server-side off the health side-table, never from the client
    // — the platform is DISCOVERED by the probe, and a body field carrying it
    // would be a place to get it wrong.
    const health = await serverHealth.get(deployment.serverId);
    if (!health?.ok) {
      await fail("This server has no successful reachability check — run Verify connection first.");
      return;
    }
    if (health.platform === null || !isPlatformTag(health.platform)) {
      await fail(
        `This server reported platform ${health.platform ?? "unknown"}, which no release target ` +
          `builds for, so no bundle can be shipped to it.`,
      );
      return;
    }
    const platform: PlatformTag = health.platform;

    // 1. Converge. A no-op on an already-correct host (every file lands through
    //    a content-compare `put`, and the restart is gated on the running
    //    process predating its configuration), so running it before every ship
    //    costs a warm host nothing and repairs drift on a cold one.
    const converge = await spawnVerb(deployment, "converge", []);
    if (converge.exitCode !== 0) {
      await finishRun(run.deploymentId, converge);
      return;
    }

    // 2. Build — unless there is already a bundle that ship would accept AND it
    //    was cut from this exact HEAD. Anything short of `current` rebuilds: a
    //    dirty worktree is `unknown`, never `current`, so a work-in-progress
    //    tree always gets fresh bytes.
    setRunPhase(run.deploymentId, "build");
    const existing = resolveBundle({ composition, platform });
    let reuse = false;
    if (existing.ok) {
      const staleness = await compareToHead(existing.manifest, REPO_ROOT);
      reuse = staleness.kind === "current";
      // Whichever way it goes, SAY so: "why did this deploy take twelve minutes"
      // and "why did it ship something older than my tree" are the two questions
      // an automatic decision has to answer without being asked.
      deployLog.publish(
        reuse
          ? `[skip] build — ${platform} bundle ${existing.runId} is already built from the current HEAD.`
          : `[build] the ${platform} bundle ${existing.runId} is ${staleness.kind} vs HEAD — ` +
              `cutting a fresh candidate of ${composition}.`,
      );
    } else {
      deployLog.publish(
        `[build] no shippable ${platform} bundle for ${composition}: ` +
          bundleRefusalMessage(existing.refusal),
      );
    }
    if (!reuse) {
      const outcome = await runRelease({
        composition,
        target: RELEASE_TARGET,
        intent: { kind: "candidate", platform },
      });
      if (!outcome.ok) {
        await fail(outcome.message);
        return;
      }
    }

    // 3. Ship, pinned by run id. Re-resolved rather than reusing `existing`: a
    //    build that just ran moved the `latest-<platform>` pointer, and the
    //    whole point of pinning is that what was resolved here is what goes out.
    const pinned = resolveBundle({ composition, platform });
    if (!pinned.ok) {
      await fail(bundleRefusalMessage(pinned.refusal));
      return;
    }
    // The pinned bundle's OWN manifest is the honest answer to "which commit is
    // going onto the box" — not HEAD, which is a fact about this checkout and
    // would be a plausible lie the moment the bundle is reused or the tree moves.
    // Null when the manifest carries none (a build that predates provenance).
    setRunPhase(run.deploymentId, "ship", {
      release: pinned.runId,
      commitSha: pinned.manifest.commitSha ?? null,
    });
    await finishRun(
      run.deploymentId,
      await spawnVerb(deployment, "ship", ["--release", pinned.runId]),
    );
  } catch (err) {
    // Anything the sequence itself did not anticipate — a DB read that threw, a
    // corrupt RELEASE.json (`resolveBundle` throws on those by design). Surfaced
    // as a failed run rather than an unhandled rejection: leaving the run
    // `running` forever would wedge the server's exclusivity guard until the
    // next restart.
    await fail(err instanceof Error ? err.message : String(err));
  }
}

/**
 * Spawn one CLI verb and drive it to completion: stream both pipes into the log
 * channel, then report the outcome **without stamping the run** — the caller
 * decides whether this was the whole run or one leg of a sequence.
 *
 * Not detached. A run is tied to this backend's lifetime because its status has
 * nowhere durable to live (see `core/runs.ts`) — a child that outlived the map
 * would be an invisible orphan nothing could report on, which is worse than one
 * that dies with its parent. Long unattended deploys belong on the CLI.
 */
async function spawnVerb(
  deployment: Deployment,
  verb: "converge" | "ship",
  extra: readonly string[],
): Promise<VerbOutcome> {
  const argv = deployArgv(deployment, verb, extra);
  deployLog.publish(`$ ${argv.join(" ")}`);

  // Every stderr line, bounded — the failure `message` is picked from these.
  const stderr: string[] = [];
  const STDERR_KEPT = 200;

  try {
    const proc = Bun.spawn(argv, { cwd: REPO_ROOT, stdout: "pipe", stderr: "pipe" });

    async function stream(
      readable: ReadableStream<Uint8Array> | null,
      kind: "stdout" | "stderr",
    ): Promise<void> {
      if (!readable) return;
      const decoder = new TextDecoder();
      for await (const chunk of readable as unknown as AsyncIterable<Uint8Array>) {
        for (const line of decoder.decode(chunk).split("\n")) {
          if (!line) continue;
          deployLog.publish(line, kind);
          if (kind === "stderr") {
            stderr.push(line);
            if (stderr.length > STDERR_KEPT) stderr.shift();
          }
        }
      }
    }

    await Promise.all([stream(proc.stdout, "stdout"), stream(proc.stderr, "stderr")]);
    const exitCode = await proc.exited;

    if (exitCode === 0) {
      deployLog.publish(`[done] deploy ${verb} ${deployment.compositionId}`);
      return { exitCode, message: null };
    }
    const message = failureMessage(stderr, exitCode);
    deployLog.publish(`[failed] deploy ${verb} exited ${exitCode}`, "stderr");
    return { exitCode, message };
  } catch (err) {
    // A spawn that never started (missing `./singularity`, EAGAIN) — or a decode
    // failure mid-stream. Reported as a failed outcome AND a log line rather
    // than rethrown: the run record is the only place the user can see it.
    const message = err instanceof Error ? err.message : String(err);
    deployLog.publish(`[failed] could not run ${argv.join(" ")}: ${message}`, "stderr");
    return { exitCode: null, message };
  }
}

/**
 * The one line that says what went wrong: the CLI's named refusal when it made
 * one, else its last word, else the bare exit status.
 */
function failureMessage(stderr: readonly string[], exitCode: number): string {
  const refusal = stderr.find((line) => line.startsWith(REFUSAL_PREFIX));
  if (refusal) return refusal.slice(REFUSAL_PREFIX.length);
  const last = [...stderr].reverse().find((line) => line.trim() !== "");
  return last ?? `Exited with code ${exitCode}`;
}
