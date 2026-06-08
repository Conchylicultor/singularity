import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

// One push emits up to three phased records over its life (see push-profiler.ts):
// "lock_requested" (full identity, written before it blocks on the lock),
// "lock_acquired" (minimal, when the lock is granted), and a terminal "completed"
// when it finishes. Legacy records predate phasing and have no phase — treated as
// terminal. Non-terminal records are partial; the reader synthesizes a live
// record from them. All numeric/identity fields are optional at the raw level.
interface RawPushRecord {
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
  outcome?: PushContentionRecord["outcome"];
  interrupted?: boolean;
  steps?: Array<{ name: string; startMs: number; durationMs: number }>;
}

export interface PushContentionRecord {
  pushId: string;
  opSlug: string | null;
  branch: string;
  conversationId: string | null;
  worktree: string | null;
  mode: "worktree" | "from-main";
  startedAt: string;
  lockRequestedAt: string;
  lockAcquiredAt: string;
  completedAt: string | null;
  preLockMs: number;
  waitMs: number;
  holdMs: number;
  totalMs: number;
  // "waiting"/"running" are synthesized for in-flight pushes that have not yet
  // written a terminal record. Terminal outcomes are the CLI-written ones.
  outcome:
    | "success"
    | "failed_rebase"
    | "failed_checks"
    | "failed_push"
    | "error"
    | "waiting"
    | "running";
  // True for pushes hard-killed mid-flight and closed by the orphan reconciler.
  // They have no real duration (waitMs/holdMs 0) and render as a fixed marker.
  interrupted: boolean;
  steps: Array<{ name: string; startMs: number; durationMs: number }>;
}

const CONTENTION_FILE = join(SINGULARITY_DIR, "push-contention.jsonl");

function readRawRecords(): RawPushRecord[] {
  let raw: string;
  try {
    raw = readFileSync(CONTENTION_FILE, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return [];
  }

  const records: RawPushRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as RawPushRecord);
    } catch (err) {
      if (err instanceof SyntaxError) continue;
      throw err;
    }
  }
  return records;
}

interface PushGroup {
  requested?: RawPushRecord;
  acquired?: RawPushRecord;
  terminal?: RawPushRecord;
}

// Group raw records by pushId. A "completed" or legacy no-phase record is the
// terminal; "lock_requested"/"lock_acquired" are the in-flight phases.
function groupByPushId(raw: RawPushRecord[]): Map<string, PushGroup> {
  const byId = new Map<string, PushGroup>();
  for (const r of raw) {
    const g = byId.get(r.pushId) ?? {};
    if (r.phase === "lock_requested") g.requested = r;
    else if (r.phase === "lock_acquired") g.acquired = r;
    else g.terminal = r; // "completed" or legacy no-phase
    byId.set(r.pushId, g);
  }
  return byId;
}

function normalizeTerminal(r: RawPushRecord): PushContentionRecord {
  return {
    pushId: r.pushId,
    opSlug: r.opSlug ?? null,
    branch: r.branch ?? r.pushId,
    conversationId: r.conversationId ?? null,
    worktree: r.worktree ?? null,
    mode: r.mode ?? "worktree",
    startedAt: r.startedAt ?? new Date(0).toISOString(),
    lockRequestedAt: r.lockRequestedAt ?? r.startedAt ?? new Date(0).toISOString(),
    lockAcquiredAt: r.lockAcquiredAt ?? r.lockRequestedAt ?? new Date(0).toISOString(),
    completedAt: r.completedAt ?? null,
    preLockMs: r.preLockMs ?? 0,
    waitMs: r.waitMs ?? 0,
    holdMs: r.holdMs ?? 0,
    totalMs: r.totalMs ?? 0,
    outcome: r.outcome ?? "error",
    interrupted: r.interrupted ?? false,
    steps: r.steps ?? [],
  };
}

