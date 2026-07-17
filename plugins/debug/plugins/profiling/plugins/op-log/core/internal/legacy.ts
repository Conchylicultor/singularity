import { sumWaits } from "./fold";
import type { OpRecord, OpStep } from "./types";

// Read-only adapters for the two pre-op-log formats. `push-contention.jsonl`
// (~5.3k lines) and `build-log.jsonl` (~10.5k lines) are NOT migrated: new ops
// write `op-log.jsonl`, these two become frozen history that the reader maps
// into `OpRecord` so the Gantt renders it unchanged. NOTHING here ever writes —
// the old files' own reconcilers (which this stage does not touch) still close
// their own orphans.
//
// Both adapters are deletable as one unit each, once history ages past the
// pane's 24 h default window.
//
// They emit `OpRecord` (the read model) DIRECTLY rather than remapping onto
// `RawOpRecord` and reusing `foldOpRecords`: the legacy phases carry the wrong
// shape for that fold (a legacy `lock_acquired` line has no `lockRequestedAt`,
// so its wait can only be computed across lines), and the build log has no
// grant/wait concept at all. Folding them here keeps the new fold clean.

const EPOCH = new Date(0).toISOString();

/** One raw line of `push-contention.jsonl`. */
export interface RawLegacyPushRecord {
  phase?: "lock_requested" | "lock_acquired" | "completed";
  pushId: string;
  opSlug?: string | null;
  branch?: string;
  conversationId?: string | null;
  worktree?: string | null;
  mode?: "worktree" | "from-main";
  startedAt?: string;
  lockRequestedAt?: string;
  lockAcquiredAt?: string;
  completedAt?: string | null;
  preLockMs?: number;
  waitMs?: number;
  holdMs?: number;
  totalMs?: number;
  outcome?: "success" | "failed_rebase" | "failed_checks" | "failed_push" | "error";
  interrupted?: boolean;
  steps?: OpStep[];
}

/** One raw line of `build-log.jsonl`. */
export interface RawLegacyBuildRecord {
  /**
   * ABSENT on the oldest records — the build log predates phasing, and its first
   * ~thousands of lines are bare
   * `{worktree,branch,startedAt,completedAt,totalMs,success}`. A record with no
   * phase is terminal, exactly as the existing reader treats it.
   */
  phase?: "started" | "completed";
  worktree: string;
  branch: string;
  buildId?: string | null;
  startedAt: string;
  completedAt: string | null;
  totalMs: number;
  success: boolean;
  interrupted?: boolean;
}

function msBetween(fromIso: string | undefined, toIso: string | undefined): number {
  if (fromIso == null || toIso == null) return 0;
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, to - from);
}

interface LegacyPushGroup {
  requested?: RawLegacyPushRecord;
  acquired?: RawLegacyPushRecord;
  terminal?: RawLegacyPushRecord;
}

function groupLegacyPushes(raw: RawLegacyPushRecord[]): Map<string, LegacyPushGroup> {
  const byId = new Map<string, LegacyPushGroup>();
  for (const r of raw) {
    const g = byId.get(r.pushId) ?? {};
    if (r.phase === "lock_requested") g.requested = r;
    else if (r.phase === "lock_acquired") g.acquired = r;
    else g.terminal = r; // "completed", or a legacy no-phase line
    byId.set(r.pushId, g);
  }
  return byId;
}

/**
 * `push-contention.jsonl` → `OpRecord[]`. A legacy push only ever blocked on one
 * thing the log knew about, so it maps to exactly one wait segment:
 * `[{ kind: "push-mutex", startMs: 0, durationMs: waitMs }]`. Its nested
 * host-grant wait was never recorded and cannot be recovered — that blind spot
 * is what the new log closes going forward.
 *
 * `preLockMs` (the legacy startedAt → lockRequestedAt gap) has no counterpart in
 * the new model; `requestedAt` is the lock-request instant, and the terminal's
 * own `totalMs` is preserved verbatim so historical bars keep their width.
 */
