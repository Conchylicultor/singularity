import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { runTracked } from "@plugins/infra/plugins/runtime-profiler/core";
import type { Deployment } from "../../core/schemas";
import type { DeployRun } from "../../core/runs";
import type { RunDeploymentBody } from "../../core/endpoints";
import { deployLog } from "./deploy-log";
import { finishRun, runningOnServer, startRun } from "./run-state";

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

/**
 * Launch a verb for one deployment, streaming the CLI's output into the `deploy`
 * channel. Returns the `running` record; the outcome arrives via `deploy.runs`.
 *
 * **The exclusivity check and the state write are one synchronous turn**, which
 * is why the 409 lives here rather than in the handler: an `await` between
 * "nothing is running" and "mark it running" would be a TOCTOU window two clicks
 * could walk through. Scoped to the SERVER, not the deployment — converge writes
 * `/etc/caddy/Caddyfile` and runs `apt-get`, so two converges on one box race
 * even when they are different compositions.
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
        ? `A ${busy.verb} of "${busy.compositionId}" is already running on this server.`
        : `A ${busy.verb} of "${busy.compositionId}" is already running on this server — ` +
            `converge and ship both mutate host-wide state (Caddy, apt, systemd), so they run one at a time.`,
    );
  }

  // `./singularity` from the checkout this backend was built from, so the CLI
  // resolves the SAME namespace: it reads its deployment record over HTTP from
  // `<worktree>.localhost:9000` and its server row from that worktree's DB fork,
  // both keyed on `currentWorktreeName()` — which the child inherits through
  // SINGULARITY_WORKTREE from this process's env (hence no `env` override).
  const argv = [
    "./singularity",
    "deploy",
    body.verb,
    deployment.compositionId,
    "--server",
    deployment.serverId,
    ...(body.verb === "ship" && body.release ? ["--release", body.release] : []),
  ];

  const run = startRun({ deployment, verb: body.verb });
  deployLog.publish(`$ ${argv.join(" ")}`);
  void runTracked("deploy:run", () => pump(argv, run));
  return run;
}

/**
 * Drive the spawned CLI to completion: stream both pipes into the log channel,
 * then stamp the terminal outcome.
 *
 * Not detached. A run is tied to this backend's lifetime because its status has
 * nowhere durable to live (see `core/runs.ts`) — a child that outlived the map
 * would be an invisible orphan nothing could report on, which is worse than one
 * that dies with its parent. Long unattended deploys belong on the CLI.
 */
async function pump(argv: string[], run: DeployRun): Promise<void> {
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
      deployLog.publish(`[done] deploy ${run.verb} ${run.compositionId}`);
      finishRun(run.deploymentId, { exitCode, message: null });
      return;
    }
    const message = failureMessage(stderr, exitCode);
    deployLog.publish(`[failed] deploy ${run.verb} exited ${exitCode}`, "stderr");
    finishRun(run.deploymentId, { exitCode, message });
  } catch (err) {
    // A spawn that never started (missing `./singularity`, EAGAIN) — or a decode
    // failure mid-stream. Surfaced as a failed run AND a log line rather than
    // rethrown into an unhandled rejection: the run record is the only place the
    // user can see it, and leaving it `running` forever would wedge the server's
    // exclusivity guard until the next restart.
    const message = err instanceof Error ? err.message : String(err);
    deployLog.publish(`[failed] could not run ${argv.join(" ")}: ${message}`, "stderr");
    finishRun(run.deploymentId, { exitCode: null, message });
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