// Build a live record from an in-flight push's identity (the lock_requested
// record), computing wait/hold against `now` so the Gantt bars grow on refresh.
function synthInFlight(
  base: RawPushRecord,
  acquired: RawPushRecord | undefined,
  now: number,
): PushContentionRecord {
  const startedMs = new Date(base.startedAt ?? base.lockRequestedAt ?? 0).getTime();
  const requestedMs = new Date(base.lockRequestedAt ?? base.startedAt ?? 0).getTime();

  let outcome: PushContentionRecord["outcome"];
  let lockAcquiredAt: string;
  let waitMs: number;
  let holdMs: number;
  if (acquired?.lockAcquiredAt) {
    const acquiredMs = new Date(acquired.lockAcquiredAt).getTime();
    outcome = "running";
    lockAcquiredAt = acquired.lockAcquiredAt;
    waitMs = Math.max(0, acquiredMs - requestedMs);
    holdMs = Math.max(0, now - acquiredMs);
  } else {
    outcome = "waiting";
    lockAcquiredAt = base.lockRequestedAt ?? base.startedAt ?? new Date(0).toISOString();
    waitMs = Math.max(0, now - requestedMs);
    holdMs = 0;
  }

  const preLockMs = Math.max(0, requestedMs - startedMs);
  return {
    pushId: base.pushId,
    opSlug: base.opSlug ?? null,
    branch: base.branch ?? base.pushId,
    conversationId: base.conversationId ?? null,
    worktree: base.worktree ?? null,
    mode: base.mode ?? "worktree",
    startedAt: base.startedAt ?? new Date(startedMs).toISOString(),
    lockRequestedAt: base.lockRequestedAt ?? base.startedAt ?? new Date(0).toISOString(),
    lockAcquiredAt,
    completedAt: null,
    preLockMs,
    waitMs,
    holdMs,
    totalMs: preLockMs + waitMs + holdMs,
    outcome,
    interrupted: false,
    steps: [],
  };
}

export function readContentionRecords(): PushContentionRecord[] {
  const byId = groupByPushId(readRawRecords());
  const now = Date.now(); // server runtime — drives the live, growing in-flight bars

  const out: PushContentionRecord[] = [];
  for (const g of byId.values()) {
    if (g.terminal) {
      out.push(normalizeTerminal(g.terminal));
      continue;
    }
    if (!g.requested) continue; // stray lock_acquired with no identity — skip defensively
    out.push(synthInFlight(g.requested, g.acquired, now));
  }
  return out;
}

/**
 * Close out orphaned in-flight pushes by appending a terminal interrupted
 * record for each — the push analogue of finalizeOrphanedBuilds. A hard kill
 * (SIGKILL/OOM/power loss) can't run the CLI's profiler.write(), leaving a
 * lock_requested (and maybe lock_acquired) with no terminal; this stamps a real
 * terminal record so the push stops being recomputed as live on every read
 * while preserving it as an interrupted trace. `isActive(opSlug)` guards against
 * closing a push that is still genuinely running. Liveness is keyed on the op
 * slug (basename of root), NOT the `worktree` field. Appends (never rewrites) to
 * stay safe against concurrent CLI writes — callers must ensure a single writer
 * (gate on the main backend). Returns the number of records finalized.
 */
export function finalizeOrphanedPushes(
  isActive: (slug: string) => boolean,
): number {
  const byId = groupByPushId(readRawRecords());
  let finalized = 0;
  for (const [pushId, g] of byId) {
    if (g.terminal) continue;
    const base = g.requested;
    if (!base) continue;
    if (isActive(base.opSlug ?? "")) continue;

    const startedMs = new Date(base.startedAt ?? base.lockRequestedAt ?? 0).getTime();
    const requestedMs = new Date(base.lockRequestedAt ?? base.startedAt ?? 0).getTime();
    const acquiredMs = g.acquired?.lockAcquiredAt
      ? new Date(g.acquired.lockAcquiredAt).getTime()
      : null;

    const record: RawPushRecord = {
      phase: "completed",
      pushId,
      opSlug: base.opSlug ?? null,
      branch: base.branch,
      conversationId: base.conversationId ?? null,
      worktree: base.worktree ?? null,
      mode: base.mode ?? "worktree",
      startedAt: base.startedAt,
      lockRequestedAt: base.lockRequestedAt,
      lockAcquiredAt: g.acquired?.lockAcquiredAt ?? base.lockRequestedAt,
      completedAt: null,
      preLockMs: Math.max(0, requestedMs - startedMs),
      waitMs: acquiredMs ? Math.max(0, acquiredMs - requestedMs) : 0,
      holdMs: 0,
      totalMs: 0,
      outcome: "error",
      interrupted: true,
      steps: [],
    };
    appendFileSync(CONTENTION_FILE, JSON.stringify(record) + "\n");
    finalized++;
  }
  return finalized;
}
