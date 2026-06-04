import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "./paths";

export interface PushContentionRecord {
  // Phase discriminates the three records a single push emits over its life:
  // an up-front "lock_requested" (so an in-flight waiter is observable), a
  // "lock_acquired" the moment the lock is granted, and a terminal "completed"
  // when the push finishes. Legacy records (written before phasing) have no
  // phase and are treated as terminal. Non-terminal records are partial — the
  // reader synthesizes a live record from them (see read-contention.ts).
  phase?: "lock_requested" | "lock_acquired" | "completed";
  pushId: string;
  // basename(worktree root) == the op-marker slug used by isWorktreeOpActive().
  // Carried explicitly because the orphan reconciler checks liveness on it, and
  // it is NOT the same as `worktree` (env SINGULARITY_WORKTREE), which may differ.
  opSlug: string | null;
  branch: string;
  conversationId: string | null;
  worktree: string | null;
  mode: "worktree" | "from-main";
  startedAt: string;
  lockRequestedAt: string;
  lockAcquiredAt: string;
  completedAt: string;
  preLockMs: number;
  waitMs: number;
  holdMs: number;
  totalMs: number;
  outcome: "success" | "failed_rebase" | "failed_checks" | "failed_push" | "error";
  // Set on terminal records written by the orphan reconciler: the push was
  // hard-killed mid-flight, so it has no real end. Absent on CLI-written records.
  interrupted?: boolean;
  steps: Array<{ name: string; startMs: number; durationMs: number }>;
}

interface PushProfiler {
  markLockRequested(): void;
  markLockAcquired(): void;
  stepStart(name: string): void;
  stepEnd(name: string): void;
  complete(outcome: PushContentionRecord["outcome"]): void;
  write(): void;
}

const CONTENTION_FILE = join(SINGULARITY_DIR, "push-contention.jsonl");

function appendRecord(record: Partial<PushContentionRecord>): void {
  mkdirSync(SINGULARITY_DIR, { recursive: true });
  appendFileSync(CONTENTION_FILE, JSON.stringify(record) + "\n");
}

export function createPushProfiler(
  pushId: string,
  branch: string,
  mode: PushContentionRecord["mode"],
  opSlug: string | null,
): PushProfiler {
  const conversationId = process.env.SINGULARITY_CONVERSATION_ID ?? null;
  const worktree = process.env.SINGULARITY_WORKTREE ?? null;

  const startedAt = new Date();
  let lockRequestedAt: Date | undefined;
  let lockAcquiredAt: Date | undefined;
  let completedAt: Date | undefined;
  let outcome: PushContentionRecord["outcome"] | undefined;

  const steps: PushContentionRecord["steps"] = [];
  const stepStarts = new Map<string, number>();

  return {
    markLockRequested() {
      lockRequestedAt = new Date();
      // Land the full identity up-front so a push blocked on the lock shows as
      // a live "waiting" row immediately, before it ever acquires the lock.
      appendRecord({
        phase: "lock_requested",
        pushId,
        opSlug,
        branch,
        conversationId,
        worktree,
        mode,
        startedAt: startedAt.toISOString(),
        lockRequestedAt: lockRequestedAt.toISOString(),
      });
    },

    markLockAcquired() {
      lockAcquiredAt = new Date();
      // Minimal — identity already landed in the lock_requested record. This
      // lets the reader flip the synthesized row from "waiting" to "running"
      // and freeze waitMs at its final value.
      appendRecord({
        phase: "lock_acquired",
        pushId,
        lockAcquiredAt: lockAcquiredAt.toISOString(),
      });
    },

    stepStart(name: string) {
      stepStarts.set(name, Date.now());
    },

    stepEnd(name: string) {
      const start = stepStarts.get(name);
      if (start == null) return;
      stepStarts.delete(name);
      steps.push({
        name,
        startMs: lockAcquiredAt ? start - lockAcquiredAt.getTime() : 0,
        durationMs: Date.now() - start,
      });
    },

    complete(o) {
      completedAt = new Date();
      outcome = o;
    },

    write() {
      if (!lockRequestedAt) lockRequestedAt = startedAt;
      if (!lockAcquiredAt) lockAcquiredAt = lockRequestedAt;
      if (!completedAt) completedAt = new Date();
      if (!outcome) outcome = "error";

      const record: PushContentionRecord = {
        phase: "completed",
        pushId,
        opSlug,
        branch,
        conversationId,
        worktree,
        mode,
        startedAt: startedAt.toISOString(),
        lockRequestedAt: lockRequestedAt.toISOString(),
        lockAcquiredAt: lockAcquiredAt.toISOString(),
        completedAt: completedAt.toISOString(),
        preLockMs: lockRequestedAt.getTime() - startedAt.getTime(),
        waitMs: lockAcquiredAt.getTime() - lockRequestedAt.getTime(),
        holdMs: completedAt.getTime() - lockAcquiredAt.getTime(),
        totalMs: completedAt.getTime() - startedAt.getTime(),
        outcome,
        steps,
      };

      appendRecord(record);
    },
  };
}
