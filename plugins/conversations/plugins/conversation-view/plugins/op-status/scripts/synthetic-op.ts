/**
 * A synthetic op for the op-status e2e (`../e2e/op-status-waits.ts`): a real
 * process that drives the REAL writers — the flocked liveness marker
 * (`markWorktreeOpStart`) and the op-log profiler (`createOpProfiler`) — through
 * a scripted life, one step per write of a control file, so the e2e can assert
 * what the banner and chip show at each state. A separate process because the
 * e2e runtime may not import `server` barrels, and because killing it is the
 * honest way to test a death. (Steps used to be signals; a child spawned from
 * the Playwright-driving e2e process never saw SIGUSR2, and Bun crashes on
 * SIGUSR1 — so the driver writes `<dir>/control.json` instead, which this
 * process watches.)
 *
 *   run   --slug <ns> --op-id <id> --dir <dir>
 *     on start   : publish the marker, `requested`, two requeues, then
 *                  `wait-start duress-valve` (reason "cluster-onset: loadRatio",
 *                  cycle 2)                                     → ready.json {step:0}
 *     control ≥ 1: `wait-end cleared` + `granted`               → ready.json {step:1}
 *     control ≥ 2: `completed success`, then release the marker → ready.json {step:2}, exit 0
 *     SIGKILL    : dies holding the marker, no terminal — the kernel drops the lock
 *
 *   close --op-id <id>
 *     Append the reconciler's own `completed{by:"reconciler"}` for an op the
 *     log still has in flight — the stand-in for main's reconciler, used ONLY
 *     for cleanup when main does not run it yet. Refuses a live or unknown op.
 *
 * The branch is `e2e-synthetic` so the rows are recognisable in the history.
 */
import { existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendOpLog,
  createOpProfiler,
  readOpStates,
} from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import {
  orphanedOps,
  reconcilerCompletedEvent,
} from "@plugins/debug/plugins/profiling/plugins/op-log/core";
import {
  markWorktreeOpStart,
  probeWorktreeOp,
} from "@plugins/infra/plugins/worktree/server";

const BRANCH = "e2e-synthetic";
/** How long a run may sit un-advanced before it gives up on its driver. */
const MAX_LIFE_MS = 10 * 60_000;

function flag(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) {
    console.error(`synthetic-op: --${name} is required`);
    process.exit(2);
  }
  return v;
}

async function close(): Promise<void> {
  const opId = flag("op-id");
  const state = readOpStates().get(opId);
  if (!state) {
    // The driver's cleanup calls this for every op it started, including one
    // that died before its first event: there is nothing to close.
    console.log(
      `synthetic-op close: ${opId} is not in the op log — nothing to close`,
    );
    return;
  }
  const slug = state.identity?.opSlug;
  if (slug && (await probeWorktreeOp(slug, opId)) === "live")
    throw new Error(`synthetic-op close: ${opId} is still running`);
  const [orphan] = orphanedOps([state]);
  if (!orphan) {
    console.log(`synthetic-op close: ${opId} is already closed`);
    return;
  }
  appendOpLog(reconcilerCompletedEvent(orphan, Date.now()));
  console.log(
    `synthetic-op close: appended the reconciler terminal for ${opId}`,
  );
}

function run(): void {
  const slug = flag("slug");
  const opId = flag("op-id");
  const dir = flag("dir");
  const readyFile = join(dir, "ready.json");
  const controlFile = join(dir, "control.json");
  const say = (step: number) =>
    writeFileSync(readyFile, JSON.stringify({ step, pid: process.pid }));

  const marker = markWorktreeOpStart(slug, "build", opId);
  const profiler = createOpProfiler("build", {
    opId,
    branch: BRANCH,
    opSlug: slug,
    lane: "background",
    buildId: null,
  });
  profiler.markRequested();
  profiler.requeue();
  profiler.requeue();
  profiler.waitStart("duress-valve", "cluster-onset: loadRatio");

  // A deadline, not a poll: a driver that never advances us must not leave a
  // marker held forever.
  const lifetime = setTimeout(() => {
    console.error("synthetic-op: never advanced — giving up");
    profiler.complete("failed");
    profiler.write();
    marker.release();
    process.exit(1);
  }, MAX_LIFE_MS);

  let step = 0;
  const advanceTo = (wanted: number): void => {
    while (step < wanted) {
      step++;
      if (step === 1) {
        profiler.waitEnd("cleared");
        profiler.markGranted();
        say(1);
        continue;
      }
      // The terminal BEFORE the release — the ordering every op command keeps.
      profiler.complete("success");
      profiler.write();
      marker.release();
      clearTimeout(lifetime);
      watcher.close();
      say(2);
      process.exit(0);
    }
  };
  const readControl = (): number => {
    if (!existsSync(controlFile)) return 0;
    const text = readFileSync(controlFile, "utf8");
    // The driver writes the file whole via rename, so a read is never torn.
    return (JSON.parse(text) as { step: number }).step;
  };
  // Push-based: the driver's rename of control.json wakes this watcher.
  const watcher = watch(dir, () => advanceTo(readControl()));
  say(0);
  advanceTo(readControl());
}

const mode = process.argv[2];
if (mode === "run") run();
else if (mode === "close") await close();
else {
  console.error("usage: synthetic-op.ts run|close …");
  process.exit(2);
}
