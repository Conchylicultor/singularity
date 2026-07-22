// Reap a wedged CLI op AFTER its forensics are banked — the capture-then-reap
// policy (research/2026-07-22-global-op-wedge-capture-then-reap.md). One wedged
// op holds its host cpu-slots and, push-nested, the global push mutex; before
// this policy it gridlocked every build and push on the box for hours.
//
// Reap safety rests on existing self-healing, all verified:
//   - the push mutex is a kernel flock on push.lock, auto-released when the
//     holder's fd closes on death (worktree-op.ts);
//   - host-semaphore slots are flock fds with the same auto-release
//     (host-semaphore/scripts/flock-block.ts);
//   - op markers are reaped by every reader once the pid is dead ("so a
//     SIGKILLed build/push self-heals on the next read" — worktree-op.ts);
//   - a push-nested check dying surfaces to its parent push as a check failure,
//     which exits through its normal failure path (observed live 2026-07-22).
//
// SIGTERM first: the CLI installs graceful handlers (build.ts maps SIGTERM→143
// and runs cleanup). Escalate to SIGKILL because the native microtask storm has
// been reported upstream to ignore SIGTERM (oven-sh/bun#27766) — our specimens
// service timers so SIGTERM *may* deliver, but "may" is not a policy.
//
// Kills ONLY the wedged pid, never descendants: observed culprits have none,
// and any that exist are recorded in the capture's child tree for the report.

export type ReapOutcome = "exited-sigterm" | "exited-sigkill" | "survived" | "already-dead";

export interface ReapResult {
  outcome: ReapOutcome;
  /** Per-step errors (signal EPERM etc.); non-empty never silently dropped. */
  failures: Array<{ step: string; error: string }>;
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await Bun.sleep(250);
  }
  return !isPidAlive(pid);
}

/**
 * SIGTERM → wait 5s → SIGKILL → wait 2s. Returns the outcome rather than
 * throwing; `survived` (alive after SIGKILL) is a finding worth filing, not an
 * exception to swallow.
 */
export async function reapWedge(pid: number): Promise<ReapResult> {
  const failures: ReapResult["failures"] = [];
  if (!isPidAlive(pid)) return { outcome: "already-dead", failures };

  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    failures.push({ step: "sigterm", error: String(err) });
  }
  if (await waitForExit(pid, 5_000)) return { outcome: "exited-sigterm", failures };

  try {
    process.kill(pid, "SIGKILL");
  } catch (err) {
    failures.push({ step: "sigkill", error: String(err) });
  }
  if (await waitForExit(pid, 2_000)) return { outcome: "exited-sigkill", failures };

  return { outcome: "survived", failures };
}