export function foldLegacyPushRecords(raw: RawLegacyPushRecord[], now: number): OpRecord[] {
  const out: OpRecord[] = [];
  for (const g of groupLegacyPushes(raw).values()) {
    const terminal = g.terminal;
    if (terminal) {
      const waits = [{ kind: "push-mutex" as const, startMs: 0, durationMs: terminal.waitMs ?? 0 }];
      out.push({
        opId: terminal.pushId,
        kind: "push",
        opSlug: terminal.opSlug ?? null,
        worktree: terminal.worktree ?? null,
        branch: terminal.branch ?? terminal.pushId,
        conversationId: terminal.conversationId ?? null,
        lane: null, // never recorded by the legacy writer
        mode: terminal.mode ?? "worktree",
        buildId: null,
        requestedAt: terminal.lockRequestedAt ?? terminal.startedAt ?? EPOCH,
        grantedAt: terminal.lockAcquiredAt ?? terminal.lockRequestedAt ?? EPOCH,
        completedAt: terminal.completedAt ?? null,
        waits,
        waitMs: sumWaits(waits),
        holdMs: terminal.holdMs ?? 0,
        totalMs: terminal.totalMs ?? 0,
        outcome: terminal.outcome ?? "error",
        interrupted: terminal.interrupted ?? false,
        steps: terminal.steps ?? [],
      });
      continue;
    }

    const base = g.requested;
    if (!base) continue; // stray lock_acquired with no identity
    const requestedAt = base.lockRequestedAt ?? base.startedAt ?? EPOCH;
    const requestedMs = new Date(requestedAt).getTime();
    const acquiredAt = g.acquired?.lockAcquiredAt;

    if (acquiredAt) {
      const waits = [
        { kind: "push-mutex" as const, startMs: 0, durationMs: msBetween(requestedAt, acquiredAt) },
      ];
      out.push({
        opId: base.pushId,
        kind: "push",
        opSlug: base.opSlug ?? null,
        worktree: base.worktree ?? null,
        branch: base.branch ?? base.pushId,
        conversationId: base.conversationId ?? null,
        lane: null,
        mode: base.mode ?? "worktree",
        buildId: null,
        requestedAt,
        grantedAt: acquiredAt,
        completedAt: null,
        waits,
        waitMs: sumWaits(waits),
        holdMs: Math.max(0, now - new Date(acquiredAt).getTime()),
        totalMs: Math.max(0, now - requestedMs),
        outcome: "running",
        interrupted: false,
        steps: [],
      });
      continue;
    }

    const waits = [
      { kind: "push-mutex" as const, startMs: 0, durationMs: Math.max(0, now - requestedMs) },
    ];
    out.push({
      opId: base.pushId,
      kind: "push",
      opSlug: base.opSlug ?? null,
      worktree: base.worktree ?? null,
      branch: base.branch ?? base.pushId,
      conversationId: base.conversationId ?? null,
      lane: null,
      mode: base.mode ?? "worktree",
      buildId: null,
      requestedAt,
      grantedAt: requestedAt,
      completedAt: null,
      waits,
      waitMs: sumWaits(waits),
      holdMs: 0,
      totalMs: Math.max(0, now - requestedMs),
      outcome: "waiting",
      interrupted: false,
      steps: [],
    });
  }
  return out;
}

/**
 * `build-log.jsonl` → `OpRecord[]`. The legacy build log recorded NO waits — its
 * `startedAt` was stamped before `acquireBuildLock`, so `totalMs` silently
 * swallowed every wait (a build that queued 5 min and worked 1 min is
 * indistinguishable from one that worked 6). That is unrecoverable, so historical
 * builds map to `waits: []` and `holdMs = totalMs`: no wait segments, the same
 * flat bar the pane already draws.
 *
 * Pairing is by `(worktree, startedAt)` — the key the legacy writer and reader
 * both use, since `buildId` is null on older manual builds. Needs no `now`: an
 * unpaired `started` has no known end and renders as an interrupted marker, not
 * a growing bar (mirroring the existing reader exactly).
 */
export function foldLegacyBuildRecords(raw: RawLegacyBuildRecord[]): OpRecord[] {
  const keyOf = (r: RawLegacyBuildRecord): string => `${r.worktree}:${r.startedAt}`;

  const toRecord = (r: RawLegacyBuildRecord, interrupted: boolean): OpRecord => {
    const totalMs = interrupted ? 0 : r.totalMs;
    return {
      opId: keyOf(r),
      kind: "build",
      // For a build the log's `worktree` IS the op-marker slug: build.ts writes
      // `basename(root)` to both.
      opSlug: r.worktree,
      worktree: r.worktree,
      branch: r.branch,
      conversationId: null,
      lane: null,
      mode: null,
      buildId: r.buildId ?? null,
      requestedAt: r.startedAt,
      grantedAt: r.startedAt,
      completedAt: interrupted ? null : r.completedAt,
      waits: [],
      waitMs: 0,
      holdMs: totalMs,
      totalMs,
      outcome: interrupted ? "error" : r.success ? "success" : "failed",
      interrupted,
      steps: [],
    };
  };

  const pending = new Map<string, RawLegacyBuildRecord>();
  const merged: OpRecord[] = [];
  for (const r of raw) {
    if (r.phase === "started") {
      pending.set(keyOf(r), r);
      continue;
    }
    // "completed", or a legacy no-phase line — either way, terminal.
    pending.delete(keyOf(r));
    merged.push(toRecord(r, r.interrupted ?? false));
  }
  // Whatever is still open was hard-killed before any graceful exit and not yet
  // reconciled: end time unknown, so no duration and an interrupted marker.
  for (const r of pending.values()) merged.push(toRecord(r, true));
  return merged;
}
