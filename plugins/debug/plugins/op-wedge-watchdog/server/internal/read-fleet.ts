import {
  resolveActiveWorktreeOps,
  type WorktreeOpInfo,
} from "@plugins/infra/plugins/worktree/server";
import { readOpRecords } from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import type { OpRecord } from "@plugins/debug/plugins/profiling/plugins/op-log/core";

// One over-budget, still-running CLI op: a wedge candidate. Carries the timing
// accounting the trip decision used, so the report can show WHY it tripped.
export interface WedgedOp {
  info: WorktreeOpInfo;
  // Raw wall age (`now − startedAt`) off the marker — context for the report,
  // NOT the trip quantity. A build parked 15 min in host-grant has a large
  // `wedgedMs` but a near-zero `genuineWorkMs`.
  wedgedMs: number;
  // Total recorded host-resource wait (build-lock/push-mutex/duress-valve/
  // host-grant) from the unified op-log, subtracted from wall age. 0 when no
  // op-log record correlated (the uniform fallback — see below), which degrades
  // the decision to `now − startedAt`.
  blockedMs: number;
  // Genuine non-blocked work time (`now − anchor − blockedMs`) — THE quantity
  // the trip decision uses. `anchor` is the op-log `requestedAt` when a record
  // correlated, else the marker's `startedAt`.
  genuineWorkMs: number;
}

// The pure trip decision, factored out of the fs-touching sweep so it is unit-
// testable without stubbing `readOpRecords`/`resolveActiveWorktreeOps`.
//
// `rec` is the correlated in-flight op-log record, or `undefined` when none was
// found. The formula is UNIFORM — there is no legacy branch:
//
//   anchorMs      = rec?.requestedAt ?? marker.startedAt   // op-log clock if present
//   blockedMs     = rec?.waitMs ?? 0                       // ALL recorded host waits
//   genuineWorkMs = nowMs − anchorMs − blockedMs
//   tripped       = genuineWorkMs ≥ budgetMs               // caller also gates on phase
//
// `rec.waitMs` already includes the currently-open wait, clocked to the op-log
// fold's `now`, so a build PARKED in host-grant has `genuineWorkMs ≈ 0` and
// cannot trip; a build that queued 14 min then genuinely ran 2 min has
// `genuineWorkMs ≈ 2 min` and cannot trip; a build actually burning CPU for
// 16 min with no waits has `genuineWorkMs ≈ 16 min` and trips — as intended.
//
// `blockedMs = 0` on a missing record is the CORRECT uniform fallback, not a
// legacy path: it collapses the formula to `now − startedAt` (the marker's own
// anchor), so a pre-op-log CLI or a parked op whose `requested` head was clipped
// by the op-log's 8 MB bounded tail still trips if genuinely over budget. It
// errs toward still-catching the wedge.
//
// Returns `null` only when the anchor timestamp is unparseable — there is no age
// to judge, so the op is neither tripped nor a candidate.
export function classifyOp(
  marker: Pick<WorktreeOpInfo, "startedAt">,
  rec: Pick<OpRecord, "requestedAt" | "waitMs"> | undefined,
  nowMs: number,
  budgetMs: number,
): { wedgedMs: number; blockedMs: number; genuineWorkMs: number; tripped: boolean } | null {
  const anchorMs = Date.parse(rec?.requestedAt ?? marker.startedAt);
  if (Number.isNaN(anchorMs)) return null; // no anchor to judge age from
  const startedAtMs = Date.parse(marker.startedAt);
  // Wall age off the marker; if the marker timestamp itself is unparseable fall
  // back to the anchor so the report still carries a number.
  const wedgedMs = Number.isNaN(startedAtMs) ? nowMs - anchorMs : nowMs - startedAtMs;
  const blockedMs = rec?.waitMs ?? 0;
  const genuineWorkMs = nowMs - anchorMs - blockedMs;
  return { wedgedMs, blockedMs, genuineWorkMs, tripped: genuineWorkMs >= budgetMs };
}

// Sweep the whole op-marker fleet (`~/.singularity/worktrees/*/ops/*.json`) and
// return every op that is RUNNING, alive, and has been GENUINELY WORKING past
// `budgetMs` — where "genuinely working" is wall age MINUS recorded host-resource
// wait, read from the unified op-log.
//
// TWO on-disk recordings, each owning what only it can:
//
//   • The op MARKER (`infra/worktree`, one file per (worktree, op), overwritten)
//     is PROCESS IDENTITY: the pid to sample/reap, the `--inspect` URL for the JS
//     probe, and liveness. Its coarse two-state phase (`waiting-for-lock →
//     running`) freezes at `running` on the lock grant and never moves again —
//     even while the op sits, for unbounded time, in the duress-valve/host-grant
//     admission wait that follows. It is NOT a wedge-time source.
//   • The op-LOG (`debug/profiling/op-log`, the one durable record) is the
//     WEDGE-TIME AUTHORITY: its `waits[]` list carries every host-resource wait
//     (build-lock/push-mutex/duress-valve/host-grant), and `waitMs` folds them —
//     including the currently-open wait — to the read clock. It was built
//     specifically to stop "a build parked in host-grant rendering as a
//     motionless running bar"; the watchdog now consults it.
//
// So the two are unified at the timing seam: the marker supplies identity and
// liveness, the op-log supplies "how long has this op genuinely been working."
// Before this, wedge-time was `now − startedAt` off the marker, so a healthy
// build merely QUEUED for a host CPU grant was reported wedged and reaped.
//
// `resolveActiveWorktreeOps` is reused rather than re-walking the marker tree:
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
// wait. This is the cheap early-out AND the load-bearing flock-derived push-
// victim guard; the op-log subtraction now makes it belt-and-suspenders (a
// push queued behind another is pure `push-mutex` wait, so `genuineWorkMs ≈ 0`
// too), not the sole guard. The culprit is always running: a leaked push lock is
// held by a running push, a serialised build queue is headed by a running build
// — so narrowing to running loses no wedge, it only drops the collateral.
export async function readWedgedOps(nowMs: number, budgetMs: number): Promise<WedgedOp[]> {
  const ops = await resolveActiveWorktreeOps();

  // Read the op-log ONCE per sweep (bounded 8 MB tail; cheap; main-only per-
  // minute). Index the in-flight records ("waiting"/"running" — a terminal
  // record is a finished op, not a live wedge) by (opSlug, kind), keeping the
  // latest `requestedAt` on collision so we correlate against the newest run.
  const inflightByKey = new Map<string, OpRecord>();
  for (const rec of readOpRecords()) {
    if (rec.outcome !== "running" && rec.outcome !== "waiting") continue;
    if (rec.opSlug === null) continue;
    const key = `${rec.opSlug}:${rec.kind}`;
    const prev = inflightByKey.get(key);
    if (prev === undefined || Date.parse(rec.requestedAt) > Date.parse(prev.requestedAt)) {
      inflightByKey.set(key, rec);
    }
  }

  const wedged: WedgedOp[] = [];
  for (const info of ops) {
    if (info.phase !== "running") continue;
    const rec = inflightByKey.get(`${info.slug}:${info.op}`);
    const c = classifyOp(info, rec, nowMs, budgetMs);
    if (c === null) continue; // unparseable anchor — no age to judge
    if (!c.tripped) continue;
    wedged.push({
      info,
      wedgedMs: c.wedgedMs,
      blockedMs: c.blockedMs,
      genuineWorkMs: c.genuineWorkMs,
    });
  }
  return wedged;
}
