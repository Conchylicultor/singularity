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
// The reap covers the WHOLE captured tree — the marker pid plus every
// descendant — not just the marker. The 2026-07-22 m0gj incident falsified the
// original "culprits have no children" assumption: the actual burner was a
// marker-less nested-check grandchild, and reaping only the marker orphaned it
// at 99% CPU indefinitely. Descendants go deepest-first (deterministic; no race
// with the CLI's own orphan-guard cascade for the same pids), the marker last.
// Descendant pids are re-verified against a fresh ps read before being
// signalled — a pid whose identity cannot be confirmed is NEVER killed.

import type { WedgeChild } from "./capture";
import { runBounded } from "./capture";
import { PS } from "@plugins/infra/plugins/paths/server";

export type ReapOutcome = "exited-sigterm" | "exited-sigkill" | "survived" | "already-dead";

export interface ReapResult {
  outcome: ReapOutcome;
  /** Per-step errors (signal EPERM etc.); non-empty never silently dropped. */
  failures: Array<{ step: string; error: string }>;
}

/** Per-pid outcome within a tree reap. The two extra states over `ReapOutcome`
 * are the identity guards: `vanished` (gone between capture and reap — nothing
 * to signal) and `identity-mismatch` (the pid is alive but its ppid/command no
 * longer match the captured row — pid reuse; signalling it would kill an
 * innocent process, so it is skipped and reported). */
export type PidReapOutcome = ReapOutcome | "identity-mismatch" | "vanished";

export interface PidReapResult {
  pid: number;
  role: "marker" | "descendant";
  outcome: PidReapOutcome;
  failures: Array<{ step: string; error: string }>;
}

export type ReapRollup = "all-reaped" | "some-survived" | "disabled";

export interface TreeReapResult {
  /** One entry per targeted pid, in kill order (descendants deepest-first, marker last). */
  outcomes: PidReapResult[];
  /** `some-survived` when any pid is possibly still alive (survived SIGKILL, or
   * skipped on identity-mismatch); `all-reaped` otherwise. `disabled` is minted
   * by the monitor when the reap toggle is off — never by this function. */
  rollup: Exclude<ReapRollup, "disabled">;
  /** Tree-level failures (e.g. the reap-time ps re-verification read failed). */
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

/** Reap-time identity snapshot: pid → { ppid, command }, from one whole-table read. */
async function readIdentityTable(): Promise<Map<number, { ppid: number; command: string }> | { error: string }> {
  const res = await runBounded([PS, "-axo", "pid=,ppid=,command="], 10_000);
  if (!res.ok) return { error: res.error };
  const table = new Map<number, { ppid: number; command: string }>();
  for (const line of res.stdout.split("\n")) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    if (!m) continue;
    table.set(Number(m[1]), { ppid: Number(m[2]), command: m[3]! });
  }
  return table;
}

/**
 * Reap the whole captured tree: every descendant deepest-first, the marker pid
 * last.
 *
 * Two provenance tiers, deliberately different:
 *
 * - **Descendants** were photographed by the capture possibly minutes ago, so
 *   each is re-verified against a fresh ps read and signalled only when its
 *   live `{ppid, command}` still matches the captured row exactly. Absent →
 *   `vanished`; mismatched → `identity-mismatch`; neither is ever signalled.
 *   If the re-read itself fails, ALL descendants are skipped with a loud
 *   tree-level `ps-reverify` failure — killing on stale identity is worse than
 *   leaving an orphan for the CLI's own orphan-guard cascade.
 * - **The marker pid** carries its own provenance (the op-marker file plus this
 *   very tick's liveness check in `readWedgedOps`), so it is reaped even when
 *   the ps re-read failed — releasing the push mutex / cpu-slots is the core
 *   value and must not be hostage to a diagnostic read.
 */
export async function reapTree(
  marker: { pid: number },
  descendants: WedgeChild[],
): Promise<TreeReapResult> {
  const failures: TreeReapResult["failures"] = [];
  const outcomes: PidReapResult[] = [];

  const identity = descendants.length > 0 ? await readIdentityTable() : new Map<number, never>();
  const identityOk = !("error" in identity);
  if (!identityOk) failures.push({ step: "ps-reverify", error: identity.error });

  // Capture's `children` is BFS nearest-first; reversing yields deepest-first.
  for (const target of [...descendants].reverse()) {
    if (!identityOk) {
      outcomes.push({
        pid: target.pid,
        role: "descendant",
        outcome: "identity-mismatch",
        failures: [{ step: "ps-reverify", error: "reap-time ps read failed — identity unverifiable, not signalled" }],
      });
      continue;
    }
    const live = identity.get(target.pid);
    if (live === undefined) {
      outcomes.push({ pid: target.pid, role: "descendant", outcome: "vanished", failures: [] });
      continue;
    }
    if (live.ppid !== target.ppid || live.command !== target.command) {
      outcomes.push({
        pid: target.pid,
        role: "descendant",
        outcome: "identity-mismatch",
        failures: [
          {
            step: "identity",
            error:
              `captured {ppid=${target.ppid}, command=${JSON.stringify(target.command)}} vs ` +
              `live {ppid=${live.ppid}, command=${JSON.stringify(live.command)}} — pid likely reused`,
          },
        ],
      });
      continue;
    }
    const res = await reapWedge(target.pid);
    outcomes.push({ pid: target.pid, role: "descendant", outcome: res.outcome, failures: res.failures });
  }

  const markerRes = await reapWedge(marker.pid);
  outcomes.push({ pid: marker.pid, role: "marker", outcome: markerRes.outcome, failures: markerRes.failures });

  const someSurvived = outcomes.some(
    (o) => o.outcome === "survived" || o.outcome === "identity-mismatch",
  );
  return { outcomes, rollup: someSurvived ? "some-survived" : "all-reaped", failures };
}
