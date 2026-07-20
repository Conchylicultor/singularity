import {
  resolveActiveWorktreeOps,
  type WorktreeOpInfo,
} from "@plugins/infra/plugins/worktree/server";

// One over-budget, still-running CLI op: a wedge candidate.
export interface WedgedOp {
  info: WorktreeOpInfo;
  wedgedMs: number;
}

// Sweep the whole op-marker fleet (`~/.singularity/worktrees/*/ops/*.json`) and
// return every op that is RUNNING, alive, and older than `budgetMs`.
//
// Reuses `resolveActiveWorktreeOps` rather than re-walking the marker tree:
//
//   • it already reaps dead/garbage markers and returns ONLY markers whose pid
//     is alive (`isPidAlive`), which is exactly the "pid is alive" half of the
//     trip condition — a dead pid is a crashed CLI, not a wedge;
//   • it derives each PUSH marker's phase from the kernel flock + the single
//     holder file. A push marker's stored `phase` is a self-assertion and can
//     read "running" for a push that is really queued, so the derived value is
//     the only trustworthy one here;
//   • re-deriving the paths or re-parsing the JSON by hand would fork the
//     marker format away from the module that owns it.
//
// Only `phase === "running"` trips. An op sitting in "waiting-for-lock" for
// hours is a VICTIM of a wedge, not a wedge — it is parked in a healthy flock
// wait, and its forensic capture would show nothing but that. Filing on waiters
// would turn one wedge into a report storm of its queue while burying the
// culprit. The culprit is always running: a leaked push lock is held by a
// running push, a serialised build queue is headed by a running build — so
// narrowing to running loses no wedge, it only drops the collateral.
export async function readWedgedOps(nowMs: number, budgetMs: number): Promise<WedgedOp[]> {
  const ops = await resolveActiveWorktreeOps();
  const wedged: WedgedOp[] = [];
  for (const info of ops) {
    if (info.phase !== "running") continue;
    const startedAtMs = Date.parse(info.startedAt);
    if (Number.isNaN(startedAtMs)) continue; // unparseable marker timestamp — no age to judge
    const wedgedMs = nowMs - startedAtMs;
    if (wedgedMs < budgetMs) continue;
    wedged.push({ info, wedgedMs });
  }
  return wedged;
}
