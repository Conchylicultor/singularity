import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "./paths";

export interface PushContentionRecord {
  pushId: string;
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

export function createPushProfiler(
  pushId: string,
  branch: string,
  mode: PushContentionRecord["mode"],
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
    },

    markLockAcquired() {
      lockAcquiredAt = new Date();
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
        pushId,
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

      mkdirSync(SINGULARITY_DIR, { recursive: true });
      appendFileSync(CONTENTION_FILE, JSON.stringify(record) + "\n");
    },
  };
}
